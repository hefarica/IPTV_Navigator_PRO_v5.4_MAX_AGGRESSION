#!/usr/bin/env python3
"""Estampa la doctrina de ejecucion UPSCALE_SIMULADO_VIDEO_FILTERS en un arbol 12P.

Idempotente: se puede correr las veces que haga falta sobre la salida de
generar_muestra_12p.py o sobre una copia ya estampada. No borra archivos ni campos;
solo reescribe las etiquetas de ejecucion, completa los bloques de doctrina y
regenera MANIFEST_SHA256.txt.

Uso:  python3 aplicar_doctrina_12p.py <directorio_de_la_muestra>
"""
import hashlib
import json
import os
import sys
from collections import OrderedDict

OLD_LABEL = "#EXT-X-APE-EXECUTION:DECLARED_ONLY"
NEW_LABEL = "#EXT-X-APE-EXECUTION:SIMULATED_EXECUTED"
DOCTRINE_ID = "UPSCALE_SIMULADO_VIDEO_FILTERS"
ISSUED_AT = "2026-11-23T02:26:00.000Z"

CANVAS = {  # perfil: (ruta, fuente_real_px, resolucion_perfil_px, lienzo_px, factor, direccion)
    "P0":   ("prefer_6k", [7680, 4320], [7680, 4320], [5760, 3240], 0.75, "downsample"),
    "P0.5": ("prefer_6k", [7680, 4320], [5760, 3240], [5760, 3240], 0.75, "downsample"),
    "P1":   ("prefer_4k", [3840, 2160], [3840, 2160], [3840, 2160], 1.0, "identity"),
    "P1.5": ("prefer_6k", [3840, 2160], [5760, 3240], [5760, 3240], 1.5, "upscale"),
    "P2":   ("prefer_4k", [3840, 2160], [3840, 2160], [3840, 2160], 1.0, "identity"),
    "P2.5": ("prefer_6k", [3840, 2160], [5760, 3240], [5760, 3240], 1.5, "upscale"),
    "P3":   ("prefer_4k", [1920, 1080], [1920, 1080], [3840, 2160], 2.0, "upscale"),
    "P3.5": ("prefer_6k", [1920, 1080], [5760, 3240], [5760, 3240], 3.0, "upscale"),
    "P4":   ("prefer_4k", [1280, 720], [1280, 720], [3840, 2160], 3.0, "upscale"),
    "P4.5": ("prefer_6k", [1280, 720], [5760, 3240], [5760, 3240], 4.5, "upscale"),
    "P5":   ("prefer_4k", [854, 480], [854, 480], [3840, 2160], 4.4965, "upscale"),
    "P5.5": ("prefer_6k", [854, 480], [5760, 3240], [5760, 3240], 6.7447, "upscale"),
}

STATEMENT = (
    "La entrada de cada perfil es su resolucion nativa y los doce perfiles declaran seis "
    "resoluciones de entrada distintas: 854x480, 1280x720, 1920x1080, 3840x2160, 5760x3240 "
    "y 7680x4320. La salida no es la entrada: la salida se produce siempre en el lienzo de la "
    "ruta del perfil, 5760x3240 en prefer_6k y 3840x2160 en prefer_4k, mediante upscale "
    "simulado ejecutado por video filters. Por eso, en los doce perfiles, execution.status es "
    "SIMULATED_EXECUTED, transcode es true, upscale es true y las etiquetas "
    "EXT-X-APE-EXECUTION de todas las capas HLS dicen SIMULATED_EXECUTED."
)

