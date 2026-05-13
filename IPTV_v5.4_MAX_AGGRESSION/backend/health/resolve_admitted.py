#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlparse

import requests
from flask import Flask, Response, jsonify, redirect, request


ADMITTED_JSON = Path(os.environ.get('APE_ADMITTED_JSON', '/home/ubuntu/ape_integration/backend/health/runtime/admitted.json'))
RESOLVE_MODE = os.environ.get('APE_RESOLVE_MODE', 'redirect').strip().lower()

app = Flask(__name__)
_session = requests.Session()
_cached = {'mtime': None, 'payload': {}}


def load_admitted() -> dict:
    if not ADMITTED_JSON.exists():
        return {}
    mtime = ADMITTED_JSON.stat().st_mtime
    if _cached['mtime'] == mtime:
        return _cached['payload']
    with ADMITTED_JSON.open('r', encoding='utf-8') as fh:
        payload = json.load(fh)
    _cached['mtime'] = mtime
    _cached['payload'] = payload
    return payload


@app.get('/health')
def health():
    payload = load_admitted()
    return jsonify({'ok': True, 'entries': len(payload), 'mode': RESOLVE_MODE, 'admitted_json': str(ADMITTED_JSON)})


@app.get('/resolve/<stream_id>.m3u8')
def resolve_stream(stream_id: str):
    payload = load_admitted()
    entry = payload.get(str(stream_id))
    if not entry:
        return jsonify({'ok': False, 'error': 'stream_id_no_admitido', 'stream_id': stream_id}), 404

    target = entry.get('url')
    if not target:
        return jsonify({'ok': False, 'error': 'entry_sin_url', 'stream_id': stream_id}), 500

    requested_profile = request.args.get('profile', 'P3')
    if RESOLVE_MODE == 'proxy':
        upstream = _session.get(target, timeout=20, allow_redirects=True)
        headers = {
            'Content-Type': upstream.headers.get('Content-Type', 'application/vnd.apple.mpegurl'),
            'X-APE-Requested-Profile': requested_profile,
            'X-APE-Upstream-Host': urlparse(upstream.url).hostname or '',
            'Cache-Control': 'no-store'
        }
        return Response(upstream.content, status=upstream.status_code, headers=headers)

    response = redirect(target, code=302)
    response.headers['X-APE-Requested-Profile'] = requested_profile
    response.headers['X-APE-Upstream-Host'] = entry.get('host', '')
    response.headers['Cache-Control'] = 'no-store'
    return response


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', '8765')), debug=False)
