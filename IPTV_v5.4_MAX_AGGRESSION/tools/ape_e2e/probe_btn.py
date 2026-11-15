import functools, sys, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DNR_JSON = r"C:\Users\HFRC\Downloads\LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120-DNR.json"
FRONTEND = r"c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION-master (8)\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION-master\IPTV_v5.4_MAX_AGGRESSION\frontend"
PORT = 8646

class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

httpd = ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Q, directory=FRONTEND))
threading.Thread(target=httpd.serve_forever, daemon=True).start()

dialogs = []
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"])
    pg = b.new_page()
    pg.on("dialog", lambda d: (dialogs.append(d.type), d.accept()))
    pg.on("console", lambda m: print("   [console." + m.type + "]", m.text[:180]) if ("APE" in m.text or "LAB" in m.text or m.type == "error" or "PROBE" in m.text or "GATE" in m.text or "TYPED" in m.text or "PRE-FLIGHT" in m.text) else None)
    pg.goto("http://127.0.0.1:%d/index-v4.html" % PORT, timeout=90000, wait_until="domcontentloaded")
    pg.wait_for_function("typeof window.ProfileManagerV9==='object'", timeout=60000)

    with pg.expect_file_chooser() as fc:
        pg.evaluate("window.ProfileManagerV9.importFromLAB()")
    fc.value.set_files(DNR_JSON)
    pg.wait_for_function("(()=>{try{return !!JSON.parse(localStorage.getItem('ape_lab_bulletproof_meta')||'null').imported_at}catch(e){return false}})()", timeout=30000)
    print("== import OK")

    pg.evaluate(
        "(()=>{"
        "window.__mockChannels=[{id:'c1',name:'T P2',url:'http://provider.example/live/u/p/101.ts',group:'E2E',profile:'P2'},"
        "{id:'c2',name:'T P3',url:'http://provider.example/live/u/p/303.ts',group:'E2E',profile:'P3'},"
        "{id:'c3',name:'T P5',url:'http://provider.example/live/u/p/505.ts',group:'E2E',profile:'P5'}];"
        "if(!window.app)window.app={};window.app.getFilteredChannels=()=>window.__mockChannels;"
        "if(!window.app.showToast)window.app.showToast=()=>{};"
        # marcadores de fase
        "if(window.APEHealthRuntime&&window.APEHealthRuntime.ensureReady){const o=window.APEHealthRuntime.ensureReady.bind(window.APEHealthRuntime);"
        "window.APEHealthRuntime.ensureReady=async(...a)=>{window.__m1='ensureReady:start';try{const r=await o(...a);window.__m1='ensureReady:end';return r;}catch(e){window.__m1='ensureReady:err';throw e;}};}"
        "const G=window.M3U8TypedArraysGenerator,orig=G.generate.bind(G);"
        "G.generateAndDownloadStreaming=async(c,o)=>{window.__m2='gen:start';"
        "try{const blob=await orig(c,Object.assign({},o,{skipMetaScan:true,skipProbe:true}));window.__btnBlob=await blob.text();window.__m2='gen:end';"
        "return {mode:'CAP',bytes:window.__btnBlob.length};}catch(e){window.__m2='gen:err '+String(e);throw e;}};"
        "return 'set';})()")

    pg.evaluate("document.querySelector('#btnGenerateAudited').click()")
    print("== click hecho, esperando fases...")
    for i in range(12):
        pg.wait_for_timeout(5000)
        st = pg.evaluate("JSON.stringify({m1:window.__m1||null,m2:window.__m2||null,blob:(window.__btnBlob||'').length,keys:Object.keys(window).filter(k=>k.indexOf('__m')===0)})")
        print("t+%02ds %s" % ((i + 1) * 5, st))
        if pg.evaluate("!!window.__btnBlob || (window.__m2||'').indexOf('err')>=0"):
            break
    print("== dialogs:", len(dialogs))
    b.close()
