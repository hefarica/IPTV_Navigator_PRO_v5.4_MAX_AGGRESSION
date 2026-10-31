#!/usr/bin/env python3
from pathlib import Path

p = Path("/usr/local/bin/ara-skill")
s = p.read_text()
needle = 'if [ "$MODE" = "status" ]; then'
gate = '''# ARA-SKILL SELF GATE — FASE 1
if [ "$CANARY" = "1" ]; then
  AP="$ROOT/self/APPROVED"
  [ -f "$AP" ] || fail "falta self/APPROVED; corre ara-skill-grade.py"
  CUR=$(cat "$ROOT"/self/S-*.md 2>/dev/null | sha256sum | cut -d' ' -f1)
  [ "$CUR" = "$(cat "$AP")" ] || fail "skills propias cambiaron; re-aprueba antes del canary"
fi

'''
if "ARA-SKILL SELF GATE" in s:
    print("gate ya instalado")
elif needle not in s:
    raise SystemExit("no se encontró el punto de inserción en ara-skill")
else:
    s = s.replace(needle, gate + needle, 1)
    p.write_text(s)
    print("gate instalado")
