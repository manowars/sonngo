"""GrammarBubble — a floating bubble that proofreads the clipboard (English / Korean).

Copy text anywhere, click the bubble, read the suggested corrections, press
"Copy bản sửa" and paste the fixed text back.
"""

from __future__ import annotations

import difflib
import html
import re
import sys

from PySide6.QtCore import QPoint, QRectF, Qt, QThread, QTimer, Signal
from PySide6.QtGui import (
    QAction,
    QActionGroup,
    QColor,
    QFont,
    QGuiApplication,
    QKeySequence,
    QPainter,
    QPen,
    QRadialGradient,
    QShortcut,
)
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QHBoxLayout,
    QLabel,
    QMenu,
    QPlainTextEdit,
    QPushButton,
    QSplitter,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

import config
import engine

LANG_CHOICES = [("auto", "Tự nhận diện"), ("en", "English"), ("ko", "한국어")]
TONE_CHOICES = [
    ("keep", "Giữ giọng văn"),
    ("formal", "Trang trọng"),
    ("academic", "Học thuật"),
    ("friendly", "Thân thiện"),
]
TYPE_LABELS = {
    "grammar": "Ngữ pháp",
    "spelling": "Chính tả",
    "punctuation": "Dấu câu",
    "word_choice": "Từ vựng",
    "style": "Văn phong",
}
TYPE_COLORS = {
    "grammar": "#dc2626",
    "spelling": "#ea580c",
    "punctuation": "#ca8a04",
    "word_choice": "#2563eb",
    "style": "#7c3aed",
}

_TOKEN = re.compile(r"\s+|\w+|[^\w\s]", re.UNICODE)


def diff_html(before: str, after: str) -> str:
    """Word-level diff: deletions struck through in red, insertions in green."""
    a, b = _TOKEN.findall(before), _TOKEN.findall(after)
    out = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        old, new = html.escape("".join(a[i1:i2])), html.escape("".join(b[j1:j2]))
        if op == "equal":
            out.append(old)
            continue
        if op in ("delete", "replace") and old.strip():
            out.append(
                f'<span style="background:#fee2e2;color:#b91c1c;text-decoration:line-through">{old}</span>'
            )
        if op in ("insert", "replace") and new:
            out.append(f'<span style="background:#dcfce7;color:#15803d">{new}</span>')
    return "".join(out).replace("\n", "<br>")


def plain_html(text: str) -> str:
    return html.escape(text).replace("\n", "<br>")


class CheckWorker(QThread):
    done = Signal(int, object)
    failed = Signal(int, str)

    def __init__(self, request_id: int, text: str, cfg: dict, language: str, tone: str):
        super().__init__()
        self.request_id, self.text, self.cfg = request_id, text, cfg
        self.language, self.tone = language, tone

    def run(self):
        try:
            result = engine.check_text(self.text, self.cfg, self.language, self.tone)
            self.done.emit(self.request_id, result)
        except engine.CorrectionError as e:
            self.failed.emit(self.request_id, str(e))
        except Exception as e:  # keep the UI alive on unexpected errors
            self.failed.emit(self.request_id, f"{type(e).__name__}: {e}")


