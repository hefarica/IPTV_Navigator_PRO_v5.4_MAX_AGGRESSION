#!/usr/bin/env python3
"""Persistent idempotent IPTV session registry.

Same client + channel + secret -> same token and slot after restarts.
New sessions go to the least-loaded of N provider slots (4 TVs / 2 slots).
State is a local JSON file; no network and no credentials are stored.

Usage:
  python3 tools/ape_idempotent_session.py token <secret> <client> <channel> <slots> [state]
  python3 tools/ape_idempotent_session.py self-test
"""
import hashlib
import hmac
import json
import os
import sys
import tempfile


def digest(secret, client, channel):
    return hmac.new(secret.encode('utf-8'), f'{client}|{channel}'.encode('utf-8'), hashlib.sha256).hexdigest()


class Registry:
    def __init__(self, secret, slots, state):
        self.secret = secret
        self.slots = slots
        self.state = state
        self.data = {'sessions': {}, 'loads': {}}
        if state and os.path.exists(state):
            try:
                loaded = json.load(open(state, encoding='utf-8'))
                if isinstance(loaded, dict) and isinstance(loaded.get('sessions'), dict):
                    self.data = loaded
            except Exception:
                pass
        for i in range(slots):
            self.data['loads'].setdefault(str(i), 0)

    def key(self, client, channel):
        return 'sha256:' + digest(self.secret, client, channel)[:32]

    def resolve(self, client, channel):
        key = self.key(client, channel)
        existing = self.data['sessions'].get(key)
        if existing:
            return existing
        # least-loaded slot, deterministic tie-breaker by index
        loads = [(int(self.data['loads'].get(str(i), 0)), i) for i in range(self.slots)]
        _, chosen = min(loads)
        entry = {
            'client': client,
            'channel': channel,
            'token': digest(self.secret, client, channel)[:24],
            'slot': chosen,
            'slots': self.slots,
            'idempotent': True,
        }
        self.data['sessions'][key] = entry
        self.data['loads'][str(chosen)] = int(self.data['loads'].get(str(chosen), 0)) + 1
        self.save()
        return entry

    def save(self):
        if not self.state:
            return
        directory = os.path.dirname(os.path.abspath(self.state))
        os.makedirs(directory, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=directory, prefix='.sessions.', suffix='.json')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, ensure_ascii=False, sort_keys=True)
            os.replace(tmp, self.state)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)


def resolve(secret, client, channel, slots=2, state=None):
    return Registry(secret, slots, state).resolve(client, channel)


def main(argv):
    if len(argv) >= 5 and argv[1] == 'token':
        slots = int(argv[5]) if len(argv) > 5 and argv[5].isdigit() else 2
        state = argv[6] if len(argv) > 6 else None
        print(json.dumps(resolve(argv[2], argv[3], argv[4], slots, state), indent=2))
        return 0
    if len(argv) == 2 and argv[1] == 'self-test':
        secret = 'local-test-secret'
        with tempfile.TemporaryDirectory() as td:
            state = os.path.join(td, 'sessions.json')
            r = Registry(secret, 2, state)
            first = [r.resolve(f'tv{i}', 'SKY-SPORTS-F1') for i in range(1, 5)]
            again = [Registry(secret, 2, state).resolve(f'tv{i}', 'SKY-SPORTS-F1') for i in range(1, 5)]
            slots_used = sorted(set(x['slot'] for x in first))
            tokens_stable = [x['token'] for x in first] == [x['token'] for x in again]
            slots_stable = [x['slot'] for x in first] == [x['slot'] for x in again]
            print(json.dumps({
                'clients': first,
                'tokens_stable': tokens_stable,
                'slots_stable': slots_stable,
                'slots_used': slots_used,
                'four_clients_two_slots': slots_used == [0, 1],
            }, indent=2))
            return 0 if (tokens_stable and slots_stable and slots_used == [0, 1]) else 1
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
