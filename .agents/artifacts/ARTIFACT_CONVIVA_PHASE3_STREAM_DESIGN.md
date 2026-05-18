# ARTIFACT — Conviva Phase 3: Live Stream Bridge Design

**Status:** DESIGN + STUB (no VPS deploy yet)
**Date:** 2026-05-18
**Predecessor:** ARTIFACT_CONVIVA_ADB_PUSH_DESIGN.md (Phase 1 + Phase 2 DEPLOYED)
**Follows:** Phase 2 (SQLite + /dev/shm circular buffer · LIVE on VPS as of 2026-05-18 16:04 UTC)

---

## 1. Goal

Deliver server-pushed Conviva events to a browser dashboard widget in near real time
without polling, while:
- Preserving Autopista doctrine (no shield interference, no upstream traffic)
- Reusing the existing `/dev/shm/conviva-events.log` circular buffer as source
- Keeping the implementation reversible (additive nginx snippet, single PHP file)

---

## 2. Transport choice — SSE vs WebSocket

| Criterion | Server-Sent Events (SSE) | WebSocket |
|---|---|---|
| Direction | Server → Client only | Bidirectional |
| Protocol | HTTP/1.1 `text/event-stream` | RFC 6455 frame protocol |
| Nginx routing | Native (fastcgi/proxy_pass + buffering off) | Requires `proxy_pass http://` + `Upgrade` headers + `proxy_http_version 1.1` |
| PHP support | Native (long-running script + flush) | Requires Ratchet/ReactPHP/swoole or external process |
| TLS termination | Same as HTTPS (letsencrypt cert reused) | Same |
| Browser API | `new EventSource(url)` (5 lines JS) | `new WebSocket(url)` (more lifecycle) |
| Reconnection | Auto (browser native, `Last-Event-ID`) | Manual |
| Browser support | All modern (Safari/Chrome/Firefox/Edge · including Smart TV WebKit) | All modern + Smart TV |
| Best fit | Server-push of events (our case) | Chat / collaborative |

**Decision: SSE**

Rationale:
1. Our data is one-way (server → dashboard). No browser-to-server events needed.
2. SSE runs over plain HTTPS — no WebSocket library needed in PHP, no new ports, no
   special nginx module. Compatible with the autopista (no new failure surfaces).
3. Auto-reconnect with `Last-Event-ID` simplifies the widget client.
4. Smart TV WebKit support is more mature for SSE than WebSocket in older devices.

If a future requirement needs bidirectional (e.g., remote-control a player from the
dashboard), a WebSocket endpoint can be added *additively* alongside this one.

---

## 3. Endpoint contract

### Request

```
GET /prisma/api/conviva-stream
Accept: text/event-stream
Cache-Control: no-cache
Last-Event-ID: <int>     (optional · sent automatically by EventSource on reconnect)
```

Query params (all optional):
- `session_id` — filter to events belonging to a single session
- `device_id`  — filter by device
- `tail` — initial event count to replay from buffer on connect (default 50, max 500)

### Response

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache, no-store
Connection: keep-alive
X-Accel-Buffering: no
```

Stream body (one event per record, blank line terminates each event):

```
id: 1
event: conviva
data: {"t":1747500000000,"s":"...","d":"...","p":"VLC","c":"ch1","e":"first_frame","q":90,"dec":"PROMOTE_QUALITY"}

id: 2
event: conviva
data: {...}

: keepalive

