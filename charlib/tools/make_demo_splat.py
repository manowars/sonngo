#!/usr/bin/env python3
"""Tạo một nhân vật splat giả lập (ma-nơ-canh) ở định dạng .spz.

Không cần GPU hay ComfyUI — dùng để thử trang thư viện và trình xem 3D trước
khi có nhân vật thật. File sinh ra là SPZ phiên bản 2 (Niantic), y hướng lên.

  python3 tools/make_demo_splat.py library/characters/demo-mannequin/model.spz
"""
from __future__ import annotations

import gzip
import math
import random
import struct
import sys
from pathlib import Path

SH_C0 = 0.28209479177387814

# (tâm x,y,z, bán kính rx,ry,rz, màu rgb 0..1)
PARTS = [
    ((0.00, 1.55, 0.00), (0.13, 0.15, 0.13), (0.96, 0.80, 0.66)),  # đầu
    ((0.00, 1.66, -0.02), (0.14, 0.09, 0.14), (0.20, 0.13, 0.10)),  # tóc
    ((0.00, 1.15, 0.00), (0.22, 0.28, 0.13), (0.15, 0.42, 0.75)),  # thân
    ((0.00, 0.82, 0.00), (0.20, 0.10, 0.12), (0.30, 0.22, 0.15)),  # thắt lưng
    ((-0.33, 1.18, 0.00), (0.06, 0.25, 0.06), (0.15, 0.42, 0.75)),  # tay trái
    ((0.33, 1.18, 0.00), (0.06, 0.25, 0.06), (0.15, 0.42, 0.75)),  # tay phải
    ((-0.34, 0.86, 0.00), (0.05, 0.06, 0.05), (0.96, 0.80, 0.66)),  # bàn tay
    ((0.34, 0.86, 0.00), (0.05, 0.06, 0.05), (0.96, 0.80, 0.66)),
    ((-0.11, 0.43, 0.00), (0.08, 0.36, 0.08), (0.18, 0.18, 0.24)),  # chân
    ((0.11, 0.43, 0.00), (0.08, 0.36, 0.08), (0.18, 0.18, 0.24)),
    ((-0.11, 0.04, 0.04), (0.08, 0.04, 0.12), (0.45, 0.25, 0.12)),  # giày
    ((0.11, 0.04, 0.04), (0.08, 0.04, 0.12), (0.45, 0.25, 0.12)),
    ((0.00, 1.12, -0.16), (0.24, 0.40, 0.03), (0.75, 0.15, 0.18)),  # áo choàng
]


def sample(n_total: int, seed: int = 7):
    rnd = random.Random(seed)
    vols = [rx * ry * rz for _, (rx, ry, rz), _ in PARTS]
    total = sum(vols)
    pts = []
    for (c, r, col), v in zip(PARTS, vols):
        for _ in range(max(200, int(n_total * v / total))):
            # điểm gần bề mặt ellipsoid
            u, w = rnd.uniform(-1, 1), rnd.uniform(0, 2 * math.pi)
            s = math.sqrt(1 - u * u)
            k = rnd.uniform(0.85, 1.0)
            d = (s * math.cos(w), u, s * math.sin(w))
            p = tuple(c[i] + r[i] * d[i] * k for i in range(3))
            shade = 0.75 + 0.25 * max(0.0, 0.3 * d[0] + 0.6 * d[1] + 0.7 * d[2])
            rgb = tuple(min(1.0, col[i] * shade + rnd.uniform(-0.03, 0.03)) for i in range(3))
            pts.append((p, rgb, rnd.uniform(0.012, 0.022)))
    return pts


def write_spz(path: Path, pts, fractional_bits: int = 12):
    n = len(pts)
    out = bytearray(struct.pack("<IIIBBBB", 0x5053474E, 2, n, 0, fractional_bits, 0, 0))
    scale = 1 << fractional_bits
    for p, _, _ in pts:
        for x in p:
            v = int(round(x * scale)) & 0xFFFFFF
            out += bytes((v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF))
    out += bytes(235 for _ in pts)  # độ đục ~0.92
    for _, rgb, _ in pts:
        for c in rgb:
            dc = (c - 0.5) / SH_C0
            out.append(max(0, min(255, round(dc * 0.15 * 255 + 0.5 * 255))))
    for _, _, s in pts:
        b = max(0, min(255, round((math.log(s) + 10.0) * 16.0)))
        out += bytes((b, b, b))
    out += bytes((128, 128, 128) * n)  # quaternion đơn vị
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(bytes(out), 9))
    return n


if __name__ == "__main__":
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "model.spz")
    count = write_spz(target, sample(int(sys.argv[2]) if len(sys.argv) > 2 else 40000))
    print(f"{target}: {count} gaussian, {target.stat().st_size // 1024} KB")
