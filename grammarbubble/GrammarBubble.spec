# PyInstaller build: `pyinstaller GrammarBubble.spec` -> dist/GrammarBubble.exe (one file, no console).
# Paths are relative to this file. UPX stays off: packed executables trip antivirus heuristics.

a = Analysis(
    ["app.py"],
    datas=[("icon.png", ".")],
    excludes=["tkinter"],
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="GrammarBubble",
    console=False,
    upx=False,
    icon=["icon.ico"],
)
