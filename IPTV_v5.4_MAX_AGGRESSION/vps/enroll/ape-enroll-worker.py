#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ape-enroll-worker.py — Worker ROOT del auto-enrolamiento WireGuard (F0).

Corre como root (systemd). Procesa la cola que escribe ara-enroll.php (www-data):
  lee  /dev/shm/ape_enroll/req-<id>.json   (solicitud ya autenticada por el endpoint)
  escribe /dev/shm/ape_enroll/resp-<id>.json (respuesta con el config WG)

Por cada solicitud:
  1. Valida la pubkey (de nuevo).
  2. Idempotencia por pubkey (registry /etc/wireguard/ape_peers.json): si ya existe -> devuelve su IP.
  3. Asigna la siguiente IP libre 10.200.0.x (reservadas 1-4; cap configurable).
  4. `wg set wg0 peer <pub> allowed-ips <ip>/32` (en vivo) + persiste [Peer] en wg0.conf (backup antes).
  5. Registra el device en el Guardian (config.yaml devices:) + SIGHUP  -> BEST-EFFORT, no fatal.
  6. Audita en /var/log/ape-enroll/audit.jsonl.

Doctrina: alcance acotado (solo wg + esos 2 configs), idempotente, auditado, SIEMPRE responde
(incluso en error) para que el endpoint no haga timeout. No toca shield/intercept/lists.
"""

import json
import os
import re
import signal
import subprocess
import sys
import time

# ── Config ────────────────────────────────────────────────────────────────────
QUEUE_DIR      = "/dev/shm/ape_enroll"
WG_IFACE       = "wg0"
WG_CONF        = "/etc/wireguard/wg0.conf"
PEERS_REGISTRY = "/etc/wireguard/ape_peers.json"
GUARDIAN_CONF  = "/etc/ape-realtime-guardian/config.yaml"
AUDIT_DIR      = "/var/log/ape-enroll"
AUDIT_FILE     = os.path.join(AUDIT_DIR, "audit.jsonl")

SUBNET_PREFIX  = "10.200.0."
RESERVED_HOSTS = {0, 1, 2, 3, 4, 255}   # .1 server, .2 ONN, .3 FireTV, .4 onn4k_buga(guardian)
HOST_MIN, HOST_MAX = 5, 250
MAX_PEERS      = 200                      # cap anti-abuso
WG_ENDPOINT    = os.environ.get("APE_WG_ENDPOINT", "178.156.147.234:51820")
WG_DNS         = os.environ.get("APE_WG_DNS", "10.200.0.1")
POLL_SEC       = 0.2

PUBKEY_RE = re.compile(r"^[A-Za-z0-9+/]{43}=$")

# Resolucion de www-data para permisos de la cola IPC (review HIGH: NO usar 0o777)
try:
    import pwd
    _pw = pwd.getpwnam("www-data")
    WWW_UID, WWW_GID = _pw.pw_uid, _pw.pw_gid
except Exception:
    WWW_UID, WWW_GID = -1, -1


def log_audit(rec):
    try:
        os.makedirs(AUDIT_DIR, exist_ok=True)
        rec["ts"] = int(time.time())
        with open(AUDIT_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception as e:
        sys.stderr.write("audit fail: %s\n" % e)


def run(cmd, timeout=10):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def load_registry():
    try:
        with open(PEERS_REGISTRY, "r", encoding="utf-8") as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def save_registry(reg):
    tmp = PEERS_REGISTRY + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(reg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, PEERS_REGISTRY)
    try:
        os.chmod(PEERS_REGISTRY, 0o600)
    except Exception:
        pass


def used_hosts(reg):
    """IPs ya usadas: reservadas + del registry + las que ya tiene wg0.conf."""
    used = set(RESERVED_HOSTS)
    for entry in reg.values():
        ip = entry.get("ip", "")
        if ip.startswith(SUBNET_PREFIX):
            try:
                used.add(int(ip[len(SUBNET_PREFIX):].split("/")[0]))
            except Exception:
                pass
    try:
        with open(WG_CONF, "r", encoding="utf-8") as f:
            for line in f:
                m = re.search(r"AllowedIPs\s*=\s*" + re.escape(SUBNET_PREFIX) + r"(\d+)/32", line)
                if m:
                    used.add(int(m.group(1)))
    except Exception:
        pass
    return used


def alloc_ip(reg):
    used = used_hosts(reg)
    if len([h for h in used if h not in RESERVED_HOSTS]) >= MAX_PEERS:
        return None
    for h in range(HOST_MIN, HOST_MAX + 1):
        if h not in used:
            return "%s%d" % (SUBNET_PREFIX, h)
    return None


def server_pubkey():
    r = run(["wg", "show", WG_IFACE, "public-key"])
    return r.stdout.strip() if r.returncode == 0 else ""


def wg_set_peer(pub, ip):
    r = run(["wg", "set", WG_IFACE, "peer", pub, "allowed-ips", ip + "/32"])
    return r.returncode == 0, (r.stderr or "").strip()


def persist_wg_conf(pub, ip, device_id, model):
    """Append [Peer] a wg0.conf (idempotente: si ya esta la pubkey, no duplica). Backup antes."""
    try:
        with open(WG_CONF, "r", encoding="utf-8") as f:
            cur = f.read()
    except Exception as e:
        return False, "read wg0.conf: %s" % e
    if pub in cur:
        return True, "already-in-conf"
    bak = "%s.bak_enroll_%d" % (WG_CONF, int(time.time()))
    try:
        with open(bak, "w", encoding="utf-8") as f:
            f.write(cur)
    except Exception as e:
        return False, "backup: %s" % e
    block = ("\n[Peer]\n# auto-enroll %s %s %d\nPublicKey = %s\nAllowedIPs = %s/32\n"
             % (device_id, model, int(time.time()), pub, ip))
    try:
        with open(WG_CONF, "a", encoding="utf-8") as f:
            f.write(block)
    except Exception as e:
        return False, "append: %s" % e
    return True, "appended"


def register_guardian(ip, device_id):
    """BEST-EFFORT (no fatal): anade el device a probes.devices del Guardian + SIGHUP."""
    try:
        import yaml  # PyYAML; si no esta, se omite (no fatal)
    except Exception:
        return "yaml-missing"
    try:
        with open(GUARDIAN_CONF, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
        probes = cfg.setdefault("probes", {})
        devices = probes.setdefault("devices", [])
        addr = "%s:5555" % ip
        for d in devices:
            if isinstance(d, dict) and d.get("adb_address") == addr:
                return "already"
        devices.append({"name": "enroll_%s" % device_id, "adb_address": addr,
                        "player": "exoplayer", "poll_every_n_cycles": 2})
        bak = "%s.bak_enroll_%d" % (GUARDIAN_CONF, int(time.time()))
        with open(bak, "w", encoding="utf-8") as f:
            yaml.safe_dump(cfg, f, sort_keys=False, default_flow_style=False)  # validar dump primero
        with open(GUARDIAN_CONF, "w", encoding="utf-8") as f:
            yaml.safe_dump(cfg, f, sort_keys=False, default_flow_style=False)
        # SIGHUP al daemon (recarga sin reiniciar, segun su doc)
        run(["systemctl", "kill", "-s", "HUP", "ape-realtime-guardian.service"])
        return "registered"
    except Exception as e:
        return "error:%s" % e


def respond(rid, obj):
    path = os.path.join(QUEUE_DIR, "resp-%s.json" % rid)
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)
        os.replace(tmp, path)
        os.chmod(path, 0o640)                       # no world-readable (review HIGH)
        if WWW_UID != -1:
            try: os.chown(path, WWW_UID, WWW_GID)   # solo www-data (php-fpm) lo lee
            except Exception: pass
    except Exception as e:
        sys.stderr.write("respond fail: %s\n" % e)


def process(req):
    rid = req.get("id", "")
    pub = str(req.get("pubkey", ""))
    device_id = re.sub(r"[^0-9A-Za-z._-]", "", str(req.get("device_id", "dev")))[:40] or "dev"
    model = str(req.get("model", ""))[:64]
    if not PUBKEY_RE.match(pub):
        respond(rid, {"ok": False, "error": "BAD_PUBKEY"})
        log_audit({"ev": "reject", "reason": "bad_pubkey", "id": rid})
        return

    reg = load_registry()

    # Idempotencia por pubkey
    if pub in reg:
        ip = reg[pub]["ip"]
        wg_set_peer(pub, ip)  # re-aplica en vivo por si el wg se reinicio
        respond(rid, {"ok": True, "assigned_ip": ip, "server_pubkey": server_pubkey(),
                      "endpoint": WG_ENDPOINT, "dns": WG_DNS, "allowed_ips": "0.0.0.0/0",
                      "reused": True})
        log_audit({"ev": "reuse", "id": rid, "ip": ip, "device_id": device_id})
        return

    ip = alloc_ip(reg)
    if ip is None:
        respond(rid, {"ok": False, "error": "NO_FREE_IP_OR_CAP"})
        log_audit({"ev": "reject", "reason": "no_ip", "id": rid})
        return

    ok, err = wg_set_peer(pub, ip)
    if not ok:
        respond(rid, {"ok": False, "error": "WG_SET_FAIL"})
        log_audit({"ev": "error", "stage": "wg_set", "id": rid, "err": err})
        return

    pok, pmsg = persist_wg_conf(pub, ip, device_id, model)
    reg[pub] = {"ip": ip, "device_id": device_id, "model": model,
                "remote": req.get("remote", ""), "ts": int(time.time())}
    save_registry(reg)
    gstate = register_guardian(ip, device_id)

    respond(rid, {"ok": True, "assigned_ip": ip, "server_pubkey": server_pubkey(),
                  "endpoint": WG_ENDPOINT, "dns": WG_DNS, "allowed_ips": "0.0.0.0/0",
                  "reused": False})
    log_audit({"ev": "enroll", "id": rid, "ip": ip, "device_id": device_id,
               "model": model, "persist": pmsg, "guardian": gstate,
               "remote": req.get("remote", "")})


def main():
    os.makedirs(QUEUE_DIR, exist_ok=True)
    try:
        os.chmod(QUEUE_DIR, 0o770)              # no 0o777 (review HIGH)
        if WWW_UID != -1:
            os.chown(QUEUE_DIR, WWW_UID, WWW_GID)  # www-data crea req + borra resp; root tambien escribe
    except Exception:
        pass
    log_audit({"ev": "worker_start", "endpoint": WG_ENDPOINT})
    running = {"v": True}
    signal.signal(signal.SIGTERM, lambda *a: running.update(v=False))
    while running["v"]:
        try:
            for name in sorted(os.listdir(QUEUE_DIR)):
                if not (name.startswith("req-") and name.endswith(".json")):
                    continue
                path = os.path.join(QUEUE_DIR, name)
                # Owner check: la req la creo www-data (php-fpm) o root — no otro usuario local (review HIGH)
                try:
                    st = os.stat(path)
                    if WWW_UID != -1 and st.st_uid not in (WWW_UID, 0):
                        os.unlink(path)
                        log_audit({"ev": "reject", "reason": "bad_owner", "uid": st.st_uid})
                        continue
                except Exception:
                    pass
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        req = json.load(f)
                except Exception:
                    req = None
                try:
                    os.unlink(path)
                except Exception:
                    pass
                if isinstance(req, dict):
                    try:
                        process(req)
                    except Exception as e:
                        respond(req.get("id", ""), {"ok": False, "error": "WORKER_EXC"})
                        log_audit({"ev": "exc", "err": str(e)})
        except Exception as e:
            sys.stderr.write("loop err: %s\n" % e)
        time.sleep(POLL_SEC)


if __name__ == "__main__":
    main()
