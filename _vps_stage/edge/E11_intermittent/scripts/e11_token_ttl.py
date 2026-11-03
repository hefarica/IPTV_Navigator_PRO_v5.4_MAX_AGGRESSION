#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════════
# E11 · Token del 302: ¿único por petición? ¿cuánto vive? (GET solamente)
# ══════════════════════════════════════════════════════════════════════════════
# Relevante para dos decisiones:
#   · E11: si el CDN responde 509 cuando el token caduca, un token rancio es la
#     causa natural del único código «de ticket» que aparece en este proveedor.
#   · E4 (caché del destino del 302): si el token es único por petición y vive
#     ~15 s, cachear el destino sirve SOLO dentro de esa ventana; fuera, el hit
#     devolvería 509 (peor que no cachear).
#
# Medidas:
#   1) UNICIDAD: 5 peticiones seguidas al mismo path -> ¿cuántos tokens distintos?
#   2) TTL fino: se captura 1 token y se sondea la MISMA URL en una rejilla
#      (2,4,6,8,10,12,14,16,18,20,25,30 s) -> primer 509 = caducidad.
#      Se repite con 2 tokens más para ver si el TTL es estable.
#   3) Se comprueba también que un token NUEVO sigue sirviendo tras la
#      caducidad del anterior (no es un bloqueo del CDN, es del token).
# ══════════════════════════════════════════════════════════════════════════════
import gzip
import http.client
import json
import re
import time

GW_HOST = "line.tivi-ott.net"
LIST_GZ = "/var/www/html/lists/APE_LISTA_1793002539897_CDN.m3u8.gz"
TIMEOUT = 20
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


def discover():
    pat = re.compile(r"^https://iptv-ape\.duckdns\.org(/cdn/line\.tivi-ott\.net/[^?\s]+/3\.m3u8)$")
    with gzip.open(LIST_GZ, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            m = pat.match(line.strip())
            if m:
                return m.group(1)
    raise SystemExit("canal 3 no encontrado")


def hit(host, port, path, hosthdr):
    t0 = time.perf_counter()
    out = {"status": None, "ms": None, "hdrs": {}, "n": 0, "err": None}
    try:
        c = http.client.HTTPConnection(host, port, timeout=TIMEOUT)
        c.putrequest("GET", path, skip_host=True, skip_accept_encoding=True)
        c.putheader("Host", hosthdr)
        c.endheaders()
        r = c.getresponse()
        out["status"] = r.status
        out["hdrs"] = {k.lower(): v for k, v in r.getheaders()}
        out["n"] = len(r.read())
        out["ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
        c.close()
    except Exception as e:                                  # noqa: BLE001
        out["err"] = "%s: %s" % (type(e).__name__, e)
    return out


def mint(prov_path):
    """1 GET al proveedor -> (status, cdn_host, cdn_path, token) con el token crudo."""
    r = hit(GW_HOST, 80, prov_path, GW_HOST)
    loc = r["hdrs"].get("location")
    if not loc:
        return {"status": r["status"], "loc": None}
    m = re.match(r"^https?://([^/]+)(/.*)$", loc)
    host, path = m.group(1), m.group(2)
    tok = re.search(r"/play/([^/]+)/", path)
    return {"status": r["status"], "host": host, "path": path,
            "token": tok.group(1) if tok else None}


def fetch_cdn(host, path):
    h, p = (host.split(":") + ["80"])[:2]
    return hit(host.split(":")[0], int(p), path, host)


def main():
    base = discover()
    m = re.match(r"^/cdn/[^/]+/live/([^/]+)/([^/]+)/", base)
    add_secret(m.group(1), "<USER>")
    add_secret(m.group(2), "<PASS>")
    prov_path = base.replace("/cdn/" + GW_HOST, "")

    out = {"kind": "TOK_META", "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    print(json.dumps(out, ensure_ascii=False), flush=True)

    # ── 1 · unicidad del token ────────────────────────────────────────────
    toks, rows = [], []
    for _ in range(5):
        v = mint(prov_path)
        if v.get("token"):
            toks.append(v["token"])
        rows.append({"status": v["status"], "token_len": len(v.get("token") or "")})
        time.sleep(0.4)
    print(json.dumps({"kind": "TOK_UNIQUENESS", "n": len(toks),
                      "distinct": len(set(toks)),
                      "unique_per_request": len(set(toks)) == len(toks),
                      "rows": rows}, ensure_ascii=False), flush=True)

    # ── 2 · TTL fino, 3 tokens independientes ─────────────────────────────
    GRID = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 25, 30]
    trials = []
    for trial in range(3):
        v = mint(prov_path)
        if not v.get("token"):
            trials.append({"error": "sin 302", "prov": v.get("status")})
            continue
        t0 = time.time()
        samples, first509 = [], None
        for w in GRID:
            while time.time() - t0 < w:
                time.sleep(0.1)
            r = fetch_cdn(v["host"], v["path"])
            s = {"t_s": round(time.time() - t0, 1), "status": r["status"], "bytes": r["n"]}
            samples.append(s)
            if r["status"] == 509 and first509 is None:
                first509 = s["t_s"]
        # ── 3 · token nuevo tras la caducidad del anterior ────────────────
        v2 = mint(prov_path)
        fresh = fetch_cdn(v2["host"], v2["path"]) if v2.get("token") else {"status": None}
        trials.append({"trial": trial + 1, "samples": samples, "first_509_at_s": first509,
                       "fresh_token_after": {"mint": v2.get("status"), "cdn": fresh["status"],
                                             "bytes": fresh["n"]},
                       "token_distinct_from_prev": v2.get("token") != v.get("token")})
        time.sleep(1)
    print(json.dumps({"kind": "TOK_TTL", "grid_s": GRID, "trials": trials}, ensure_ascii=False), flush=True)
    print(json.dumps({"kind": "TOK_TAIL", "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
                     ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
