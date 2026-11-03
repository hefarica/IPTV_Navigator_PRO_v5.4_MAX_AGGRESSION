#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════════
# E11 · Caracterización del PROVEEDOR (post-hotfix: el breaker ya no existe)
# ══════════════════════════════════════════════════════════════════════════════
# Preguntas que responde, con GET solamente:
#   B) ¿qué códigos usa el proveedor y en qué ruta? (405 / 513 / 509 / 407 / 461)
#   C) ¿el token del CDN del 302 caduca? ¿en 30-60 s? (mito o realidad)
#   D) ¿el proveedor castiga la CONCURRENCIA con 407/509? (origen de los fallos
#      que el breaker amplificaba)
#   E) el mismo estímulo a través del gateway: ¿qué status/X-APE devuelve ahora?
#
# Se ejecuta EN el VPS por stdin: `ssh root@vps 'python3 -' < e11_provider_codes.py`
# No escribe nada. Redacta usuario/contraseña y token del CDN.
# ══════════════════════════════════════════════════════════════════════════════
import gzip
import http.client
import json
import re
import ssl
import threading
import time

PUB_HOST = "iptv-ape.duckdns.org"
GW_HOST  = "line.tivi-ott.net"
LIST_GZ  = "/var/www/html/lists/APE_LISTA_1793002539897_CDN.m3u8.gz"
TIMEOUT  = 20
SECRETS  = []


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


def ro(o):
    if isinstance(o, str):
        return redact(o)
    if isinstance(o, dict):
        return {redact(k): ro(v) for k, v in o.items()}
    if isinstance(o, list):
        return [ro(v) for v in o]
    return o


