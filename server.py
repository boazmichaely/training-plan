"""Serve the read-only training plan app and its static assets."""

import argparse
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ADDRESS = "127.0.0.1"
PORT = 8765
PRIVATE_LOG = ROOT / "session-log.json"


class TrainingHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _is_private_log(self):
        try:
            return Path(super().translate_path(self.path)).resolve() == PRIVATE_LOG.resolve()
        except OSError:
            return False

    def do_GET(self):
        if self._is_private_log():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if self._is_private_log():
            self.send_error(404)
            return
        super().do_HEAD()


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
