#!/usr/bin/env python3
"""charlib — ảnh nhân vật 2D → Gaussian splat 3D bằng ComfyUI + TripoSplat.

Chỉ dùng thư viện chuẩn của Python (>= 3.9), không cần pip install.

Các lệnh:
  fetch-workflow   tải workflow mẫu 3d_triposplat_image_to_gaussian_splat.json
  convert          đổi workflow giao diện (UI) sang định dạng API của ComfyUI
  build            chạy hàng loạt: mọi ảnh trong input/ → library/characters/<id>/
  index            dựng lại library/index.json từ các meta.json

Ví dụ:
  python3 tools/charlib.py fetch-workflow
  python3 tools/charlib.py build --server http://127.0.0.1:8188 --glb
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import mimetypes
import random
import re
import shutil
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INPUT_DIR = ROOT / "input"
LIBRARY_DIR = ROOT / "library"
CHAR_DIR = LIBRARY_DIR / "characters"
WORKFLOW_DIR = ROOT / "workflows"
DEFAULT_WORKFLOW = WORKFLOW_DIR / "3d_triposplat_image_to_gaussian_splat.json"
TEMPLATE_URL = (
    "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/"
    "templates/3d_triposplat_image_to_gaussian_splat.json"
)
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
WIDGET_TYPES = {"INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"}
SEED_CONTROL_VALUES = {"fixed", "increment", "decrement", "randomize"}
# Nút chỉ có ở giao diện, không bao giờ gửi lên server.
FRONTEND_ONLY = {"Note", "MarkdownNote", "Reroute", "PrimitiveNode"}
MODE_MUTED, MODE_BYPASS = 2, 4


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def slugify(text: str) -> str:
    """'Pháp sư Băng' → 'phap-su-bang' (bỏ dấu tiếng Việt, đ → d)."""
    text = text.strip().lower().replace("đ", "d")
    text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "character"


# --------------------------------------------------------------------------
# ComfyUI HTTP client
# --------------------------------------------------------------------------
class Comfy:
    def __init__(self, server: str, timeout: float = 60):
        self.base = server.rstrip("/")
        self.timeout = timeout
        self.client_id = str(uuid.uuid4())

    def _req(self, method, path, data=None, headers=None):
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            raise RuntimeError(f"{method} {path} → HTTP {e.code}: {body[:2000]}") from None
        except urllib.error.URLError as e:
            raise RuntimeError(f"Không kết nối được ComfyUI tại {self.base}: {e.reason}") from None

    def get_json(self, path):
        return json.loads(self._req("GET", path))

    def post_json(self, path, obj):
        return json.loads(self._req("POST", path, json.dumps(obj).encode(),
                                    {"Content-Type": "application/json"}))

    def object_info(self):
        return self.get_json("/object_info")

    def upload_image(self, path: Path, name: str) -> str:
        boundary = "----charlib" + uuid.uuid4().hex
        ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
        parts = []

        def field(n, v):
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{n}"'
                         f"\r\n\r\n{v}\r\n".encode())

        field("overwrite", "true")
        field("type", "input")
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; '
                     f'filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode())
        parts.append(path.read_bytes())
        parts.append(f"\r\n--{boundary}--\r\n".encode())
        res = json.loads(self._req("POST", "/upload/image", b"".join(parts),
                                   {"Content-Type": f"multipart/form-data; boundary={boundary}"}))
        sub = res.get("subfolder") or ""
        return f"{sub}/{res['name']}" if sub else res["name"]

    def queue(self, prompt: dict) -> str:
        res = self.post_json("/prompt", {"prompt": prompt, "client_id": self.client_id})
        if res.get("node_errors"):
            raise RuntimeError("ComfyUI từ chối workflow: " + json.dumps(res["node_errors"], ensure_ascii=False)[:3000])
        return res["prompt_id"]

    def wait(self, prompt_id: str, timeout: float, poll: float = 2.0) -> dict:
        start = time.time()
        while True:
            hist = self.get_json(f"/history/{prompt_id}")
            if prompt_id in hist:
                entry = hist[prompt_id]
                status = entry.get("status", {})
                if status.get("status_str") == "error":
                    msgs = [m for m in status.get("messages", []) if m and m[0] == "execution_error"]
                    detail = msgs[0][1] if msgs else status
                    raise RuntimeError("ComfyUI chạy lỗi: " + json.dumps(detail, ensure_ascii=False)[:3000])
                if status.get("completed", True):
                    return entry
            if time.time() - start > timeout:
                raise TimeoutError(f"Quá {timeout:.0f}s mà prompt {prompt_id} chưa xong")
            time.sleep(poll)

    def download(self, f: dict) -> bytes:
        q = urllib.parse.urlencode({"filename": f["filename"],
                                    "subfolder": f.get("subfolder", ""),
                                    "type": f.get("type", "output")})
        return self._req("GET", "/view?" + q)


# --------------------------------------------------------------------------
# UI workflow (có subgraph) → API prompt
# --------------------------------------------------------------------------
def is_api_format(wf: dict) -> bool:
    return "nodes" not in wf and all(isinstance(v, dict) and "class_type" in v for v in wf.values())


def _norm_links(links):
    out = {}
    for l in links or []:
        if isinstance(l, dict):
            out[l["id"]] = (l["origin_id"], l["origin_slot"])
        else:  # [id, origin_id, origin_slot, target_id, target_slot, type]
            out[l[0]] = (l[1], l[2])
    return out


class _Graph:
    def __init__(self, nodes, links, defs, prefix="", sgdef=None, instance=None, parent=None):
        self.nodes = {n["id"]: n for n in nodes}
        self.links = _norm_links(links)
        self.defs = defs
        self.prefix = prefix
        self.sgdef = sgdef
        self.instance = instance
        self.parent = parent
        self._children = {}

    def child(self, node):
        if node["id"] not in self._children:
            sg = self.defs[node["type"]]
            self._children[node["id"]] = _Graph(sg["nodes"], sg.get("links"), self.defs,
                                                f"{self.prefix}{node['id']}:", sg, node, self)
        return self._children[node["id"]]

    def resolve(self, origin_id, slot):
        """Trả về (flat_id, slot) của nút thật cung cấp dữ liệu, hoặc None."""
        if origin_id == -10:  # cổng vào của subgraph
            name = self.sgdef["inputs"][slot]["name"]
            inp = next((i for i in self.instance.get("inputs", []) if i["name"] == name), None)
            if not inp or inp.get("link") is None:
                return None
            return self.parent.resolve(*self.parent.links[inp["link"]])
        node = self.nodes[origin_id]
        if node["type"] in self.defs:  # đi vào trong subgraph
            inner = self.child(node)
            out = inner.sgdef["outputs"][slot]
            return inner.resolve(*inner.links[out["linkIds"][0]])
        if node["type"] == "Reroute" or node.get("mode") == MODE_BYPASS:
            want = (node.get("outputs") or [{}])[slot].get("type")
            for inp in node.get("inputs", []):
                if inp.get("link") is not None and (node["type"] == "Reroute" or inp.get("type") == want):
                    return self.resolve(*self.links[inp["link"]])
            return None
        return (f"{self.prefix}{origin_id}", slot)


def _widget_names(spec: dict) -> list[str]:
    inputs = spec.get("input", {})
    order = spec.get("input_order") or {k: list(v) for k, v in inputs.items()}
    names = []
    for section in ("required", "optional"):
        for name in order.get(section, []):
            t = inputs.get(section, {}).get(name)
            if t is None:
                continue
            typ = t[0]
            if isinstance(typ, list) or typ in WIDGET_TYPES:
                names.append(name)
    return names


def ui_to_api(wf: dict, object_info: dict) -> dict:
    defs = {sg["id"]: sg for sg in (wf.get("definitions") or {}).get("subgraphs", [])}
    api: dict = {}

    def walk(g: _Graph):
        for node in g.nodes.values():
            typ = node["type"]
            if node.get("mode") in (MODE_MUTED, MODE_BYPASS):
                continue
            if typ in defs:
                walk(g.child(node))
                continue
            if typ in FRONTEND_ONLY:
                continue
            spec = object_info.get(typ)
            if spec is None:
                raise RuntimeError(f"ComfyUI không có nút '{typ}'. Hãy cập nhật ComfyUI "
                                   "(TripoSplat cần bản comfy-core mới).")
            inputs = {}
            values = list(node.get("widgets_values") or [])
            if isinstance(node.get("widgets_values"), dict):
                inputs.update(node["widgets_values"])
            else:
                i = 0
                for name in _widget_names(spec):
                    if i >= len(values):
                        break
                    inputs[name] = values[i]
                    i += 1
                    if i < len(values) and isinstance(values[i], str) and values[i] in SEED_CONTROL_VALUES \
                            and isinstance(inputs[name], int) and not isinstance(inputs[name], bool):
                        i += 1  # bỏ widget "control_after_generate"
            for inp in node.get("inputs", []):
                if inp.get("link") is None:
                    continue
                src = g.resolve(*g.links[inp["link"]])
                if src is not None:
                    inputs[inp["name"]] = [src[0], src[1]]
                # src None: cổng subgraph không nối → giữ giá trị widget bên trong
            api[f"{g.prefix}{node['id']}"] = {"class_type": typ, "inputs": inputs,
                                              "_meta": {"title": node.get("title") or typ}}

    walk(_Graph(wf["nodes"], wf.get("links"), defs))
    # Bỏ những nút không dẫn tới nút output nào (vd. nhánh GLB bị bypass).
    outputs = {k for k, v in api.items() if object_info.get(v["class_type"], {}).get("output_node")}
    keep, stack = set(), list(outputs)
    while stack:
        k = stack.pop()
        if k in keep or k not in api:
            continue
        keep.add(k)
        stack += [v[0] for v in api[k]["inputs"].values() if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str)]
    return {k: v for k, v in api.items() if k in keep}


def enable_glb_branch(wf: dict):
    """Bật lại các nút SplatToMesh/SaveGLB đang bị bypass (nhánh xuất .glb)."""
    n = 0
    for node in wf.get("nodes", []):
        if node["type"] in ("SplatToMesh", "SaveGLB") and node.get("mode") == MODE_BYPASS:
            node["mode"] = 0
            n += 1
    return n


def patch_prompt(api: dict, *, image: str, seed: int | None, num_gaussians: int | None,
                 remove_bg: bool | None, prefix: str, preview: bool | None = None):
    by_class = lambda c: [(k, v) for k, v in api.items() if v["class_type"] == c]
    src_class = lambda ref: api.get(ref[0], {}).get("class_type") if isinstance(ref, list) else None

    loads = by_class("LoadImage")
    if len(loads) != 1:
        raise RuntimeError(f"Workflow phải có đúng 1 nút LoadImage (đang có {len(loads)})")
    loads[0][1]["inputs"]["image"] = image
    for _, n in by_class("KSampler"):
        if seed is not None and not isinstance(n["inputs"].get("seed"), list):
            n["inputs"]["seed"] = seed
    for _, n in by_class("VAEDecodeTripoSplat"):
        if num_gaussians is not None and not isinstance(n["inputs"].get("num_gaussians"), list):
            n["inputs"]["num_gaussians"] = num_gaussians
        if seed is not None and "seed" in n["inputs"] and not isinstance(n["inputs"]["seed"], list):
            n["inputs"]["seed"] = seed
    for _, n in by_class("ComfySwitchNode"):
        on_true = src_class(n["inputs"].get("on_true"))
        if on_true == "RemoveBackground" and remove_bg is not None:
            n["inputs"]["switch"] = remove_bg
        if on_true == "TripoSplatSamplingPreview" and preview is not None:
            n["inputs"]["switch"] = preview
    for _, n in api.items():
        if "filename_prefix" in n["inputs"]:
            n["inputs"]["filename_prefix"] = prefix
    return api


# --------------------------------------------------------------------------
# Thư viện
# --------------------------------------------------------------------------
def load_metadata() -> dict:
    p = INPUT_DIR / "characters.json"
    if not p.exists():
        return {}
    data = json.loads(p.read_text("utf-8"))
    return data.get("characters", data) if isinstance(data, dict) else {}


def find_inputs(only: list[str] | None) -> list[tuple[str, Path]]:
    items = []
    for p in sorted(INPUT_DIR.iterdir()):
        if p.suffix.lower() in IMAGE_EXTS and not p.name.startswith("."):
            cid = slugify(p.stem)
            if only and cid not in only and p.stem not in only:
                continue
            items.append((cid, p))
    return items


def classify_output(filename: str) -> str | None:
    ext = Path(filename).suffix.lower()
    return {".spz": "splat", ".ply": "splat_ply", ".glb": "glb", ".mp4": "turntable",
            ".webm": "turntable", ".png": "preview"}.get(ext)


def collect_files(history_entry: dict) -> list[dict]:
    files = []
    for out in history_entry.get("outputs", {}).values():
        for v in out.values():
            if isinstance(v, list):
                files += [f for f in v if isinstance(f, dict) and "filename" in f and f.get("type", "output") == "output"]
    return files


def rebuild_index() -> dict:
    chars = []
    for meta in sorted(CHAR_DIR.glob("*/meta.json")):
        try:
            chars.append(json.loads(meta.read_text("utf-8")))
        except json.JSONDecodeError as e:
            log(f"! bỏ qua {meta}: {e}")
    chars.sort(key=lambda c: (c.get("order", 1000), c.get("name", c["id"]).lower()))
    index = {"generatedAt": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
             "count": len(chars), "characters": chars}
    LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    (LIBRARY_DIR / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", "utf-8")
    return index


def build_one(comfy: Comfy, base_api: dict, cid: str, img: Path, meta_in: dict, args) -> dict:
    out_dir = CHAR_DIR / cid
    out_dir.mkdir(parents=True, exist_ok=True)
    seed = args.seed if args.seed is not None else meta_in.get("seed", random.randint(0, 2**32 - 1))
    uploaded = comfy.upload_image(img, f"charlib_{cid}{img.suffix.lower()}")
    api = json.loads(json.dumps(base_api))
    patch_prompt(api, image=uploaded, seed=seed,
                 num_gaussians=args.num_gaussians or meta_in.get("num_gaussians"),
                 remove_bg=False if args.keep_background else meta_in.get("remove_background"),
                 prefix=f"charlib/{cid}/{cid}")
    t0 = time.time()
    pid = comfy.queue(api)
    log(f"  → prompt {pid} (seed {seed}) đang chạy…")
    entry = comfy.wait(pid, timeout=args.timeout)
    files = {}
    for f in collect_files(entry):
        kind = classify_output(f["filename"])
        if not kind or kind in files:
            continue
        ext = Path(f["filename"]).suffix.lower()
        name = {"splat": "model", "splat_ply": "model", "glb": "model", "turntable": "turntable",
                "preview": "preview"}[kind] + ext
        (out_dir / name).write_bytes(comfy.download(f))
        files[kind] = f"characters/{cid}/{name}"
    if "splat" not in files and "splat_ply" not in files:
        raise RuntimeError("ComfyUI chạy xong nhưng không trả về file splat (.spz/.ply)")
    src_name = "source" + img.suffix.lower()
    shutil.copyfile(img, out_dir / src_name)
    old = {}
    if (out_dir / "meta.json").exists():
        old = json.loads((out_dir / "meta.json").read_text("utf-8"))
    meta = {
        "id": cid,
        "name": meta_in.get("name") or old.get("name") or re.sub(r"[_\s-]+", " ", img.stem).strip().title() or cid,
        "role": meta_in.get("role", old.get("role", "")),
        "faction": meta_in.get("faction", old.get("faction", "")),
        "tags": meta_in.get("tags", old.get("tags", [])),
        "description": meta_in.get("description", old.get("description", "")),
        "source": f"characters/{cid}/{src_name}",
        "splat": files.get("splat") or files.get("splat_ply"),
        "glb": files.get("glb"),
        "turntable": files.get("turntable"),
        "viewer": meta_in.get("viewer", old.get("viewer", {})),
        "generation": {
            "workflow": "Comfy-Org/workflow_templates · 3d_triposplat_image_to_gaussian_splat",
            "model": "VAST-AI/TripoSplat",
            "seed": seed,
            "num_gaussians": api_value(api, "VAEDecodeTripoSplat", "num_gaussians"),
            "seconds": round(time.time() - t0, 1),
            "prompt_id": pid,
        },
        "createdAt": old.get("createdAt") or _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "updatedAt": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
    }
    if "order" in meta_in:
        meta["order"] = meta_in["order"]
    meta = {k: v for k, v in meta.items() if v not in (None, "")}
    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", "utf-8")
    return meta


def api_value(api, cls, key):
    for n in api.values():
        if n["class_type"] == cls and not isinstance(n["inputs"].get(key), list):
            return n["inputs"].get(key)
    return None


def prepare_api(comfy: Comfy, workflow_path: Path, glb: bool) -> dict:
    if not workflow_path.exists():
        raise SystemExit(f"Chưa có {workflow_path}. Chạy: python3 tools/charlib.py fetch-workflow")
    wf = json.loads(workflow_path.read_text("utf-8"))
    if is_api_format(wf):
        if glb:
            log("! --glb bị bỏ qua: workflow đã ở dạng API, hãy bật nhánh GLB trong ComfyUI rồi export lại")
        return wf
    if glb:
        log(f"  bật {enable_glb_branch(wf)} nút của nhánh GLB")
    return ui_to_api(wf, comfy.object_info())


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
def cmd_fetch(args):
    WORKFLOW_DIR.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(TEMPLATE_URL, timeout=60) as r:
        data = r.read()
    json.loads(data)
    DEFAULT_WORKFLOW.write_bytes(data)
    log(f"Đã lưu {DEFAULT_WORKFLOW.relative_to(ROOT)} ({len(data) // 1024} KB)")


def cmd_convert(args):
    comfy = Comfy(args.server)
    api = prepare_api(comfy, Path(args.workflow), args.glb)
    out = Path(args.out)
    out.write_text(json.dumps(api, ensure_ascii=False, indent=2) + "\n", "utf-8")
    log(f"Đã ghi {out} ({len(api)} nút)")
    for k, v in api.items():
        log(f"  {k:>8}  {v['class_type']}")


def cmd_build(args):
    comfy = Comfy(args.server)
    items = find_inputs(args.only)
    if not items:
        raise SystemExit(f"Không có ảnh nào trong {INPUT_DIR} (png/jpg/webp)")
    meta_all = load_metadata()
    base_api = prepare_api(comfy, Path(args.workflow), args.glb)
    ok, failed = 0, []
    for cid, img in items:
        done = (CHAR_DIR / cid / "meta.json").exists()
        if done and not args.force:
            log(f"= {cid}: đã có, bỏ qua (dùng --force để tạo lại)")
            continue
        log(f"▶ {cid}  ({img.name})")
        try:
            meta = build_one(comfy, base_api, cid, img, meta_all.get(cid) or meta_all.get(img.stem) or {}, args)
            log(f"  ✓ {meta['splat']}  ({meta['generation']['seconds']}s)")
            ok += 1
        except Exception as e:  # noqa: BLE001 — một nhân vật lỗi không làm hỏng cả lô
            log(f"  ✗ {e}")
            failed.append(cid)
            if args.fail_fast:
                break
    idx = rebuild_index()
    log(f"\nXong: {ok} mới, {len(failed)} lỗi, thư viện có {idx['count']} nhân vật → library/index.json")
    if failed:
        log("Lỗi: " + ", ".join(failed))
        sys.exit(1)


def cmd_index(args):
    idx = rebuild_index()
    log(f"library/index.json: {idx['count']} nhân vật")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p):
        p.add_argument("--server", default="http://127.0.0.1:8188", help="địa chỉ ComfyUI")
        p.add_argument("--workflow", default=str(DEFAULT_WORKFLOW),
                       help="workflow UI (.json tải từ template) hoặc bản Export (API)")
        p.add_argument("--glb", action="store_true", help="bật nhánh xuất mesh .glb (thử nghiệm)")

    sub.add_parser("fetch-workflow", help="tải workflow mẫu TripoSplat").set_defaults(func=cmd_fetch)

    p = sub.add_parser("convert", help="đổi workflow UI → API (để kiểm tra)")
    common(p)
    p.add_argument("--out", default=str(WORKFLOW_DIR / "triposplat_api.json"))
    p.set_defaults(func=cmd_convert)

    p = sub.add_parser("build", help="tạo splat 3D cho các ảnh trong input/")
    common(p)
    p.add_argument("--only", nargs="*", help="chỉ chạy các id này")
    p.add_argument("--force", action="store_true", help="tạo lại cả nhân vật đã có")
    p.add_argument("--seed", type=int, help="seed cố định (mặc định ngẫu nhiên, hoặc lấy từ characters.json)")
    p.add_argument("--num-gaussians", type=int, help="số gaussian (mặc định của workflow: 262144)")
    p.add_argument("--keep-background", action="store_true",
                   help="không chạy BiRefNet (ảnh đã có nền trong suốt)")
    p.add_argument("--timeout", type=float, default=1800, help="giây tối đa cho mỗi nhân vật")
    p.add_argument("--fail-fast", action="store_true", help="dừng ở lỗi đầu tiên")
    p.set_defaults(func=cmd_build)

    sub.add_parser("index", help="dựng lại library/index.json").set_defaults(func=cmd_index)

    args = ap.parse_args(argv)
    try:
        args.func(args)
    except (RuntimeError, TimeoutError, OSError) as e:
        log(f"Lỗi: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