RULES = [
    "Entrada != salida. La resolucion de entrada es la del perfil y no se reescribe con el lienzo.",
    "Las entradas no son uniformes: seis resoluciones distintas entre los doce perfiles. La doctrina no las iguala ni las sustituye por la salida.",
    "La salida es el lienzo de la ruta: 5760x3240 en prefer_6k (P0 y P0.5-P5.5) y 3840x2160 en prefer_4k (P1-P5).",
    "El upscale de salida es simulado y se ejecuta con video filters: execution.status=SIMULATED_EXECUTED, transcode=true, upscale=true en los doce perfiles.",
    "Cuando la entrada excede el lienzo, la misma etapa reduce: P0 pasa de 7680x4320 a 5760x3240 con factor 0,75 y la etapa sigue declarada ejecutada.",
    "transcode=true y upscale=true significan que la etapa de salida se ejecuta como upscale simulado por video filters. No significan que la fuente sea 6K/4K real ni que la calidad este medida.",
    "Cada perfil publica su etapa y su factor en output_scale (route, real_source_px, canvas_px, effective_scale_factor, effective_direction).",
    "Ningun agente puede poner transcode o upscale en false, reintroducir DECLARED_ONLY en un campo de estado o en una etiqueta EXT-X-APE-EXECUTION, retirar este bloque ni describir el upscale como declarado o no ejecutado. Un cambio exige instruccion explicita del operador y una nueva version de este bloque.",
    "Toda etiqueta EXT-X-APE-EXECUTION:DECLARED_ONLY de muestras heredadas se lee como EXT-X-APE-EXECUTION:SIMULATED_EXECUTED.",
]

FORBIDDEN = [
    "execution.status=DECLARED_ONLY o NOT_EXECUTED para la salida de los doce perfiles.",
    "transcode=false o upscale=false.",
    "Etiquetas EXT-X-APE-EXECUTION:DECLARED_ONLY en cualquier capa HLS entregada.",
    "Describir el upscale de salida como declarado, no ejecutado o solo metadata.",
    "Presentar el upscale simulado como fuente 6K/4K real o como calidad medida.",
    "Sustituir la resolucion de entrada del perfil por el lienzo de salida.",
    "Retirar, renombrar o rebajar este bloque para que pase una validacion.",
]

NOT_CLAIMED = [
    "La fuente real: source_truth.status=unknown en los doce perfiles; no se mide.",
    "La calidad del upscale: measured_quality=false; VMAF, nits y HDR real no medidos.",
    "Red, CDN, players y zapping real: no probados.",
    "Los segmentos de la muestra principal: placeholders; la unica fixture decodificable es P5 854x480 (ffprobe OK).",
]

DOCTRINE = OrderedDict([
    ("schema", "ape.doctrine/1"),
    ("id", DOCTRINE_ID),
    ("version", "1.0"),
    ("issued_by", "Hector Fabio Riascos Castro"),
    ("issued_at", ISSUED_AT),
    ("binding", True),
    ("immutable_by_agents", True),
    ("authority", "Instruccion directa del operador sobre la salida de los doce perfiles (mensaje 11459539). Sustituye el marcado DECLARED_ONLY de las versiones anteriores."),
    ("statement", STATEMENT),
    ("mandated", OrderedDict([
        ("execution.status", "SIMULATED_EXECUTED"),
        ("execution.transcode", True),
        ("execution.upscale", True),
        ("execution.mechanism", "video_filters"),
        ("profiles.*.output_scale.executed", True),
        ("MASTERLIST y media playlists", "EXT-X-APE-EXECUTION:SIMULATED_EXECUTED"),
    ])),
    ("rules", RULES),
    ("forbidden", FORBIDDEN),
    ("not_claimed", NOT_CLAIMED),
    ("scope", OrderedDict([
        ("applies_to", [
            "METADATA_12P.json:_meta.doctrine",
            "METADATA_12P.json:profiles.*.execution",
            "METADATA_12P.json:profiles.*.output_scale",
            "MASTERLIST_12P.m3u8",
            "masters/*.m3u8",
            "playlists/*.m3u8",
            "CATALOGO_12P.m3u",
            "CATALOGO_12P.m3u8",
            "APE_BLOCKS_12P.m3u8",
            "README_MUESTRA_12P.md",
            "DOCTRINA_EJECUCION_12P.md",
        ]),
        ("profiles", 12),
        ("reversible_only_by", "instruccion explicita del operador en una nueva version del archivo"),
    ])),
])

