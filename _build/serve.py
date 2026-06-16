# Static server with correct MIME types for ES modules (Windows-safe).
import http.server, socketserver, os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5577
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.chdir(ROOT)

H = http.server.SimpleHTTPRequestHandler
H.extensions_map = dict(H.extensions_map)
H.extensions_map.update({
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
    '.html': 'text/html',
})

class Server(socketserver.TCPServer):
    allow_reuse_address = True

with Server(('127.0.0.1', PORT), H) as httpd:
    print(f'serving {ROOT} at http://127.0.0.1:{PORT}')
    httpd.serve_forever()
