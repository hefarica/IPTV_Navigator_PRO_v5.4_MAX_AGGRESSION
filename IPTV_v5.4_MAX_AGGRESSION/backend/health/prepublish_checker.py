#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════
🎯 PREPUBLISH CHECKER — Etapa 3 del plan "Integración sin /resolve/"
═══════════════════════════════════════════════════════════════

Pipeline 8-pasos del diagrama "prepublish_pipeline_without_resolve":
   1. Canal + catálogo fuente (recibido por el caller)
   2. Variantes candidatas por perfil y formato (recibidas en `candidates`)
   3. Canonicalización (aplicada por el frontend con APEFormatPolicy)
   4. Validar respuesta HTTP real ← empieza aquí
   5. Leer Content-Type y cuerpo inicial (256 bytes)
   6. ¿MIME coincide con el rol esperado?
   7. Evaluar compatibilidad del perfil (HLS > HLS-legacy > HLS-TS > DASH > CMAF)
   8. Seleccionar URL terminal mejor posicionada + insertar en admitted[]

Usado vía:
   - CLI: python prepublish_checker.py --input batch.json --out result.json
   - HTTP: gate_server.py POST /prepublish → llama run_batch()

Contrato API: ver crispy-soaring-floyd.md Fase 0.
═══════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import argparse
import json
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, List, Optional

import requests


# ── Headers anti-WAF (replica publication_gate.py + health_checker.py) ───────
DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WebAppManager',
    'Referer': 'https://www.netflix.com/',
    'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
    'Connection': 'keep-alive',
}


# ── Política MIME (traducción 1:1 de frontend/js/ape-v9/mime-policy.js) ──────
MIME_POLICY: Dict[str, Dict[str, str]] = {
    'application/vnd.apple.mpegurl': {'role': 'playlist_hls',   'disposition': 'preferred'},
    'application/x-mpegurl':         {'role': 'playlist_hls',   'disposition': 'admitted'},
    'application/dash+xml':          {'role': 'playlist_dash',  'disposition': 'admitted'},
    'video/mp2t':                    {'role': 'segment_ts',     'disposition': 'admitted'},
    'video/iso.segment':             {'role': 'segment_cmaf',   'disposition': 'admitted'},
    'application/mp4':               {'role': 'segment_cmaf',   'disposition': 'admitted'},
    'audio/aac':                     {'role': 'audio_track',    'disposition': 'admitted'},
    'audio/mp4':                     {'role': 'audio_track',    'disposition': 'admitted'},
    'text/vtt':                      {'role': 'subtitle',       'disposition': 'admitted'},
    'application/ttml+xml':          {'role': 'subtitle',       'disposition': 'admitted'},
    'application/json':              {'role': 'metadata',       'disposition': 'restricted'},
    'application/jwt':               {'role': 'auth_token',     'disposition': 'restricted'},
    'application/octet-stream':      {'role': 'binary_opaque',  'disposition': 'restricted'},
    'text/plain':                    {'role': 'metadata',       'disposition': 'restricted'},
    'application/x-www-form-urlencoded': {'role': 'form_handshake', 'disposition': 'restricted'},
}

DISPOSITION_RANK = {'preferred': 0, 'admitted': 1, 'restricted': 2, 'forbidden': 3}

DEFAULT_PRIORITY_CHAIN = ['playlist_hls', 'segment_ts', 'playlist_dash', 'segment_cmaf']


def normalize_ct(raw_content_type: str) -> str:
    """Extrae el MIME sin charset/params. Alineado con publication_gate.normalize_ct."""
    return str(raw_content_type or '').split(';')[0].strip().lower()


def matches_role(content_type: str, expected_role: str, body_preview: str = '') -> bool:
    """
    ¿El Content-Type real matchea el rol esperado de la URL?
    Caso especial HLS: si expected_role=='playlist_hls' y body empieza con '#EXTM3U',
    admitir aunque Content-Type sea text/plain (upstream a veces miente).
    """
    if not expected_role:
        return False
    ct_norm = normalize_ct(content_type)
    entry = MIME_POLICY.get(ct_norm)
    if entry and entry['role'] == expected_role:
        return entry['disposition'] in ('preferred', 'admitted')
    # Bypass HLS: cuerpo inicia con #EXTM3U
    if expected_role == 'playlist_hls' and body_preview:
        head = body_preview.lstrip()[:8].upper()
        if head.startswith('#EXTM3U'):
            return True
    return False


