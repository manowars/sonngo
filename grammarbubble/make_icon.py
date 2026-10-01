"""Render icon.png and icon.ico from the bubble drawing. Run: python make_icon.py"""

import os
import sys

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtCore import Qt
from PySide6.QtGui import QGuiApplication, QImage, QPainter

from app import draw_bubble

SIZES = [16, 24, 32, 48, 64, 128, 256]


def render(size: int) -> QImage:
    img = QImage(size, size, QImage.Format_ARGB32)
    img.fill(Qt.transparent)
    p = QPainter(img)
    draw_bubble(p, size)
    p.end()
    return img


if __name__ == "__main__":
    app = QGuiApplication(sys.argv)
    render(256).save("icon.png")
    # Qt's ICO writer stores one image per frame; build a multi-size .ico with Pillow.
    from PIL import Image

    frames = []
    for s in SIZES:
        render(s).save(f"_icon{s}.png")
        frames.append(Image.open(f"_icon{s}.png"))
    frames[-1].save("icon.ico", sizes=[(s, s) for s in SIZES], append_images=frames[:-1])
    for s in SIZES:
        os.remove(f"_icon{s}.png")
    print("wrote icon.png, icon.ico")
