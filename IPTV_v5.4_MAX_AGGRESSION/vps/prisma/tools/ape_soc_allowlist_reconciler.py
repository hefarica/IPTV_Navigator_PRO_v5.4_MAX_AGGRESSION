#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reconciliador de allowlist SoC del plano APE/Prisma (esquema v2).

ALLOWLIST SIEMPRE COMPLETA
--------------------------
Lee las observaciones crudas que el agente deja en ``/var/lib/ape/soc_seen.jsonl``
(una línea JSON ``{"soc": "...", "device_id": "...", "ts": "..."}``) y reconcilia
``/etc/ape-uhdx/ape_soc_allowlist.json`` de forma que:

* **Ningún SoC observado queda fuera**: todo SoC visto entra en el archivo, como
  mínimo en cuarentena (``sr=0``, ``vpp=unknown``).
* **``sr=1`` solo con evidencia**: familia con AI-SR conocida *y* al menos
  ``SR_MIN_DEVICES`` dispositivos distintos. Dos boxes no son evidencia.
* **Nada se borra**: las entradas existentes se conservan; el conjunto de
  ``devices`` es una unión monótona, así que una promoción no se pierde por una
  pasada con menos tráfico.
* **PQ conocido sin AI-SR** (``s905x4``, ``s905y4``, ``s928x``) ⇒
  ``state=confirmed``, ``sr=0``, ``vpp=tradicional`` (mejora por VPP clásico, sin
  super-resolución inventada).
* **Desconocido** ⇒ ``sr=0``, ``vpp=unknown`` y una línea en
  ``soc_needs_curation.txt`` para que un humano lo clasifique.

Escritura atómica (temp + fsync + ``os.replace`` + fsync del directorio), con
validación del JSON **antes** de pisar el archivo vivo, ``.bak`` obligatorio y
lock de proceso (``fcntl``; en hosts sin ``fcntl`` degrada a ``msvcrt`` o a
sin-lock, declarándolo).

Es stdlib puro y no toca nada fuera de las rutas que se le pasan.

