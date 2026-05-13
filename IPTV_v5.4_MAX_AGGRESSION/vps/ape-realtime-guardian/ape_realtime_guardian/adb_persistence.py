#!/usr/bin/env python3
"""
ADB Persistence Daemon — Mantiene conexiones ADB eternamente.

Corre como systemd service. Cada N segundos verifica que todos los dispositivos
estén conectados y autorizados. Si alguno se cae, reconecta automáticamente.

Diseñado para:
  - Fire Stick Cali (10.200.0.3:5555) vía WireGuard
  - ONN 4K Buga (10.200.0.4:5555) vía WireGuard

El Guardian (ape-realtime-guardian) depende de este servicio para leer
ExoPlayer stats via ADB logcat.
"""

import subprocess
import time
import json
import logging
import signal
import sys
import os
from datetime import datetime, timezone

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════════════════
DEVICES = [
    {
        "name": "firestick_cali",
        "address": "10.200.0.3:5555",
        "location": "Cali",
    },
    {
        "name": "onn4k_buga",
        "address": "10.200.0.4:5555",
        "location": "Buga",
    },
]

CHECK_INTERVAL_S = 15        # Verificar cada 15 segundos
CONNECT_TIMEOUT_S = 10       # Timeout para adb connect
ADB_BIN = "/usr/bin/adb"     # Ruta al binario ADB
STATE_FILE = "/dev/shm/adb_persistence_state.json"
LOG_FILE = "/var/log/ape-realtime-guardian/adb_persistence.log"

# ═══════════════════════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════════════════════
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE, mode="a", encoding="utf-8"),
    ],
)
log = logging.getLogger("adb-persist")

# ═══════════════════════════════════════════════════════════════════════════════
# GLOBAL STATE
# ═══════════════════════════════════════════════════════════════════════════════
running = True
device_state = {}  # name -> {status, last_seen, reconnects, consecutive_fails}


def handle_signal(signum, frame):
    global running
    log.info(f"Signal {signum} received, shutting down...")
    running = False


signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


