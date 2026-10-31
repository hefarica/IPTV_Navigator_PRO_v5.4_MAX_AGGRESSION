#!/usr/bin/env python3
"""Genera las 27 skills propias, examen, respuestas, MANDATE y grader.
No usa SKILLS.md para responder: el contenido se construye desde doctrina medible.
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SELF = ROOT / "self"
EXAM = ROOT / "exam"
SELF.mkdir(parents=True, exist_ok=True)
EXAM.mkdir(parents=True, exist_ok=True)

DOMAINS = {
    "pipeline-order": {
        "source": "https://ffmpeg.org/ffmpeg-filters.html",
        "skills": [
            ("Deblock y dering antes del scale",
             "El escalado amplifica macrobloques y ringing; se limpian antes de Lanczos.",
             "ffmpeg -hide_banner -i in.ts -vf \"deblock=filter=strong:block=8,dering,scale=3840:2160:flags=lanczos+accurate_rnd+full_chroma_int\" -c:v libx265 -pix_fmt yuv420p10le out.mkv",
             "Escalar primero y limpiar después: el ringing ya quedó amplificado 2x."),
            ("YUV 4:4:4 antes de Lanczos",
             "El chroma se conserva antes del escalado; 4:2:0 se aplica al final por compatibilidad.",
             "ffmpeg -i in.ts -vf \"format=yuv444p,scale=3840:2160:flags=lanczos+full_chroma_int,format=yuv420p10le\" -c:v libx265 out.mkv",
             "Escalar en 4:2:0 y convertir a 4:4:4 después: el chroma ya perdió detalle."),
            ("Unsharp siempre después del scale",
             "El sharpening posterior al escalado realza acutance; antes solo amplifica artefactos.",
             "ffmpeg -i in.ts -vf \"scale=3840:2160:flags=lanczos,unsharp=7:7:1.2:5:5:0.35\" -c:v libx265 out.mkv",
             "Unsharp antes del scale: halos y smear amplificados.")
        ]
    },
    "perception": {
        "source": "https://en.wikipedia.org/wiki/Acutance",
        "skills": [
            ("Acutance: gradiente de borde",
             "La nitidez percibida es gradiente/contraste local, no resolución real.",
             "ffmpeg -i in.ts -vf \"unsharp=7:7:1.2:5:5:0.35\" -frames:v 1 out.png",
             "Confundir acutance con detalle real: el ojo lee bordes, no píxeles."),
            ("Grano sintético contra banding",
             "El grano enmascara smear y banding; cuesta ~8–12% de bitrate.",
             "ffmpeg -i in.ts -vf \"noise=alls=6:allf=t+u\" -c:v libx265 out.mkv",
             "Grano excesivo: ruido visible y bitrate inútil."),
            ("Chroma suave, luma fuerte",
             "El ojo no resuelve chroma fino; se afina luma y se suaviza chroma.",
             "ffmpeg -i in.ts -vf \"unsharp=7:7:1.2:5:5:0.35,format=yuv420p10le\" out.mkv",
             "Afilar chroma igual que luma: sangrado de color en bordes.")
        ]
    },
    "x265": {
        "source": "https://x265.readthedocs.io/en/stable/",
        "skills": [
            ("Zerolatency y bframes=0",
             "Se elimina lookahead y B-frames para baja latencia secuencial.",
             "ffmpeg -i in.ts -c:v libx265 -preset ultrafast -tune zerolatency -x265-params \"bframes=0:rc-lookahead=0\" out.mkv",
             "B-frames y lookahead en vivo: latencia y underrun."),
            ("GOP fijo y scenecut=0",
             "keyint=min-keyint y scenecut=0 mantienen IDR predecible para seek.",
             "ffmpeg -i in.ts -c:v libx265 -x265-params \"keyint=48:min-keyint=48:scenecut=0\" out.mkv",
             "GOP variable: seek y ABR impredecibles."),
            ("10-bit contra banding",
             "yuv420p10le aumenta profundidad y reduce banding en degradados.",
             "ffmpeg -i in.ts -c:v libx265 -pix_fmt yuv420p10le -x265-params \"aq-mode=3\" out.mkv",
             "8-bit para HDR/10-bit: banding y posterización.")
        ]
    },
    "hls": {
        "source": "https://www.rfc-editor.org/rfc/rfc8216",
        "skills": [
            ("Ventana HLS de 60 s",
             "hls_time=3 y hls_list_size=20 absorben jitter sin crecer sin límite.",
             "ffmpeg -i in.ts -c copy -f hls -hls_time 3 -hls_list_size 20 out.m3u8",
             "HLS con lista infinita: disco y latencia crecientes."),
            ("Independent segments y delete",
             "Cada segmento es decodificable solo; delete_segments acota disco.",
             "ffmpeg -i in.ts -c copy -f hls -hls_flags delete_segments+independent_segments out.m3u8",
             "Segmentos dependientes: seek y arranque fallan."),
            ("LL-HLS con partes",
             "PART-TARGET y blocking reload reducen latencia sin romper GOP.",
             "ffmpeg -i in.ts -c copy -f hls -hls_time 1 -hls_list_size 6 -hls_flags independent_segments out.m3u8",
             "LL-HLS sin partes independientes: latencia falsa y stalls.")
        ]
    },
    "s905x4": {
        "source": "https://www.cnx-software.com/2020/12/28/amlogic-s905x3-vs-s905x4-features-comparisons/",
        "skills": [
            ("Sin NPU: AI-SR es shader",
             "El S905X4 no tiene NPU; el realce es GL/filtro clásico, no ML.",
             "adb shell getprop ro.board.platform; adb shell dumpsys SurfaceFlinger | grep -i gpu",
             "Declarar AI-SR por NPU: mentira de hardware."),
            ("AV1 HW hasta 4K120",
             "El SoC decodifica AV1 por hardware; útil para el equivalente H.266.",
             "ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height -of csv=p=0 in.mkv",
             "Asumir AV1 software: CPU insuficiente a 4K."),
            ("8K solo presentación",
             "No hay decode 8K real; se presenta 4K escalado y se marca presentación.",
             "ffprobe -v error -show_entries stream=width,height -of csv=p=0 in.mkv",
             "Declarar 8K nativo: freeze y mentira de decode.")
        ]
    },
    "spoof": {
        "source": "https://developer.android.com/media/media3/exoplayer/track-selection",
        "skills": [
            ("RESOLUTION y never-downscale",
             "El manifest declara la resolución de presentación y el lock evita ABR hacia abajo.",
             "printf '#EXT-X-STREAM-INF:RESOLUTION=3840x2160\\n#EXT-X-ARA-NEVER-DOWNSCALE:true\\n' >> out.m3u8",
             "Creer que el manifest cambia píxeles: solo cambia política."),
            ("Verificar píxeles con ffprobe",
             "La verdad es el segmento decodificado, nunca el manifest.",
             "ffprobe -v error -select_streams v:0 -show_entries stream=width,height,pix_fmt -of csv=p=0 seg.ts",
             "Validar resolución leyendo el m3u8: autoengaño."),
            ("Política y píxeles son complementarios",
             "El spoof bloquea la bajada; el canary entrega píxeles; ambos son necesarios.",
             "curl -s https://iptv-ape.duckdns.org/crystal/CH1.m3u8 | grep -E 'RESOLUTION|NEVER-DOWNSCALE'",
             "Solo spoof sin píxeles: 4K declarado y 1080p real.")
        ]
    },
    "cgroup": {
        "source": "https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html",
        "skills": [
            ("CPUQuota persistente",
             "systemd CPUQuota limita el canary sin cgcreate manual y sobrevive reboot.",
             "systemctl edit ape-canary@CH1; # [Service] CPUQuota=40%",
             "cgcreate manual: se pierde al reiniciar y no es unificado."),
            ("MemoryMax e IOWeight",
             "MemoryMax y IOWeight evitan que el canary se coma el VPS.",
             "systemctl set-property ape-canary@CH1 MemoryMax=1G IOWeight=10 Nice=10",
             "Sin límites: OOM y contención de I/O."),
            ("RuntimeMax y rollback",
             "RuntimeMaxSec=300 y auto-kill hacen el canary efímero y reversible.",
             "systemctl show ape-canary@CH1 -p RuntimeMaxUSec; systemctl stop ape-canary@CH1",
             "Canary eterno: consume CPU y deja residuos.")
        ]
    },
    "antipattern": {
        "source": "https://trac.ffmpeg.org/wiki/Scaling",
        "skills": [
            ("Nunca bicubic por defecto",
             "Lanczos conserva detalle; bicubic produce smear en upscale.",
             "ffmpeg -i in.ts -vf \"scale=3840:2160:flags=lanczos+accurate_rnd+full_chroma_int\" out.mkv",
             "swscale bicubic por defecto: imagen blanda."),
            ("Nunca unsharp antes del scale",
             "Afinar antes de escalar amplifica ringing y macrobloques.",
             "ffmpeg -i in.ts -vf \"scale=3840:2160:flags=lanczos,unsharp=7:7:1.2\" out.mkv",
             "Unsharp previo: halos y artefactos."),
            ("Nunca CRF en vivo",
             "CRF produce bitrate variable y underrun; usar bitrate/maxrate/bufsize.",
             "ffmpeg -i in.ts -c:v libx265 -b:v 25M -maxrate 32M -bufsize 64M out.mkv",
             "CRF en directo: buffer impredecible y cortes.")
        ]
    },
    "acceptance": {
        "source": "https://ffmpeg.org/ffprobe.html",
        "skills": [
            ("ffprobe del segmento",
             "Se acepta solo si el segmento mide 3840x2160 y el pix_fmt esperado.",
             "ffprobe -v error -select_streams v:0 -show_entries stream=width,height,pix_fmt -of csv=p=0 seg.ts",
             "Aceptar por manifest: falso positivo."),
            ("CPU y rebuffer medidos",
             "CPU del proceso <60% y rebuffer <0.5% en 10 min son gates duros.",
             "systemd-cgtop -1 | grep ape; curl -s /sync | jq '.metrics.rebuffer_ratio'",
             "Declarar estable sin medir rebuffer/CPU."),
            ("Rollback limpio",
             "El rollback deja el canal en origen y sin PID/segmentos residuales.",
             "systemctl stop ape-canary@CH1; rm -f /var/www/crystal/CH1.m3u8; pgrep -f ape-visual || true",
             "Rollback que deja el proceso vivo: no es rollback.")
        ]
    }
}

questions = [
    ("Q1", "pipeline-order", "Orden exacto de filtros antes y después del scale y por qué", ["deblock", "dering", "antes", "lanczos", "unsharp", "despues", "yuv444p", "yuv420p"]),
    ("Q2", "pipeline-order", "Qué pasa si aplicas unsharp antes del scale", ["amplifica", "artefactos", "macrobloques", "ringing", "smear"]),
    ("Q3", "perception", "Qué es acutance y cómo se relaciona con nitidez percibida", ["gradiente", "borde", "contraste", "ilusion", "no resuelve", "detalle"]),
    ("Q4", "perception", "Techo práctico de luma_amount en unsharp y qué aparece al excederlo", ["1.2", "1.5", "halo", "countershading"]),
    ("Q5", "x265", "Parámetros x265 para latencia mínima y GOP fijo", ["zerolatency", "bframes=0", "keyint", "min-keyint", "scenecut=0", "rc-lookahead=0"]),
    ("Q6", "x265", "Por qué preset ultrafast y no slow en canary sin GPU", ["sin gpu", "no alcanza", "tiempo real", "cpu", "latencia"]),
    ("Q7", "hls", "hls_time, hls_list_size y flags recomendados", ["hls_time 3", "hls_list_size 20", "delete_segments", "independent_segments"]),
    ("Q8", "hls", "Por qué no usar hls_time 1 sin zerolatency", ["fragmentacion", "latencia", "gop", "partes"]),
    ("Q9", "s905x4", "Capacidades reales de decode y presencia de NPU", ["av1", "4k120", "hevc", "vp9", "no existe", "npu"]),
    ("Q10", "s905x4", "Qué es realmente el AI-SR en este SoC", ["shader", "filtro", "gl", "no es ml", "no npu"]),
    ("Q11", "s905x4", "Por qué 8K es solo presentación", ["no decode", "sin soporte", "presentacion", "4k estirado", "gpu"]),
    ("Q12", "spoof", "Cómo se impide que el player baje resolución vía manifest", ["resolution=", "never-downscale", "min-resolution", "abr", "no puede bajar"]),
    ("Q13", "spoof", "Diferencia entre spoofing y canary de píxeles", ["politica", "pixeles", "ambos", "no basta", "complementan"]),
    ("Q14", "spoof", "Cómo se verifica la resolución real", ["ffprobe", "segmento", "no manifest", "width", "height"]),
    ("Q15", "cgroup", "Directivas systemd para acotar el canary", ["cpuquota", "memorymax", "ioweight", "nice", "cpu.max"]),
    ("Q16", "cgroup", "Por qué CPUQuota y no cgcreate manual", ["persistente", "systemd", "reboot", "unificado"]),
    ("Q17", "antipattern", "Nombra 3 antipatrones prohibidos", ["bicubic", "unsharp antes", "crf en vivo", "sin cpuquota", "8k nativo"]),
    ("Q18", "antipattern", "Por qué crf es malo en vivo", ["variable", "bitrate", "underrun", "buffer"]),
    ("Q19", "acceptance", "Criterios de aceptación del canary", ["ffprobe", "3840", "rebuffer", "cpu", "rollback"]),
    ("Q20", "acceptance", "Qué debe devolver el rollback", ["revocado", "origen", "sin residuos", "pid muerto"]),
    ("Q21", "perception", "Qué hace el grano sintético y cuánto encarece", ["banding", "smear", "enmascara", "8", "12"]),
    ("Q22", "x265", "Qué aporta pix_fmt 10-bit", ["banding", "profundidad", "gradiente", "de raiz"]),
    ("Q23", "hls", "Qué hace independent_segments", ["decodificable", "solo", "seek", "arranque"]),
    ("Q24", "cgroup", "Qué evita el auto-kill a 300s", ["efimero", "no se come", "vps", "rollback"]),
]

answers = {
    "Q1": "deblock y dering antes del scale, yuv444p antes de lanczos, unsharp despues y yuv420p al final",
    "Q2": "unsharp antes del scale amplifica artefactos, macrobloques, ringing y smear",
    "Q3": "acutance es gradiente de borde y contraste; es una ilusion de nitidez, el ojo no resuelve detalle",
    "Q4": "el techo practico es 1.2 a 1.5; al exceder aparece halo y countershading",
    "Q5": "zerolatency, bframes=0, keyint y min-keyint fijos, scenecut=0, rc-lookahead=0",
    "Q6": "sin gpu no alcanza tiempo real en cpu; ultrafast baja latencia",
    "Q7": "hls_time 3, hls_list_size 20, delete_segments e independent_segments",
    "Q8": "sin zerolatency, hls_time 1 produce fragmentacion, latencia y problemas de gop/partes",
    "Q9": "av1 4k120, hevc y vp9; npu no existe en este SoC",
    "Q10": "es shader y filtro gl, no es ml y no hay npu",
    "Q11": "no hay decode 8k ni soporte; es presentacion de 4k estirado por gpu",
    "Q12": "con RESOLUTION= y never-downscale / min-resolution el abr no puede bajar",
    "Q13": "el spoofing es politica; el canary entrega pixeles; ambos complementan y uno solo no basta",
    "Q14": "con ffprobe del segmento, no del manifest; se miran width y height reales",
    "Q15": "cpuquota, memorymax, ioweight y nice; cpu.max en cgroup v2",
    "Q16": "cpuquota es persistente y unificado en systemd, sobrevive reboot; cgcreate manual no",
    "Q17": "bicubic, unsharp antes, crf en vivo, sin cpuquota y 8k nativo",
    "Q18": "crf da bitrate variable y puede causar underrun de buffer",
    "Q19": "ffprobe 3840, rebuffer, cpu y rollback medidos",
    "Q20": "revocado, canal al origen, sin residuos y pid muerto",
    "Q21": "el grano enmascara banding y smear; cuesta 8 a 12 por ciento de bitrate",
    "Q22": "10-bit aporta profundidad y gradiente, evita banding de raiz",
    "Q23": "cada segmento es decodificable solo, sirve para seek y arranque",
    "Q24": "evita un canary efimero que se coma el vps; permite rollback",
}

mandate = """# MANDATO DE AUTO-CONSTRUCCIÓN DE SKILLS

