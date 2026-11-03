"""ComfyUI giả lập để kiểm tra tools/charlib.py mà không cần GPU.

Mô phỏng các endpoint /object_info, /upload/image, /prompt, /history, /view.
Tên input của các nút TripoSplat ở đây là phỏng đoán — khi chạy thật,
charlib.py lấy tên chính xác từ /object_info của ComfyUI của bạn.
"""
from __future__ import annotations

import json
import sys
import tempfile
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import make_demo_splat  # noqa: E402


def _n(required=None, optional=None, output_node=False):
    req = required or {}
    opt = optional or {}
    return {"input": {"required": req, "optional": opt},
            "input_order": {"required": list(req), "optional": list(opt)},
            "output_node": output_node}


INT, FLOAT, STR, BOOL = ["INT", {}], ["FLOAT", {}], ["STRING", {}], ["BOOLEAN", {}]
SEED = ["INT", {"control_after_generate": True}]

OBJECT_INFO = {
    "LoadImage": _n({"image": [["a.png"], {"image_upload": True}]}),
    "SaveGLB": _n({"mesh": ["MESH"], "filename_prefix": STR}, output_node=True),
    "SaveVideo": _n({"video": ["VIDEO"], "filename_prefix": STR, "format": [["auto"]], "codec": [["auto"]]},
                    output_node=True),
    "CreateVideo": _n({"images": ["IMAGE"], "fps": FLOAT}, {"audio": ["AUDIO"]}),
    "CreateCameraInfo": _n({k: (STR if k in ("mode", "projection") else FLOAT) for k in
                            ["mode", "fov", "elevation", "distance", "a", "b", "c", "d", "frames", "e", "projection"]}),
    "RenderSplat": _n({"splat": ["SPLAT"], "width": INT, "height": INT, "fov": FLOAT, "a": FLOAT, "b": FLOAT,
                       "c": FLOAT, "d": FLOAT, "bg_mode": STR, "bg_color": STR},
                      {"bg_image": ["IMAGE"], "camera_info": ["LOAD3D_CAMERA"]}),
    "SplatToMesh": _n({"splat": ["SPLAT"], **{f"p{i}": FLOAT for i in range(7)}}),
    "SplatToFile3D": _n({"splat": ["SPLAT"], "format": [["spz", "ply"]]}),
    "RemoveBackground": _n({"image": ["IMAGE"], "bg_removal_model": ["BACKGROUND_REMOVAL"]}),
    "LoadBackgroundRemovalModel": _n({"bg_removal_name": [["birefnet.safetensors"]]}),
    "InvertMask": _n({"mask": ["MASK"]}),
    "JoinImageWithAlpha": _n({"image": ["IMAGE"], "alpha": ["MASK"]}),
    "TripoSplatConditioning": _n({"clip_vision": ["CLIP_VISION"], "vae": ["VAE"], "image": ["IMAGE"]}),
    "PreviewImage": _n({"images": ["IMAGE"]}, output_node=True),
    "KSampler": _n({"model": ["MODEL"], "seed": SEED, "steps": INT, "cfg": FLOAT, "sampler_name": [["dpmpp_2m"]],
                    "scheduler": [["simple"]], "positive": ["CONDITIONING"], "negative": ["CONDITIONING"],
                    "latent_image": ["LATENT"], "denoise": FLOAT}),
    "ComfySwitchNode": _n({"switch": BOOL}, {"on_false": ["*"], "on_true": ["*"]}),
    "TripoSplatPreprocessImage": _n({"image": ["IMAGE"], "padding": FLOAT, "resolution": INT}, {"mask": ["MASK"]}),
    "CLIPVisionLoader": _n({"clip_name": [["dino_v3_vit_h.safetensors"]]}),
    "VAELoader": _n({"vae_name": [["flux2-vae.safetensors"]]}),
    "VAEDecodeTripoSplat": _n({"samples": ["LATENT"], "vae": ["VAE"], "num_gaussians": INT, "seed": SEED}),
    "UNETLoader": _n({"unet_name": [["triposplat_fp16.safetensors"]], "weight_dtype": [["default"]]}),
    "TripoSplatSamplingPreview": _n({"model": ["MODEL"], "vae": ["VAE"], **{f"p{i}": INT for i in range(5)}}),
}


class MockComfy:
    def __init__(self):
        self.prompts: dict[str, dict] = {}
        self.uploads: list[str] = []
        self.files: dict[str, bytes] = {}
        self._tmp = tempfile.mkdtemp()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), self._handler())
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def __enter__(self):
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        return self

    def __exit__(self, *a):
        self.server.shutdown()

    def _run(self, prompt: dict) -> dict:
        errors = {}
        for nid, node in prompt.items():
            if node["class_type"] not in OBJECT_INFO:
                errors[nid] = f"unknown class {node['class_type']}"
            for k, v in node["inputs"].items():
                if isinstance(v, list) and (len(v) != 2 or v[0] not in prompt):
                    errors[nid] = f"bad link {k}={v}"
        if errors:
            return {"error": errors}
        outputs = {}
        for nid, node in prompt.items():
            if node["class_type"] in ("SaveGLB", "SaveVideo"):
                prefix = node["inputs"]["filename_prefix"]
                src = node["inputs"].get("mesh") or node["inputs"].get("video")
                src_cls = prompt[src[0]]["class_type"]
                ext = {"SplatToFile3D": ".spz", "SplatToMesh": ".glb", "CreateVideo": ".mp4"}[src_cls]
                fname = f"{Path(prefix).name}_00001_{ext}"
                sub = str(Path(prefix).parent)
                data = b"fake-" + ext.encode()
                if ext == ".spz":
                    tmp = Path(self._tmp) / "m.spz"
                    make_demo_splat.write_spz(tmp, make_demo_splat.sample(3000))
                    data = tmp.read_bytes()
                self.files[f"{sub}/{fname}"] = data
                key = "3d" if ext in (".spz", ".glb") else "images"
                outputs[nid] = {key: [{"filename": fname, "subfolder": sub, "type": "output"}]}
        return {"outputs": outputs}

    def _handler(self):
        mock = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, code, body, ctype="application/json"):
                if not isinstance(body, bytes):
                    body = json.dumps(body).encode()
                self.send_response(code)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                u = urlparse(self.path)
                if u.path == "/object_info":
                    return self._send(200, OBJECT_INFO)
                if u.path.startswith("/history/"):
                    pid = u.path.split("/")[-1]
                    p = mock.prompts.get(pid)
                    if not p:
                        return self._send(200, {})
                    res = mock._run(p)
                    if "error" in res:
                        return self._send(200, {pid: {"outputs": {}, "status": {
                            "status_str": "error", "completed": False,
                            "messages": [["execution_error", res["error"]]]}}})
                    return self._send(200, {pid: {**res, "status": {"status_str": "success", "completed": True}}})
                if u.path == "/view":
                    q = parse_qs(u.query)
                    key = f"{q['subfolder'][0]}/{q['filename'][0]}"
                    return self._send(200, mock.files[key], "application/octet-stream")
                self._send(404, {"error": "not found"})

            def do_POST(self):
                body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                if self.path == "/upload/image":
                    name = body.split(b'filename="', 1)[1].split(b'"', 1)[0].decode()
                    mock.uploads.append(name)
                    return self._send(200, {"name": name, "subfolder": "", "type": "input"})
                if self.path == "/prompt":
                    data = json.loads(body)
                    pid = str(uuid.uuid4())
                    mock.prompts[pid] = data["prompt"]
                    return self._send(200, {"prompt_id": pid, "number": 1, "node_errors": {}})
                self._send(404, {"error": "not found"})

        return H
