#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ingestor APE polimorfico, isomorfo, idempotente y anamorfico.

Fuentes:
  --xtream-url + --username/--password (o APE_XTREAM_*)
  --m3u <archivo|URL>
  --direct <archivo|URL>

Todas producen un CanonicalChannel y pasan por el mismo render
(ape_upscale_v3.py), el mismo recibo y el mismo catalogo.

Idempotencia:
  job_key = sha256(kind|proveedor|id|url_hash|tiers|duration|aspect|preset)
  lock exclusivo por job; si el recibo PASS existe y no --refresh, SKIP.
  render a .tmp y rename atomico; no duplica canales.

Anamorfico:
  --aspect preserve (default): conserva DAR/SAR con pad y setsar=1.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RENDERER = ROOT / "tools" / "ape_upscale_v3.py"
UA = "OTT Navigator/1.6.5.0 (Linux; Android 10)"


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


@dataclass(frozen=True)
class CanonicalChannel:
    kind: str
    provider: str
    channel_id: str
    name: str
    group: str
    url: str      # internal, never written to receipts/logs
    logo: str = ""


def _get_json(url: str) -> dict | list:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _read_text(url_or_path: str) -> str:
    if re.match(r"^https?://", url_or_path):
        req = urllib.request.Request(url_or_path, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.read().decode("utf-8", "replace")
    return Path(url_or_path).read_text(encoding="utf-8", errors="replace")


class XtreamSource:
    def __init__(self, base: str, username: str, password: str):
        self.base = base.rstrip("/")
        if self.base.endswith("/player_api.php"):
            self.base = self.base[: -len("/player_api.php")]
        self.username = username
        self.password = password
        self.provider = urllib.parse.urlsplit(self.base).hostname or self.base

    def _api(self, action: str) -> dict | list:
        q = urllib.parse.urlencode({"username": self.username, "password": self.password,
                                    "action": action})
        return _get_json(self.base + "/player_api.php?" + q)

    def channels(self, limit: int | None = None, group: str | None = None,
                 channel_id: str | None = None, name: str | None = None) -> list[CanonicalChannel]:
        data = self._api("get_live_streams")
        if not isinstance(data, list):
            raise RuntimeError("Xtream get_live_streams no devolvio lista")
        out = []
        for s in data:
            if not isinstance(s, dict):
                continue
            sid = str(s.get("stream_id") or "")
            if not sid:
                continue
            if channel_id and sid != str(channel_id):
                continue
            nm = str(s.get("name") or sid)
            grp = str(s.get("category_id") or "")
            if group and group not in grp and group.lower() not in nm.lower():
                continue
            if name and name.lower() not in nm.lower():
                continue
            # URL Xtream: las credenciales solo viven aqui y en el snapshot,
            # nunca en receipts/logs.
            u = (f"{self.base}/live/{urllib.parse.quote(self.username, safe='')}/"
                 f"{urllib.parse.quote(self.password, safe='')}/{urllib.parse.quote(sid, safe='')}.m3u8")
            out.append(CanonicalChannel("xtream", self.provider, sid, nm, grp, u,
                                        str(s.get("stream_icon") or "")))
            if limit and len(out) >= limit:
                break
        return out


class M3USource:
    def __init__(self, location: str):
        self.location = location
        self.provider = (urllib.parse.urlsplit(location).hostname
                         if re.match(r"^https?://", location) else str(Path(location).parent))

    def channels(self, limit: int | None = None, group: str | None = None,
                 channel_id: str | None = None, name: str | None = None) -> list[CanonicalChannel]:
        text = _read_text(self.location)
        lines = text.splitlines()
        out = []
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            if line.startswith("#EXTINF:"):
                attrs = {"id": "", "name": "", "group": "", "logo": ""}
                m = re.search(r'tvg-id="([^"]*)"', line)
                if m:
                    attrs["id"] = m.group(1)
                m = re.search(r'tvg-name="([^"]*)"', line)
                if m:
                    attrs["name"] = m.group(1)
                m = re.search(r'group-title="([^"]*)"', line)
                if m:
                    attrs["group"] = m.group(1)
                m = re.search(r'tvg-logo="([^"]*)"', line)
                if m:
                    attrs["logo"] = m.group(1)
                name_part = line.rsplit(",", 1)[-1].strip()
                j = i + 1
                while j < len(lines) and (not lines[j].strip() or lines[j].strip().startswith("#")):
                    j += 1
                if j < len(lines):
                    url = lines[j].strip()
                    cid = attrs["id"] or sha256_text(url)[:16]
                    nm = attrs["name"] or name_part or cid
                    grp = attrs["group"]
                    if (not channel_id or cid == channel_id) and \
                       (not group or group.lower() in grp.lower()) and \
                       (not name or name.lower() in nm.lower()):
                        out.append(CanonicalChannel("m3u", self.provider, cid, nm, grp, url,
                                                    attrs["logo"]))
                        if limit and len(out) >= limit:
                            break
                    i = j
            i += 1
        return out


class DirectSource:
    def __init__(self, location: str, name: str = "direct"):
        self.location = location
        self.name = name
        self.provider = (urllib.parse.urlsplit(location).hostname
                         if re.match(r"^https?://", location) else "local")

    def channels(self, limit: int | None = None, **_: object) -> list[CanonicalChannel]:
        cid = sha256_text(self.location)[:16]
        return [CanonicalChannel("direct", self.provider, cid, self.name, "direct", self.location)]


def snapshot(ch: CanonicalChannel, dest: Path, duration: float, redact: str) -> Path:
    local = ch.url
    if re.match(r"^https?://", local):
        cmd = ["ffmpeg", "-hide_banner", "-y", "-t", str(duration), "-i", local,
               "-map", "0:v:0", "-map", "0:a?", "-c", "copy", "-f", "mpegts", str(dest)]
        p = subprocess.run(cmd, text=True, capture_output=True, timeout=180)
        if p.returncode != 0:
            err = p.stderr.replace(local, "<source>").replace(redact, "<redacted>")
            raise RuntimeError(f"snapshot fallo: {err[-1200:]}")
    else:
        src = Path(local)
        if not src.is_file():
            raise RuntimeError("fuente local no existe")
        cmd = ["ffmpeg", "-hide_banner", "-y"]
        if duration and duration > 0:
            cmd += ["-t", str(duration)]
        cmd += ["-i", str(src), "-c", "copy", "-f", "mpegts", str(dest)]
        p = subprocess.run(cmd, text=True, capture_output=True, timeout=180)
        if p.returncode != 0:
            raise RuntimeError(f"snapshot local fallo: {p.stderr[-1000:]}")
    if not dest.is_file() or dest.stat().st_size == 0:
        raise RuntimeError("snapshot vacio")
    return dest


def job_key(ch: CanonicalChannel, tiers: str, duration: float, aspect: str, preset: str) -> str:
    identity = sha256_text(f"{ch.kind}|{ch.provider}|{ch.channel_id}|{ch.url}")
    payload = {"identity": identity, "tiers": tiers, "duration": duration,
               "aspect": aspect, "preset": preset, "renderer": "ape_upscale_v3"}
    return sha256_text(json.dumps(payload, sort_keys=True))[:32]


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def render(ch: CanonicalChannel, snap: Path, target: Path, tiers: str, aspect: str,
           preset: str, refresh: bool) -> dict:
    final_receipt = target / "receipt.json"
    if final_receipt.is_file() and not refresh:
        r = json.loads(final_receipt.read_text(encoding="utf-8"))
        if r.get("result") == "PASS":
            return {"status": "skipped", "receipt": r}
    if target.exists():
        if not refresh:
            raise RuntimeError("target existe sin receipt PASS")
        shutil.rmtree(target)
    cmd = [sys.executable, str(RENDERER), "--source", str(snap), "--out", str(target),
           "--name", ch.name, "--tiers", tiers, "--cmaf", "patch",
           "--aspect", aspect, "--preset", preset, "--force"]
    p = subprocess.run(cmd, text=True, capture_output=True, timeout=3600)
    if p.returncode != 0:
        raise RuntimeError(f"render fallo: {p.stderr[-2000:]}")
    child = json.loads((target / "receipt.json").read_text(encoding="utf-8"))
    if child.get("result") != "PASS" or not child.get("cmaf_conformant"):
        raise RuntimeError("render sin CMAF PASS")
    # La salida debe ser SAR 1:1 y DAR conservado por el renderer.
    for t in child.get("output", {}).get("tiers", []):
        sar = t.get("probe", {}).get("video", {}).get("sample_aspect_ratio")
        if sar not in ("1:1", "1/1", None):
            raise RuntimeError(f"SAR de salida no es 1:1: {sar}")
    wrapper = {
        "schema": "ape.ingest.receipt.v1", "result": "PASS",
        "canonical": {"kind": ch.kind, "provider": ch.provider, "channel_id": ch.channel_id,
                      "name": ch.name, "group": ch.group, "url_sha256": sha256_text(ch.url)},
        "job": {"key": target.name, "tiers": tiers, "aspect": aspect, "preset": preset},
        "source_snapshot": {"sha256": sha256_file(snap), "bytes": snap.stat().st_size},
        "render": child,
        "created_at": int(time.time()),
    }
    atomic_write(target / "receipt.json", json.dumps(wrapper, ensure_ascii=False, indent=2) + "\n")
    return {"status": "done", "receipt": wrapper}


def rebuild_catalog(root: Path) -> Path | None:
    entries = []
    for receipt in sorted(root.glob("*/receipt.json")):
        try:
            r = json.loads(receipt.read_text(encoding="utf-8"))
            if r.get("result") != "PASS":
                continue
            c = r["canonical"]
            entries.append((c["channel_id"], c["name"], c.get("group", ""), receipt.parent.name))
        except Exception:
            continue
    if not entries:
        return None
    entries.sort(key=lambda x: (x[0], x[1]))
    lines = ["#EXTM3U", "#EXT-X-APE-INGEST:SCHEMA=ape.ingest.v1;IDEMPOTENT=1;"
             "POLYMORPHIC=1;ISOMORPHIC=1;ANAMORPHIC=preserve"]
    for cid, name, group, job in entries:
        lines += [f'#EXTINF:-1 tvg-id="{cid}" tvg-name="{name}" group-title="{group}",{name}',
                  f"{job}/master.m3u8"]
    cat = root / "catalog.m3u8"
    text = "\n".join(lines) + "\n"
    if not cat.is_file() or cat.read_text(encoding="utf-8") != text:
        atomic_write(cat, text)
    return cat


def main() -> int:
    ap = argparse.ArgumentParser(description="Ingestor Xtream/M3U/direct -> 4K/6K CMAF")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--xtream-url")
    src.add_argument("--m3u")
    src.add_argument("--direct")
    ap.add_argument("--username", default=os.environ.get("APE_XTREAM_USER", ""))
    ap.add_argument("--password", default=os.environ.get("APE_XTREAM_PASS", ""))
    ap.add_argument("--out-root", default=".tmp/ape-ingest")
    ap.add_argument("--limit", type=int, default=1)
    ap.add_argument("--channel-id", default="")
    ap.add_argument("--channel-name", default="")
    ap.add_argument("--group", default="")
    ap.add_argument("--tiers", default="4k,6k")
    ap.add_argument("--duration", type=float, default=2.0)
    ap.add_argument("--aspect", default="preserve", choices=["preserve", "stretch"])
    ap.add_argument("--preset", default="veryfast")
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()

    if a.xtream_url:
        if not a.username or not a.password:
            print("FAIL: Xtream requiere --username/--password o APE_XTREAM_USER/PASS", file=sys.stderr)
            return 1
        source = XtreamSource(a.xtream_url, a.username, a.password)
    elif a.m3u:
        source = M3USource(a.m3u)
    else:
        source = DirectSource(a.direct, name=a.channel_name or "direct")

    try:
        channels = source.channels(limit=a.limit, group=a.group or None,
                                   channel_id=a.channel_id or None,
                                   name=a.channel_name or None)
        if not channels:
            print("FAIL: no hay canales que cumplan el filtro", file=sys.stderr)
            return 1
    except Exception as e:
        print(f"FAIL: fuente: {e}", file=sys.stderr)
        return 1

    root = Path(a.out_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    locks = root / ".locks"
    locks.mkdir(exist_ok=True)
    results = []
    for ch in channels:
        key = job_key(ch, a.tiers, a.duration, a.aspect, a.preset)
        target = root / key
        lock = locks / (key + ".lock")
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
        except FileExistsError:
            # lock huerfano > 6 h se retira; si no, se respeta.
            if time.time() - lock.stat().st_mtime > 6 * 3600:
                lock.unlink(missing_ok=True)
            else:
                results.append({"channel": ch.name, "status": "locked"})
                continue
        try:
            tmp = root / (".tmp-" + key + "-" + str(os.getpid()))
            if tmp.exists():
                shutil.rmtree(tmp)
            snap = tmp / "source.ts"
            tmp.mkdir(parents=True)
            snapshot(ch, snap, a.duration, a.password)
            res = render(ch, snap, target, a.tiers, a.aspect, a.preset, a.refresh)
            results.append({"channel": ch.name, "channel_id": ch.channel_id,
                            "status": res["status"], "job": target.name})
        except Exception as e:
            results.append({"channel": ch.name, "channel_id": ch.channel_id,
                            "status": "error", "error": str(e)})
        finally:
            lock.unlink(missing_ok=True)
            tmp = root / (".tmp-" + key + "-" + str(os.getpid()))
            if tmp.exists():
                shutil.rmtree(tmp, ignore_errors=True)
    cat = rebuild_catalog(root)
    print(json.dumps({"result": "PASS" if all(r["status"] in ("done", "skipped") for r in results)
                      else "PARTIAL", "catalog": str(cat) if cat else None,
                      "channels": results}, ensure_ascii=False))
    return 0 if cat else 1


if __name__ == "__main__":
    raise SystemExit(main())
