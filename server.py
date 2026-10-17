"""Serve the training modules app and save its session log as JSON."""

import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock


ROOT = Path(__file__).resolve().parent
ADDRESS = "127.0.0.1"
PORT = 8765
LOG_FILE = ROOT / "session-log.json"
LOG_LOCK = Lock()


class TrainingHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == "/api/logs":
            with LOG_LOCK:
                logs = json.loads(LOG_FILE.read_text(encoding="utf-8"))
            self._send_json(logs)
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/logs":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            entry = json.loads(self.rfile.read(length))
            if not all(key in entry for key in ("module", "date", "startTime", "duration")):
                self.send_error(400, "Log entry is missing required fields")
                return
            with LOG_LOCK:
                logs = json.loads(LOG_FILE.read_text(encoding="utf-8"))
                logs.insert(0, entry)
                LOG_FILE.write_text(json.dumps(logs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            self._send_json({"ok": True, "logs": logs})
        except (ValueError, OSError) as error:
            self.send_error(400, str(error))

    def do_DELETE(self):
        if self.path != "/api/logs":
            self.send_error(404)
            return
        with LOG_LOCK:
            LOG_FILE.write_text("[]\n", encoding="utf-8")
        self._send_json({"ok": True, "logs": []})

    def _send_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    if not LOG_FILE.exists():
        LOG_FILE.write_text("[]\n", encoding="utf-8")
    server = ThreadingHTTPServer((ADDRESS, PORT), TrainingHandler)
    print(f"Training modules are available at http://localhost:{PORT}/")
    print("Press Ctrl+C to stop the server.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()
