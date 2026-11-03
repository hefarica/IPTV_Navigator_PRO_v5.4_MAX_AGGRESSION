#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════════
# E11 · Muestreador del fallo intermitente de /cdn/  (READ-ONLY)
# ══════════════════════════════════════════════════════════════════════════════
# Se ejecuta EN el VPS vía `ssh root@<vps> 'python3 -' < e11_sample.py`.
#   · SOLO GET. No escribe nada en el VPS; la salida va por stdout.
#   · No toca config, no recarga nginx, no muta shared dicts (solo los LEE vía
#     /_ape/qoe y /_ape/health, que son lecturas).
#   · Antes de cada muestra lee /_ape/qoe para saber si el CIRCUIT-BREAKER
#     (`down:<host>`, TTL 15 s) estaba ABIERTO en ese instante. Ese es el eje
#     del diagnóstico: separar "fallo de proveedor" de "fallo cacheado por
#     breaker" (que devuelve 502 instantáneo SIN `reason`).
#
# Brazos:
#   https443 · 150 GET al 443 público (camino del player, TLS nuevo por muestra)
#   loop8088 ·  30 GET al 8088 loopback (mismo gateway, sin TLS ni 443)
# Controles: tras CADA no-200 se replica el fetch edge contra el proveedor
# (Host + `User-Agent: Mozilla/5.0`, sin Accept) y se sigue 1 salto (302->CDN).
# Es la única forma de saber si el proveedor habría servido: el proveedor
# devuelve 461 si ve `Accept: */*`.
#
# Salida: JSONL por stdout · 1 línea META, N SAMPLE, 1 TAIL.
# Redacción: usuario/contraseña del proveedor y token del CDN -> <USER>/<PASS>/<TOKEN>.
# ══════════════════════════════════════════════════════════════════════════════
import http.client
import json
import os
import re
import ssl
import sys
import time
import gzip
import hashlib

VPS_IP       = "178.156.147.234"
PUB_HOST     = "iptv-ape.duckdns.org"          # SNI + Host del 443
LOOP_HOST    = "127.0.0.1"                     # 8088 (mismo gateway, sin TLS)
LOOP_PORT    = 8088
CDN_LIST_GZ  = "/var/www/html/lists/APE_LISTA_1793002539897_CDN.m3u8.gz"
CDN_IDS      = ["3", "5", "6"]
GW_HOST      = "line.tivi-ott.net"             # host del gateway (allowlist)
N_HTTPS      = int(os.environ.get("E11_N_HTTPS", "150"))
N_LOOP       = int(os.environ.get("E11_N_LOOP", "30"))
CTRL_EVERY   = int(os.environ.get("E11_CTRL_EVERY", "15"))
SLEEP_S      = float(os.environ.get("E11_SLEEP", "0.15"))
TIMEOUT      = 20


