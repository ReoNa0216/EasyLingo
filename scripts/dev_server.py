from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import urllib.parse

ROOT_DIR = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT_DIR / "src"
NODE_MODULES_DIR = ROOT_DIR / "node_modules"
PORT = 1420


class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def translate_path(self, path):
        """重写路径解析，支持 node_modules"""
        parsed = urllib.parse.urlparse(path)
        clean_path = urllib.parse.unquote(parsed.path)
        
        # 处理 node_modules 路径
        if clean_path.startswith('/node_modules/'):
            relative = clean_path[len('/node_modules/'):]
            return str(NODE_MODULES_DIR / relative)
        
        # 默认行为：从 WEB_DIR 提供
        return str(WEB_DIR / clean_path.lstrip('/'))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("", PORT), NoCacheHandler)
    print(f"Serving {WEB_DIR} at http://localhost:{PORT} (cache disabled)")
    print(f"Node modules served from {NODE_MODULES_DIR}")
    server.serve_forever()
