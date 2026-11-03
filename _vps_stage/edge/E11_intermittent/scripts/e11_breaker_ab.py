#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════════
# E11 · A/B determinista del CIRCUIT-BREAKER de ape_gateway.lua  (READ-ONLY)
# ══════════════════════════════════════════════════════════════════════════════
# Objetivo: probar, sin ambigüedad, que el breaker `down:<host>` (TTL 15 s) de
# ape_gateway.lua convierte UN fallo real del proveedor en una ventana de 15 s
# en la que TODOS los manifiestos de ese host fallan al instante (502 sin
# `reason`, sin `X-APE-*`), aunque el proveedor esté sano.
#
# Secuencia:
#   0) esperar a que el breaker esté LIMPIO (3 lecturas seguidas sin `down:GW`)
#   1) control ANTES  : proveedor directo (Host+UA) sobre el canal bueno -> 302->200
#   2) disparo        : 1 GET al gateway con un id inexistente -> non-2xx (trip)
#   3) ventana        : durante ~22 s, GET del canal BUENO por el gateway cada
#                       0.5 s + control al proveedor cada 2 s. Se registra
#                       status, ms, cabeceras X-APE-*, cuerpo y estado del breaker.
#   4) control DESPUÉS: proveedor directo otra vez (debe seguir sano)
#   5) se verifica que el breaker quedó limpio
#
# SOLO GET. No escribe nada en el VPS. Redacta credenciales y token del CDN.
# ══════════════════════════════════════════════════════════════════════════════
import http.client
import json
import os
import re
import ssl
import sys
import time
import gzip

PUB_HOST   = "iptv-ape.duckdns.org"
LOOP_HOST  = "127.0.0.1"
LOOP_PORT  = 8088
GW_HOST    = "line.tivi-ott.net"
CDN_LIST_GZ = "/var/www/html/lists/APE_LISTA_1793002539897_CDN.m3u8.gz"
BAD_ID     = os.environ.get("E11_BAD_ID", "999999999")
WINDOW_S   = float(os.environ.get("E11_WINDOW_S", "22"))
STEP_S     = float(os.environ.get("E11_STEP_S", "0.5"))
CTRL_EVERY = float(os.environ.get("E11_CTRL_EVERY_S", "2.0"))
TIMEOUT    = 20

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