class ResultWindow(QWidget):
    busy_changed = Signal(bool)

    def __init__(self, cfg: dict):
        super().__init__(None, Qt.Window | Qt.WindowStaysOnTopHint)
        self.cfg = cfg
        self.result: engine.Result | None = None
        self.request_id = 0
        self.workers: set[CheckWorker] = set()
        self.setWindowTitle("GrammarBubble — gợi ý sửa")
        self.resize(560, 640)

        self.lang_box = QComboBox()
        for key, label in LANG_CHOICES:
            self.lang_box.addItem(label, key)
        self.tone_box = QComboBox()
        for key, label in TONE_CHOICES:
            self.tone_box.addItem(label, key)
        self._select(self.lang_box, cfg.get("language", "auto"))
        self._select(self.tone_box, cfg.get("tone", "keep"))
        self.lang_box.currentIndexChanged.connect(self._remember_choices)
        self.tone_box.currentIndexChanged.connect(self._remember_choices)

        self.check_btn = QPushButton("Kiểm tra lại")
        self.check_btn.clicked.connect(lambda: self.start(self.source.toPlainText()))

        top = QHBoxLayout()
        top.addWidget(QLabel("Ngôn ngữ:"))
        top.addWidget(self.lang_box)
        top.addWidget(QLabel("Giọng văn:"))
        top.addWidget(self.tone_box)
        top.addStretch()
        top.addWidget(self.check_btn)

        self.source = QPlainTextEdit()
        self.source.setPlaceholderText("Văn bản gốc (lấy từ clipboard, có thể sửa rồi bấm Kiểm tra lại)")

        self.status = QLabel()
        self.status.setWordWrap(True)

        self.show_changes = QCheckBox("Đánh dấu thay đổi")
        self.show_changes.setChecked(True)
        self.show_changes.toggled.connect(self._render_corrected)

        self.corrected = QTextBrowser()
        self.edits = QTextBrowser()

        corrected_box = QWidget()
        cl = QVBoxLayout(corrected_box)
        cl.setContentsMargins(0, 0, 0, 0)
        head = QHBoxLayout()
        head.addWidget(self._title("Bản đề xuất"))
        head.addStretch()
        head.addWidget(self.show_changes)
        cl.addLayout(head)
        cl.addWidget(self.corrected)

        edits_box = QWidget()
        el = QVBoxLayout(edits_box)
        el.setContentsMargins(0, 0, 0, 0)
        el.addWidget(self._title("Chi tiết từng lỗi"))
        el.addWidget(self.edits)

        source_box = QWidget()
        sl = QVBoxLayout(source_box)
        sl.setContentsMargins(0, 0, 0, 0)
        sl.addWidget(self._title("Văn bản gốc"))
        sl.addWidget(self.source)

        splitter = QSplitter(Qt.Vertical)
        splitter.addWidget(source_box)
        splitter.addWidget(corrected_box)
        splitter.addWidget(edits_box)
        splitter.setSizes([140, 240, 220])

        self.copy_btn = QPushButton("Copy bản sửa")
        self.copy_btn.setDefault(True)
        self.copy_btn.clicked.connect(self.copy_corrected)
        close_btn = QPushButton("Đóng")
        close_btn.clicked.connect(self.hide)
        bottom = QHBoxLayout()
        bottom.addWidget(QLabel(self._backend_label()))
        bottom.addStretch()
        bottom.addWidget(self.copy_btn)
        bottom.addWidget(close_btn)

        layout = QVBoxLayout(self)
        layout.addLayout(top)
        layout.addWidget(splitter, 1)
        layout.addWidget(self.status)
        layout.addLayout(bottom)

        QShortcut(QKeySequence(Qt.Key_Escape), self, activated=self.hide)
        QShortcut(QKeySequence("Ctrl+Return"), self, activated=self.copy_corrected)

    @staticmethod
    def _title(text: str) -> QLabel:
        label = QLabel(text)
        font = label.font()
        font.setBold(True)
        label.setFont(font)
        return label

    @staticmethod
    def _select(box: QComboBox, key: str):
        idx = box.findData(key)
        box.setCurrentIndex(idx if idx >= 0 else 0)

    def _backend_label(self) -> str:
        if self.cfg.get("backend") == "ollama":
            return f"Ollama · {self.cfg['ollama_model']} (offline)"
        return f"Claude API · {self.cfg['claude_model']}"

    def _remember_choices(self):
        self.cfg["language"] = self.lang_box.currentData()
        self.cfg["tone"] = self.tone_box.currentData()
        config.save(self.cfg)

    def set_choices(self, language: str | None = None, tone: str | None = None):
        if language:
            self._select(self.lang_box, language)
        if tone:
            self._select(self.tone_box, tone)

    def start(self, text: str):
        self.request_id += 1
        self.result = None
        self.source.setPlainText(text)
        self.corrected.clear()
        self.edits.clear()
        self.copy_btn.setEnabled(False)
        if not text.strip():
            self._set_status("Clipboard đang trống — hãy copy (Ctrl/Cmd+C) đoạn văn trước rồi bấm bubble.", error=True)
            return
        self._set_status("Đang kiểm tra…")
        self.check_btn.setEnabled(False)
        self.busy_changed.emit(True)
        worker = CheckWorker(
            self.request_id, text, dict(self.cfg), self.lang_box.currentData(), self.tone_box.currentData()
        )
        worker.done.connect(self._on_done)
        worker.failed.connect(self._on_failed)
        worker.finished.connect(lambda: self.workers.discard(worker))
        self.workers.add(worker)
        worker.start()

    def _finish(self):
        self.check_btn.setEnabled(True)
        self.busy_changed.emit(False)

    def _on_failed(self, request_id: int, message: str):
        if request_id != self.request_id:
            return
        self._finish()
        self._set_status(message, error=True)

    def _on_done(self, request_id: int, result: engine.Result):
        if request_id != self.request_id:
            return
        self._finish()
        self.result = result
        self.copy_btn.setEnabled(True)
        lang = engine.LANG_NAMES.get(result.language, result.language)
        if result.corrected_text.strip() == result.original_text.strip():
            self._set_status(f"✓ {lang}: không phát hiện lỗi. {result.summary}")
        else:
            self._set_status(f"{lang} · {len(result.edits)} gợi ý. {result.summary}")
        self._render_corrected()
        self._render_edits()

    def _render_corrected(self):
        if not self.result:
            return
        r = self.result
        body = diff_html(r.original_text, r.corrected_text) if self.show_changes.isChecked() else plain_html(r.corrected_text)
        self.corrected.setHtml(f'<div style="font-size:14px;line-height:150%">{body}</div>')

    def _render_edits(self):
        r = self.result
        if not r.edits:
            self.edits.setHtml("<i>Không có thay đổi nào.</i>")
            return
        rows = []
        for i, e in enumerate(r.edits, 1):
            color = TYPE_COLORS.get(e.type, "#555")
            rows.append(
                f'<p style="margin:0 0 10px 0">'
                f"<b>{i}.</b> "
                f'<span style="color:{color};font-weight:bold">[{TYPE_LABELS.get(e.type, e.type)}]</span> '
                f'<span style="color:#b91c1c;text-decoration:line-through">{html.escape(e.original) or "∅"}</span>'
                f" → "
                f'<span style="color:#15803d;font-weight:bold">{html.escape(e.suggestion) or "∅"}</span><br>'
                f'<span style="color:#555">{html.escape(e.explanation)}</span></p>'
            )
        self.edits.setHtml("".join(rows))

    def _set_status(self, text: str, error: bool = False):
        self.status.setStyleSheet("color:#b91c1c" if error else "color:#444")
        self.status.setText(text)

    def copy_corrected(self):
        if not self.result:
            return
        QGuiApplication.clipboard().setText(self.result.corrected_text)
        self._set_status("Đã copy bản sửa — dán (Ctrl/Cmd+V) vào chỗ cũ.")

    def show_near(self, anchor: QPoint):
        screen = QGuiApplication.screenAt(anchor) or QGuiApplication.primaryScreen()
        area = screen.availableGeometry()
        x = anchor.x() - self.width() - 12
        if x < area.left():
            x = anchor.x() + 80
        x = max(area.left(), min(x, area.right() - self.width()))
        y = max(area.top(), min(anchor.y() - 40, area.bottom() - self.height()))
        self.move(x, y)
        self.show()
        self.raise_()
        self.activateWindow()