id: 3
event: conviva
data: {...}
```

- `id` — monotonic counter (matches SQLite primary key when available, otherwise position
   in `/dev/shm/conviva-events.log`)
- `event: conviva` — event type field consumed by `addEventListener("conviva", ...)`
- `: keepalive` — SSE comment line every 25 s to keep proxies + browsers warm
- Heartbeat interval **MUST** be < `proxy_read_timeout` (60 s autopista) — 25 s is safe

### Errors

| Code | Meaning |
|---|---|
| 200 | Stream open. May emit `event: error` frames mid-stream for recoverable issues. |
| 405 | Method not allowed (anything other than GET) |
| 429 | Rate limited (zone `prisma_api`) |
| 503 | Buffer file missing or unreadable (Conviva persistence not yet initialized) |

---

## 4. Implementation outline (stub provided)

`vps/prisma/api/conviva-stream.php` (STUB — see file):

1. Method guard (GET only).
2. Read query string filters.
3. Open `/dev/shm/conviva-events.log` shared-locked, read tail (per `?tail=N`).
4. Stream the tail as initial backlog (`id:` from buffer line counter).
5. Use `inotifywait`-equivalent via `stream_set_blocking(false)` + 100ms poll loop on
   the buffer file. (Phase 3 stub: simple poll. Phase 3.1: upgrade to inotify via FFI.)
6. For each new line in the buffer, emit one SSE frame.
7. Every 25 s, emit `: keepalive`.
8. Exit when client disconnects (`connection_aborted()`).
9. Hard cap stream duration to `max_execution_time = 290` s (under nginx 5 min default)
   to force clean reconnect and avoid zombie PHP-FPM workers.

**Status:** Stub returns `501 Not Implemented` with a structured JSON body until full
loop is implemented. Endpoint exists so the routing can be tested without exposing a
half-baked stream.

---

## 5. Nginx snippet outline (NOT DEPLOYED — Phase 3.1 deploy task)

```nginx
# /etc/nginx/snippets/prisma-conviva-stream.conf  (FUTURE — not yet placed)
location = /prisma/api/conviva-stream {
    limit_except GET { deny all; }
    # NO limit_req — streams hold a single conn for minutes, rate limiting causes
    # spurious 503 on legitimate reconnects. Use limit_conn instead.
    limit_conn  prisma_stream_per_ip 4;

    # CORS scoped to local frontend
    add_header Access-Control-Allow-Origin "https://iptv-ape.duckdns.org" always;
    add_header Cache-Control "no-cache, no-store" always;
    add_header X-Accel-Buffering "no" always;

    # SSE requires keepalive + no buffering
    proxy_buffering off;
    proxy_cache off;
    fastcgi_buffering off;
    fastcgi_keep_conn on;
    fastcgi_read_timeout 300s;

    include fastcgi.conf;
    fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    fastcgi_param SCRIPT_FILENAME /var/www/html/prisma/api/conviva-stream.php;
    fastcgi_param SCRIPT_NAME     /prisma/api/conviva-stream.php;
    fastcgi_param PHP_VALUE       "max_execution_time=290\noutput_buffering=0\nzlib.output_compression=Off";
}
```

Plus `limit_conn_zone` in http context:

```nginx
# /etc/nginx/conf.d/prisma-stream-zone.conf  (FUTURE)
limit_conn_zone $binary_remote_addr zone=prisma_stream_per_ip:8m;
```

---

## 6. Browser widget integration (FUTURE Phase 3.2)

`frontend/js/conviva-stream-widget.js` (sketch only):

```js
const es = new EventSource('/prisma/api/conviva-stream?tail=100');
es.addEventListener('conviva', (evt) => {
  const ev = JSON.parse(evt.data);
  ConvivaQoE.observer?.onServerEvent?.(ev);
});
es.addEventListener('error', () => {
  // EventSource auto-reconnects; only log
  console.warn('[conviva-stream] reconnecting...');
});
```

---

## 7. Compliance gates (Phase 3 audit checklist)

| Gate | Phase 3 stub | Phase 3.1 deploy |
|---|---|---|
| 1 — CABLEADO | N/A (returns 501) | Endpoint reachable + JS widget consumes events |
| 2 — BENEFICIO | Reserves URI path; no broken commitments | Live dashboard without polling |
| 3 — SANDBOX | Local file only; no VPS touch | Snippet + zone additive; rollback by removing include |
| 4 — EXCEPCIONAL | Stub explicit about 501 to avoid silent half-work | Auto-reconnect + keepalive + filters + bounded execution time |

---

## 8. Deferred (Phase 3.1+)

- Replace 100ms poll with inotify FFI (`inotify_add_watch` via PHP FFI) for sub-ms latency.
- Add SQLite fallback path if `/dev/shm` buffer is rotated mid-stream.
- Add per-device subscription via SSE channels.
- Widget UI integration in `frontend/js/conviva-qoe-engine.js`.

---

## 9. References

- ARTIFACT_CONVIVA_ADB_PUSH_DESIGN.md — Phase 1 + 2 architecture
- vps/prisma/lib/conviva_persistence.php — circular buffer producer
- WHATWG SSE spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
- nginx SSE recipe: https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering
- feedback_autopista_doctrine — passthrough rules respected here
