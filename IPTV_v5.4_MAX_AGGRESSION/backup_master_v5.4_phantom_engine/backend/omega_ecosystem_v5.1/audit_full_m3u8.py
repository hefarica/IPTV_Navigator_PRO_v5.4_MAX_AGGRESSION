#!/usr/bin/env python3
"""
Auditoría Forense Completa — APE TYPED ARRAYS ULTIMATE
Analiza estructura, directivas, URLs, servidores y requisitos de reproducción.
"""
import re
import json
import base64
from collections import defaultdict, Counter
from urllib.parse import urlparse

FILE = "/home/ubuntu/upload/APE_TYPED_ARRAYS_ULTIMATE_20260402(3).m3u8"

with open(FILE, "r", encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

total_lines = len(lines)

# ── Contadores globales ──
extinf_count = 0
url_count = 0
exthttp_count = 0
kodiprop_count = 0
extvlcopt_count = 0
ape_count = 0
extattrfromurl_count = 0
telchemy_count = 0
stream_inf_count = 0
lcevc_count = 0
cortex_count = 0
phantom_count = 0
fallback_direct_count = 0
extm3u_count = 0

# ── Análisis por canal ──
channels = []
current = {
    "extinf": None, "url": None,
    "extvlcopt": 0, "kodiprop": 0, "exthttp": 0,
    "ape": 0, "extattrfromurl": 0, "telchemy": 0,
    "stream_inf": 0, "lcevc": 0, "cortex": 0,
    "phantom": 0, "fallback_direct": 0,
    "lines": 0
}
in_channel = False

# ── Servidores / hosts de URLs ──
servers = Counter()
url_samples = []
proxy_urls = []
bare_urls = []
cred_missing = []
exthttp_payloads = []

# ── Grupos y perfiles ──
groups = Counter()
profiles = Counter()
content_types = Counter()
codecs = Counter()

# ── Orden de directivas (primer canal) ──
first_channel_order = []
first_channel_captured = False

for raw_line in lines:
    line = raw_line.rstrip("\n").rstrip("\r")
    current["lines"] += 1

    if line.startswith("#EXTM3U"):
        extm3u_count += 1
        continue

    if line.startswith("#EXTINF:"):
        # Guardar canal anterior
        if in_channel and current["extinf"]:
            channels.append(dict(current))
        # Reiniciar
        current = {
            "extinf": line, "url": None,
            "extvlcopt": 0, "kodiprop": 0, "exthttp": 0,
            "ape": 0, "extattrfromurl": 0, "telchemy": 0,
            "stream_inf": 0, "lcevc": 0, "cortex": 0,
            "phantom": 0, "fallback_direct": 0,
            "lines": 1
        }
        in_channel = True
        extinf_count += 1

        # Extraer metadatos del EXTINF
        m_group = re.search(r'group-title="([^"]*)"', line)
        m_profile = re.search(r'ape-profile="([^"]*)"', line)
        m_ct = re.search(r'ape-content-type="([^"]*)"', line)
        m_codec = re.search(r'ape-codec-family="([^"]*)"', line)
        if m_group: groups[m_group.group(1)] += 1
        if m_profile: profiles[m_profile.group(1)] += 1
        if m_ct: content_types[m_ct.group(1)] += 1
        if m_codec and m_codec.group(1): codecs[m_codec.group(1)] += 1

        if not first_channel_captured:
            first_channel_order = ["#EXTINF"]
        continue

    if in_channel:
        current["lines"] += 1

        if line.startswith("#EXTVLCOPT"):
            extvlcopt_count += 1
            current["extvlcopt"] += 1
            if not first_channel_captured and "#EXTVLCOPT" not in first_channel_order:
                first_channel_order.append("#EXTVLCOPT")

        elif line.startswith("#KODIPROP"):
            kodiprop_count += 1
            current["kodiprop"] += 1
            if not first_channel_captured and "#KODIPROP" not in first_channel_order:
                first_channel_order.append("#KODIPROP")

        elif line.startswith("#EXTHTTP"):
            exthttp_count += 1
            current["exthttp"] += 1
            if not first_channel_captured and "#EXTHTTP" not in first_channel_order:
                first_channel_order.append("#EXTHTTP")
            # Extraer payload JSON
            json_str = line[len("#EXTHTTP:"):].strip()
            try:
                payload = json.loads(json_str)
                exthttp_payloads.append(payload)
            except:
                pass

        elif line.startswith("#EXT-X-APE-PHANTOM") or "PHANTOM" in line:
            phantom_count += 1
            current["phantom"] += 1
            ape_count += 1
            current["ape"] += 1
            if not first_channel_captured and "#EXT-X-APE-PHANTOM" not in first_channel_order:
                first_channel_order.append("#EXT-X-APE-PHANTOM")

        elif line.startswith("#EXT-X-APE-FALLBACK-DIRECT"):
            fallback_direct_count += 1
            current["fallback_direct"] += 1
            if not first_channel_captured and "#EXT-X-APE-FALLBACK-DIRECT" not in first_channel_order:
                first_channel_order.append("#EXT-X-APE-FALLBACK-DIRECT")

        elif line.startswith("#EXT-X-APE"):
            ape_count += 1
            current["ape"] += 1
            if not first_channel_captured and "#EXT-X-APE" not in first_channel_order:
                first_channel_order.append("#EXT-X-APE")

        elif line.startswith("#EXTATTRFROMURL"):
            extattrfromurl_count += 1
            current["extattrfromurl"] += 1
            if not first_channel_captured and "#EXTATTRFROMURL" not in first_channel_order:
                first_channel_order.append("#EXTATTRFROMURL")

        elif line.startswith("#EXT-X-TELCHEMY"):
            telchemy_count += 1
            current["telchemy"] += 1
            if not first_channel_captured and "#EXT-X-TELCHEMY" not in first_channel_order:
                first_channel_order.append("#EXT-X-TELCHEMY")

        elif line.startswith("#EXT-X-STREAM-INF"):
            stream_inf_count += 1
            current["stream_inf"] += 1
            if not first_channel_captured and "#EXT-X-STREAM-INF" not in first_channel_order:
                first_channel_order.append("#EXT-X-STREAM-INF")

        elif line.startswith("#EXT-X-VNOVA-LCEVC") or "LCEVC" in line[:40]:
            lcevc_count += 1
            current["lcevc"] += 1

        elif line.startswith("#EXT-X-CORTEX"):
            cortex_count += 1
            current["cortex"] += 1

        elif not line.startswith("#") and line.strip():
            # Es una URL
            url_count += 1
            current["url"] = line.strip()
            if not first_channel_captured:
                first_channel_order.append("URL")
                first_channel_captured = True

            parsed = urlparse(line.strip())
            host = parsed.netloc
            if host:
                servers[host] += 1
                if len(url_samples) < 5:
                    url_samples.append(line.strip())

            # Clasificar URL
            if "resolve_quality_unified" in line or "rq_polymorphic" in line:
                proxy_urls.append(line.strip())
            elif re.match(r'https?://[\w\.\-]+:\d+/', line.strip()):
                bare_urls.append(line.strip())

            # Verificar si tiene credenciales (usuario/pass en path)
            if re.search(r'https?://[^/]+/\w+/\w+/\d+', line.strip()):
                pass  # tiene estructura usuario/pass/id

            channels.append(dict(current))
            current = {
                "extinf": None, "url": None,
                "extvlcopt": 0, "kodiprop": 0, "exthttp": 0,
                "ape": 0, "extattrfromurl": 0, "telchemy": 0,
                "stream_inf": 0, "lcevc": 0, "cortex": 0,
                "phantom": 0, "fallback_direct": 0,
                "lines": 0
            }
            in_channel = False

# ── Estadísticas de directivas por canal ──
complete_channels = [c for c in channels if c["url"]]
n = len(complete_channels)

def avg(lst): return sum(lst)/len(lst) if lst else 0
def mn(lst): return min(lst) if lst else 0
def mx(lst): return max(lst) if lst else 0

vlc_per = [c["extvlcopt"] for c in complete_channels]
kodi_per = [c["kodiprop"] for c in complete_channels]
http_per = [c["exthttp"] for c in complete_channels]
ape_per = [c["ape"] for c in complete_channels]
lines_per = [c["lines"] for c in complete_channels]
phantom_per = [c["phantom"] for c in complete_channels]
fallback_per = [c["fallback_direct"] for c in complete_channels]

# ── Análisis de EXTHTTP payload (primer canal) ──
exthttp_sample = exthttp_payloads[0] if exthttp_payloads else {}
exthttp_keys = len(exthttp_sample)

# ── Análisis de servidores ──
total_urls = sum(servers.values())
server_dist = []
for host, cnt in servers.most_common(10):
    pct = cnt/total_urls*100 if total_urls else 0
    server_dist.append((host, cnt, pct))

# ── Verificar integridad ──
extinf_url_match = extinf_count == url_count
lines_consistent = (mx(lines_per) - mn(lines_per)) <= (mx(lines_per) * 0.05) if lines_per else False

print("=" * 70)
print("  AUDITORÍA FORENSE — APE TYPED ARRAYS ULTIMATE 20260402")
print("=" * 70)
print()
print("── MÉTRICAS GLOBALES ──")
print(f"  Líneas totales del archivo : {total_lines:,}")
print(f"  Canales (#EXTINF)          : {extinf_count:,}")
print(f"  URLs de stream             : {url_count:,}")
print(f"  EXTINF == URL (1:1)        : {'✅ SÍ' if extinf_url_match else '🔴 NO'}")
print(f"  Peso del archivo           : {total_lines * 80 / 1024 / 1024:.1f} MB estimado")
print()
print("── DIRECTIVAS POR CANAL (avg / min / max) ──")
print(f"  Líneas/canal    : {avg(lines_per):.0f} / {mn(lines_per)} / {mx(lines_per)}")
print(f"  #EXTVLCOPT      : {avg(vlc_per):.0f} / {mn(vlc_per)} / {mx(vlc_per)}")
print(f"  #KODIPROP       : {avg(kodi_per):.0f} / {mn(kodi_per)} / {mx(kodi_per)}")
print(f"  #EXTHTTP        : {avg(http_per):.0f} / {mn(http_per)} / {mx(http_per)}")
print(f"  #EXT-X-APE-*    : {avg(ape_per):.0f} / {mn(ape_per)} / {mx(ape_per)}")
print(f"  #EXT-X-PHANTOM  : {avg(phantom_per):.0f} / {mn(phantom_per)} / {mx(phantom_per)}")
print(f"  FALLBACK-DIRECT : {avg(fallback_per):.0f} / {mn(fallback_per)} / {mx(fallback_per)}")
print()
print("── DIRECTIVAS TOTALES EN LA LISTA ──")
print(f"  #EXTVLCOPT total     : {extvlcopt_count:,}")
print(f"  #KODIPROP total      : {kodiprop_count:,}")
print(f"  #EXTHTTP total       : {exthttp_count:,}")
print(f"  #EXT-X-APE-* total   : {ape_count:,}")
print(f"  #EXTATTRFROMURL      : {extattrfromurl_count:,}")
print(f"  #EXT-X-TELCHEMY      : {telchemy_count:,}")
print(f"  #EXT-X-STREAM-INF    : {stream_inf_count:,}")
print(f"  #EXT-X-VNOVA-LCEVC   : {lcevc_count:,}")
print(f"  #EXT-X-CORTEX        : {cortex_count:,}")
print(f"  PHANTOM-HYDRA        : {phantom_count:,}")
print(f"  FALLBACK-DIRECT      : {fallback_direct_count:,}")
print()
print("── ANÁLISIS DE EXTHTTP (primer canal) ──")
print(f"  Campos JSON en EXTHTTP : {exthttp_keys}")
if exthttp_sample:
    for k, v in list(exthttp_sample.items())[:15]:
        print(f"    {k}: {str(v)[:60]}")
    if exthttp_keys > 15:
        print(f"    ... ({exthttp_keys - 15} campos más)")
print()
print("── SERVIDORES / HOSTS DE URLS ──")
for host, cnt, pct in server_dist:
    print(f"  {host:<45} {cnt:>5} canales ({pct:.1f}%)")
print()
print("── MUESTRA DE URLs (primeros 5 canales) ──")
for u in url_samples[:5]:
    print(f"  {u[:100]}")
print()
print("── ORDEN DE DIRECTIVAS (primer canal) ──")
for i, d in enumerate(first_channel_order, 1):
    print(f"  Pos {i:02d}: {d}")
print()
print("── GRUPOS (top 10) ──")
for g, cnt in groups.most_common(10):
    print(f"  {g:<50} {cnt:>5}")
print()
print("── PERFILES APE ──")
for p, cnt in profiles.most_common():
    print(f"  {p:<20} {cnt:>5} canales")
print()
print("── TIPOS DE CONTENIDO ──")
for ct, cnt in content_types.most_common():
    print(f"  {ct:<20} {cnt:>5} canales")
print()
print("── INTEGRIDAD ──")
print(f"  EXTINF == URL 1:1        : {'✅' if extinf_url_match else '🔴'} ({extinf_count} vs {url_count})")
print(f"  Líneas/canal consistente : {'✅' if lines_consistent else '⚠️'} (min={mn(lines_per)}, max={mx(lines_per)})")
print(f"  URLs bare hostname       : {len(bare_urls)}")
print(f"  FALLBACK-DIRECT expuesto : {fallback_direct_count} ({'⚠️ EXPONE ORIGEN' if fallback_direct_count > 0 else '✅'})")
print(f"  #EXT-X-STREAM-INF        : {stream_inf_count} ({'⚠️ PUEDE ROMPER ALGUNOS PLAYERS' if stream_inf_count > 0 else '✅ 0'})")
print()
print("── REQUISITOS DE REPRODUCCIÓN ──")
print("  (análisis basado en las directivas detectadas)")
