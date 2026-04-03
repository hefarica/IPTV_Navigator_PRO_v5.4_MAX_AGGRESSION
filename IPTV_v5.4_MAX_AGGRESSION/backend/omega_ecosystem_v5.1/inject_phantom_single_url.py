#!/usr/bin/env python3.11
"""
APE OMEGA — Inyector Híbrido: PHANTOM HYDRA + URL Única Polimórfica
====================================================================
Implementa el plan de arquitectura del documento:
  "Implementación: PHANTOM HYDRA & RESOLVEDOR POLIMÓRFICO 200 OK"

FASES DE PROCESAMIENTO:
  Fase 1 (Idempotencia): Hash MD5 del nombre de canal → UID + Nonce criptográfico (1% Uniqueness)
  Fase 2 (Phantom Hydra): Inyección de las 52 directivas extremas (DoH, SNI, Swarm, Traffic Morphing)
  Fase 3 (URL Única Determinista): Clasifica el canal → genera URL única hacia el backend PHP
  Fase 4 (Rendimiento): Procesa 4,000+ canales en menos de 10 segundos

RESULTADO POR CANAL (53 líneas):
  52 directivas Phantom Hydra + 1 URL Única = 53 líneas exactas

USO:
  python3.11 inject_phantom_single_url.py <entrada.m3u8> <salida.m3u8> [--proxy-base URL]

EJEMPLO:
  python3.11 inject_phantom_single_url.py \\
      APE_TYPED_ARRAYS_ULTIMATE_20260401.m3u8 \\
      APE_OMEGA_PHANTOM_SINGLE_URL.m3u8 \\
      --proxy-base "http://iptv-ape.duckdns.org/resolve_quality_unified.php"
"""

import sys
import re
import hashlib
import time
import argparse
from pathlib import Path
from urllib.parse import urlencode

# ─── CONFIGURACIÓN ────────────────────────────────────────────
# SSOT: apunta SOLO a resolve_quality_unified.php (el único archivo PHP del ecosistema)
DEFAULT_PROXY_BASE = "http://iptv-ape.duckdns.org/resolve_quality_unified.php"

SPORTS_KW = [
    'sport','espn','fox sport','nba','nfl','nhl','mlb','f1','formula',
    'futbol','football','soccer','tennis','golf','boxing','ufc','mma',
    'olympic','liga','premier','serie a','bundesliga','champions','copa',
    'mundial','eufa','nascar','motogp','wimbledon','superbowl','playoff',
]
CINEMA_KW = [
    'hbo','cine','movie','film','netflix','amazon','disney','apple tv',
    'showtime','starz','fx','amc','tnt','tbs','syfy','horror','comedy',
    'drama','thriller','action','sci-fi','documentary','anime','cartoon',
]
NEWS_KW = [
    'news','noticias','cnn','bbc','fox news','msnbc','abc news','nbc news',
    'univision','telemundo','noticiero','informativo','breaking','live news',
    'al jazeera','euronews','sky news','bloomberg','cnbc',
]

PROFILE_MAP = {
    'P0_ULTRA_SPORTS_8K': SPORTS_KW,
    'P1_CINEMA_4K_HDR':   CINEMA_KW,
    'P2_NEWS_4K_HDR':     NEWS_KW,
}

# ─── USER-AGENT POOL (para rotación en Phantom Hydra) ─────────
UA_POOL = [
    'AppleTV/tvOS/17.0 HLS/1.0',
    'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36',
    'Kodi/20.2 (Linux; Android 11) ExoPlayerLib/2.18.1',
    'VLC/3.0.18 LibVLC/3.0.18',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
    'ExoPlayer/2.18.1 (Linux; Android 13; Pixel 7)',
    'Roku/DVP-12.5 (552.05E04111A)',
    'Mozilla/5.0 (PlayStation 5 3.20) AppleWebKit/605.1.15',
    'Mozilla/5.0 (BRAVIA 4K UR3 x86) AppleWebKit/537.36',
    'Mozilla/5.0 (Linux; Android 12; Fire TV Stick 4K) AppleWebKit/537.36',
    'HbbTV/1.4.7 (+DL+DRM+PVR;Philips;SmartTV2018;T.001.001.001.001;CE-HTML/1.0)',
    'Mozilla/5.0 (Linux; Android 11; SHIELD Android TV) AppleWebKit/537.36',
]

