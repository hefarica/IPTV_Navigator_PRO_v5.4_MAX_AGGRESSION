"""E2E HERMETICO — 2 fases.
F1: Import LAB via el boton real de la app (dialogs nativos auto-OK) con el JSON DNR.
F2: Click en #btnGenerateAudited (boton real) con 3 canales mock; captura la lista
    que produce el generador REAL con el payload bulletproof_* del LAB importado.
Cero trafico externo: todo lo que no sea localhost:8642 se aborta."""
import functools, sys, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DNR_JSON = r"C:\Users\HFRC\Downloads\LAB_CALIBRATED_BULLETPROOF_22.6.0-MEMC-TOTAL-8K120-DNR.json"
FRONTEND = r"c:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION-master (8)\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION-master\IPTV_v5.4_MAX_AGGRESSION\frontend"
PORT = 8646
BASE = "http://127.0.0.1:" + str(PORT) + "/index-v4.html"
results, dialogs, console_errors = [], [], []

# Servidor estatico IN-PROCESS (threaded, sin logs) — evita pipes/subprocesos
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

httpd = ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(QuietHandler, directory=FRONTEND))
threading.Thread(target=httpd.serve_forever, daemon=True).start()

def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (("  [" + str(extra) + "]") if extra else ""))

with sync_playwright() as p:
    # HERMETICO a nivel DNS: todo hostname externo -> NOTFOUND; 127.0.0.1 intacto.
    # (Sin page.route: la interaccion route-interception + servidor in-process es inestable.)
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
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        print("(networkidle timeout — sigo con polling)")
    page.wait_for_function(
        "typeof window.ProfileManagerV9==='object' && typeof window.APE_PROFILES_CONFIG==='object'"
        " && typeof window.M3U8TypedArraysGenerator==='object' && typeof window.APEGenerationController==='object'",
        timeout=90000)
    check("app cargada: PM9 + APE_PROFILES_CONFIG + GENERATOR + GenerationController", True)

    # ---------- FASE 1: IMPORT por el flujo real del boton ----------
    # Los errores de consola PRE-import son diagnósticos del boot con perfil fresco
    # (Headers Mode/APE Config vacíos) — se excluyen del veredicto del flujo.
    _boot_noise = len(console_errors)
    # El click() interno de importFromLAB dispara un filechooser: lo interceptamos
    # y alimentamos con el JSON DNR (evita confundirlo con otro input file de la pagina).
    with page.expect_file_chooser() as fc_info:
        page.evaluate("window.ProfileManagerV9.importFromLAB()")
    chooser = fc_info.value
    chooser.set_files(DNR_JSON)
    page.wait_for_function(
        "(()=>{try{const m=JSON.parse(localStorage.getItem('ape_lab_bulletproof_meta')||'null');"
        "return !!(m&&m.imported_at)}catch(e){return false}})()", timeout=30000)
    check("F1 import completado via dialog flow real (ape_lab_bulletproof_meta)", True)
    ndry = sum(1 for d in dialogs if "IMPORT FROM LAB" in d)
    nextras = sum(1 for d in dialogs if "EXTRAS DEL LAB" in d)
    check("F1 dry-run confirm mostrado (1 vez)", ndry == 1, "visto=" + str(ndry))
    print("   extras dialog: " + ("mostrado+OK (includeLabExtras=true)" if nextras else "NO mostrado"))

    state = page.evaluate(
        "(()=>{const C=window.APE_PROFILES_CONFIG,g=(p)=>C.getProfile(p);return{"
        "P2vf:g('P2').vlcopt['video-filter'],P5vf:g('P5').vlcopt['video-filter'],P3vf:g('P3').vlcopt['video-filter'],"
        "extras:[g('P2').includeLabExtras,g('P3').includeLabExtras,g('P5').includeLabExtras],"
        "soc:g('P2').actor_injections.soc_vpp_dnr?Object.keys(g('P2').actor_injections.soc_vpp_dnr.settings).length:null,"
        "hdr:g('P2').headerOverrides['X-APE-DNR-POLICY'],n1:(C.nivel1Directives||[]).length,"
        "n1last:(C.nivel1Directives||[]).slice(-1)[0],exp:C.labExportedAt?1:0,bp:C.labBulletproof}})()")
    check("F1 P2 video-filter = nlmeans2.8+gradfun+minterpolate (DNR integrado)",
          str(state["P2vf"]).startswith("nlmeans=s=2.8") and str(state["P2vf"]).endswith("scd=5"))
    check("F1 P5 video-filter = hqdn3d+minterpolate (DNR integrado)",
          str(state["P5vf"]).startswith("hqdn3d=luma_spatial=3.0") and str(state["P5vf"]).endswith("scd=0"))
    check("F1 P3 intacto (nlmeans original)", str(state["P3vf"]).startswith("nlmeans=s=2.5"))
    check("F1 includeLabExtras=true en P2/P3/P5", all(v is True for v in state["extras"]), str(state["extras"]))
    check("F1 soc_vpp_dnr importado (13 claves SoC)", state["soc"] == 13, "claves=" + str(state["soc"]))
    check("F1 X-APE-DNR-POLICY en headerOverrides", bool(state["hdr"]))
    check("F1 nivel1=51, ultima=DNR-CALIBRATION",
          state["n1"] == 51 and "#EXT-X-APE-DNR-CALIBRATION" in str(state["n1last"]))
    check("F1 labExportedAt presente (gate FAIL-LOUD del boton satisfacible)", state["exp"] == 1)
    check("F1 labBulletproof=true (payload is_bulletproof)", state["bp"] is True)

    # ---------- FASE 2: BOTON REAL #btnGenerateAudited ----------
    prep = page.evaluate(
        "(()=>{"
        "window.__mockChannels=["
        "{id:'c1',name:'TEST P2 QHD',url:'http://provider.example/live/u/p/101.ts',group:'E2E',profile:'P2'},"
        "{id:'c2',name:'TEST P3 FHD',url:'http://provider.example/live/u/p/303.ts',group:'E2E',profile:'P3'},"
        "{id:'c3',name:'TEST P5 SD',url:'http://provider.example/live/u/p/505.ts',group:'E2E',profile:'P5'}];"
        "if(!window.app)window.app={};"
        "window.app.getFilteredChannels=()=>window.__mockChannels;"
        "if(!window.app.showToast)window.app.showToast=()=>{};"
        "const G=window.M3U8TypedArraysGenerator,orig=G.generate.bind(G);"
        "G.generateAndDownloadStreaming=async(channels,opts)=>{"
        "window.__btnOpts={bp:opts.bulletproof_profiles?'Y':'N',"
        "n1:Array.isArray(opts.bulletproof_nivel1)?opts.bulletproof_nivel1.length:null,"
        "loaded:opts.bulletproof_loaded,meta:opts.lab_metadata||null};"
        # Entorno hermetico: el fetch DNS-bloqueado nunca settlea (artefacto de Chromium),
        # asi que se saltan SOLO las fases de red con los flags propios de la app.
        # El payload LAB del boton pasa integro al generador.
        "const blob=await orig(channels,Object.assign({},opts,{skipMetaScan:true,skipProbe:true}));"
        "window.__btnBlob=await blob.text();"
        "return {mode:'E2E_CAPTURE',bytes:window.__btnBlob.length,channels:channels.length};};"
        "return typeof orig==='function'?'wrapper OK':'orig missing';})()")
    check("F2 wrapper generateAndDownloadStreaming instalado (generate REAL debajo)", "wrapper OK" in str(prep))
    # Instrumentacion: capturar error/rechazo del prepublish real del boton
    page.evaluate(
        "(()=>{const C=window.APEGenerationController,o=C.prepublishAndGenerate.bind(C);"
        "C.prepublishAndGenerate=async(...a)=>{try{const r=await o(...a);window.__pagDone=String(r&&r.decision||'ok');return r;}"
        "catch(e){window.__pagErr=String(e&&e.stack||e);throw e;}};return 'instrumented';})()")

    # El boton vive en un panel oculto por defecto: revelarlo y click REAL;
    # si el layout lo mantiene invisible, el.click() ejecuta el mismo onclick.
    page.evaluate(
        "(()=>{const el=document.querySelector('#btnGenerateAudited');if(!el)return 'missing';"
        "let n=el;while(n&&n!==document.body){const d=getComputedStyle(n).display;"
        "if(d==='none')n.style.display='block';n=n.parentElement;}el.scrollIntoView({block:'center'});return 'unhidden';})()")
    try:
        page.click("#btnGenerateAudited", timeout=8000)
        clicked = "playwright click"
    except Exception:
        page.evaluate("document.querySelector('#btnGenerateAudited').click()")
        clicked = "DOM el.click() (onclick real)"
    print("   boton pulsado via:", clicked)
    try:
        page.wait_for_function("!!window.__btnBlob || !!window.__pagErr", timeout=120000)
    except Exception:
        pass
    pag_err = page.evaluate("window.__pagErr || null")
    pag_done = page.evaluate("window.__pagDone || null")
    if pag_err:
        print("   prepublish rechazo con:\n     " + str(pag_err).replace("\n", "\n     ")[:1200])
    if not page.evaluate("!!window.__btnBlob"):
        check("F2 click boton REAL -> genero lista", False, "pagDone=" + str(pag_done))
        hard = [e for e in console_errors if "net::ERR" not in e and "Failed to load resource" not in e and "favicon" not in e.lower()]
        print("   console:", *hard[:6], sep="\n     ")
        browser.close()
        n = sum(1 for _, ok in results if ok)
        print("")
        print("==== RESULTADO E2E: " + str(n) + "/" + str(len(results)) + " PASS ====")
        sys.exit(1)
    check("F2 click boton REAL -> genero lista (sin excepciones)", True)
    o = page.evaluate("window.__btnOpts")
    check("F2 payload del boton lleva bulletproof_profiles (LAB SSOT)", o.get("bp") == "Y")
    check("F2 payload lleva bulletproof_nivel1=51 directivas", o.get("n1") == 51, "n1=" + str(o.get("n1")))
    check("F2 payload bulletproof_loaded=true + lab_metadata", o.get("loaded") is True and bool(o.get("meta")))

    t = page.evaluate("window.__btnBlob")
    check("F2 lista: 3 EXTINF (0 canales perdidos)", t.count("#EXTINF") == 3, "extinf=" + str(t.count("#EXTINF")))
    # FIX-DNR-1: la cadena calibrada del LAB MANDA (P3 por heuristica determinaProfile)
    check("F2 FIX1: video-filter del LAB emitido (nlmeans calibrado)", "#EXTVLCOPT:video-filter=nlmeans" in t)
    check("F2 FIX1: gradfun del LAB presente", "gradfun=" in t)
    check("F2 FIX1: MEMC minterpolate=fps=120 intacto", t.count("minterpolate=fps=120") == 3)
    check("F2 FIX1: exactamente 1 video-filter por canal",
          t.count("#EXTVLCOPT:video-filter=") == 3, "vf=" + str(t.count("#EXTVLCOPT:video-filter=")))
    check("F2 FIX1: tag ENGINE actualizado a LAB-CALIBRATED", "LAB-CALIBRATED-DNR+MEMC-120" in t)
    check("F2 FIX1: #EXT-X-APE-DNR-ENGINE:LAB-SSOT por canal", t.count("#EXT-X-APE-DNR-ENGINE:LAB-SSOT") == 3)
    # FIX-DNR-2: politica DNR como linea dedicada (inmune al cap 8KB)
    check("F2 FIX2: #EXT-X-APE-DNR-POLICY por canal (extras ON)",
          t.count("#EXT-X-APE-DNR-POLICY:") == 3, "n=" + str(t.count("#EXT-X-APE-DNR-POLICY:")))
    check("F2 lista: directiva nivel1 #EXT-X-APE-DNR-CALIBRATION presente", "#EXT-X-APE-DNR-CALIBRATION" in t)

    # FALLBACK (COVERAGE ALWAYS): sin cadena LAB → cadena 4KFALSE hardcodeada intacta
    fb = page.evaluate(
        "(()=>{const G=window.M3U8TypedArraysGenerator;return G.generate([{id:'f1',name:'FALLBACK',"
        "url:'http://provider.example/live/u/p/9.ts',group:'FB',profile:'P3'}],"
        "{bulletproof_loaded:true,bulletproof_profiles:{P3:{vlcopt:{'network-caching':1000}}},"
        "skipMetaScan:true,skipProbe:true}).then(b=>b.text())})()")
    check("F2 FALLBACK: sin LAB video-filter → cadena 4KFALSE (hqdn3d+zscale)",
          "hqdn3d" in fb and "zscale" in fb and "nlmeans" not in fb)
    check("F2 FALLBACK: sin cadena LAB → sin tag LAB-SSOT (la DNR-POLICY sigue la config de la app)",
          "LAB-SSOT" not in fb)
    check("F2 FALLBACK: MEMC 120fps presente igualmente", "minterpolate=fps=120" in fb)

    # Invariantes de compatibilidad universal (toxic = keys reales de EXTHTTP JSON)
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
    check("F2 COMPAT: 0 headers toxicos en EXTHTTP JSON (CA8 gate)", not toxic, str(toxic))
    check("F2 COMPAT: 0 emision Range: bytes=0- literal", "range: bytes=0-" not in t.lower())
    media_uri = any(l.startswith("#EXT-X-MEDIA") and "URI=" in l for l in lines)
    check("F2 COMPAT: sin EXT-X-MEDIA URI= (single URL per channel)", not media_uri)
    iframe_uri = any(l.startswith("#EXT-X-I-FRAME-STREAM-INF") and "URI=" in l for l in lines)
    check("F2 COMPAT: sin EXT-X-I-FRAME-STREAM-INF URI=", not iframe_uri)
    blocks = t.split("#EXTINF")[1:]
    multi = [i for i, b in enumerate(blocks)
             if sum(1 for l in b.splitlines()[1:] if l.strip() and not l.strip().startswith("#")) != 1]
    check("F2 COMPAT: exactamente 1 URL por bloque EXTINF (Anti-509)", not multi, "bloques_mal=" + str(multi))
    check("F2 COMPAT: max 1 STREAM-INF por canal", t.count("#EXT-X-STREAM-INF") <= len(blocks),
          "si=" + str(t.count("#EXT-X-STREAM-INF")))
    check("F2 lista: EXTVLCOPT/KODIPROP presentes (VLC/Kodi leen, resto ignora)",
          "#EXTVLCOPT:" in t or "#KODIPROP:" in t)
    check("F2 lista: empieza con #EXTM3U", t.lstrip().startswith("#EXTM3U"))

    hard = [e for e in console_errors[_boot_noise:] if "favicon" not in e.lower()
            and "net::ERR" not in e and "Failed to load resource" not in e]
    check("0 errores JS/pageerror en todo el flujo", not hard, "; ".join(hard[:2])[:250])
    browser.close()

n = sum(1 for _, ok in results if ok)
print("")
print("==== RESULTADO E2E: " + str(n) + "/" + str(len(results)) + " PASS ====")
print("DIALOGOS VISTOS:")
for d in dialogs[:8]:
    print("  " + d)
sys.exit(0 if n == len(results) else 1)
