#!/usr/bin/env python3
"""Deterministic IPTV session/token registry (iptv-proxy concept subset).

Same client+channel+secret => same token and same provider slot, independent of
process restarts. Four TVs assigned to two provider slots deterministically.
No network, no credentials, no stream access.

Usage:
  python3 tools/ape_idempotent_session.py token <secret> <client> <channel> <slots>
  python3 tools/ape_idempotent_session.py self-test
"""
import hashlib
import hmac
import json
import sys


def token(secret, client, channel):
    msg = f'{client}|{channel}'.encode('utf-8')
    return hmac.new(secret.encode('utf-8'), msg, hashlib.sha256).hexdigest()


def slot(secret, client, channel, slots=2):
    if slots < 1:
        raise ValueError('slots must be >= 1')
    # Rendezvous (highest-random-weight) hashing: deterministic, stable and
    # distributes clients better than a single modulo.
    best_slot = 0
    best_score = -1
    for candidate in range(slots):
        msg = f'{client}|{channel}|slot-{candidate}'.encode('utf-8')
        score = int(hmac.new(secret.encode('utf-8'), msg, hashlib.sha256).hexdigest()[:16], 16)
        if score > best_score:
            best_score = score
            best_slot = candidate
    return best_slot


def resolve(secret, client, channel, slots=2):
    return {
        'client': client,
        'channel': channel,
        'token': token(secret, client, channel)[:24],
        'slot': slot(secret, client, channel, slots),
        'slots': slots,
        'idempotent': True,
    }


def main(argv):
    if len(argv) >= 5 and argv[1] == 'token':
        print(json.dumps(resolve(argv[2], argv[3], argv[4], int(argv[5]) if len(argv) > 5 else 2), indent=2))
        return 0
    if len(argv) == 2 and argv[1] == 'self-test':
        secret = 'local-test-secret'
        out = [resolve(secret, f'tv{i}', 'SKY-SPORTS-F1', 2) for i in range(1, 5)]
        again = [resolve(secret, f'tv{i}', 'SKY-SPORTS-F1', 2) for i in range(1, 5)]
        tokens_stable = [a['token'] for a in out] == [b['token'] for b in again]
        slots_used = sorted(set(x['slot'] for x in out))
        # Simulate a restart: same values must be reproduced.
        print(json.dumps({
            'clients': out,
            'tokens_stable': tokens_stable,
            'slot_distribution': {str(s): sum(1 for x in out if x['slot'] == s) for s in range(2)},
            'note': 'Deterministic/stable; balance is best-effort HRW, not a hard 50/50 guarantee.',
        }, indent=2))
        return 0 if tokens_stable else 1
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
