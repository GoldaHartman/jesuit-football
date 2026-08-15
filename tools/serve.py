#!/usr/bin/env python3
"""
Local dev server for docs/, with caching turned all the way off.

python -m http.server sends no cache headers at all, which lets browsers
heuristically cache index.html — so you edit the app, reload, and still see
the old one. That wasted a real debugging round. This sends no-store on
everything, so what you see is always what is on disk.

Usage: serve.py [port]     (default 8770, listening on the LAN)
"""

import functools
import http.server
import socket
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # keep the console readable — only show failures
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


def lan_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
    handler = functools.partial(NoCacheHandler, directory=str(DOCS))
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)

    print(f"Serving {DOCS} with caching disabled\n")
    print(f"  This Mac:  http://localhost:{port}")
    print(f"  Your phone: http://{lan_ip()}:{port}   (same wifi)\n")
    print("Ctrl-C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