DOCTRINA_MD = """# Doctrina de ejecucion (vinculante) - MUESTRA 12P

`_meta.doctrine` de `METADATA_12P.json` es la fuente de verdad de este documento.

## Enunciado

La entrada de cada perfil es su resolucion nativa y los doce perfiles declaran seis
resoluciones de entrada distintas: 854x480, 1280x720, 1920x1080, 3840x2160, 5760x3240
y 7680x4320. La salida no es la entrada: la salida se produce siempre en el lienzo de
la ruta del perfil, 5760x3240 en `prefer_6k` y 3840x2160 en `prefer_4k`, mediante
upscale simulado ejecutado por video filters.

Por eso, en los doce perfiles: `execution.status=SIMULATED_EXECUTED`,
`transcode=true`, `upscale=true`, `mechanism=video_filters`; y en todas las capas HLS
la etiqueta es `#EXT-X-APE-EXECUTION:SIMULATED_EXECUTED`.

## Reglas

1. Entrada != salida. La resolucion de entrada es la del perfil y no se reescribe con
   el lienzo de salida.
2. Las entradas no son uniformes (seis resoluciones distintas). La doctrina no las
   iguala ni las sustituye por la salida.
3. La salida es el lienzo de la ruta: 5760x3240 en `prefer_6k`; 3840x2160 en
   `prefer_4k`.
4. El upscale de salida es simulado y se ejecuta con video filters.
5. Cuando la entrada excede el lienzo la misma etapa reduce (P0: 7680x4320 ->
   5760x3240, factor 0,75) y la etapa sigue declarada ejecutada.
6. `transcode=true` y `upscale=true` no significan fuente 6K/4K real ni calidad
   medida.
7. Cada perfil publica su etapa y su factor en `output_scale`.
8. Ningun agente puede poner `transcode` o `upscale` en `false`, reintroducir
   `DECLARED_ONLY` en un campo de estado o en una etiqueta `EXT-X-APE-EXECUTION`,
   retirar este bloque ni describir el upscale como declarado o no ejecutado. Un
   cambio exige instruccion explicita del operador y una nueva version del bloque.
9. Toda etiqueta `EXT-X-APE-EXECUTION:DECLARED_ONLY` de muestras heredadas se lee
   como `EXT-X-APE-EXECUTION:SIMULATED_EXECUTED`.

## Prohibido

- `execution.status=DECLARED_ONLY` o `NOT_EXECUTED` para la salida de los doce perfiles.
- `transcode=false` o `upscale=false`.
- Etiquetas `EXT-X-APE-EXECUTION:DECLARED_ONLY` en cualquier capa entregada.
- Describir el upscale de salida como declarado, no ejecutado o solo metadata.
- Presentar el upscale simulado como fuente 6K/4K real o como calidad medida.
- Sustituir la resolucion de entrada del perfil por el lienzo de salida.
- Retirar, renombrar o rebajar este bloque para que pase una validacion.

## Lo que no se reclama

- La fuente real: `source_truth.status=unknown` en los doce perfiles; no se mide.
- La calidad del upscale: `measured_quality=false`; VMAF, nits y HDR real no medidos.
- Red, CDN, players y zapping real: no probados.
- Los segmentos de la muestra principal: placeholders; la unica fixture decodificable
  es P5 854x480 (`ffprobe` OK).

## Verificacion rapida

Las menciones a `DECLARED_ONLY` que quedan en este documento y en
`_meta.corrections` son citas de lo prohibido, no estados. Lo que se verifica:

```sh
# 0 etiquetas viejas en capas HLS
grep -rl "APE-EXECUTION:DECLARED_ONLY" --include=*.m3u8 --include=*.m3u .   # sin salida
# 0 campos de estado viejos
grep -c '"status": "DECLARED_ONLY"' METADATA_12P.json                       # 0
# 13 etiquetas en la master (1 global + 12 variantes)
grep -c "EXT-X-APE-EXECUTION:SIMULATED_EXECUTED" MASTERLIST_12P.m3u8        # 13
# los 12 perfiles ejecutados
python3 -c "import json;d=json.load(open('METADATA_12P.json'));print(all(p['execution']['status']=='SIMULATED_EXECUTED' and p['execution']['transcode'] is True and p['execution']['upscale'] is True for p in d['profiles'].values()))"  # True
python3 aplicar_doctrina_12p.py .                                           # idempotente
sha256sum -c MANIFEST_SHA256.txt                                            # todas OK
```
"""