def discover():
    pat = re.compile(r"^https://iptv-ape\.duckdns\.org(/cdn/line\.tivi-ott\.net/[^?\s]+/3\.m3u8)$")
    with gzip.open(LIST_GZ, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            m = pat.match(line.strip())
            if m:
                return m.group(1)
    raise SystemExit("canal 3 no encontrado")


def hit(host, port, path, hosthdr, scheme="http", ctx=None):
    t0 = time.perf_counter()
    out = {"status": None, "ms": None, "hdrs": {}, "body": b"", "err": None}
    try:
        if scheme == "https":
            c = http.client.HTTPSConnection(host, port, timeout=TIMEOUT, context=ctx)
        else:
            c = http.client.HTTPConnection(host, port, timeout=TIMEOUT)
        c.putrequest("GET", path, skip_host=True, skip_accept_encoding=True)
        c.putheader("Host", hosthdr)
        c.endheaders()
        r = c.getresponse()
        out["status"] = r.status
        out["hdrs"] = {k.lower(): v for k, v in r.getheaders()}
        out["body"] = r.read()
        out["ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
        c.close()
    except Exception as e:                                  # noqa: BLE001
        out["err"] = "%s: %s" % (type(e).__name__, e)
        out["ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
    return out


def prov(path):
    """Réplica del fetch edge (Host + UA, sin Accept)."""
    r = hit(GW_HOST, 80, path, GW_HOST)
    loc = r["hdrs"].get("location")
    return {"status": r["status"], "ms": r["ms"], "err": redact(r["err"]),
            "loc": redact(re.sub(r"(/play/)[^/]+", r"\1<TOKEN>", loc)) if loc else None,
            "_loc": loc, "_hdrs": r["hdrs"]}


def gw(cdn_path, ctx):
    r = hit(PUB_HOST, 443, cdn_path, PUB_HOST, "https", ctx)
    body = r["body"]
    rec = {"status": r["status"], "ms": r["ms"],
           "xape": {k[6:]: v for k, v in r["hdrs"].items() if k.startswith("x-ape-")}}
    if r["status"] == 200:
        rec["bytes"] = len(body)
        rec["kind"] = "playlist" if body.lstrip()[:7] == b"#EXTM3U" else "other"
    else:
        try:
            rec["body"] = ro(json.loads(body))
        except Exception:                                   # noqa: BLE001
            rec["head"] = redact(body[:160].decode("utf-8", "replace"))
    return rec


def part_b(base, ctx):
    """Códigos por tipo de ruta (3 muestras cada una)."""
    user, pwd = re.match(r"^/cdn/[^/]+/live/([^/]+)/([^/]+)/", base).groups()
    cases = {
        "creds_invalidas":       "/live/0000/0000/3.m3u8",
        "id_inexistente":        "/live/%s/%s/999999999.m3u8" % (user, pwd),
        "id_cero":               "/live/%s/%s/0.m3u8" % (user, pwd),
        "ruta_inexistente":      "/live/%s/%s/nope.m3u8" % (user, pwd),
        "canal_valido_3":        base.replace("/cdn/" + GW_HOST, ""),
        "sin_extension_m3u8":    re.sub(r"\.m3u8$", "", base).replace("/cdn/" + GW_HOST, ""),
    }
    out = {}
    for name, p in cases.items():
        rows = []
        for _ in range(3):
            r1 = prov(p)
            row = {"prov": r1["status"], "ms": r1["ms"], "loc": r1["loc"]}
            if r1["_loc"]:                                  # seguir 1 salto
                m = re.match(r"^https?://([^/]+)(/.*)$", r1["_loc"])
                if m:
                    ch, cp = (m.group(1).split(":") + ["80"])[:2]
                    r2 = hit(m.group(1).split(":")[0], int(cp), m.group(2), m.group(1))
                    row["cdn"] = r2["status"]
                    row["cdn_bytes"] = len(r2["body"])
            rows.append(row)
            time.sleep(0.3)
        out[name] = rows
    # mismo estímulo por el gateway (lo que ve el player)
    out["_gateway"] = {}
    for name in ("creds_invalidas", "id_inexistente", "canal_valido_3"):
        out["_gateway"][name] = gw("/cdn/" + GW_HOST + cases[name], ctx)
    return out


def part_c(base, ctx):
    """¿Caduca el token del CDN? Se repite la MISMA URL con token a lo largo del tiempo."""
    p = base.replace("/cdn/" + GW_HOST, "")
    r1 = prov(p)
    loc = r1["_loc"]
    if not loc:
        return {"error": "sin 302", "prov": r1["status"]}
    m = re.match(r"^https?://([^/]+)(/.*)$", loc)
    chost, cpath = m.group(1), m.group(2)
    ch, cp = (chost.split(":") + ["80"])[:2]
    t0 = time.time()
    samples = []
    for wait in (0, 5, 20, 40, 70, 110, 180):
        while time.time() - t0 < wait:
            time.sleep(0.2)
        r = hit(ch, int(cp), cpath, chost)
        samples.append({"t_s": round(time.time() - t0, 1), "status": r["status"],
                        "bytes": len(r["body"]), "ms": r["ms"]})
    return {"cdn": redact(re.sub(r"(/play/)[^/]+", r"\1<TOKEN>", loc)), "samples": samples}


def part_d(base, ctx, n=6, rounds=2):
    """Concurrencia acotada: n GET simultáneos al MISMO canal (proveedor y gateway)."""
    p = base.replace("/cdn/" + GW_HOST, "")
    out = {"n": n, "rounds": rounds, "prov": [], "gw": []}
    for rnd in range(rounds):
        res = [None] * n

        def w(i):
            res[i] = prov(p)["status"]

        ts = [threading.Thread(target=w, args=(i,)) for i in range(n)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        out["prov"].append({"round": rnd + 1, "statuses": res})
        time.sleep(3)
    for rnd in range(rounds):
        res = [None] * n

        def w2(i):
            res[i] = gw(base, ctx)["status"]

        ts = [threading.Thread(target=w2, args=(i,)) for i in range(n)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        out["gw"].append({"round": rnd + 1, "statuses": res})
        time.sleep(3)
    return out


def main():
    base = discover()
    m = re.match(r"^/cdn/[^/]+/live/([^/]+)/([^/]+)/", base)
    add_secret(m.group(1), "<USER>")
    add_secret(m.group(2), "<PASS>")
    ctx = ssl.create_default_context()
    print(json.dumps({"kind": "PC_META", "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                      "canal3": redact(base), "gw_host": GW_HOST}, ensure_ascii=False), flush=True)

    print(json.dumps({"kind": "PC_B", "rutas": ro(part_b(base, ctx))}, ensure_ascii=False), flush=True)
    print(json.dumps({"kind": "PC_C_token", "res": ro(part_c(base, ctx))}, ensure_ascii=False), flush=True)
    print(json.dumps({"kind": "PC_D_concurrencia", "res": ro(part_d(base, ctx))}, ensure_ascii=False), flush=True)
    print(json.dumps({"kind": "PC_TAIL", "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
                     ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
