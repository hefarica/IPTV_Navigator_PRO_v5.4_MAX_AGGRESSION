import functools, http.server, sys
from http.server import ThreadingHTTPServer
DIR = r"c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION-master (8)\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION-master\IPTV_v5.4_MAX_AGGRESSION\frontend"
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIR)
with ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H) as httpd:
    httpd.serve_forever()