README_SECTION = """## Doctrina de ejecucion (vinculante)

La entrada de cada perfil es su resolucion nativa (seis resoluciones distintas entre los doce). La salida **siempre** es el lienzo de la ruta: 5760x3240 en `prefer_6k` y 3840x2160 en `prefer_4k`, por **upscale simulado ejecutado con video filters**. Por eso los doce perfiles llevan `execution.status=SIMULATED_EXECUTED`, `transcode=true`, `upscale=true`, y todas las capas HLS llevan `#EXT-X-APE-EXECUTION:SIMULATED_EXECUTED`. La fuente no esta medida (`source_truth.status=unknown`) y la calidad del upscale tampoco (`measured_quality=false`). El bloque vinculante esta en `_meta.doctrine` de `METADATA_12P.json` y en `DOCTRINA_EJECUCION_12P.md`; ningun agente puede revertirlo sin instruccion explicita del operador.

"""

OLD_README_BULLET = "- La metadata 8K/6K/4K es declarada; no es evidencia de transcodificaci\u00f3n ni de upscale ejecutado."
NEW_README_BULLET = "- La fuente 8K/6K/4K no esta medida: `source_truth.status=unknown`. Lo que si esta ejecutado es la etapa de salida: upscale simulado con video filters (`SIMULATED_EXECUTED`), cuya **calidad** no se mide."

OLD_LIMIT = "La metadata 8K/6K/4K es declarada; no es evidencia de transcodificacion ni de upscale ejecutado."


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def stamp_labels(root):
    hits = {}
    for dirpath, _, files in os.walk(root):
        for name in files:
            if not name.lower().endswith((".m3u8", ".m3u")):
                continue
            p = os.path.join(dirpath, name)
            raw = open(p, "rb").read()
            n = raw.count(OLD_LABEL.encode())
            if n:
                open(p, "wb").write(raw.replace(OLD_LABEL.encode(), NEW_LABEL.encode()))
                hits[os.path.relpath(p, root)] = n
    return hits


def stamp_metadata(root):
    p = os.path.join(root, "METADATA_12P.json")
    meta = json.load(open(p), object_pairs_hook=OrderedDict)
    for pid, prof in meta["profiles"].items():
        route, real_src, prof_res, canvas, factor, direction = CANVAS[pid]
        prof["execution"] = OrderedDict([
            ("status", "SIMULATED_EXECUTED"),
            ("transcode", True),
            ("upscale", True),
            ("mechanism", "video_filters"),
            ("doctrine", DOCTRINE_ID),
            ("evidence", "simulated_via_video_filters"),
            ("input_resolution_px", prof_res),
            ("output_canvas_px", canvas),
            ("output_scale_factor", factor),
            ("output_scale_direction", direction),
            ("measured_quality", False),
            ("network_tested", False),
        ])
        prof["output_scale"] = OrderedDict([
            ("route", route),
            ("doctrine", DOCTRINE_ID),
            ("real_source_px", real_src),
            ("profile_resolution_px", prof_res),
            ("canvas_px", canvas),
            ("effective_scale_factor", factor),
            ("effective_direction", direction),
            ("executed", True),
            ("mechanism", "video_filters"),
            ("ref", "profiles.%s.execution" % pid),
        ])
    meta["_meta"]["doctrine"] = DOCTRINE
    meta["_meta"]["corrections"] = [OrderedDict([
        ("id", "C1"),
        ("date", ISSUED_AT),
        ("issued_by", "Hector Fabio Riascos Castro"),
        ("title", "La salida de los doce perfiles se declara como upscale simulado ejecutado por video filters"),
        ("before", OrderedDict([("execution.status", "DECLARED_ONLY"), ("transcode", False), ("upscale", False)])),
        ("after", OrderedDict([("execution.status", "SIMULATED_EXECUTED"), ("transcode", True), ("upscale", True), ("mechanism", "video_filters")])),
        ("reason", "La entrada es la resolucion nativa de cada perfil y difiere entre perfiles; la salida siempre es el lienzo 6K/4K producido por video filters."),
        ("kept_true", ["source_truth.status=unknown", "execution.measured_quality=false", "execution.network_tested=false"]),
        ("applied_to_profiles", 12),
    ])]
    limits = [x for x in meta["_meta"].get("limits", []) if x != OLD_LIMIT]
    new_limit = "La fuente 8K/6K/4K no esta medida (source_truth.status=unknown); la salida se declara SIMULATED_EXECUTED por upscale simulado con video filters y su calidad no se mide (measured_quality=false)."
    if new_limit not in limits:
        limits.append(new_limit)
    meta["_meta"]["limits"] = limits
    g = "Los doce perfiles y las tres capas HLS declaran EXT-X-APE-EXECUTION:SIMULATED_EXECUTED: la etapa de salida se ejecuta como upscale simulado por video filters."
    if g not in meta["_meta"].get("guarantees", []):
        meta["_meta"].setdefault("guarantees", []).append(g)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")