# ─── DoH RESOLVERS (para rotación en Phantom Hydra) ───────────
DOH_RESOLVERS = [
    'https://cloudflare-dns.com/dns-query',
    'https://dns.google/dns-query',
    'https://doh.opendns.com/dns-query',
    'https://dns.quad9.net/dns-query',
    'https://doh.cleanbrowsing.org/doh/family-filter/',
]

# ─── CLASIFICADOR ─────────────────────────────────────────────
def classify_channel(name: str, group: str) -> str:
    haystack = (name + ' ' + group).lower()
    for profile, keywords in PROFILE_MAP.items():
        if any(kw in haystack for kw in keywords):
            return profile
    return 'P3_DEFAULT_4K'

# ─── FASE 1: GENERADORES DE IDENTIDAD ─────────────────────────
def make_uid(tvg_id: str, name: str, group: str) -> str:
    """UID estable: el mismo canal siempre produce el mismo UID (idempotencia)."""
    seed = (tvg_id or name or '') + '|' + group
    return hashlib.md5(seed.encode('utf-8')).hexdigest()[:16]

def make_nonce(uid: str) -> str:
    """Nonce único por ejecución: muta en cada generación (1% Uniqueness anti-fingerprint)."""
    raw = uid + str(time.time_ns())
    return hashlib.sha256(raw.encode()).hexdigest()[:12]

def make_adn(uid: str, profile: str, nonce: str) -> str:
    """ADN del canal: firma criptográfica del contexto completo."""
    raw = uid + '|' + profile + '|' + nonce
    return hashlib.sha256(raw.encode()).hexdigest()[:24]

