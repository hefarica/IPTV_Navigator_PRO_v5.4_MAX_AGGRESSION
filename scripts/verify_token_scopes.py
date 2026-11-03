#!/usr/bin/env python3
"""Fail closed if Android credential scopes are mixed.

Contract:
  /ara/events -> Bearer event token (Config.eventToken)
  /ara/state  -> SSE state token (Config.stateToken), never the Bearer token
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "IPTV_v5.4_MAX_AGGRESSION" / "android" / "ape-crystal-agent" / "app" / "src" / "main" / "java" / "com" / "ape" / "crystalagent"
errors = []

def text(name):
    p = SRC / name
    if not p.is_file():
        errors.append(f"missing {name}")
        return ""
    return p.read_text(encoding="utf-8")

config = text("Config.kt")
state = text("StatePublisher.kt")
bridge = text("AraCommandBridge.kt")
receiver = text("MetaReceiver.kt")
activity = text("MainActivity.kt")
vault = text("TokenVaultClient.kt")

checks = [
    ("events path constant exists", "PATH_EVENTS" in config),
    ("state path constant exists", "PATH_STATE" in config),
    ("state token is stored separately", "KEY_STATE_TOKEN" in config),
    ("event token is stored separately", "KEY_EVENT_TOKEN" in config),
    ("state publisher uses stateToken", "stateToken" in state),
    ("state publisher targets PATH_STATE", "Config.PATH_STATE" in state),
    ("state publisher does not target events", "PATH_EVENTS" not in state),
    ("state publisher does not use generic token", "Config(ctx).token" not in state),
    ("event bridge uses eventToken", "eventToken" in bridge),
    ("event receiver targets PATH_EVENTS", "Config.PATH_EVENTS" in receiver),
    ("event receiver does not target state", "PATH_STATE" not in receiver),
    ("UI keeps two credential fields", "SSE TOKEN (/ara/state)" in activity and "TOKEN Bearer" in activity),
    ("no token length/value logging", "token_len" not in (state + receiver + bridge + config)),
    ("vault path exists", "PATH_VAULT" in config),
    ("vault authenticates with event token", "Bearer $event" in vault),
    ("vault restores state only when missing", "stateToken.isNotBlank()" in vault and "setStateToken(state)" in vault),
    ("event token has private backup", "eventTokenPriv" in config),
    ("state token has private backup", "stateTokenPriv" in config),
]
for label, ok in checks:
    print(("PASS" if ok else "FAIL") + " " + label)
    if not ok:
        errors.append(label)

if errors:
    print("TOKEN_SCOPE_HARDENING=FAIL " + "; ".join(errors))
    sys.exit(1)
print("TOKEN_SCOPE_HARDENING=PASS")