Exit codes
----------
0   OK (archivo reconciliado, o ``--dry-run`` sin escribir)
10  el JSON existente está corrupto ⇒ NO se pisa (se deja ``.bak`` y se aborta)
11  no se pudo tomar el lock (otra instancia en curso)
12  el seed es inválido (JSON o esquema) ⇒ NO se pisa
"""

from __future__ import annotations

import argparse
import datetime as _dt
import errno
import json
import os
import shutil
import sys
import tempfile

SCHEMA_VERSION = 2

# ── Conocimiento de familias (NO es evidencia: es capacidad declarada) ────────
# Familias con AI-SR utilizable. sr=1 exige además ≥SR_MIN_DEVICES dispositivos.
SR_FAMILIES = {
    "s905x5": {"sr_levels": ["4k", "8k"], "note": "AI-SR hasta 8K declarado"},
    "s905x5m": {"sr_levels": ["4k"], "note": "AI-SR 4K declarado"},
}
# Familias sin AI-SR pero con PQ tradicional conocido (VPP clásico).
PQ_FAMILIES = {
    "s905x4": "PQ tradicional; sin AI-SR (ONN 4K / Fire TV clase S905X4)",
    "s905y4": "PQ tradicional; sin AI-SR (ONN 4K clase S905Y4)",
    "s928x": "PQ tradicional; sin AI-SR (clase S928X)",
}
SR_MIN_DEVICES = 3

EXIT_OK = 0
EXIT_CORRUPT = 10
EXIT_LOCKED = 11
EXIT_BAD_SEED = 12

DEFAULT_SEEN = "/var/lib/ape/soc_seen.jsonl"
DEFAULT_OUT = "/etc/ape-uhdx/ape_soc_allowlist.json"
DEFAULT_CURATION = "/etc/ape-uhdx/soc_needs_curation.txt"
DEFAULT_LOCK = "/etc/ape-uhdx/.ape_soc_allowlist.lock"


# ────────────────────────────── utilidades ───────────────────────────────────
def _now_iso(forced: str | None = None) -> str:
    if forced:
        return forced
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _norm_soc(value: object) -> str:
    """Normaliza un identificador de SoC (minúsculas, sin espacios)."""
    return str(value or "").strip().lower()


def _empty_entry() -> dict:
    return {
        "sr": 0,
        "sr_levels": [],
        "pq": "unknown",
        "vpp": "unknown",
        "state": "quarantine",
        "evidence": [],
        "devices": [],
        "first_seen": None,
        "note": "",
    }


# ─────────────────────────────── lock ────────────────────────────────────────
class _Lock:
    """Lock exclusivo entre procesos. Portable: fcntl → msvcrt → sin lock."""

    def __init__(self, path: str):
        self.path = path
        self.backend = "none"
        self._fh = None

    def __enter__(self) -> "_Lock":
        try:  # pragma: no cover - depende del SO
            import fcntl  # type: ignore
            self.backend = "fcntl"
        except ImportError:  # pragma: no cover
            try:
                import msvcrt  # type: ignore
                self.backend = "msvcrt"
            except ImportError:
                self.backend = "none"
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        self._fh = open(self.path, "a+b")
        try:
            if self.backend == "fcntl":
                import fcntl  # type: ignore
                fcntl.flock(self._fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            elif self.backend == "msvcrt":  # pragma: no cover
                import msvcrt  # type: ignore
                self._fh.seek(0)
                msvcrt.locking(self._fh.fileno(), msvcrt.LK_NBLCK, 1)
        except (OSError, IOError) as exc:  # lock ocupado
            self._fh.close()
            self._fh = None
            if getattr(exc, "errno", None) in (errno.EACCES, errno.EAGAIN, errno.EDEADLK, 13, 36):
                raise SystemExit(EXIT_LOCKED) from exc
            raise
        return self

    def __exit__(self, *exc_info) -> None:
        if self._fh is None:
            return
        try:
            if self.backend == "fcntl":
                import fcntl  # type: ignore
                fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
            elif self.backend == "msvcrt":  # pragma: no cover
                import msvcrt  # type: ignore
                self._fh.seek(0)
                msvcrt.locking(self._fh.fileno(), msvcrt.LK_UNLCK, 1)
        finally:
            self._fh.close()
            self._fh = None


# ─────────────────────────────── entrada ─────────────────────────────────────
def read_seen(path: str) -> tuple[dict, dict]:
    """Lee el jsonl de observaciones. Devuelve ({soc: {"devices": set, "first": ts}}, stats)."""
    observed: dict[str, dict] = {}
    stats = {"lines": 0, "bad_lines": 0, "seen_missing": False}
    if not os.path.exists(path):
        stats["seen_missing"] = True
        return observed, stats
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            stats["lines"] += 1
            try:
                rec = json.loads(line)
            except ValueError:
                stats["bad_lines"] += 1
                continue
            if not isinstance(rec, dict):
                stats["bad_lines"] += 1
                continue
            soc = _norm_soc(rec.get("soc"))
            if not soc:
                stats["bad_lines"] += 1
                continue
            dev = str(rec.get("device_id") or rec.get("device") or "").strip()
            ts = str(rec.get("ts") or "").strip() or None
            slot = observed.setdefault(soc, {"devices": set(), "first": None})
            if dev:
                slot["devices"].add(dev)
            if ts and (slot["first"] is None or ts < slot["first"]):
                slot["first"] = ts
    return observed, stats


def load_json_doc(path: str, what: str) -> tuple[dict | None, str | None]:
    """Carga un JSON. Devuelve (doc, error). Un archivo ausente NO es error."""
    if not os.path.exists(path):
        return None, None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            doc = json.load(fh)
    except (ValueError, OSError) as exc:
        return None, f"{what} inválido en {path}: {exc}"
    if not isinstance(doc, dict):
        return None, f"{what} inválido en {path}: la raíz no es un objeto JSON"
    return doc, None


# ─────────────────────────── reconciliación ──────────────────────────────────
def _merge_entry(prev: dict | None, soc: str, devs: set, first_ts: str | None,
                 now: str) -> dict:
    """Fusiona una entrada existente con lo observado y aplica las reglas."""
    entry = _empty_entry()
    if isinstance(prev, dict):
        for key in entry:
            if key in prev:
                entry[key] = prev[key]
    # devices = unión monótona (nada se pierde)
    old_devs = entry.get("devices") if isinstance(entry.get("devices"), list) else []
    devices = sorted({str(d) for d in old_devs if str(d).strip()} | {str(d) for d in devs})
    entry["devices"] = devices
    n = len(devices)
    # first_seen = mínimo (nunca se mueve hacia adelante)
    candidates = [t for t in (entry.get("first_seen"), first_ts) if t]
    entry["first_seen"] = min(candidates) if candidates else now

    evidence: list[str] = []
    if soc in SR_FAMILIES:
        evidence.append(f"family={soc};aisr=yes")
        if n >= SR_MIN_DEVICES:
            entry.update({
                "sr": 1, "state": "confirmed", "vpp": "aisr", "pq": "known",
                "sr_levels": list(SR_FAMILIES[soc]["sr_levels"]),
                "evidence": evidence + [f"devices={n}>={SR_MIN_DEVICES}", "rule=promote_sr"],
                "note": SR_FAMILIES[soc]["note"],
            })
        else:
            entry.update({
                "sr": 0, "state": "quarantine", "vpp": "unknown", "pq": "known",
                "sr_levels": [],
                "evidence": evidence + [f"devices={n}<{SR_MIN_DEVICES}", "rule=need_more_devices"],
                "note": f"{SR_FAMILIES[soc]['note']}; sr=1 requiere >={SR_MIN_DEVICES} dispositivos",
            })
    elif soc in PQ_FAMILIES:
        entry.update({
            "sr": 0, "state": "confirmed", "vpp": "tradicional", "pq": "known",
            "sr_levels": [],
            "evidence": evidence + [f"family={soc};aisr=no", "rule=pq_only_traditional"],
            "note": PQ_FAMILIES[soc],
        })
    else:
        entry.update({
            "sr": 0, "state": "quarantine", "vpp": "unknown", "pq": "unknown",
            "sr_levels": [],
            "evidence": evidence + [f"family={soc};aisr=unknown", "rule=unknown_quarantine"],
            "note": "SoC desconocido: en cuarentena hasta curación manual",
        })
    return entry


def reconcile(existing: dict | None, seed: dict | None, observed: dict,
              now: str) -> dict:
    """Construye el documento nuevo conservando TODO lo previo."""
    socs: dict[str, dict] = {}
    for src in (seed, existing):
        if not isinstance(src, dict):
            continue
        src_socs = src.get("socs")
        if not isinstance(src_socs, dict):
            continue
        for soc, entry in src_socs.items():
            key = _norm_soc(soc)
            if not key:
                continue
            base = dict(entry) if isinstance(entry, dict) else {}
            merged = socs.get(key, {})
            merged.update(base)
            socs[key] = merged

    for soc in sorted(observed):
        slot = observed[soc]
        socs[soc] = _merge_entry(socs.get(soc), soc, slot["devices"], slot["first"], now)

    # Toda entrada conservada vuelve a pasar por las reglas para que el archivo
    # sea autoconsistente aunque el seed/existente traiga valores viejos.
    for soc in sorted(socs):
        if soc in observed:
            continue
        prev = socs[soc]
        devs = set(prev.get("devices") or [])
        first = prev.get("first_seen")
        socs[soc] = _merge_entry(prev, soc, devs, first, now)

    curation = sorted(s for s, e in socs.items()
                      if str(e.get("vpp")) == "unknown" and int(e.get("sr") or 0) == 0)

    return {
        "version": SCHEMA_VERSION,
        "updated": now,
        "generator": "ape_soc_allowlist_reconciler.py",
        "sr_families": sorted(SR_FAMILIES),
        "pq_families": sorted(PQ_FAMILIES),
        "sr_min_devices": SR_MIN_DEVICES,
        "socs": dict(sorted(socs.items())),
        "needs_curation": curation,
    }


# ─────────────────────────── escritura atómica ───────────────────────────────
def _validate_doc(doc: dict) -> None:
    """Valida el documento ANTES de pisar el archivo vivo."""
    text = json.dumps(doc, ensure_ascii=False, sort_keys=True)
    reparsed = json.loads(text)  # round-trip: si esto falla, no escribimos
    if reparsed.get("version") != SCHEMA_VERSION:
        raise ValueError("version distinta de %d" % SCHEMA_VERSION)
    socs = reparsed.get("socs")
    if not isinstance(socs, dict):
        raise ValueError("socs no es un objeto")
    required = {"sr", "sr_levels", "pq", "vpp", "state", "evidence",
                "devices", "first_seen", "note"}
    for soc, entry in socs.items():
        missing = required - set(entry)
        if missing:
            raise ValueError(f"{soc}: faltan campos {sorted(missing)}")
        if entry["state"] not in ("confirmed", "quarantine"):
            raise ValueError(f"{soc}: state inválido {entry['state']!r}")
        if entry["vpp"] not in ("aisr", "tradicional", "unknown"):
            raise ValueError(f"{soc}: vpp inválido {entry['vpp']!r}")
        if int(entry["sr"]) not in (0, 1):
            raise ValueError(f"{soc}: sr inválido {entry['sr']!r}")
        if int(entry["sr"]) == 1 and entry["state"] != "confirmed":
            raise ValueError(f"{soc}: sr=1 exige state=confirmed")


def atomic_write_json(path: str, doc: dict, make_bak: bool = True) -> str:
    """Escribe ``doc`` de forma atómica. Devuelve la ruta del ``.bak`` (o '')."""
    _validate_doc(doc)
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    payload = json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n"

    fd, tmp = tempfile.mkstemp(prefix=".ape_soc_allowlist.", suffix=".tmp", dir=directory)
    bak = ""
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(payload)
            fh.flush()
            os.fsync(fh.fileno())
        # El temporal debe parsear antes de sustituir al vivo.
        with open(tmp, "r", encoding="utf-8") as fh:
            json.load(fh)
        if make_bak and os.path.exists(path):
            bak = path + ".bak"
            shutil.copy2(path, bak)
        os.replace(tmp, path)
        try:
            dir_fd = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except OSError:
            pass  # en algunos FS (p.ej. Windows) no se puede fsync el directorio
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return bak


def atomic_write_text(path: str, lines: list[str]) -> None:
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".soc_curation.", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            for line in lines:
                fh.write(line.rstrip("\n") + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def read_curation(path: str) -> list[str]:
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        return [ln.strip() for ln in fh if ln.strip()]


# ──────────────────────────────── main ───────────────────────────────────────
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Reconciliador de allowlist SoC (v2)")
    p.add_argument("--seen", default=os.environ.get("APE_SOC_SEEN", DEFAULT_SEEN))
    p.add_argument("--out", default=os.environ.get("APE_SOC_OUT", DEFAULT_OUT))
    p.add_argument("--curation", default=os.environ.get("APE_SOC_CURATION", DEFAULT_CURATION))
    p.add_argument("--lock", default=os.environ.get("APE_SOC_LOCK", DEFAULT_LOCK))
    p.add_argument("--seed", default=os.environ.get("APE_SOC_SEED", ""),
                   help="seed opcional (JSON con 'socs'); si falta, no se usa")
    p.add_argument("--now", default=None, help="timestamp fijo (para tests/idempotencia)")
    p.add_argument("--dry-run", action="store_true", help="calcula y valida, no escribe")
    p.add_argument("--quiet", action="store_true")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    now = _now_iso(args.now)
    say = (lambda *a: None) if args.quiet else (lambda *a: print(*a))

    with _Lock(args.lock):
        seed = None
        if args.seed:
            seed, err = load_json_doc(args.seed, "seed")
            if err:
                print(f"ERROR: {err}", file=sys.stderr)
                return EXIT_BAD_SEED
        existing, err = load_json_doc(args.out, "allowlist existente")
        if err:
            print(f"ERROR: {err}", file=sys.stderr)
            print("ERROR: NO se pisa el archivo vivo (se aborta).", file=sys.stderr)
            return EXIT_CORRUPT

        observed, stats = read_seen(args.seen)
        doc = reconcile(existing, seed, observed, now)

        if args.dry_run:
            say(f"DRY-RUN: socs={len(doc['socs'])} needs_curation={len(doc['needs_curation'])}")
            say(json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True))
            return EXIT_OK

        bak = atomic_write_json(args.out, doc)

        # Curación: append de las nuevas líneas, sin perder las previas.
        prev_lines = read_curation(args.curation)
        prev_set = set(prev_lines)
        new_lines = [f"{soc}\t{now}\tsr=0\tvpp=unknown\tdevices={len(doc['socs'][soc]['devices'])}"
                     for soc in doc["needs_curation"]
                     if not any(ln.split("\t", 1)[0] == soc for ln in prev_lines)]
        if new_lines:
            atomic_write_text(args.curation, prev_lines + new_lines)
        say(f"OK socs={len(doc['socs'])} promovidos_sr1="
            f"{sum(1 for e in doc['socs'].values() if int(e['sr']) == 1)} "
            f"cuarentena={sum(1 for e in doc['socs'].values() if e['state'] == 'quarantine')} "
            f"needs_curation={len(doc['needs_curation'])} "
            f"seen_lines={stats['lines']} bad_lines={stats['bad_lines']} "
            f"lock={_lock_backend(args.lock)} bak={bak or '(sin previo)'}")
        return EXIT_OK


def _lock_backend(path: str) -> str:
    try:
        import fcntl  # noqa: F401  # type: ignore
        return "fcntl"
    except ImportError:  # pragma: no cover
        try:
            import msvcrt  # noqa: F401  # type: ignore
            return "msvcrt"
        except ImportError:
            return "none"


if __name__ == "__main__":
    sys.exit(main())