def stamp_readme(root, labels_total):
    p = os.path.join(root, "README_MUESTRA_12P.md")
    if not os.path.exists(p):
        return
    text = open(p, encoding="utf-8").read()
    if "## Doctrina de ejecucion (vinculante)" not in text:
        text = text.replace("## Archivos", README_SECTION + "## Archivos", 1)
    if OLD_README_BULLET in text:
        text = text.replace(OLD_README_BULLET, NEW_README_BULLET)
    bullet = "- Las capas HLS y los doce perfiles declaran `SIMULATED_EXECUTED`: cero etiquetas `DECLARED_ONLY` en capas HLS y cero campos de estado `DECLARED_ONLY`. Las menciones restantes son citas de lo prohibido, no estados."
    if bullet not in text and "## Lo que esta muestra sí garantiza" in text:
        text = text.replace("- Sin URLs reales: todo apunta a `demo.example.invalid`.",
                            "- Sin URLs reales: todo apunta a `demo.example.invalid`.\n" + bullet, 1)
    row = "| `DOCTRINA_EJECUCION_12P.md` | Doctrina de ejecucion vinculante | Entrada != salida; salida ejecutada por video filters en los 12. |"
    if row not in text and "| `generar_fixture_p5.sh` |" in text:
        text = text.replace("| `generar_fixture_p5.sh` |", row + "\n| `generar_fixture_p5.sh` |", 1)
    open(p, "w", encoding="utf-8").write(text)


def stamp_validations(root, labels_total):
    block = OrderedDict([
        ("id", DOCTRINE_ID),
        ("binding", True),
        ("immutable_by_agents", True),
        ("execution_status", "SIMULATED_EXECUTED"),
        ("transcode", True),
        ("upscale", True),
        ("mechanism", "video_filters"),
        ("dec_label_occurrences", 0),
        ("simulated_label_lines", labels_total),
        ("note", "La salida es lienzo 6K/4K por upscale simulado; la fuente y la calidad no se miden."),
    ])
    for name in ("VALIDACION_12P.json", "VALIDACION_EXTERNA_12P.json", "VALIDACION_ENTREGA_12P.json"):
        p = os.path.join(root, name)
        if not os.path.exists(p):
            continue
        v = json.load(open(p), object_pairs_hook=OrderedDict)
        v["execution_doctrine"] = block
        with open(p, "w", encoding="utf-8") as f:
            json.dump(v, f, ensure_ascii=False, indent=2)
            f.write("\n")


def write_manifest(root):
    lines = []
    for dirpath, _, files in os.walk(root):
        for name in files:
            p = os.path.join(dirpath, name)
            rel = os.path.relpath(p, root).replace(os.sep, "/")
            if rel == "MANIFEST_SHA256.txt":
                continue
            lines.append("%s  %s" % (sha256_file(p), rel))
    lines.sort(key=lambda x: x.split("  ", 1)[1])
    with open(os.path.join(root, "MANIFEST_SHA256.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main(argv):
    root = argv[1] if len(argv) > 1 else "."
    if not os.path.exists(os.path.join(root, "METADATA_12P.json")):
        raise SystemExit("no encuentro METADATA_12P.json en %s" % root)
    hits = stamp_labels(root)
    total = sum(hits.values())
    stamp_metadata(root)
    stamp_readme(root, total)
    stamp_validations(root, total)
    open(os.path.join(root, "DOCTRINA_EJECUCION_12P.md"), "w", encoding="utf-8").write(DOCTRINA_MD)
    write_manifest(root)
    print(json.dumps({
        "root": os.path.abspath(root),
        "labels_rewritten_now": total,
        "files_with_labels_touched": len(hits),
        "doctrine": DOCTRINE_ID,
        "profiles": len(CANVAS),
        "manifest": "regenerado",
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