def probe_variant(session: requests.Session, url: str, timeout: int = 8) -> Dict:
    """
    GET con stream=True. Lee primeros 256 bytes. Cierra socket.
    Retorna {status, content_type, body_preview, final_url, error?}.
    Blindaje total: cualquier excepción → status=0 con 'error'.
    """
    try:
        resp = session.get(url, timeout=timeout, allow_redirects=True, stream=True)
        status = resp.status_code
        ct = resp.headers.get('Content-Type', '')
        final_url = resp.url
        try:
            raw = next(resp.iter_content(chunk_size=256), b'') or b''
            body_preview = raw.decode('utf-8', errors='replace')
        except Exception:
            body_preview = ''
        try:
            resp.close()
        except Exception:
            pass
        return {
            'url': url,
            'status': status,
            'content_type': ct,
            'body_preview': body_preview,
            'final_url': final_url,
        }
    except requests.RequestException as exc:
        return {'url': url, 'status': 0, 'content_type': '', 'body_preview': '', 'final_url': '', 'error': str(exc)}
    except Exception as exc:
        return {'url': url, 'status': 0, 'content_type': '', 'body_preview': '', 'final_url': '', 'error': f'unexpected:{exc}'}


def evaluate_variant(probe: Dict, expected_role: str) -> Dict:
    """
    Evalúa si una probe cumple: 200 + MIME match + no 'restricted'.
    Retorna {admitted: bool, reason: str, role?: str, disposition?: str}.
    """
    status = probe.get('status', 0)
    if status != 200:
        return {'admitted': False, 'reason': f'http_not_200:{status}'}
    ct_norm = normalize_ct(probe.get('content_type', ''))
    body_preview = probe.get('body_preview', '')
    mime_entry = MIME_POLICY.get(ct_norm)
    if matches_role(probe.get('content_type', ''), expected_role, body_preview):
        # Determinar disposición para ranking
        disposition = mime_entry['disposition'] if mime_entry else 'admitted'  # bypass HLS
        return {
            'admitted': True,
            'reason': 'ok',
            'role': expected_role,
            'disposition': disposition,
            'mime_real': ct_norm,
        }
    return {'admitted': False, 'reason': f'mime_mismatch:{ct_norm}_vs_{expected_role}'}


def rank_variants(admitted_variants: List[Dict], priority_chain: List[str]) -> Optional[Dict]:
    """
    Ordena las variantes admitidas por:
       1. priority_chain.index(role) — menor = más prioritario
       2. DISPOSITION_RANK[disposition] — preferred > admitted
       3. número de perfil (P0 > P1 > ... > P5)
    Retorna la mejor variante o None si la lista está vacía.
    """
    if not admitted_variants:
        return None

    def sort_key(v: Dict):
        role = v.get('role', '')
        role_idx = priority_chain.index(role) if role in priority_chain else len(priority_chain)
        disp_rank = DISPOSITION_RANK.get(v.get('disposition', 'admitted'), 99)
        profile = v.get('profile', 'P9')
        try:
            profile_num = int(profile.lstrip('Pp'))
        except (ValueError, AttributeError):
            profile_num = 99
        return (role_idx, disp_rank, profile_num)

    sorted_variants = sorted(admitted_variants, key=sort_key)
    return sorted_variants[0]


