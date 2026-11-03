"""Serve the bundled webcam app on this computer. Python 3, no pip packages."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent / 'docs'

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.wasm': 'application/wasm'}

def main():
    try:
        server = ThreadingHTTPServer(('127.0.0.1', 8000), partial(Handler, directory=str(ROOT)))
    except OSError as error:
        print('Could not start localhost:8000:', error)
        print('Close any other server using port 8000, then run this launcher again.')
        return 1
    print('Gum-Gum Hand Stretch is running at http://localhost:8000')
    print('Keep this window open. Press Ctrl+C here to stop the server.')
    threading.Timer(0.8, lambda: webbrowser.open('http://localhost:8000')).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
    finally:
        server.server_close()
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