# ─── FASE 2: GENERADOR DE BLOQUE PHANTOM HYDRA (52 directivas) ─
def build_phantom_hydra_block(uid: str, nonce: str, profile: str) -> list:
    """
    Genera las 52 directivas PHANTOM HYDRA de evasión ISP.
    Cada directiva es única por canal gracias al UID y el nonce.
    Total: exactamente 52 líneas.
    """
    # Selección determinista pero variable de UA y DoH por canal
    ua_idx   = int(uid[:2], 16) % len(UA_POOL)
    doh_idx  = int(uid[2:4], 16) % len(DOH_RESOLVERS)
    ua_seed  = hashlib.md5((uid + nonce).encode()).hexdigest()[:8]

    # Swarm TCP: varía entre 256 y 2048 según el perfil
    swarm_map = {
        'P0_ULTRA_SPORTS_8K': 2048,
        'P1_CINEMA_4K_HDR':   1024,
        'P2_NEWS_4K_HDR':      512,
        'P3_DEFAULT_4K':       512,
    }
    swarm_size = swarm_map.get(profile, 512)

    # Padding de tráfico: varía entre 64 y 512 bytes
    padding_size = (int(uid[4:6], 16) % 8 + 1) * 64

    directives = [
        # ── CAPA 1: IDENTIDAD POLIMÓRFICA (8 directivas) ──────
        f'#EXT-X-APE-PHANTOM-UID: {uid}',
        f'#EXT-X-APE-PHANTOM-NONCE: {nonce}',
        f'#EXT-X-APE-PHANTOM-PROFILE: {profile}',
        f'#EXT-X-APE-PHANTOM-GENERATION-TS: {int(time.time())}',
        f'#EXT-X-APE-PHANTOM-UA-SEED: {ua_seed}',
        f'#EXT-X-APE-PHANTOM-UA-POOL-SIZE: {len(UA_POOL)}',
        f'#EXT-X-APE-PHANTOM-UA-INDEX: {ua_idx}',
        f'#EXT-X-APE-PHANTOM-UA: {UA_POOL[ua_idx]}',

        # ── CAPA 2: SNI OBFUSCATION (6 directivas) ────────────
        f'#EXT-X-APE-SNI-OBFUSCATION: ENABLED',
        f'#EXT-X-APE-SNI-MUTATION-SEED: {uid[:8]}',
        f'#EXT-X-APE-SNI-PADDING-BYTES: {padding_size}',
        f'#EXT-X-APE-SNI-FRAGMENTATION: ENABLED',
        f'#EXT-X-APE-SNI-RECORD-SPLIT: 1',
        f'#EXT-X-APE-SNI-FAKE-HOSTNAME: cdn-{uid[:6]}.cloudfront.net',

        # ── CAPA 3: DNS-OVER-HTTPS (6 directivas) ─────────────
        f'#EXT-X-APE-DOH-ENABLED: TRUE',
        f'#EXT-X-APE-DOH-RESOLVER: {DOH_RESOLVERS[doh_idx]}',
        f'#EXT-X-APE-DOH-FALLBACK-1: {DOH_RESOLVERS[(doh_idx+1) % len(DOH_RESOLVERS)]}',
        f'#EXT-X-APE-DOH-FALLBACK-2: {DOH_RESOLVERS[(doh_idx+2) % len(DOH_RESOLVERS)]}',
        f'#EXT-X-APE-DOH-CACHE-TTL: 300',
        f'#EXT-X-APE-DOH-DNSSEC-VALIDATION: STRICT',

        # ── CAPA 4: TCP SWARM (10 directivas) ─────────────────
        f'#EXT-X-APE-TCP-SWARM-ENABLED: TRUE',
        f'#EXT-X-APE-TCP-SWARM-SIZE: {swarm_size}',
        f'#EXT-X-APE-TCP-SWARM-RAMP-UP-MS: 200',
        f'#EXT-X-APE-TCP-SWARM-KEEPALIVE-SEC: 120',
        f'#EXT-X-APE-TCP-SWARM-PIPELINE-DEPTH: 32',
        f'#EXT-X-APE-TCP-SWARM-MULTIPLEX: H2_PUSH',
        f'#EXT-X-APE-TCP-SWARM-QUIC-FALLBACK: ENABLED',
        f'#EXT-X-APE-TCP-SWARM-IP-ROTATION: ENABLED',
        f'#EXT-X-APE-TCP-SWARM-IP-POOL-SIZE: 64',
        f'#EXT-X-APE-TCP-SWARM-CIRCUIT-BREAKER-THRESHOLD: 3',

        # ── CAPA 5: TRAFFIC MORPHING (12 directivas) ──────────
        f'#EXT-X-APE-TRAFFIC-MORPH-ENABLED: TRUE',
        f'#EXT-X-APE-TRAFFIC-MORPH-PADDING-BYTES: {padding_size}',
        f'#EXT-X-APE-TRAFFIC-MORPH-JITTER-MS: {(int(uid[6:8], 16) % 50) + 10}',
        f'#EXT-X-APE-TRAFFIC-MORPH-BURST-PATTERN: IRREGULAR',
        f'#EXT-X-APE-TRAFFIC-MORPH-DECOY-REQUESTS: 3',
        f'#EXT-X-APE-TRAFFIC-MORPH-DECOY-DOMAINS: cdn.akamai.com,static.cloudflare.com',
        f'#EXT-X-APE-TRAFFIC-MORPH-HEADER-MUTATION: ENABLED',
        f'#EXT-X-APE-TRAFFIC-MORPH-REFERER-SPOOF: https://www.google.com/search?q={uid[:8]}',
        f'#EXT-X-APE-TRAFFIC-MORPH-ACCEPT-LANG: en-US,en;q=0.9,es;q=0.8',
        f'#EXT-X-APE-TRAFFIC-MORPH-CACHE-CONTROL: no-cache, no-store, must-revalidate',
        f'#EXT-X-APE-TRAFFIC-MORPH-PRAGMA: no-cache',
        f'#EXT-X-APE-TRAFFIC-MORPH-FINGERPRINT-HASH: {hashlib.md5((uid+nonce+"morph").encode()).hexdigest()[:16]}',

        # ── CAPA 6: EVASIÓN AVANZADA (10 directivas) ──────────
        f'#EXT-X-APE-EVASION-MODE: SWARM_PHANTOM_HYDRA_STEALTH',
        f'#EXT-X-APE-EVASION-ISP-THROTTLE-BYPASS: ENABLED',
        f'#EXT-X-APE-EVASION-DPI-BYPASS: ENABLED',
        f'#EXT-X-APE-EVASION-PACKET-FRAGMENTATION: ENABLED',
        f'#EXT-X-APE-EVASION-TTL-MANIPULATION: 64',
        f'#EXT-X-APE-EVASION-TLS-FINGERPRINT-SPOOF: CHROME_120',
        f'#EXT-X-APE-EVASION-HTTP2-SETTINGS-MUTATION: ENABLED',
        f'#EXT-X-APE-EVASION-GREASE-EXTENSION: ENABLED',
        f'#EXT-X-APE-EVASION-SESSION-TICKET-ROTATION: ENABLED',
        f'#EXT-X-APE-EVASION-STEALTH-SIGNATURE: {hashlib.sha256((uid+nonce+"stealth").encode()).hexdigest()[:32]}',
    ]

    # Verificar que son exactamente 52 directivas
    assert len(directives) == 52, f"ERROR: Se esperaban 52 directivas Phantom Hydra, se generaron {len(directives)}"
    return directives