class Bubble(QWidget):
    SIZE = 60

    def __init__(self, cfg: dict):
        super().__init__(None, Qt.Tool | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint)
        self.cfg = cfg
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setAttribute(Qt.WA_MacAlwaysShowToolWindow)
        self.setFixedSize(self.SIZE, self.SIZE)
        self.setToolTip("Copy văn bản rồi click để sửa lỗi\nKéo để di chuyển · Chuột phải: tuỳ chọn")
        self.setCursor(Qt.PointingHandCursor)

        self.window = ResultWindow(cfg)
        self.window.busy_changed.connect(self._set_busy)
        self._press_pos: QPoint | None = None
        self._dragging = False
        self._busy = False
        self._angle = 0
        self._spin = QTimer(self, interval=30, timeout=self._tick)

        self._place()

    def _place(self):
        area = QGuiApplication.primaryScreen().availableGeometry()
        x, y = self.cfg.get("bubble_x"), self.cfg.get("bubble_y")
        pos = QPoint(x, y) if x is not None and y is not None else None
        if pos is None or QGuiApplication.screenAt(pos + QPoint(self.SIZE // 2, self.SIZE // 2)) is None:
            pos = QPoint(area.right() - self.SIZE - 24, area.top() + area.height() // 3)
        self.move(pos)

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        rect = QRectF(4, 4, self.SIZE - 8, self.SIZE - 8)
        grad = QRadialGradient(rect.center() - QPoint(8, 8), rect.width())
        grad.setColorAt(0, QColor("#6366f1"))
        grad.setColorAt(1, QColor("#3730a3"))
        p.setPen(QPen(QColor(255, 255, 255, 220), 2))
        p.setBrush(grad)
        p.drawEllipse(rect)
        if self._busy:
            pen = QPen(QColor("#fbbf24"), 3)
            pen.setCapStyle(Qt.RoundCap)
            p.setPen(pen)
            p.drawArc(rect.adjusted(2, 2, -2, -2), -self._angle * 16, 100 * 16)
        p.setPen(QColor("white"))
        font = QFont(self.font())
        font.setBold(True)
        font.setPixelSize(15)
        p.setFont(font)
        p.drawText(rect, Qt.AlignCenter, "Aa\n가")

    def _tick(self):
        self._angle = (self._angle + 12) % 360
        self.update()

    def _set_busy(self, busy: bool):
        self._busy = busy
        self._spin.start() if busy else self._spin.stop()
        self.update()

    def mousePressEvent(self, e):
        if e.button() == Qt.LeftButton:
            self._press_pos = e.globalPosition().toPoint()
            self._origin = self.pos()
            self._dragging = False

    def mouseMoveEvent(self, e):
        if self._press_pos is None:
            return
        delta = e.globalPosition().toPoint() - self._press_pos
        if self._dragging or delta.manhattanLength() > 6:
            self._dragging = True
            self.move(self._origin + delta)

    def mouseReleaseEvent(self, e):
        if e.button() != Qt.LeftButton or self._press_pos is None:
            return
        self._press_pos = None
        if self._dragging:
            self.cfg["bubble_x"], self.cfg["bubble_y"] = self.x(), self.y()
            config.save(self.cfg)
        else:
            self.check_clipboard()

    def check_clipboard(self):
        text = QGuiApplication.clipboard().text()
        self.window.show_near(self.pos())
        self.window.start(text)

    def contextMenuEvent(self, e):
        menu = QMenu(self)
        menu.addAction("Kiểm tra clipboard", self.check_clipboard)
        menu.addAction("Mở cửa sổ kết quả", lambda: self.window.show_near(self.pos()))
        menu.addSeparator()
        self._choice_menu(menu, "Ngôn ngữ", LANG_CHOICES, "language")
        self._choice_menu(menu, "Giọng văn", TONE_CHOICES, "tone")
        menu.addSeparator()
        menu.addAction(f"Cấu hình: {config.CONFIG_PATH}").setEnabled(False)
        menu.addAction("Thoát", QApplication.quit)
        menu.exec(e.globalPos())

    def _choice_menu(self, parent: QMenu, title: str, choices, key: str):
        sub = parent.addMenu(title)
        group = QActionGroup(sub)
        for value, label in choices:
            act = QAction(label, sub, checkable=True, checked=self.cfg.get(key) == value)
            act.triggered.connect(lambda _=False, v=value: self._set_choice(key, v))
            group.addAction(act)
            sub.addAction(act)

    def _set_choice(self, key: str, value: str):
        self.cfg[key] = value
        config.save(self.cfg)
        self.window.set_choices(**{key: value})


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("GrammarBubble")
    app.setQuitOnLastWindowClosed(False)
    bubble = Bubble(config.load())
    bubble.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