# ── descubrimiento de canales (misma fuente que el arnés E1) ────────────────
def discover():
    pats = {i: re.compile(r"^https://iptv-ape\.duckdns\.org(/cdn/line\.tivi-ott\.net/[^?\s]+/%s\.m3u8)$" % i)
            for i in CDN_IDS}
    found = {}
    with gzip.open(CDN_LIST_GZ, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            for i, p in pats.items():
                if i in found:
                    continue
                m = p.match(line)
                if m:
                    found[i] = m.group(1)
            if len(found) == len(CDN_IDS):
                break
    missing = [i for i in CDN_IDS if i not in found]
    if missing:
        raise SystemExit("canales no encontrados en la lista: %s" % missing)
    return found


SECRETS = []


def add_secret(lit, rep):
    if lit and (lit, rep) not in SECRETS:
        SECRETS.append((lit, rep))


def redact(s):
    if not isinstance(s, str):
        return s
    for lit, rep in SECRETS:
        if lit in s:
            s = s.replace(lit, rep)
    return s


def redact_obj(o):
    if isinstance(o, str):
        return redact(o)
    if isinstance(o, dict):
        return {redact(k): redact_obj(v) for k, v in o.items()}
    if isinstance(o, list):
        return [redact_obj(v) for v in o]
    return o


# ── lectura del estado del plano (solo lectura) ────────────────────────────
def plane_state():
    """ /_ape/qoe del 8088 -> mapa REAL de hosts castigados + contadores.
        OJO: /_ape/health NO publica los nombres de host, solo el número; el
        mapa `hosts_down` (claves `down:<host>`) solo sale por /_ape/qoe. """
    try:
        c = http.client.HTTPConnection(LOOP_HOST, LOOP_PORT, timeout=5)
        c.request("GET", "/_ape/qoe", headers={"Host": "127.0.0.1"})
        r = c.getresponse()
        j = json.loads(r.read())
        c.close()
    except Exception as e:                                  # noqa: BLE001
        return {"err": "%s: %s" % (type(e).__name__, e)}
    m = j.get("metrics") or {}
    dn = j.get("hosts_down") or {}
    req = m.get("req") or 0
    failed = m.get("all_failed") or 0
    attempts = req + failed
    return {
        "down": dn,                                  # host -> 1 (TTL 15 s vivo)
        "n_down": len(dn),
        "breaker_gw": dn.get(GW_HOST),               # 1 si el gateway está castigado
        "req": req,                                  # SOLO éxitos (defecto métrica)
        "all_failed": failed,
        "attempts": attempts,
        "trips_gw": m.get("host_down:" + GW_HOST),   # nº de castigos acumulados
        "error_ratio_official": round(failed / req, 4) if req else 0.0,
        "error_ratio_honest": round(failed / attempts, 4) if attempts else 0.0,
        "last_ms": m.get("last_ms"),
        "ts": j.get("ts"),
    }


# ── una petición HTTP cruda, conexión nueva, sin keep-alive ────────────────
def hit(scheme, host, port, path, hosthdr, ctx=None):
    t0 = time.perf_counter()
    out = {"status": None, "ttfb_ms": None, "total_ms": None, "size": None,
           "hdrs": {}, "body": b"", "err": None}
    try:
        if scheme == "https":
            conn = http.client.HTTPSConnection(host, port, timeout=TIMEOUT, context=ctx)
        else:
            conn = http.client.HTTPConnection(host, port, timeout=TIMEOUT)
        # sin Host automático y sin Accept-Encoding automático: control total
        conn.putrequest("GET", path, skip_host=True, skip_accept_encoding=True)
        conn.putheader("Host", hosthdr)
        conn.endheaders()
        r = conn.getresponse()
        out["ttfb_ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
        body = r.read()
        out["total_ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
        out["status"] = r.status
        out["size"] = len(body)
        out["body"] = body
        out["hdrs"] = {k.lower(): v for k, v in r.getheaders()}
        conn.close()
    except Exception as e:                                  # noqa: BLE001
        out["err"] = "%s: %s" % (type(e).__name__, e)
        out["total_ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
    return out


def xape(h):
    return {k[len("x-ape-"):]: v for k, v in h.items() if k.startswith("x-ape-")}


# ── control: ¿el proveedor habría servido? (réplica EXACTA del fetch edge) ──
def provider_control(ape_host, cdn_path):
    """Replica /_ape/_fetch: Host + `User-Agent: Mozilla/5.0`, sin Accept, sin
    otras cabeceras (proxy_pass_request_headers off). Sigue 1 salto como el
    gateway (302 -> CDN)."""
    prov_path = re.sub(r"^/cdn/[^/]+", "", cdn_path)     # quitar /cdn/<host>
    res = {"prov_path": redact(prov_path), "provider": None, "cdn": None}
    phost, pport = (ape_host.split(":") + ["80"])[:2]
    r1 = hit("http", phost, int(pport), prov_path, ape_host)
    loc = r1["hdrs"].get("location")
    res["provider"] = {"status": r1["status"], "ms": r1["total_ms"],
                       "err": redact(r1["err"]),
                       "loc": redact(re.sub(r"(/play/)[^/]+", r"\1<TOKEN>", loc)) if loc else None}
    if loc:
        m = re.match(r"^https?://([^/]+)(/.*)$", loc)
        if m:
            chost, cpath = m.group(1), m.group(2)
            ch, cp = (chost.split(":") + ["80"])[:2]
            r2 = hit("http", ch, int(cp), cpath, chost)
            res["cdn"] = {"status": r2["status"], "ms": r2["total_ms"],
                          "bytes": r2["size"], "err": redact(r2["err"]),
                          "head": redact(r2["body"][:40].decode("utf-8", "replace"))}
    return res


def main():
    chans = discover()
    for i, p in chans.items():
        m = re.match(r"^/cdn/[^/]+/live/([^/]+)/([^/]+)/", p)
        if m:
            add_secret(m.group(1), "<USER>")
            add_secret(m.group(2), "<PASS>")

    ctx = ssl.create_default_context()
    meta = {
        "kind": "META",
        "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "epoch": int(time.time()),
        "vps_ip": VPS_IP,
        "arms": {"https443": N_HTTPS, "loop8088": N_LOOP},
        "ctrl_every_200": CTRL_EVERY,
        "channels": {i: redact(p) for i, p in chans.items()},
        "cdn_ids": CDN_IDS,
        "gw_host": GW_HOST,
        "plane_before": redact_obj(plane_state()),
    }
    print(json.dumps(meta, ensure_ascii=False), flush=True)

    arms = [("https443", N_HTTPS), ("loop8088", N_LOOP)]
    i = 0
    n200 = 0
    for arm, n in arms:
        for k in range(n):
            chan = CDN_IDS[k % len(CDN_IDS)]
            path = chans[chan]
            pre = plane_state()
            if arm == "https443":
                r = hit("https", PUB_HOST, 443, path, PUB_HOST, ctx=ctx)
            else:
                r = hit("http", LOOP_HOST, LOOP_PORT, path, PUB_HOST)
            post = plane_state()
            i += 1
            st = r["status"]
            rec = {
                "kind": "SAMPLE", "i": i, "arm": arm, "chan": chan,
                "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "t_rel": round(time.time() - meta["epoch"], 2),
                "status": st, "err": redact(r["err"]),
                "ttfb_ms": r["ttfb_ms"], "total_ms": r["total_ms"], "size": r["size"],
                "x_ape": xape(r["hdrs"]),
                "ctype": r["hdrs"].get("content-type"),
                "pre": {"breaker_gw": pre.get("breaker_gw"), "n_down": pre.get("n_down"),
                        "down": list((pre.get("down") or {}).keys()),
                        "trips_gw": pre.get("trips_gw"), "all_failed": pre.get("all_failed"),
                        "req": pre.get("req")},
                "post": {"breaker_gw": post.get("breaker_gw"), "n_down": post.get("n_down"),
                         "down": list((post.get("down") or {}).keys()),
                         "trips_gw": post.get("trips_gw"), "all_failed": post.get("all_failed"),
                         "req": post.get("req")},
            }
            if st == 200:
                n200 += 1
                body = r["body"]
                rec["body_kind"] = "playlist" if body.lstrip()[:7] == b"#EXTM3U" else "other"
                rec["body_sha"] = hashlib.sha256(body).hexdigest()[:12]
                rec["body_head"] = redact(body[:100].decode("utf-8", "replace"))
                rec["body_uris"] = body.count(b"\nhttp") + (1 if body.startswith(b"http") else 0)
                if n200 % CTRL_EVERY == 0:
                    rec["control"] = provider_control(GW_HOST, path)
            else:
                body = r["body"]
                ct = (r["hdrs"].get("content-type") or "")
                if "json" in ct or body.lstrip()[:1] == b"{":
                    rec["body_kind"] = "json"
                    try:
                        rec["body"] = redact_obj(json.loads(body))
                    except Exception:                       # noqa: BLE001
                        rec["body_raw"] = redact(body[:300].decode("utf-8", "replace"))
                else:
                    rec["body_kind"] = "other"
                    rec["body_head"] = redact(body[:200].decode("utf-8", "replace"))
                rec["control"] = provider_control(GW_HOST, path)
            print(json.dumps(rec, ensure_ascii=False), flush=True)
            time.sleep(SLEEP_S)

    tail = {"kind": "TAIL",
            "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "samples": i, "n_200": n200,
            "plane_after": redact_obj(plane_state())}
    print(json.dumps(tail, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:                                   # noqa: BLE001
        print(json.dumps({"kind": "FATAL", "err": "%s: %s" % (type(e).__name__, e)}), flush=True)
        sys.exit(1)
