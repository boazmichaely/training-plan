"""Serve the training modules app and save its session log as JSON."""

import argparse
import json
import socket
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


def get_lan_address():
    """Return the IPv4 address used by the default network route, if available."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            # UDP connect selects a route but sends no packet.
            probe.connect(("192.0.2.1", 80))
            return probe.getsockname()[0]
    except OSError:
        return None


def main():
    parser = argparse.ArgumentParser(description="Run the local training plan app.")
    parser.add_argument(
        "--lan",
        action="store_true",
        help="also allow devices on your local network to connect",
    )
    args = parser.parse_args()

    if not LOG_FILE.exists():
        LOG_FILE.write_text("[]\n", encoding="utf-8")

    address = "0.0.0.0" if args.lan else ADDRESS
    server = ThreadingHTTPServer((address, PORT), TrainingHandler)
    if args.lan:
        lan_address = get_lan_address()
        print("Local network access is enabled. Use this only on a trusted home network.")
        print(f"On this computer: http://localhost:{PORT}/")
        if lan_address:
            print(f"On another device: http://{lan_address}:{PORT}/")
        else:
            print("Could not detect the network address. Run ipconfig to find the computer's IPv4 address.")
        print("If Windows Firewall asks, allow Python on Private networks only. Do not set up router port forwarding.")
    else:
        print(f"Training modules are available at http://localhost:{PORT}/")
    print("Press Ctrl+C to stop the server.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
