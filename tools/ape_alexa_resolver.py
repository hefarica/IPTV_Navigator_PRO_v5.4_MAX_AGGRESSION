#!/usr/bin/env python3
"""Deterministic Alexa-style channel resolver over REA channels.json.

Same phrase + same catalog => same channel. No AWS, DynamoDB or network.
Usage:
  python3 tools/ape_alexa_resolver.py channels.json "pon cnn"
"""
import json
import re
import sys
import unicodedata


def norm(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode()
    s = re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()
    return re.sub(r'\s+', ' ', s)


def best(channels, phrase):
    q = norm(phrase)
    q_tokens = set(q.split())
    ranked = []
    for i, ch in enumerate(channels):
        name = norm(ch.get('name', ''))
        if not name:
            continue
        score = 0
        if q == name:
            score = 1000
        elif name in q or q in name:
            score = 500 + min(len(name), len(q))
        else:
            n_tokens = set(name.split())
            score = len(q_tokens & n_tokens) * 10
        if score:
            ranked.append((score, i, ch))
    if not ranked:
        return None
    ranked.sort(key=lambda x: (-x[0], x[1]))
    return ranked[0][2]


def main(argv):
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    data = json.load(open(argv[1], encoding='utf-8'))
    channels = data.get('channels', [])
    ch = best(channels, argv[2])
    print(json.dumps({
        'query': argv[2],
        'matched': ch is not None,
        'channel': ch,
        'deterministic': True,
    }, ensure_ascii=False, indent=2))
    return 0 if ch else 1


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