def discover_good():
    pat = re.compile(r"^https://iptv-ape\.duckdns\.org(/cdn/line\.tivi-ott\.net/[^?\s]+/3\.m3u8)$")
    with gzip.open(CDN_LIST_GZ, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if line.startswith("#EXT") or not line:
                continue
            m = pat.match(line)
            if m:
                return m.group(1)
    raise SystemExit("canal 3 no encontrado")


def plane_state():
    try:
        c = http.client.HTTPConnection(LOOP_HOST, LOOP_PORT, timeout=5)
        c.request("GET", "/_ape/qoe", headers={"Host": "127.0.0.1"})
        j = json.loads(c.getresponse().read())
        c.close()
    except Exception as e:                                  # noqa: BLE001
        return {"err": "%s: %s" % (type(e).__name__, e)}
    m = j.get("metrics") or {}
    dn = j.get("hosts_down") or {}
    req = m.get("req") or 0
    failed = m.get("all_failed") or 0
    return {"down": dn, "n_down": len(dn), "breaker_gw": dn.get(GW_HOST),
            "req": req, "all_failed": failed, "attempts": req + failed,
            "trips_gw": m.get("host_down:" + GW_HOST),
            "trips_loop": m.get("host_down:127.0.0.1:8088"),
            "error_ratio_official": round(failed / req, 4) if req else 0.0,
            "error_ratio_honest": round(failed / (req + failed), 4) if (req + failed) else 0.0,
            "ts": j.get("ts")}


def hit(scheme, host, port, path, hosthdr, ctx=None):
    t0 = time.perf_counter()
    out = {"status": None, "ttfb_ms": None, "total_ms": None, "size": None,
           "hdrs": {}, "body": b"", "err": None}
    try:
        if scheme == "https":
            conn = http.client.HTTPSConnection(host, port, timeout=TIMEOUT, context=ctx)
        else:
            conn = http.client.HTTPConnection(host, port, timeout=TIMEOUT)
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


def provider_probe(cdn_path):
    """Réplica del fetch edge: Host + UA 'Mozilla/5.0', sin Accept. 1 salto."""
    prov_path = re.sub(r"^/cdn/[^/]+", "", cdn_path)
    r1 = hit("http", GW_HOST, 80, prov_path, GW_HOST)
    loc = r1["hdrs"].get("location")
    res = {"prov_status": r1["status"], "prov_ms": r1["total_ms"],
           "loc": redact(re.sub(r"(/play/)[^/]+", r"\1<TOKEN>", loc)) if loc else None,
           "cdn_status": None, "cdn_ms": None}
    if loc:
        m = re.match(r"^https?://([^/]+)(/.*)$", loc)
        if m:
            chost, cpath = m.group(1), m.group(2)
            ch, cp = (chost.split(":") + ["80"])[:2]
            r2 = hit("http", ch, int(cp), cpath, chost)
            res["cdn_status"] = r2["status"]
            res["cdn_ms"] = r2["total_ms"]
            res["cdn_bytes"] = r2["size"]
    return res


def gw_probe(path, ctx, label):
    r = hit("https", PUB_HOST, 443, path, PUB_HOST, ctx=ctx)
    rec = {"label": label,
           "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "status": r["status"], "ttfb_ms": r["ttfb_ms"], "total_ms": r["total_ms"],
           "size": r["size"], "x_ape": xape(r["hdrs"]), "err": redact(r["err"])}
    body = r["body"]
    if r["status"] == 200:
        rec["body_kind"] = "playlist" if body.lstrip()[:7] == b"#EXTM3U" else "other"
        rec["has_reason_hdr_chain"] = bool(rec["x_ape"])
    else:
        try:
            rec["body"] = redact_obj(json.loads(body))
        except Exception:                                   # noqa: BLE001
            rec["body_head"] = redact(body[:200].decode("utf-8", "replace"))
        rec["body_has_reason"] = isinstance(rec.get("body"), dict) and ("reason" in rec["body"])
    return rec


def main():
    good = discover_good()
    m = re.match(r"^/cdn/[^/]+/live/([^/]+)/([^/]+)/", good)
    if m:
        add_secret(m.group(1), "<USER>")
        add_secret(m.group(2), "<PASS>")
    bad = re.sub(r"/3\.m3u8$", "/%s.m3u8" % BAD_ID, good)

    ctx = ssl.create_default_context()
    print(json.dumps({"kind": "AB_META",
                      "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                      "good": redact(good), "bad": redact(bad),
                      "bad_id": BAD_ID, "window_s": WINDOW_S, "step_s": STEP_S,
                      "gw_host": GW_HOST,
                      "plane_before": redact_obj(plane_state())}, ensure_ascii=False), flush=True)

    # 0 · esperar breaker limpio
    clean = 0
    t_wait0 = time.time()
    while clean < 3 and time.time() - t_wait0 < 90:
        st = plane_state()
        clean = clean + 1 if not st.get("breaker_gw") else 0
        if clean < 3:
            time.sleep(0.7)
    print(json.dumps({"kind": "AB_WAIT", "waited_s": round(time.time() - t_wait0, 1),
                      "plane": redact_obj(plane_state())}, ensure_ascii=False), flush=True)

    # 1 · control ANTES
    print(json.dumps({"kind": "AB_STEP", "step": "control_before",
                      "prov": redact_obj(provider_probe(good)),
                      "gw": redact_obj(gw_probe(good, ctx, "gw_good_before")),
                      "plane": redact_obj(plane_state())}, ensure_ascii=False), flush=True)

    # 2 · disparo
    t_trip = time.time()
    trig = gw_probe(bad, ctx, "gw_bad_triggers")
    trig["t_from_trip"] = 0.0
    trig["plane_after"] = redact_obj(plane_state())
    print(json.dumps({"kind": "AB_STEP", "step": "trigger", "rec": redact_obj(trig)},
                     ensure_ascii=False), flush=True)

    # 3 · ventana
    k = 0
    last_ctrl = 0.0
    while time.time() - t_trip < WINDOW_S:
        k += 1
        rec = gw_probe(good, ctx, "gw_good_in_window")
        rec["t_from_trip"] = round(time.time() - t_trip, 2)
        rec["plane"] = redact_obj(plane_state())
        if time.time() - last_ctrl >= CTRL_EVERY:
            rec["prov"] = redact_obj(provider_probe(good))
            last_ctrl = time.time()
        print(json.dumps({"kind": "AB_STEP", "step": "window", "n": k, "rec": rec},
                         ensure_ascii=False), flush=True)
        time.sleep(STEP_S)

    # 4 · control DESPUÉS
    print(json.dumps({"kind": "AB_STEP", "step": "control_after",
                      "prov": redact_obj(provider_probe(good)),
                      "gw": redact_obj(gw_probe(good, ctx, "gw_good_after")),
                      "plane": redact_obj(plane_state()),
                      "t_from_trip": round(time.time() - t_trip, 2)}, ensure_ascii=False), flush=True)

    print(json.dumps({"kind": "AB_TAIL", "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                      "plane_after": redact_obj(plane_state())}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:                                   # noqa: BLE001
        print(json.dumps({"kind": "FATAL", "err": "%s: %s" % (type(e).__name__, e)}), flush=True)
        sys.exit(1)
