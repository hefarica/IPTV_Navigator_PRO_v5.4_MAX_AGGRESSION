#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════════
# E4 · Parámetros reales de la caché del 302 (GET solamente)
# ══════════════════════════════════════════════════════════════════════════════
#   A) SPLIT de saltos: proveedor (302) vs CDN (playlist final). N muestras por
#      canal. Es el techo de ahorro: saltarse el 302 ahorra SOLO el primer salto.
#   B) VIDA del token: 6 acuñaciones independientes, rejilla 2..30 s con parada
#      al primer `509` -> distribución (no un único punto).
#   C) Coste del camino «hit» (CDN directo con token vivo) vs «miss» (302+CDN),
#      medido en la misma ventana para que el ruido del proveedor afecte a ambos.
#
# Réplica EXACTA del fetch edge: Host + `User-Agent: Mozilla/5.0`, sin `Accept`
# (el proveedor contesta 461 si ve `Accept: */*`).
# ══════════════════════════════════════════════════════════════════════════════
import gzip
import http.client
import json
import re
import statistics
import time

GW_HOST = "line.tivi-ott.net"
LIST_GZ = "/var/www/html/lists/APE_LISTA_1793002539897_CDN.m3u8.gz"
TIMEOUT = 20
N_SPLIT = 30
N_TTL = 6
GRID = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24, 28, 30]
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