# ─── FASE 3: CONSTRUCTOR DE URL ÚNICA ─────────────────────────
def build_proxy_url(proxy_base: str, origin_url: str, uid: str,
                    nonce: str, profile: str, name: str, group: str, adn: str) -> str:
    """
    Construye la URL única que apunta al backend PHP.
    Formato: http://proxy.php?ch=[uid]&profile=[SPORTS]&ctx=[ADN]&...
    """
    params = {
        'ch':      uid,           # Hash determinista del canal
        'profile': profile,       # Perfil de contenido
        'ctx':     adn,           # ADN: firma criptográfica del contexto
        'url':     origin_url,    # URL original del servidor IPTV
        'name':    name,
        'group':   group,
        'nonce':   nonce,
        'mode':    '200ok',       # Modo proxy inverso 200 OK (NO 302)
    }
    return proxy_base + '?' + urlencode(params)

# ─── PARSEO DE EXTINF ─────────────────────────────────────────
def parse_extinf(line: str) -> dict:
    """Extrae tvg-id, tvg-name, group-title y display-name de #EXTINF."""
    result = {'tvg_id': '', 'name': '', 'group': '', 'raw': line}
    m = re.search(r'tvg-id="([^"]*)"',      line); result['tvg_id'] = m.group(1) if m else ''
    m = re.search(r'tvg-name="([^"]*)"',    line); result['name']   = m.group(1) if m else ''
    m = re.search(r'group-title="([^"]*)"', line); result['group']  = m.group(1) if m else ''
    if not result['name']:
        m = re.search(r',(.+)$', line)
        result['name'] = m.group(1).strip() if m else 'UNKNOWN'
    return result

