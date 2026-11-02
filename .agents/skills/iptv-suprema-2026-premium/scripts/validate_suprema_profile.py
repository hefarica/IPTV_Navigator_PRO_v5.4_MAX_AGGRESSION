#!/usr/bin/env python3
"""Validate the IPTV_PREMIUM profile contract."""
import json
import sys

REQUIRED = ['schema', 'id', 'version', 'based_on', 'inherits', 'identity',
            'mission', 'scope_model', 'image_pipeline', 'profiles',
            'construction_chain', 'evidence', 'maturity', 'commands', 'guardrails']


def main(path):
    d = json.load(open(path, encoding='utf-8'))
    errors = []
    for key in REQUIRED:
        if key not in d:
            errors.append('missing ' + key)
    if d.get('id') != 'IPTV_PREMIUM':
        errors.append('id must be IPTV_PREMIUM')
    if d.get('based_on') != 'creador_habilidades':
        errors.append('based_on must be creador_habilidades')
    if not isinstance(d.get('inherits'), list) or 'creador_habilidades' not in d['inherits']:
        errors.append('inherits must include creador_habilidades')
    if not isinstance(d.get('commands'), list) or not d['commands']:
        errors.append('commands must be non-empty')
    maturity = d.get('maturity')
    if not isinstance(maturity, dict) or not maturity:
        errors.append('maturity missing')
    else:
        for name, item in maturity.items():
            if not isinstance(item, dict):
                errors.append(f'maturity.{name} must be object')
                continue
            score = item.get('score')
            if not isinstance(score, (int, float)) or not 0 <= score <= 100:
                errors.append(f'maturity.{name}.score invalid')
            if not item.get('evidence'):
                errors.append(f'maturity.{name}.evidence missing')
    print(json.dumps({
        'ok': not errors,
        'id': d.get('id'),
        'based_on': d.get('based_on'),
        'maturity_scores': {k: v.get('score') for k, v in (maturity or {}).items()},
        'errors': errors,
    }, indent=2, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('usage: validate_suprema_profile.py <profile.json>', file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))

