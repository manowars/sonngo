"""Kiểm tra charlib.py với ComfyUI giả lập.

  python3 -m unittest discover -s tests -v

Cần workflow mẫu ở workflows/ (chạy `python3 tools/charlib.py fetch-workflow`)
hoặc đặt biến môi trường CHARLIB_TEMPLATE trỏ tới file đó.
"""
import json
import os
import struct
import sys
import tempfile
import unittest
import gzip
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "tools"))
sys.path.insert(0, str(HERE))
import charlib  # noqa: E402
import make_demo_splat  # noqa: E402
from mock_comfy import OBJECT_INFO, MockComfy  # noqa: E402

TEMPLATE = Path(os.environ.get("CHARLIB_TEMPLATE", charlib.DEFAULT_WORKFLOW))


@unittest.skipUnless(TEMPLATE.exists(), f"thiếu {TEMPLATE}")
class ConvertTest(unittest.TestCase):
    def setUp(self):
        self.wf = json.loads(TEMPLATE.read_text("utf-8"))

    def test_flatten_subgraphs(self):
        api = charlib.ui_to_api(self.wf, OBJECT_INFO)
        classes = sorted(v["class_type"] for v in api.values())
        self.assertIn("KSampler", classes)
        self.assertIn("RemoveBackground", classes)
        self.assertNotIn("SplatToMesh", classes)  # nhánh GLB đang bypass
        self.assertNotIn("PreviewImage", classes)
        for nid, node in api.items():
            for k, v in node["inputs"].items():
                if isinstance(v, list):
                    self.assertIn(v[0], api, f"{nid}.{k} trỏ tới nút không tồn tại")
        ks = next(v for v in api.values() if v["class_type"] == "KSampler")
        self.assertEqual(ks["inputs"]["steps"], 20)      # bỏ đúng "fixed" sau seed
        self.assertEqual(ks["inputs"]["sampler_name"], "dpmpp_2m")
        dec = next(v for v in api.values() if v["class_type"] == "VAEDecodeTripoSplat")
        self.assertEqual(dec["inputs"]["num_gaussians"], 262144)
        bg = next(v for v in api.values() if v["class_type"] == "LoadBackgroundRemovalModel")
        self.assertEqual(bg["inputs"]["bg_removal_name"], "birefnet.safetensors")
        # Mask từ LoadImage đi qua InvertMask của subgraph
        inv = [k for k, v in api.items() if v["class_type"] == "InvertMask"
               and api[v["inputs"]["mask"][0]]["class_type"] == "LoadImage"]
        self.assertEqual(len(inv), 1)

    def test_glb_branch_and_patch(self):
        charlib.enable_glb_branch(self.wf)
        api = charlib.ui_to_api(self.wf, OBJECT_INFO)
        self.assertIn("SplatToMesh", [v["class_type"] for v in api.values()])
        charlib.patch_prompt(api, image="x.png", seed=5, num_gaussians=65536, remove_bg=False, prefix="charlib/x/x")
        sw = [v for v in api.values() if v["class_type"] == "ComfySwitchNode"
              and api[v["inputs"]["on_true"][0]]["class_type"] == "RemoveBackground"]
        self.assertEqual(sw[0]["inputs"]["switch"], False)
        self.assertTrue(all(v["inputs"]["filename_prefix"] == "charlib/x/x"
                            for v in api.values() if "filename_prefix" in v["inputs"]))


@unittest.skipUnless(TEMPLATE.exists(), f"thiếu {TEMPLATE}")
class BuildTest(unittest.TestCase):
    def test_build_end_to_end(self):
        tmp = Path(tempfile.mkdtemp())
        inp, lib = tmp / "input", tmp / "library"
        inp.mkdir()
        (inp / "Hiep Si Lua.png").write_bytes(b"\x89PNG fake")
        (inp / "characters.json").write_text(json.dumps(
            {"hiep-si-lua": {"name": "Hiệp sĩ Lửa", "role": "Tank", "tags": ["lửa"]}}), "utf-8")
        old = charlib.INPUT_DIR, charlib.LIBRARY_DIR, charlib.CHAR_DIR
        charlib.INPUT_DIR, charlib.LIBRARY_DIR, charlib.CHAR_DIR = inp, lib, lib / "characters"
        try:
            with MockComfy() as mock:
                charlib.main(["build", "--server", mock.url, "--workflow", str(TEMPLATE), "--glb", "--seed", "42"])
                self.assertEqual(mock.uploads, ["charlib_hiep-si-lua.png"])
        finally:
            charlib.INPUT_DIR, charlib.LIBRARY_DIR, charlib.CHAR_DIR = old
        idx = json.loads((lib / "index.json").read_text("utf-8"))
        self.assertEqual(idx["count"], 1)
        c = idx["characters"][0]
        self.assertEqual((c["id"], c["name"], c["role"]), ("hiep-si-lua", "Hiệp sĩ Lửa", "Tank"))
        self.assertEqual(c["generation"]["seed"], 42)
        for key in ("splat", "glb", "turntable", "source"):
            self.assertTrue((lib / c[key]).exists(), key)
        self.assertTrue(c["splat"].endswith(".spz"))


class SpzTest(unittest.TestCase):
    def test_header(self):
        tmp = Path(tempfile.mkdtemp()) / "a.spz"
        n = make_demo_splat.write_spz(tmp, make_demo_splat.sample(1000))
        raw = gzip.decompress(tmp.read_bytes())
        magic, ver, count = struct.unpack("<III", raw[:12])
        self.assertEqual((magic, ver, count), (0x5053474E, 2, n))
        self.assertEqual(len(raw), 16 + n * (9 + 1 + 3 + 3 + 3))


if __name__ == "__main__":
    unittest.main()