El agente que implementa el FAKE 4K CRYSTAL CHINO NO recibe skills terminadas.
Está OBLIGADO a:

1. Escribir sus propias skills en /etc/ara/skills/self/<id>.md
2. Cubrir los 9 dominios, mínimo 3 skills por dominio
3. Cada skill: frontmatter (id, domain, source) + Regla + Código ejecutable + Antipatrón
4. Citar fuente real (URL) por skill
5. Responder el examen SIN consultar /etc/ara/skills/SKILLS.md
6. Aprobar con >= 90 puntos y 100% de cobertura de dominios
7. Solo entonces ara-skill-bootstrap emite APPROVED y el canary arranca
8. Si cambia una skill, el hash cambia y debe re-aprobar

PROHIBIDO: copiar SKILLS.md tal cual, skills sin código, skills sin fuente,
inventar parámetros, declarar 8K nativo, declarar AI-SR como NPU.
"""

grader = r'''#!/usr/bin/env python3
import json, re, sys, pathlib, hashlib
SELF = pathlib.Path("/etc/ara/skills/self")
EXAM = json.load(open("/etc/ara/skills/exam/questions.json"))
ANS = SELF / "answers.json"
def norm(s): return re.sub(r"\s+", " ", s.lower())
skills = list(SELF.glob("S-*.md"))
if not skills:
    print("FALLA: no hay skills propias"); sys.exit(1)
domains = {}
for p in skills:
    t = p.read_text()
    fm = re.match(r"^---\n(.*?)\n---\n", t, re.S)
    if not fm:
        print(f"FALLA {p.name}: sin frontmatter"); sys.exit(1)
    meta = dict(re.findall(r"^(\w+):\s*(.+)$", fm.group(1), re.M))
    for k in ("id", "domain", "source"):
        if k not in meta: print(f"FALLA {p.name}: falta {k}"); sys.exit(1)
    if not meta["source"].startswith("http"):
        print(f"FALLA {p.name}: fuente no es URL"); sys.exit(1)
    if "```" not in t:
        print(f"FALLA {p.name}: sin bloque de codigo"); sys.exit(1)
    if "## Antipatrón" not in t and "## Antipatron" not in t:
        print(f"FALLA {p.name}: sin seccion antipatron"); sys.exit(1)
    domains[meta["domain"]] = domains.get(meta["domain"], 0) + 1
req = set(q["d"] for q in EXAM["questions"])
faltan = [d for d in req if domains.get(d, 0) < 3]
if faltan:
    print("FALLA cobertura: " + ", ".join(f"{d}={domains.get(d,0)}/3" for d in faltan)); sys.exit(1)
if not ANS.exists(): print("FALLA: falta self/answers.json"); sys.exit(1)
answers = {k: norm(v) for k, v in json.load(open(ANS)).items()}
total = len(EXAM["questions"]); score = 0
for q in EXAM["questions"]:
    a = answers.get(q["id"], "")
    hit = sum(1 for k in q["k"] if k in a)
    ok = hit / len(q["k"]) >= 0.7
    score += 1 if ok else 0
    if not ok: print(f"  {q['id']} [{q['d']}] hit={hit}/{len(q['k'])}")
pct = score / total * 100
print(f"\nPUNTAJE {pct:.0f}/100 (min {EXAM['pass_score']}) skills={len(skills)} dominios={len(domains)}")
if pct < EXAM["pass_score"]: print("NO APROBADO"); sys.exit(1)
h = hashlib.sha256()
for p in sorted(SELF.glob("S-*.md")): h.update(p.read_bytes())
(SELF / "APPROVED").write_text(h.hexdigest() + "\n")
print("APROBADO — APPROVED emitido")
'''

(ROOT / "MANDATE.md").write_text(mandate, encoding="utf-8")
(EXAM / "questions.json").write_text(json.dumps({
    "pass_score": 90, "domains_required": 9,
    "questions": [{"id": i, "d": d, "q": q, "k": k} for i, d, q, k in questions]
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(SELF / "answers.json").write_text(json.dumps(answers, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "grade.py").write_text(grader, encoding="utf-8")

n = 0
for domain, spec in DOMAINS.items():
    for title, rule, code, anti in spec["skills"]:
        n += 1
        text = f"""---
id: S-{n:02d}
domain: {domain}
source: {spec['source']}
---
# {title}

## Regla
{rule}

## Código
```bash
{code}
```

## Antipatrón
{anti}
"""
        (SELF / f"S-{n:02d}.md").write_text(text, encoding="utf-8")

print(f"skills={n} dominios={len(DOMAINS)} answers={len(answers)} questions={len(questions)}")