# ─── FASE 4: PROCESADOR PRINCIPAL (rendimiento <10s para 4000+ canales) ─
def process_m3u8(input_path: str, output_path: str, proxy_base: str) -> None:
    t_start = time.time()

    print(f"\n{'='*65}")
    print(f"  APE OMEGA — Inyector Híbrido: PHANTOM HYDRA + URL Única")
    print(f"{'='*65}")
    print(f"  Entrada : {input_path}")
    print(f"  Salida  : {output_path}")
    print(f"  Proxy   : {proxy_base}")
    print(f"{'='*65}\n")

    with open(input_path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.readlines()

    total_lines   = len(lines)
    output_lines  = []
    channels      = 0
    profile_stats = {}
    lines_per_channel_samples = []

    i = 0
    while i < total_lines:
        line = lines[i].rstrip('\n').rstrip('\r')

        # ── Detectar bloque de canal ─────────────────────────
        if line.startswith('#EXTINF'):
            extinf_line = line
            meta        = parse_extinf(extinf_line)

            # Recolectar directivas intermedias hasta encontrar la URL
            j = i + 1
            origin_url = None

            while j < total_lines:
                next_line = lines[j].rstrip('\n').rstrip('\r')
                if next_line.startswith(('http', 'rtmp', 'rtp', 'udp', '/')):
                    origin_url = next_line
                    j += 1
                    break
                elif next_line.startswith('#EXTINF'):
                    break
                else:
                    j += 1  # Descartar directivas previas (serán reemplazadas por Phantom)

            if origin_url is None:
                output_lines.append(extinf_line)
                i = j
                continue

            # ── FASE 1: Generar identidad ────────────────────
            uid   = make_uid(meta['tvg_id'], meta['name'], meta['group'])
            nonce = make_nonce(uid)

            # ── FASE 2: Clasificar perfil ────────────────────
            profile = classify_channel(meta['name'], meta['group'])
            adn     = make_adn(uid, profile, nonce)

            # ── FASE 2: Generar bloque Phantom Hydra (52 dir) ─
            phantom_block = build_phantom_hydra_block(uid, nonce, profile)

            # ── FASE 3: Construir URL única ──────────────────
            proxy_url = build_proxy_url(
                proxy_base, origin_url, uid, nonce,
                profile, meta['name'], meta['group'], adn
            )

            # ── Emitir bloque completo: 1 EXTINF + 52 Phantom + 1 URL ─
            channel_start_idx = len(output_lines)
            output_lines.append(extinf_line)
            output_lines.extend(phantom_block)
            output_lines.append(proxy_url)

            lines_this_channel = len(output_lines) - channel_start_idx
            lines_per_channel_samples.append(lines_this_channel)

            channels += 1
            profile_stats[profile] = profile_stats.get(profile, 0) + 1
            i = j
            continue

        # ── Línea genérica (cabecera, comentarios) ───────────
        output_lines.append(line)
        i += 1

    # ── Escribir salida ──────────────────────────────────────
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(output_lines) + '\n')

    t_elapsed = time.time() - t_start

    # ── Verificación: contar líneas por canal ────────────────
    avg_lines = sum(lines_per_channel_samples) / len(lines_per_channel_samples) if lines_per_channel_samples else 0
    # Estructura esperada: 1 (#EXTINF) + 52 (Phantom) + 1 (URL) = 54 líneas por canal
    # Nota: el documento dice "53 líneas" contando solo las directivas + URL (sin #EXTINF)
    phantom_lines_per_channel = avg_lines - 1  # Restar el #EXTINF
    verification_ok = abs(phantom_lines_per_channel - 53) < 0.5

    # ── Reporte ──────────────────────────────────────────────
    print(f"  Canales procesados    : {channels:,}")
    print(f"  Líneas de salida      : {len(output_lines):,}")
    print(f"  Tiempo de procesamiento: {t_elapsed:.2f}s")
    print(f"  Líneas/canal (Phantom+URL): {phantom_lines_per_channel:.0f} (esperado: 53)")
    print(f"  Verificación 53 líneas: {'✅ PASS' if verification_ok else '❌ FAIL'}")
    print(f"\n  Distribución de perfiles:")
    for p, c in sorted(profile_stats.items(), key=lambda x: -x[1]):
        pct = c / channels * 100 if channels else 0
        print(f"    {p:<30} {c:>5,} canales ({pct:.1f}%)")
    print(f"\n  ✅ Lista generada: {output_path}")
    print(f"  Cada canal: 52 directivas PHANTOM HYDRA + 1 URL ÚNICA → PHP 200 OK Proxy\n")

    if t_elapsed > 10:
        print(f"  ⚠️  ADVERTENCIA: El procesamiento tardó {t_elapsed:.1f}s (límite: 10s)")
        print(f"      Considera usar una lista de entrada más pequeña o un SSD más rápido.")

# ─── CLI ─────────────────────────────────────────────────────
if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='APE OMEGA — Inyector Híbrido: PHANTOM HYDRA + URL Única Polimórfica',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
EJEMPLOS:
  # Procesar lista completa con proxy en VPS
  python3.11 inject_phantom_single_url.py \\
      APE_TYPED_ARRAYS_ULTIMATE_20260401.m3u8 \\
      APE_OMEGA_PHANTOM_SINGLE_URL.m3u8 \\
      --proxy-base "http://iptv-ape.duckdns.org/resolve_quality_unified.php"

  # Usar el VPS directo
  python3.11 inject_phantom_single_url.py input.m3u8 output.m3u8 \\
      --proxy-base "http://178.156.147.234/resolve_quality_unified.php"
        """
    )
    parser.add_argument('input',  help='Lista M3U8 de entrada')
    parser.add_argument('output', help='Lista M3U8 de salida')
    parser.add_argument(
        '--proxy-base',
        default=DEFAULT_PROXY_BASE,
        help=f'URL base del rq_polymorphic_resolver.php (default: {DEFAULT_PROXY_BASE})'
    )
    args = parser.parse_args()

    if not Path(args.input).exists():
        print(f"ERROR: No se encuentra el archivo de entrada: {args.input}", file=sys.stderr)
        sys.exit(1)

    process_m3u8(args.input, args.output, args.proxy_base)
