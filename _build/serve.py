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

# Threading: 모듈 20여 개 + SW 캐시 프리로드가 동시에 때리면 단일 스레드는 통째로 잠긴다
class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

with Server(('127.0.0.1', PORT), H) as httpd:
    print(f'serving {ROOT} at http://127.0.0.1:{PORT}')
    httpd.serve_forever()