# ═══════════════════════════════════════════════════════════════════════════════
# ADB HELPERS
# ═══════════════════════════════════════════════════════════════════════════════
def run_adb(args, timeout=CONNECT_TIMEOUT_S):
    """Ejecuta un comando ADB y retorna (returncode, stdout, stderr)."""
    try:
        result = subprocess.run(
            [ADB_BIN] + args,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return -1, "", "timeout"
    except FileNotFoundError:
        return -2, "", "adb binary not found"
    except Exception as e:
        return -3, "", str(e)


def get_connected_devices():
    """Retorna dict de {address: status} de dispositivos conectados."""
    rc, out, _ = run_adb(["devices"], timeout=5)
    if rc != 0:
        return {}

    devices = {}
    for line in out.splitlines()[1:]:  # Skip header
        parts = line.strip().split("\t")
        if len(parts) == 2:
            devices[parts[0]] = parts[1]  # e.g., "device", "unauthorized", "offline"
    return devices


def connect_device(address):
    """Intenta conectar a un dispositivo. Retorna status string."""
    rc, out, err = run_adb(["connect", address])
    combined = f"{out} {err}".lower()

    if "connected" in combined and "unable" not in combined:
        return "connected"
    elif "already connected" in combined:
        return "already_connected"
    elif "refused" in combined:
        return "refused"
    elif "timeout" in combined or rc == -1:
        return "timeout"
    elif "unable" in combined:
        return "unreachable"
    else:
        return f"unknown:{out[:50]}"


def disconnect_device(address):
    """Desconecta un dispositivo específico."""
    run_adb(["disconnect", address], timeout=5)


def verify_device_alive(address):
    """Verifica que el dispositivo responde a comandos ADB reales."""
    rc, out, err = run_adb(["-s", address, "shell", "echo", "ALIVE"], timeout=5)
    return rc == 0 and "ALIVE" in out


def start_adb_server():
    """Asegura que el servidor ADB esté corriendo."""
    rc, out, err = run_adb(["start-server"], timeout=10)
    if rc == 0:
        log.info("ADB server started/verified")
    else:
        log.error(f"Failed to start ADB server: {err}")


# ═══════════════════════════════════════════════════════════════════════════════
# PERSISTENCE LOGIC
# ═══════════════════════════════════════════════════════════════════════════════
def ensure_device_connected(device):
    """Garantiza que un dispositivo esté conectado y autorizado.
    
    Returns: "device" | "unauthorized" | "offline" | "unreachable" | "error"
    """
    name = device["name"]
    addr = device["address"]
    state = device_state.setdefault(name, {
        "status": "unknown",
        "last_seen": None,
        "reconnects": 0,
        "consecutive_fails": 0,
        "last_error": None,
    })

    # 1. Check if already in devices list
    connected = get_connected_devices()

    if addr in connected:
        dev_status = connected[addr]

        if dev_status == "device":
            # Verify it actually responds
            if verify_device_alive(addr):
                state["status"] = "device"
                state["last_seen"] = datetime.now(timezone.utc).isoformat()
                state["consecutive_fails"] = 0
                state["last_error"] = None
                return "device"
            else:
                # Listed but not responding — disconnect and reconnect
                log.warning(f"[{name}] Listed as 'device' but not responding, reconnecting...")
                disconnect_device(addr)

        elif dev_status == "unauthorized":
            log.warning(f"[{name}] UNAUTHORIZED — needs manual approval on device screen")
            state["status"] = "unauthorized"
            state["last_error"] = "unauthorized"
            # Try disconnect + reconnect to trigger auth dialog again
            disconnect_device(addr)
            time.sleep(1)

        elif dev_status == "offline":
            log.warning(f"[{name}] OFFLINE — disconnecting and retrying...")
            disconnect_device(addr)
            time.sleep(1)

    # 2. Not connected or needs reconnection — attempt connect
    result = connect_device(addr)
    log.info(f"[{name}] adb connect → {result}")

    if result in ("connected", "already_connected"):
        # Wait a beat then verify
        time.sleep(1)
        connected = get_connected_devices()
        dev_status = connected.get(addr, "unknown")

        if dev_status == "device":
            if verify_device_alive(addr):
                state["status"] = "device"
                state["last_seen"] = datetime.now(timezone.utc).isoformat()
                state["consecutive_fails"] = 0
                state["reconnects"] += 1
                state["last_error"] = None
                log.info(f"[{name}] ✅ Connected and verified (total reconnects: {state['reconnects']})")
                return "device"
            else:
                state["status"] = "unresponsive"
                state["consecutive_fails"] += 1
                state["last_error"] = "connected but unresponsive"
                return "error"

        elif dev_status == "unauthorized":
            state["status"] = "unauthorized"
            state["consecutive_fails"] += 1
            state["last_error"] = "unauthorized"
            log.warning(f"[{name}] ⚠️ Connected but UNAUTHORIZED")
            return "unauthorized"

        else:
            state["status"] = dev_status
            state["consecutive_fails"] += 1
            state["last_error"] = f"unexpected status: {dev_status}"
            return dev_status

    else:
        # Connection failed
        state["status"] = result
        state["consecutive_fails"] += 1
        state["last_error"] = result

        # Adaptive backoff logging — don't spam logs for unreachable devices
        if state["consecutive_fails"] <= 3 or state["consecutive_fails"] % 20 == 0:
            log.warning(f"[{name}] ❌ {result} (fails: {state['consecutive_fails']})")

        return result


def write_state():
    """Escribe estado a SHM para que el Guardian y otros lo lean."""
    try:
        state = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "devices": {},
        }
        for device in DEVICES:
            name = device["name"]
            ds = device_state.get(name, {})
            state["devices"][name] = {
                "address": device["address"],
                "location": device["location"],
                "status": ds.get("status", "unknown"),
                "last_seen": ds.get("last_seen"),
                "reconnects": ds.get("reconnects", 0),
                "consecutive_fails": ds.get("consecutive_fails", 0),
                "last_error": ds.get("last_error"),
            }

        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp, STATE_FILE)
    except Exception as e:
        log.error(f"Failed to write state: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN LOOP
# ═══════════════════════════════════════════════════════════════════════════════
def main():
    log.info("=" * 60)
    log.info("ADB Persistence Daemon starting...")
    log.info(f"Devices: {[d['name'] + ' @ ' + d['address'] for d in DEVICES]}")
    log.info(f"Check interval: {CHECK_INTERVAL_S}s")
    log.info("=" * 60)

    # Ensure ADB server is running
    start_adb_server()

    cycle = 0
    while running:
        cycle += 1

        for device in DEVICES:
            if not running:
                break
            status = ensure_device_connected(device)

            # Log summary periodically (every 40 cycles = ~10 min)
            if cycle % 40 == 0:
                ds = device_state.get(device["name"], {})
                log.info(
                    f"[{device['name']}] Status: {ds.get('status')} | "
                    f"Last seen: {ds.get('last_seen', 'never')} | "
                    f"Reconnects: {ds.get('reconnects', 0)} | "
                    f"Fails: {ds.get('consecutive_fails', 0)}"
                )

        write_state()

        # Sleep in small increments for responsive shutdown
        for _ in range(CHECK_INTERVAL_S * 2):
            if not running:
                break
            time.sleep(0.5)

    log.info(f"ADB Persistence Daemon stopped after {cycle} cycles.")


if __name__ == "__main__":
    main()
