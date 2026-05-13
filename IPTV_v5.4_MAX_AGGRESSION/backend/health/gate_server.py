#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import traceback
from pathlib import Path

from flask import Flask, Response, jsonify, request

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

try:
    from publication_gate import run_gate
except Exception as exc:
    run_gate = None
    _import_error = str(exc)
else:
    _import_error = None

# Etapa 3 del plan "Integración sin /resolve/" — import del prepublish checker
# Patrón idéntico al run_gate para que el server arranque aunque falte el módulo
try:
    from prepublish_checker import run_batch as prepublish_run_batch
except Exception as exc:
    prepublish_run_batch = None
    _prepublish_import_error = str(exc)
else:
    _prepublish_import_error = None

app = Flask(__name__)

DEFAULT_SAMPLE = int(os.environ.get('APE_GATE_SAMPLE', '300'))
DEFAULT_TIMEOUT = int(os.environ.get('APE_GATE_TIMEOUT', '15'))


@app.after_request
def add_cors(response: Response) -> Response:
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.get('/health')
def health():
    return jsonify({
        'ok': run_gate is not None,
        'import_error': _import_error,
        'prepublish_ok': prepublish_run_batch is not None,
        'prepublish_import_error': _prepublish_import_error,
        'sample': DEFAULT_SAMPLE,
        'timeout': DEFAULT_TIMEOUT,
    })


@app.get('/admitted.json')
def serve_admitted():
    """Sirve el archivo admitted.json para que el frontend en Live Server lo consuma
    cross-origin (Live Server solo sirve frontend/; admitted.json vive en backend/)."""
    path = HERE / 'runtime' / 'admitted.json'
    if not path.exists():
        return jsonify({'error': 'admitted_json_not_found', 'path': str(path)}), 404
    try:
        text = path.read_text(encoding='utf-8')
    except Exception as exc:
        return jsonify({'error': 'read_failed', 'detail': str(exc)}), 500
    return Response(text, mimetype='application/json')


@app.route('/gate', methods=['POST', 'OPTIONS'])
def gate():
    if request.method == 'OPTIONS':
        return ('', 204)
    if run_gate is None:
        return jsonify({'error': 'publication_gate_not_importable', 'detail': _import_error}), 500

    try:
        sample_size = int(request.args.get('sample', DEFAULT_SAMPLE))
    except (TypeError, ValueError):
        sample_size = DEFAULT_SAMPLE
    try:
        timeout = int(request.args.get('timeout', DEFAULT_TIMEOUT))
    except (TypeError, ValueError):
        timeout = DEFAULT_TIMEOUT

    raw = request.get_data(cache=False, as_text=False) or b''
    try:
        text = raw.decode('utf-8', errors='replace')
    except Exception:
        text = raw.decode('latin-1', errors='replace')

    if not text.strip():
        return jsonify({'error': 'empty_body', 'hint': 'POST raw .m3u8 text'}), 400

    try:
        verdict = run_gate(
            text,
            sample_size=sample_size,
            timeout=timeout,
        )
    except Exception as exc:
        return jsonify({
            'error': 'gate_execution_failed',
            'exception': str(exc),
            'traceback': traceback.format_exc(),
        }), 500

    return jsonify(verdict)


@app.route('/prepublish', methods=['POST', 'OPTIONS'])
def prepublish():
    """
    Etapa 3 del plan "Integración sin /resolve/".
    Recibe JSON con candidates[] + options. Corre prepublish_checker.run_batch.
    Devuelve admitted[], rejected[], stats{}.
    """
    if request.method == 'OPTIONS':
        return ('', 204)
    if prepublish_run_batch is None:
        return jsonify({
            'error': 'prepublish_checker_not_importable',
            'detail': _prepublish_import_error
        }), 500

    try:
        body = request.get_json(force=True, silent=False)
    except Exception as exc:
        return jsonify({'error': 'invalid_body', 'detail': str(exc)}), 400

    if not isinstance(body, dict):
        return jsonify({'error': 'invalid_body', 'detail': 'body must be a JSON object'}), 400

    candidates = body.get('candidates')
    if not isinstance(candidates, list):
        return jsonify({'error': 'invalid_body', 'detail': 'candidates must be an array'}), 400

    options = body.get('options') or {}
    if not isinstance(options, dict):
        options = {}

    try:
        result = prepublish_run_batch(candidates, options)
    except Exception as exc:
        return jsonify({
            'error': 'execution_failed',
            'exception': str(exc),
            'traceback': traceback.format_exc()
        }), 500

    return jsonify(result)


if __name__ == '__main__':
    port = int(os.environ.get('APE_GATE_PORT', '8766'))
    host = os.environ.get('APE_GATE_HOST', '127.0.0.1')
    app.run(host=host, port=port, debug=False, use_reloader=False)
