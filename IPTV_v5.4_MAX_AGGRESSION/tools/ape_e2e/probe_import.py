import functools, sys, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

DNR_JSON = r"C:\Users\HFRC\Downloads\LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120-DNR.json"
FRONTEND = r"c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION-master (8)\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION-master\IPTV_v5.4_MAX_AGGRESSION\frontend"
PORT = 8646

class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

httpd = ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Q, directory=FRONTEND))
threading.Thread(target=httpd.serve_forever, daemon=True).start()

dialogs, logs = [], []
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"])
    pg = b.new_page()
    pg.on("dialog", lambda d: (dialogs.append(d.type + " :: " + d.message[:150].replace("\n", " | ")), d.accept()))
    pg.on("console", lambda m: logs.append(m.type + ": " + m.text[:160]))
    pg.on("pageerror", lambda e: logs.append("PAGEERROR: " + str(e)[:300]))
    pg.goto("http://127.0.0.1:%d/index-v4.html" % PORT, timeout=90000, wait_until="domcontentloaded")
    pg.wait_for_function("typeof window.ProfileManagerV9==='object'", timeout=60000)
    print("== app up, disparando import ==")
    pg.evaluate("window.ProfileManagerV9.importFromLAB()")
    pg.wait_for_selector("input[type=file][accept='.json']", state="attached", timeout=10000)
    pg.set_input_files("input[type=file][accept='.json']", DNR_JSON)
    pg.wait_for_timeout(15000)
    keys = pg.evaluate("Object.keys(localStorage).filter(k=>k.indexOf('ape_lab')>=0)")
    meta = pg.evaluate("localStorage.getItem('ape_lab_bulletproof_meta')")
    print("== ape_lab keys:", keys)
    print("== bulletproof_meta:", (meta[:200] + "...") if meta else None)
    print("== DIALOGOS (%d):" % len(dialogs))
    for d in dialogs:
        print("  " + d)
    print("== CONSOLE LAB/ERROR:")
    for l in logs:
        low = l.lower()
        if "lab" in low or "error" in low or "fail" in low:
            print("  " + l)
    b.close()
