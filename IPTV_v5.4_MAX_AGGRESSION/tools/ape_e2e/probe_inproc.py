import functools, sys, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

FRONTEND = r"c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION-master (8)\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION-master\IPTV_v5.4_MAX_AGGRESSION\frontend"

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

srv = ThreadingHTTPServer(("127.0.0.1", 8644), functools.partial(QuietHandler, directory=FRONTEND))
threading.Thread(target=srv.serve_forever, daemon=True).start()
print("server thread up")

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page()
    def g(route):
        if route.request.url.startswith("http://127.0.0.1:8644"):
            route.continue_()
        else:
            route.abort()
    pg.route("**/*", g)
    t0 = time.time()
    try:
        r = pg.goto("http://127.0.0.1:8644/index-v4.html", timeout=40000, wait_until="domcontentloaded")
        print("DCL ok %.1fs status=%s" % (time.time() - t0, r.status if r else None))
    except Exception as e:
        print("FAIL", str(e).split("\n")[0])
    b.close()
