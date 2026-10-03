"""Offline tests: run with `python -m unittest` (no API key or Ollama needed)."""

import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

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


class FakeOllama(BaseHTTPRequestHandler):
    models = ["nomic-embed-text:latest", "llama3.2:3b", "qwen2.5:7b"]
    last_chat = None

    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send(200, {"models": [{"name": n} for n in self.models]})

    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeOllama.last_chat = req
        if req["model"] not in self.models:
            self._send(404, {"error": f"model '{req['model']}' not found"})
            return
        content = json.dumps({"language": "en", "corrected_text": "He went home.", "edits": [], "summary": ""})
        self._send(200, {"message": {"role": "assistant", "content": content}})

    def log_message(self, *args):
        pass


class OllamaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), FakeOllama)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_list_and_pick_models(self):
        models = engine.list_ollama_models(self.url)
        self.assertEqual(models, ["llama3.2:3b", "qwen2.5:7b"])  # embedding model dropped
        self.assertEqual(engine.pick_ollama_model(models), "qwen2.5:7b")
        self.assertEqual(engine.pick_ollama_model(models, "llama3.2:3b"), "llama3.2:3b")
        self.assertEqual(engine.pick_ollama_model(["phi4:latest"]), "phi4:latest")
        self.assertIsNone(engine.pick_ollama_model([]))
        self.assertIsNone(engine.list_ollama_models("http://127.0.0.1:9", timeout=1))

    def test_check_text_through_ollama(self):
        cfg = dict(CFG, backend="ollama", ollama_model="qwen2.5:7b", ollama_url=self.url)
        r = engine.check_text("He go home.", cfg)
        self.assertEqual(r.corrected_text, "He went home.")
        self.assertEqual(FakeOllama.last_chat["format"], engine.SCHEMA)

    def test_missing_model_lists_installed_ones(self):
        cfg = dict(CFG, backend="ollama", ollama_model="gemma3:12b", ollama_url=self.url)
        with self.assertRaises(engine.CorrectionError) as ctx:
            engine.check_text("He go home.", cfg)
        self.assertIn("qwen2.5:7b", str(ctx.exception))
        self.assertIn("ollama pull gemma3:12b", str(ctx.exception))

    def test_first_run_picks_local_ollama(self):
        import app
        import config

        with tempfile.TemporaryDirectory() as d:
            old, config.CONFIG_PATH = config.CONFIG_PATH, Path(d) / "config.json"
            key = os.environ.pop("ANTHROPIC_API_KEY", None)
            try:
                cfg = dict(config.DEFAULTS, ollama_url=self.url)
                app.first_run_setup(cfg)
                self.assertEqual((cfg["backend"], cfg["ollama_model"]), ("ollama", "qwen2.5:7b"))
                self.assertEqual(config.read()["backend"], "ollama")

                cfg = dict(config.DEFAULTS, ollama_url="http://127.0.0.1:9")  # no Ollama
                app.first_run_setup(cfg)
                self.assertEqual(cfg["backend"], "claude")
            finally:
                config.CONFIG_PATH = old
                if key is not None:
                    os.environ["ANTHROPIC_API_KEY"] = key


class ConfigTests(unittest.TestCase):
    def test_broken_file_is_reported_and_not_overwritten(self):
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
