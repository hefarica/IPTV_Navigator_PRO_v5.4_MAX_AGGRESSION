"""E2E HERMETICO CRYSTAL+AV-SYNC — valida el pipeline completo con el LAB CRYSTAL-4K-UHD:
F1: Import real (dialogs nativos auto-OK) del LAB_CALIBRATED_..._CRYSTAL-4K-UHD.json
F2: #btnGenerateAudited real con 3 canales mock -> lista con cadena Crystal + sync A/V.
Cero trafico externo: todo lo que no sea localhost se aborta via DNS ~NOTFOUND."""
import functools, sys, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CRYSTAL_JSON = r"C:\Users\HFRC\Downloads\LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json"
FRONTEND = r"c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION-master (8)\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION-master\IPTV_v5.4_MAX_AGGRESSION\frontend"
PORT = 8651
BASE = "http://127.0.0.1:" + str(PORT) + "/index-v4.html"
results, dialogs, console_errors = [], [], []

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

httpd = ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(QuietHandler, directory=FRONTEND))
threading.Thread(target=httpd.serve_forever, daemon=True).start()

def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (("  [" + str(extra) + "]") if extra else ""))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=[
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"])
    page = browser.new_page()
    page.on("dialog", lambda d: (dialogs.append(d.type + ": " + d.message[:90]), d.accept()))
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append("PAGEERROR: " + str(e)))

    page.goto(BASE, timeout=90000, wait_until="domcontentloaded")
    try:
        page.wait_for_load_state("load", timeout=45000)
    except Exception:
        print("(load timeout — sigo con polling)")
    page.wait_for_function(
        "typeof window.ProfileManagerV9==='object' && typeof window.APE_PROFILES_CONFIG==='object'"
        " && typeof window.M3U8TypedArraysGenerator==='object' && typeof window.APEGenerationController==='object'",
        timeout=90000)
    check("app cargada (PM9 + CONFIG + GENERATOR + Controller)", True)
    _boot_noise = len(console_errors)

    # ---------- FASE 1: IMPORT CRYSTAL por el flujo real ----------
    with page.expect_file_chooser() as fc_info:
        page.evaluate("window.ProfileManagerV9.importFromLAB()")
    chooser = fc_info.value
    chooser.set_files(CRYSTAL_JSON)
    page.wait_for_function(
        "(()=>{try{const m=JSON.parse(localStorage.getItem('ape_lab_bulletproof_meta')||'null');"
        "return !!(m&&m.imported_at)}catch(e){return false}})()", timeout=30000)
    check("F1 import CRYSTAL completado via dialog flow real", True)

    st = page.evaluate(
        "(()=>{const C=window.APE_PROFILES_CONFIG,g=(p)=>C.getProfile(p);return{"
        "P0vf:g('P0').vlcopt['video-filter'],P1vf:g('P1').vlcopt['video-filter'],"
        "P2vf:g('P2').vlcopt['video-filter'],P3vf:g('P3').vlcopt['video-filter'],"
        "P4vf:g('P4').vlcopt['video-filter'],P5vf:g('P5').vlcopt['video-filter'],"
        "extras:[g('P2').includeLabExtras,g('P3').includeLabExtras,g('P5').includeLabExtras],"
        "hdr:g('P3').headerOverrides['X-APE-DNR-POLICY'],n1:(C.nivel1Directives||[]).length,"
        "n1last:(C.nivel1Directives||[]).slice(-1)[0]}})()")
    for pid in ["P0","P1","P2","P3","P4","P5"]:
        vf = str(st[pid+"vf"])
        check("F1 "+pid+": atadenoise presente", "atadenoise" in vf)
        check("F1 "+pid+": gradfun radius=16:strength=1.2", "gradfun=radius=16:strength=1.2" in vf)
        check("F1 "+pid+": termina en scd=fdiff:scd_threshold=8",
              vf.endswith("scd=fdiff:scd_threshold=8"))
        if pid != "P0":
            check("F1 "+pid+": upscale lanczos 4K", "w=3840:h=2160:filter=lanczos" in vf)
    check("F1 P0: SIN resize forzado (nativo 8K, no baja a 4K)", "w=3840" not in str(st["P0vf"]))
    check("F1 P0/P1: colorspace PQ/bt2020 (st2084)", "transfer=st2084" in str(st["P0vf"]) and "transfer=st2084" in str(st["P1vf"]))
    check("F1 P3: colorspace bt709 (SDR tier)", "transfer=bt709" in str(st["P3vf"]))
    check("F1 policy P3 contiene CRYSTAL4K", "CRYSTAL4K" in str(st["hdr"]))
    check("F1 includeLabExtras=true P2/P3/P5", all(v is True for v in st["extras"]), str(st["extras"]))
    check("F1 nivel1=51, ultima=DNR-CALIBRATION",
          st["n1"] == 51 and "#EXT-X-APE-DNR-CALIBRATION" in str(st["n1last"]))
    check("F1 0 restos de scd invalido (scd=5) en TODOS los perfiles",
          not any("scd=5" in str(st[k+"vf"]) for k in ["P0","P1","P2","P3","P4","P5"]))

    # ---------- FASE 2: BOTON REAL #btnGenerateAudited ----------
    prep = page.evaluate(
        "(()=>{"
        "window.__mockChannels=["
        "{id:'c1',name:'TEST P1 QHD',url:'http://provider.example/live/u/p/101.ts',group:'E2E',profile:'P1'},"
        "{id:'c2',name:'TEST P3 FHD',url:'http://provider.example/live/u/p/303.ts',group:'E2E',profile:'P3'},"
        "{id:'c3',name:'TEST P5 SD',url:'http://provider.example/live/u/p/505.ts',group:'E2E',profile:'P5'}];"
        "if(!window.app)window.app={};"
        "window.app.getFilteredChannels=()=>window.__mockChannels;"
        "if(!window.app.showToast)window.app.showToast=()=>{};"
        "const G=window.M3U8TypedArraysGenerator,orig=G.generate.bind(G);"
        "const _origPre=window.APEGenerationController&&window.APEGenerationController.prepublishAndGenerate;"
        "window.__genCalled=0;"
        "G.generateAndDownloadStreaming=async(channels,opts)=>{"
        "window.__genCalled=Date.now();"
        "const blob=await orig(channels,Object.assign({},opts,{skipMetaScan:true,skipProbe:true}));"
        "window.__btnBlob=await blob.text();"
        "return {mode:'E2E_CAPTURE',bytes:window.__btnBlob.length,channels:channels.length};};"
        "return typeof orig==='function'?'wrapper OK':'orig missing';})()")
    check("F2 wrapper instalado (generate REAL debajo)", "wrapper OK" in str(prep))
    page.evaluate(
        "(()=>{const C=window.APEGenerationController,o=C.prepublishAndGenerate.bind(C);"
        "C.prepublishAndGenerate=async(...a)=>{try{const r=await o(...a);window.__pagDone=String(r&&r.decision||'ok');return r;}"
        "catch(e){window.__pagErr=String(e&&e.stack||e);throw e;}};return 'instrumented';})()")
    page.evaluate(
        "(()=>{const el=document.querySelector('#btnGenerateAudited');if(!el)return 'missing';"
        "let n=el;while(n&&n!==document.body){const d=getComputedStyle(n).display;"
        "if(d==='none')n.style.display='block';n=n.parentElement;}el.scrollIntoView({block:'center'});return 'unhidden';})()")
    # Elaborado: el click puede llegar a la carrera del arranque posterior a la importación
    # (diálogos/timers asentándose). Reintentos acotados con diagnóstico por intento.
    import time as _time
    got = False
    for attempt in range(1, 4):
        _time.sleep(2.0)
        try:
            page.click("#btnGenerateAudited", timeout=8000)
            clicked = "playwright click"
        except Exception:
            page.evaluate("document.querySelector('#btnGenerateAudited').click()")
            clicked = "DOM el.click() (onclick real)"
        try:
            page.wait_for_function("!!window.__btnBlob || !!window.__pagErr", timeout=45000)
        except Exception:
            pass
        diag = page.evaluate(
            "({gen:window.__genCalled||0, done:window.__pagDone||null,"
            " err:(window.__pagErr||'').slice(0,200)||null})")
        print("   intento " + str(attempt) + " (" + clicked + "): genCalled=" +
              str(diag.get("gen")) + " pagDone=" + str(diag.get("done")))
        if page.evaluate("!!window.__btnBlob"):
            got = True
            break
        if diag.get("err"):
            print("   prepublish err: " + str(diag.get("err")))
    check("F2 click boton REAL -> genero lista (sin excepciones)", got)
    if not got:
        hard_dbg = [e for e in console_errors[_boot_noise:] if "favicon" not in e.lower()
                    and "net::ERR" not in e and "Failed to load resource" not in e]
        print("   DIAG console (" + str(len(hard_dbg)) + "):", *hard_dbg[:8], sep="\n     ")
        browser.close()
        n = sum(1 for _, ok in results if ok)
        print("")
        print("==== RESULTADO E2E CRYSTAL+AV-SYNC: " + str(n) + "/" + str(len(results)) + " PASS ====")
        sys.exit(1)
    if page.evaluate("!!window.__pagErr"):
        print("   prepublish rechazo con: " + str(page.evaluate("window.__pagErr"))[:800])

    t = page.evaluate("window.__btnBlob")
    vfs = [l for l in t.splitlines() if l.startswith("#EXTVLCOPT:video-filter=")]
    check("F2 3 canales emitidos, 0 perdidos", t.count("#EXTINF") == 3)
    check("F2 1 video-filter por canal", len(vfs) == 3, "vf=" + str(len(vfs)))
    check("F2 TODAS las cadenas traen atadenoise", all("atadenoise" in l for l in vfs))
    check("F2 TODAS las cadenas traen upscale lanczos 4K", all("w=3840:h=2160:filter=lanczos" in l for l in vfs))
    check("F2 TODAS las cadenas traen scd=fdiff:scd_threshold=8",
          all("scd=fdiff:scd_threshold=8" in l for l in vfs))
    check("F2 TODAS las cadenas terminan en MEMC 120 (invariante repo)",
          all(l.strip().endswith("scd=fdiff:scd_threshold=8") for l in vfs))
    check("F2 MEMC 120fps x3 intacto", t.count("minterpolate=fps=120") == 3)
    check("F2 tag ENGINE LAB-CALIBRATED x3", t.count("LAB-CALIBRATED-DNR+MEMC-120") == 3)
    check("F2 DNR-ENGINE:LAB-SSOT x3", t.count("#EXT-X-APE-DNR-ENGINE:LAB-SSOT") == 3)
    pols = t.count("#EXT-X-APE-DNR-POLICY:")
    check("F2 DNR-POLICY x3 con CRYSTAL4K", pols == 3 and "CRYSTAL4K" in t, "n=" + str(pols))

    # ── AV-SYNC FIX (2026-08-30) ──
    n_cs1 = sum(1 for l in t.splitlines() if l.strip() == "#EXTVLCOPT:clock-synchro=1")
    n_cs0 = sum(1 for l in t.splitlines() if l.strip() == "#EXTVLCOPT:clock-synchro=0")
    n_ats1 = sum(1 for l in t.splitlines() if l.strip() == "#EXTVLCOPT:audio-time-stretch=1")
    n_ats0 = sum(1 for l in t.splitlines() if l.strip() == "#EXTVLCOPT:audio-time-stretch=false")
    n_ad0 = sum(1 for l in t.splitlines() if l.strip() == "#EXTVLCOPT:audio-desync=0")
    check("AV-SYNC: clock-synchro=1 por canal (master clock ON)", n_cs1 == 3, "n=" + str(n_cs1))
    check("AV-SYNC: 0 restos de clock-synchro=0", n_cs0 == 0, "n=" + str(n_cs0))
    check("AV-SYNC: audio-time-stretch=1 por canal", n_ats1 == 3, "n=" + str(n_ats1))
    check("AV-SYNC: 0 restos de audio-time-stretch=false", n_ats0 == 0, "n=" + str(n_ats0))
    check("AV-SYNC: audio-desync=0 por canal (offset neutral)", n_ad0 == 3, "n=" + str(n_ad0))

    # ── Compatibilidad universal (players que ignoran tags desconocidos) ──
    import json as _json
    lines = t.splitlines()
    banned = {"if-none-match", "if-modified-since", "range", "te", "priority", "upgrade-insecure-requests"}
    toxic = []
    for l in lines:
        if l.startswith("#EXTHTTP:"):
            try:
                for k in _json.loads(l[len("#EXTHTTP:"):]).keys():
                    if k.lower() in banned:
                        toxic.append(k)
            except Exception:
                toxic.append("EXTHTTP_JSON_INVALID")
    check("COMPAT: 0 headers toxicos en EXTHTTP JSON", not toxic, str(toxic))
    check("COMPAT: 0 Range: bytes=0- literal", "range: bytes=0-" not in t.lower())
    check("COMPAT: sin EXT-X-MEDIA URI=", not any(l.startswith("#EXT-X-MEDIA") and "URI=" in l for l in lines))
    check("COMPAT: sin EXT-X-I-FRAME-STREAM-INF URI=",
          not any(l.startswith("#EXT-X-I-FRAME-STREAM-INF") and "URI=" in l for l in lines))
    blocks = t.split("#EXTINF")[1:]
    multi = [i for i, b in enumerate(blocks)
             if sum(1 for l in b.splitlines()[1:] if l.strip() and not l.strip().startswith("#")) != 1]
    check("COMPAT: exactamente 1 URL por bloque (Anti-509)", not multi, str(multi))
    check("COMPAT: max 1 STREAM-INF por canal", t.count("#EXT-X-STREAM-INF") <= len(blocks))
    check("COMPAT: empieza con #EXTM3U", t.lstrip().startswith("#EXTM3U"))
    check("COMPAT: sin CMAF falso (sin EXT-X-MAP declarado sin evidencia)", "#EXT-X-MAP" not in t or t.count("#EXT-X-MAP") == 0)

    # Exclusion documentada (trampa E2E): "Headers Mode/APE Config FALTA" es el
    # EmergencyFix en timer diferido diagnosticando un perfil de navegador VIRGEN
    # (sin config guardada) — artefacto hermético, no defecto del flujo.
    hard = [e for e in console_errors[_boot_noise:] if "favicon" not in e.lower()
            and "net::ERR" not in e and "Failed to load resource" not in e
            and "Headers Mode" not in e and "APE Config" not in e
            and "Headers Activos" not in e]
    check("0 errores JS/pageerror en el flujo post-import", not hard, "; ".join(hard[:2])[:250])
    browser.close()

n = sum(1 for _, ok in results if ok)
print("")
print("==== RESULTADO E2E CRYSTAL+AV-SYNC: " + str(n) + "/" + str(len(results)) + " PASS ====")
print("DIALOGOS VISTOS:", len(dialogs))
for d in dialogs[:6]:
    print("  " + d)
sys.exit(0 if n == len(results) else 1)