def discover(ids=("3",)):
    pats = {i: re.compile(r"^https://iptv-ape\.duckdns\.org(/cdn/line\.tivi-ott\.net/[^?\s]+/%s\.m3u8)$" % i) for i in ids}
    found = {}
    with gzip.open(LIST_GZ, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            for i, p in pats.items():
                if i in found:
                    continue
                m = p.match(line.strip())
                if m:
                    found[i] = m.group(1)
            if len(found) == len(ids):
                break
    return found


def hit(host, port, path, hosthdr):
    t0 = time.perf_counter()
    out = {"status": None, "ms": None, "n": 0}
    try:
        c = http.client.HTTPConnection(host, port, timeout=TIMEOUT)
        c.putrequest("GET", path, skip_host=True, skip_accept_encoding=True)
        c.putheader("Host", hosthdr)
        c.endheaders()
        r = c.getresponse()
        out["status"] = r.status
        out["n"] = len(r.read())
        out["ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
        c.close()
    except Exception as e:                                  # noqa: BLE001
        out["err"] = "%s: %s" % (type(e).__name__, e)
        out["ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
    return out


def mint(prov_path):
    """1 GET al proveedor; devuelve tiempos y destino con token."""
    t0 = time.perf_counter()
    c = http.client.HTTPConnection(GW_HOST, 80, timeout=TIMEOUT)
    c.putrequest("GET", prov_path, skip_host=True, skip_accept_encoding=True)
    c.putheader("Host", GW_HOST)
    c.endheaders()
    r = c.getresponse()
    loc = r.getheader("Location")
    st = r.status
    r.read()
    c.close()
    ms = round((time.perf_counter() - t0) * 1000.0, 1)
    if not loc:
        return {"status": st, "ms": ms}
    m = re.match(r"^https?://([^/]+)(/.*)$", loc)
    tok = re.search(r"/play/([^/]+)/", m.group(2))
    return {"status": st, "ms": ms, "host": m.group(1), "path": m.group(2),
            "token": tok.group(1) if tok else None}


def fetch_cdn(host, path):
    h, p = (host.split(":") + ["80"])[:2]
    return hit(host.split(":")[0], int(p), path, host)


def pctl(xs, p):
    if not xs:
        return None
    s = sorted(xs)
    return round(s[min(len(s) - 1, int(p * len(s)))], 1)


def main():
    chans = discover(("3", "5", "6"))
    for _, p in chans.items():
        m = re.match(r"^/cdn/[^/]+/live/([^/]+)/([^/]+)/", p)
        add_secret(m.group(1), "<USER>")
        add_secret(m.group(2), "<PASS>")
    print(json.dumps({"kind": "E4_META", "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                      "canales": {k: redact(v) for k, v in chans.items()},
                      "n_split": N_SPLIT, "n_ttl": N_TTL, "grid_s": GRID}, ensure_ascii=False), flush=True)

    # ── A · split de saltos ────────────────────────────────────────────────
    prov_ms, cdn_ms, tot_ms, statuses = [], [], [], []
    ids = list(chans)
    for i in range(N_SPLIT):
        ch = ids[i % len(ids)]
        prov_path = chans[ch].replace("/cdn/" + GW_HOST, "")
        t0 = time.perf_counter()
        v = mint(prov_path)
        statuses.append(v.get("status"))
        prov_ms.append(v.get("ms"))
        if v.get("token"):
            r = fetch_cdn(v["host"], v["path"])
            cdn_ms.append(r["ms"])
        tot_ms.append(round((time.perf_counter() - t0) * 1000.0, 1))
        time.sleep(0.1)
    split = {
        "n": len(statuses), "prov_statuses": {str(s): statuses.count(s) for s in set(statuses)},
        "hop1_proveedor_302_ms": {"p50": pctl(prov_ms, .5), "p95": pctl(prov_ms, .95),
                                  "min": min(prov_ms), "max": max(prov_ms),
                                  "mean": round(statistics.fmean(prov_ms), 1)},
        "hop2_cdn_playlist_ms": {"p50": pctl(cdn_ms, .5), "p95": pctl(cdn_ms, .95),
                                 "min": min(cdn_ms), "max": max(cdn_ms),
                                 "mean": round(statistics.fmean(cdn_ms), 1)},
        "camino_completo_ms": {"p50": pctl(tot_ms, .5), "p95": pctl(tot_ms, .95),
                               "mean": round(statistics.fmean(tot_ms), 1)},
        "cuota_hop1_pct": round(100.0 * statistics.fmean(prov_ms) / statistics.fmean(tot_ms), 1),
    }
    print(json.dumps({"kind": "E4_SPLIT", "res": split}, ensure_ascii=False), flush=True)

    # ── B · vida del token ────────────────────────────────────────────────
    trials = []
    for k in range(N_TTL):
        v = mint(chans["3"].replace("/cdn/" + GW_HOST, ""))
        if not v.get("token"):
            trials.append({"trial": k + 1, "error": "sin 302", "status": v.get("status")})
            continue
        t0 = time.time()
        last_ok, first_509, samples = None, None, []
        for w in GRID:
            while time.time() - t0 < w:
                time.sleep(0.1)
            r = fetch_cdn(v["host"], v["path"])
            age = round(time.time() - t0, 1)
            samples.append({"age_s": age, "status": r["status"]})
            if r["status"] == 200:
                last_ok = age
            elif r["status"] == 509:
                first_509 = age
                break
        trials.append({"trial": k + 1, "last_200_s": last_ok, "first_509_s": first_509,
                       "censored_at_s": GRID[-1] if first_509 is None else None,
                       "samples": samples})
        time.sleep(0.5)
    life_lo = [t["last_200_s"] for t in trials if t.get("last_200_s")]
    life_hi = [t["first_509_s"] for t in trials if t.get("first_509_s")]
    alive_at = {}
    for w in (2, 4, 5, 6, 8, 10, 12, 15, 20, 30):
        ok = sum(1 for t in trials if t.get("last_200_s") and t["last_200_s"] >= w)
        alive_at[str(w)] = {"alive": ok, "of": len([t for t in trials if t.get("samples")]),
                            "share": round(ok / max(1, len([t for t in trials if t.get("samples")])), 3)}
    ttl = {"trials": trials,
           "last_200_s": sorted(life_lo), "first_509_s": sorted(life_hi),
           "min_lifetime_observed_s": min(life_lo) if life_lo else None,
           "alive_at_s": alive_at,
           "censored": sum(1 for t in trials if t.get("first_509_s") is None)}
    print(json.dumps({"kind": "E4_TOKEN", "res": ttl}, ensure_ascii=False), flush=True)
    print(json.dumps({"kind": "E4_TAIL", "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
                     ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