def _process_channel(session: requests.Session, channel: Dict, timeout: int, priority_chain: List[str]) -> Dict:
    """Procesa 1 canal: probe todas sus variantes en serie (mismo origen = no saturar), rankea, retorna admitted/rejected."""
    channel_id = str(channel.get('channel_id', ''))
    channel_name = channel.get('channel_name', '')
    variants = channel.get('variants', []) or []

    outcomes = []
    admitted_variants = []

    for v in variants:
        url = v.get('url')
        profile = v.get('profile', '')
        expected_role = v.get('expected_role', '')
        if not url:
            outcomes.append({'profile': profile, 'url': url, 'rejected': 'no_url'})
            continue
        probe = probe_variant(session, url, timeout)
        evaluation = evaluate_variant(probe, expected_role)
        outcome = {
            'profile': profile,
            'url': url,
            'status': probe.get('status', 0),
            'content_type': normalize_ct(probe.get('content_type', '')),
        }
        if evaluation['admitted']:
            admitted_variants.append({
                'url': url,
                'profile': profile,
                'role': evaluation['role'],
                'disposition': evaluation['disposition'],
                'mime_real': evaluation['mime_real'],
                'status': probe.get('status', 0),
            })
            outcome['admitted'] = True
        else:
            outcome['rejected'] = evaluation['reason']
        outcomes.append(outcome)

    best = rank_variants(admitted_variants, priority_chain)
    if best:
        return {
            'kind': 'admitted',
            'entry': {
                'channel_id': channel_id,
                'channel_name': channel_name,
                'chosen_url': best['url'],
                'chosen_profile': best['profile'],
                'chosen_role': best['role'],
                'mime_real': best['mime_real'],
                'status': best['status'],
            },
            'outcomes': outcomes,
        }
    return {
        'kind': 'rejected',
        'entry': {
            'channel_id': channel_id,
            'channel_name': channel_name,
            'reason': 'all_variants_failed',
            'variant_outcomes': outcomes,
        },
        'outcomes': outcomes,
    }


def run_batch(candidates: List[Dict], options: Optional[Dict] = None) -> Dict:
    """
    Entrypoint principal. Recibe lista de canales con variantes candidatas.
    Retorna {admitted: [...], rejected: [...], stats: {...}}.
    """
    opts = options or {}
    concurrency = int(opts.get('concurrency', 20))
    probe_timeout = int(opts.get('probe_timeout', 8))
    priority_chain = list(opts.get('priority_chain') or DEFAULT_PRIORITY_CHAIN)

    candidates = candidates or []
    if not isinstance(candidates, list):
        return {'admitted': [], 'rejected': [], 'stats': {'error': 'candidates_must_be_list', 'candidates_total': 0, 'admitted_count': 0, 'rejected_count': 0, 'elapsed_ms': 0}}

    admitted: List[Dict] = []
    rejected: List[Dict] = []
    start = time.monotonic()

    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    try:
        with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
            futures = {pool.submit(_process_channel, session, ch, probe_timeout, priority_chain): ch for ch in candidates}
            for fut in as_completed(futures):
                try:
                    res = fut.result()
                    if res['kind'] == 'admitted':
                        admitted.append(res['entry'])
                    else:
                        rejected.append(res['entry'])
                except Exception as exc:
                    ch = futures[fut]
                    rejected.append({
                        'channel_id': str(ch.get('channel_id', '')),
                        'channel_name': ch.get('channel_name', ''),
                        'reason': f'worker_exception:{exc}',
                        'variant_outcomes': [],
                    })
    finally:
        try:
            session.close()
        except Exception:
            pass

    elapsed_ms = int((time.monotonic() - start) * 1000)
    return {
        'admitted': admitted,
        'rejected': rejected,
        'stats': {
            'candidates_total': len(candidates),
            'admitted_count': len(admitted),
            'rejected_count': len(rejected),
            'elapsed_ms': elapsed_ms,
            'concurrency': concurrency,
            'probe_timeout': probe_timeout,
            'priority_chain': priority_chain,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Prepublish checker (Etapa 3 del plan Integración sin /resolve/)')
    parser.add_argument('--input', required=True, help='JSON con {candidates:[...], options:{...}}')
    parser.add_argument('--out', required=True, help='Path del JSON de salida')
    parser.add_argument('--timeout', type=int, default=8)
    parser.add_argument('--concurrency', type=int, default=20)
    parser.add_argument('--priority-chain', default=','.join(DEFAULT_PRIORITY_CHAIN),
                        help='CSV de roles en orden de prioridad')
    args = parser.parse_args()

    data = json.loads(Path(args.input).read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise SystemExit('input JSON debe ser un objeto con claves candidates/options')

    candidates = data.get('candidates') or []
    options = data.get('options') or {}
    options.setdefault('probe_timeout', args.timeout)
    options.setdefault('concurrency', args.concurrency)
    options.setdefault('priority_chain', [r.strip() for r in args.priority_chain.split(',') if r.strip()])

    try:
        result = run_batch(candidates, options)
    except Exception:
        print(traceback.format_exc())
        raise

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    summary = {k: result['stats'][k] for k in ('candidates_total', 'admitted_count', 'rejected_count', 'elapsed_ms')}
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
