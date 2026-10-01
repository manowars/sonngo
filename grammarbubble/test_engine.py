"""Offline tests: run with `python -m unittest` (no API key or Ollama needed)."""

import json
import unittest

import engine


class FakeBackend:
    def __init__(self, reply):
        self.reply = reply
        self.system = None

    def correct(self, text, system):
        self.system = system
        return self.reply


CFG = {"explain_in": "Vietnamese", "max_chars": 8000}


class EngineTests(unittest.TestCase):
    def test_detect_language(self):
        self.assertEqual(engine.detect_language("He go to school yesterday."), "en")
        self.assertEqual(engine.detect_language("저는 어제 학교에 갔어요."), "ko")
        self.assertEqual(engine.detect_language("저는 KAIST에서 AI를 공부합니다."), "ko")

    def test_check_text_parses_edits(self):
        reply = json.dumps({
            "language": "en",
            "corrected_text": "He went to school yesterday.",
            "edits": [
                {"original": "go", "suggestion": "went", "type": "grammar", "explanation": "Quá khứ."},
                {"original": "x", "suggestion": "x", "type": "style", "explanation": "no-op"},
            ],
            "summary": "Một lỗi thì.",
        })
        backend = FakeBackend(reply)
        r = engine.check_text("He go to school yesterday.", CFG, backend=backend)
        self.assertEqual(r.corrected_text, "He went to school yesterday.")
        self.assertEqual([e.suggestion for e in r.edits], ["went"])  # no-op edit dropped
        self.assertIn("English", backend.system)
        self.assertIn("Vietnamese", backend.system)

    def test_korean_prompt_and_fenced_json(self):
        reply = '```json\n{"language":"ko","corrected_text":"저는 학교에 갔어요.","edits":[],"summary":""}\n```'
        backend = FakeBackend(reply)
        r = engine.check_text("저는 학교에 갔어요.", CFG, backend=backend)
        self.assertEqual(r.language, "ko")
        self.assertIn("띄어쓰기", backend.system)

    def test_errors(self):
        with self.assertRaises(engine.CorrectionError):
            engine.check_text("   ", CFG, backend=FakeBackend("{}"))
        with self.assertRaises(engine.CorrectionError):
            engine.check_text("hello", CFG, backend=FakeBackend("not json"))
        with self.assertRaises(engine.CorrectionError):
            engine.check_text("x" * 9000, CFG, backend=FakeBackend("{}"))

    def test_unknown_edit_type_falls_back_to_style(self):
        r = engine.parse_result(
            {"corrected_text": "b", "edits": [{"original": "a", "suggestion": "b", "type": "weird"}]}, "a", "en"
        )
        self.assertEqual(r.edits[0].type, "style")


class ConfigTests(unittest.TestCase):
    def test_broken_file_is_reported_and_not_overwritten(self):
        import tempfile
        from pathlib import Path

        import config

        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "config.json"
            old = config.CONFIG_PATH
            config.CONFIG_PATH = path
            try:
                path.write_text('{"anthropic_api_key": "k",}', encoding="utf-8")
                with self.assertRaises(ValueError):
                    config.read()
                self.assertEqual(config.load()["anthropic_api_key"], "")
                config.save({"tone": "formal"})
                self.assertIn('"k",}', path.read_text(encoding="utf-8"))  # untouched
                path.write_text('\ufeff{"tone": "academic"}', encoding="utf-8")  # Notepad BOM
                self.assertEqual(config.read()["tone"], "academic")
            finally:
                config.CONFIG_PATH = old


if __name__ == "__main__":
    unittest.main()
