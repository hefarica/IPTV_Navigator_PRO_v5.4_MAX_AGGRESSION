#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// E5 · UHD — CAPTURA READ-ONLY del plano de metadata (fixtures + módulo UHD)
// ═══════════════════════════════════════════════════════════════════════════
// Qué hace
//   1. Viaja al VPS por SSH y ejecuta SOLO lecturas:
//        · hashes de la config viva y de los módulos Lua
//        · `nginx -T | sha256sum`, valores de los flags, capacidades del host
//        · para cada fixture: el cuerpo FUENTE (en disco) y el cuerpo SERVIDO
//          por el gateway (/cdn/127.0.0.1:8088/...), más las cabeceras crudas
//        · la matriz del módulo desplegado `ape_uhd.lua` ejecutada con lua5.1
//          (funciones puras: sin ngx, sin red, sin escrituras)
//   2. Escribe `cases/<STAMP>.json` (evidencia estructurada, sin credenciales)
//      y `runs/<STAMP>/capture.log` (texto crudo).
//
// Qué NO hace
//   · No escribe NADA en el VPS (ni ficheros, ni flags, ni config, ni reload).
//   · No cambia flags: lee /_ape/flags (GET) y nada más.
//   · No toca /var/www/lists, ni gzip_static/gunzip, ni la regla .ts→404.
//   · No persiste credenciales: las fixtures son locales del VPS (loopback).
//
// Uso
//   node _vps_stage/edge/uhd/capture_uhd.mjs [--label "E5"] [--ssh hetzner-iptv]
//                                            [--public-probes] [--out <dir>]
//   --public-probes  añade 2 sondas GET al plano público 443 (solo lectura).
//                    Se ejecutan desde ESTA máquina, no desde el VPS.
//
// Salida: exit 0 si la captura es coherente; 1 si falla el SSH o falta un campo.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── argumentos ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, def = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
};
const LABEL = arg("--label", "E5-UHD");
const SSH = arg("--ssh", "hetzner-iptv");
const OUT = arg("--out", path.join(HERE, "cases"));
const PUBLIC_PROBES = argv.includes("--public-probes");
// [t35] `latest.json` es el insumo POR DEFECTO del guard y del selftest. Una
// captura nueva NO debe pisarlo: si se promueve una captura POST-fix, el
// selftest pierde su base pre-fix y algunos controles dejan de morder. Se
// escribe sólo con --promote (decisión explícita de quien certifica).
const PROMOTE = argv.includes("--promote");
// [t35] Host que se le pasa a /cdn/ para pedir los fixtures. DEBE ser una IP
// pública (la del propio VPS): el guard SSRF de ape_gateway.lua bloquea rangos
// privados con 403 private_range_blocked, así que /cdn/127.0.0.1:8088 no puede
// servir cuerpos. Con la IP pública el guard no se toca y el fetch es hairpin.
// Vacío ⇒ se descubre en el VPS con `ip -4 -o addr show scope global`.
const CDN_HOST = arg("--cdn-host", "");
const STAMP = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");

// ── fixtures: id | fichero fuente en el VPS | ruta del fixture en 8088 ─────
const FIXTURES = [
  { id: "master_1080_avc", src: "playlist_master.m3u8", fixture: "/__fixture_master.m3u8" },
  { id: "master_4k_hevc", src: "playlist_master4k.m3u8", fixture: "/__fixture_master4k.m3u8" },
  { id: "media_ll_parts", src: "playlist_ll.m3u8", fixture: "/__fixture_ll.m3u8" },
  { id: "media_hybrid_stream_inf", src: "playlist.m3u8", fixture: "/__fixture.m3u8" },
];

// ── programa Lua: matriz del módulo DESPLEGADO (puro, sin ngx) ────────────
const LUA_MATRIX = String.raw`
package.path = "/etc/nginx/lua/?.lua;" .. package.path
local uhd = require "ape_uhd"

local function count_plain(s, sub)
  local n, i = 0, 1
  while true do
    local a, b = s:find(sub, i, true)
    if not a then break end
    n = n + 1; i = b + 1
  end
  return n
end
local function si_lines(b)
  local t = {}
  for l in b:gmatch("[^\r\n]+") do
    if l:find("#EXT-X-STREAM-INF", 1, true) then t[#t+1] = l end
  end
  return t
end
local function res_list(b)
  local t = {}
  for l in b:gmatch("[^\r\n]+") do
    local w, h = l:match("RESOLUTION=(%d+)x(%d+)")
    if w then t[#t+1] = w .. "x" .. h end
  end
  return table.concat(t, " ; ")
end
local function codecs_list(b)
  local t = {}
  for l in b:gmatch("[^\r\n]+") do
    local c = l:match('CODECS="([^"]*)"')
    if c then t[#t+1] = c end
  end
  return table.concat(t, " ; ")
end

local function master(...)
  local lines = { "#EXTM3U" }
  for _, v in ipairs({ ... }) do lines[#lines+1] = v end
  return table.concat(lines, "\n") .. "\n"
end

-- M1: master 1080p AVC (dos variantes)
local M1 = master(
  '#EXT-X-STREAM-INF:BANDWIDTH=5000000,AVERAGE-BANDWIDTH=4000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.640028,mp4a.40.2"',
  "1080p/index.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1280x720,FRAME-RATE=60.000,CODECS="avc1.64001f,mp4a.40.2"',
  "720p/index.m3u8")

-- M2: master 4K HEVC L153 (dos variantes)
local M2 = master(
  '#EXT-X-STREAM-INF:BANDWIDTH=28000000,AVERAGE-BANDWIDTH=22000000,RESOLUTION=3840x2160,FRAME-RATE=60.000,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"',
  "2160p/index.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=9000000,AVERAGE-BANDWIDTH=6500000,RESOLUTION=1920x1080,CODECS="hvc1.1.6.L123.B0,mp4a.40.2"',
  "1080p/index.m3u8")

-- M3: la fuente ya declara 8K pero con L153 (nivel por debajo de la resolución)
local M3 = master(
  '#EXT-X-STREAM-INF:BANDWIDTH=80000000,RESOLUTION=7680x4320,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"',
  "4320p/index.m3u8")

-- M4: 8K declarado CON nivel 6.1 (L183) — único caso legal para 8K
local M4 = master(
  '#EXT-X-STREAM-INF:BANDWIDTH=80000000,RESOLUTION=7680x4320,CODECS="hvc1.2.4.L183.B0,mp4a.40.2"',
  "4320p/index.m3u8")

-- M5: master ascendente (720p primero, 4K después) → top(documento) < 4K
local M5 = master(
  '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1280x720,CODECS="hvc1.1.6.L93.B0,mp4a.40.2"',
  "720p/index.m3u8",
  '#EXT-X-STREAM-INF:BANDWIDTH=28000000,RESOLUTION=3840x2160,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"',
  "2160p/index.m3u8")

-- M6: hev1 en STREAM-INF (GOLDEN RULE rota en origen; la guarda vive en el gateway)
local M6 = master(
  '#EXT-X-STREAM-INF:BANDWIDTH=28000000,RESOLUTION=3840x2160,CODECS="hev1.2.4.L153.B0,mp4a.40.2"',
  "2160p/index.m3u8")

-- M7: media playlist (no master)
local M7 = "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.000,\nseg0.ts\n"

local CASES = {
  { n = "M1_master1080",  b = M1 },
  { n = "M2_master4k",    b = M2 },
  { n = "M3_8k_L153",     b = M3 },
  { n = "M4_8k_L183",     b = M4 },
  { n = "M5_ascendente",  b = M5 },
  { n = "M6_hev1",        b = M6 },
  { n = "M7_media",       b = M7 },
}

-- emit(id, variante_de_flag, cuerpo_resultante, n_tocados, modo, extra)
local function emit(id, variant, gotBody, n, m, extra)
  print(string.format("CASE|%s|%s|n=%d|mode=%s|res=%s|codecs=%s|pq=%d|tags=%d|truth=%d|%s",
    id, variant, n, tostring(m),
    res_list(gotBody), codecs_list(gotBody),
    count_plain(gotBody, "VIDEO-RANGE="),
    count_plain(gotBody, "#EXT-X-APE-UPSCALE:"),
    uhd.codec_truth_fields(gotBody),
    extra or ""))
end

-- Variante A: declare_auto() = la ruta viva por defecto (uhd_auto=1, uhd_pq=0)
for _, c in ipairs(CASES) do
  local out, n, m = uhd.declare_auto(c.b, {})
  emit(c.n, "declare_auto", out, n, m, "")
  print(string.format("TOP|%s|top_resolution=%s", c.n, tostring(uhd.top_resolution(c.b))))
end

-- Variante B: add_pq=true  (flag uhd_pq=1)
for _, c in ipairs({ CASES[1], CASES[2] }) do
  local out, n, m = uhd.declare_auto(c.b, { add_pq = true })
  emit(c.n, "declare_auto+pq", out, n, m, "")
end

-- Variante C: uhd8k=1 forzado (declare target=8K) — ¿respeta la fuente?
for _, c in ipairs({ CASES[1], CASES[2] }) do
  local out, n = uhd.declare(c.b, { target = uhd.TARGET_8K, mode = "8k", add_pq = true, only_top = true })
  emit(c.n, "declare_8k_forzado", out, n, "8k", "")
end

-- Variante D: uhd4k=1 forzado (declare target=4K) — techo 4K sobre fuente 4K
for _, c in ipairs({ CASES[1], CASES[2] }) do
  local out, n = uhd.declare(c.b, { target = uhd.TARGET_4K, mode = "4k", add_pq = false, only_top = true })
  emit(c.n, "declare_4k_forzado", out, n, "4k", "")
end
`;

// ── script remoto (solo lectura) ──────────────────────────────────────────
const remoteScript = () => `
set -u
export LC_ALL=C
# ── [t35] host de fixtures para /cdn/ ────────────────────────────────────────
# El guard SSRF sólo bloquea rangos privados/reservados; una IP pública pasa.
# Se usa la IP pública del propio VPS (hairpin a :8088) para que /cdn/ ejerza
# el pipeline real (gateway + UHD) sin tocar el guard y sin abrir nada nuevo:
# :8088 no es alcanzable desde Internet (medido: 000 desde estación externa).
CDN_HOST='${CDN_HOST}'
if [ -z "$CDN_HOST" ]; then
  CDN_HOST=$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1)
fi
if [ -z "$CDN_HOST" ]; then
  echo "FATAL|cdn_host_vacio"; exit 3
fi
echo "META|cdn_host=$CDN_HOST"
echo "META|cdn_mode=hairpin_public_ip:8088"
echo "META|host=$(hostname)"
echo "META|date_utc=$(date -u +%FT%TZ)"
echo "META|nginx_v=$(nginx -v 2>&1 | tr -d '\\n')"
echo "META|nginx_T_sha256=$(nginx -T 2>/dev/null | sha256sum | cut -d' ' -f1)"
echo "META|flags=$(curl -s -m 5 http://127.0.0.1:8088/_ape/flags | tr -d '\\n')"
echo "META|arpc=$(nproc)"
echo "META|mem_mb=$(free -m | awk 'NR==2{print $2}')"
echo "META|ffmpeg_bin=$(command -v ffmpeg || echo absent)"
echo "META|ffmpeg_procs=$(ps -eo args --no-headers | grep -c '[f]fmpeg')"
echo "META|exec_popen_modules=$(grep -rlE 'os\\.execute|io\\.popen' /etc/nginx/lua/ 2>/dev/null | tr '\\n' ',')"
echo "META|systemd_ffmpeg=$(grep -rlE 'ffmpeg|avconv|transcode' /etc/systemd/system /etc/cron.d /etc/crontab 2>/dev/null | tr '\\n' ',')"
echo "META|video_404_public=$(grep -c 'return 404' /etc/nginx/sites-enabled/default)"
echo "META|mainpid=$(systemctl show nginx -p MainPID --value)"
echo "META|nrestarts=$(systemctl show nginx -p NRestarts --value)"
for f in ape_gateway.lua ape_uhd.lua ape_rebase_lib.lua ape_obs.lua; do
  echo "MODULE|$f|$(sha256sum /etc/nginx/lua/$f | cut -d' ' -f1)|$(stat -c%s /etc/nginx/lua/$f)"
done
${FIXTURES.map(
  (f) => `
echo "SRC_B64|${f.id}|$(base64 -w0 /etc/nginx/ape-selftest/${f.src})"
echo "SRV_HDR_B64|${f.id}|$(curl -s -m 10 -D - -o /dev/null "http://127.0.0.1:8088/cdn/$CDN_HOST:8088${f.fixture}" | base64 -w0)"
echo "SRV_B64|${f.id}|$(curl -s -m 10 "http://127.0.0.1:8088/cdn/$CDN_HOST:8088${f.fixture}" | base64 -w0)"`
).join("")}
echo "LUA_MATRIX_B64|$(echo '${Buffer.from(LUA_MATRIX, "utf8").toString("base64")}' | base64 -d | lua5.1 - | base64 -w0)"
echo "END|ok"
`;

// ── ejecución ─────────────────────────────────────────────────────────────
const script = remoteScript();
const r = spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", SSH, "bash -s"], {
  input: script,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});

if (r.error) {
  console.error("FATAL: no se pudo ejecutar ssh:", r.error.message);
  process.exit(1);
}
const raw = (r.stdout || "") + (r.stderr ? "\n--- stderr ---\n" + r.stderr : "");
if (r.status !== 0 || !raw.includes("END|ok")) {
  console.error("FATAL: la captura remota no terminó bien (exit=%s)", r.status);
  console.error(raw.slice(0, 4000));
  process.exit(1);
}

const meta = {};
const modules = {};
const pairs = new Map();
let luaMatrix = "";

for (const line of raw.split(/\r?\n/)) {
  const [kind, a, b, c] = line.split("|");
  if (kind === "META") {
    const i = a.indexOf("=");
    if (i > 0) meta[a.slice(0, i)] = a.slice(i + 1);
  } else if (kind === "MODULE") {
    modules[a] = { sha256: b, bytes: Number(c) };
  } else if (kind === "SRC_B64") {
    const p = pairs.get(a) || { id: a };
    p.source_body = Buffer.from(b, "base64").toString("utf8");
    p.source_sha256 = sha256(p.source_body);
    pairs.set(a, p);
  } else if (kind === "SRV_B64") {
    const p = pairs.get(a) || { id: a };
    p.served_path = `/cdn/${meta.cdn_host || "127.0.0.1"}:8088${(FIXTURES.find((f) => f.id === a) || {}).fixture || ""}`;
    p.served_body = Buffer.from(b, "base64").toString("utf8");
    p.served_sha256 = sha256(p.served_body);
    pairs.set(a, p);
  } else if (kind === "SRV_HDR_B64") {
    const p = pairs.get(a) || { id: a };
    p.served_headers_raw = Buffer.from(b, "base64").toString("utf8");
    p.served_headers = parseHeaders(p.served_headers_raw);
    pairs.set(a, p);
  } else if (kind === "LUA_MATRIX_B64") {
    luaMatrix = Buffer.from(a, "base64").toString("utf8");
  }
}

const luaRows = luaMatrix
  .split(/\r?\n/)
  .filter((l) => l.startsWith("CASE|") || l.startsWith("TOP|"))
  .map((l) => {
    const parts = l.split("|");
    const kind = parts.shift();
    if (kind === "TOP") return { kind: "top", case: parts[0], value: String(parts[1]).replace("top_resolution=", "") };
    const [id, variant, nField, modeField, res, codecs, pq, tags, truth] = parts;
    return {
      kind: "case",
      case: id,
      variant,
      n: Number(String(nField).replace("n=", "")),
      uhd_mode: String(modeField).replace("mode=", ""),
      resolutions: String(res).replace("res=", ""),
      codecs: String(codecs).replace("codecs=", ""),
      pq_count: Number(String(pq).replace("pq=", "")),
      upscale_tags: Number(String(tags).replace("tags=", "")),
      codec_truth_fields: Number(String(truth).replace("truth=", "")),
    };
  });

// ── sondas del plano público (opcionales, desde ESTA máquina) ─────────────
const probes = [];
if (PUBLIC_PROBES) {
  const targets = [
    { id: "public_cdn_fixture_master4k", url: "https://iptv-ape.duckdns.org/cdn/127.0.0.1:8088/__fixture_master4k.m3u8" },
    { id: "public_cdn_dot_ts", url: "https://iptv-ape.duckdns.org/cdn/127.0.0.1:8088/nope.ts" },
  ];
  for (const t of targets) {
    try {
      const res = await fetch(t.url, { redirect: "manual", signal: AbortSignal.timeout(20000) });
      const body = await res.text();
      probes.push({
        id: t.id,
        url: t.url.replace(/\/\/[^/]+/, "//<public-host>"),
        status: res.status,
        content_type: res.headers.get("content-type"),
        x_ape: Object.fromEntries([...res.headers].filter(([k]) => k.startsWith("x-ape-"))),
        body_first_line: body.split(/\r?\n/)[0] || "",
        body_bytes: Buffer.byteLength(body),
        body_is_json: /^\s*[\[{]/.test(body),
      });
    } catch (e) {
      probes.push({ id: t.id, url: t.url, error: String(e && e.message) });
    }
  }
}

// ── artefactos ────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const runDir = path.join(HERE, "runs", STAMP);
fs.mkdirSync(runDir, { recursive: true });

const doc = {
  schema: "e5.uhd.capture/1",
  label: LABEL,
  captured_at: new Date().toISOString(),
  captured_by: "uhd-guard",
  read_only: true,
  ssh_host_alias: SSH,
  meta,
  modules,
  pairs: [...pairs.values()].sort((x, y) => x.id.localeCompare(y.id)),
  lua_matrix: luaRows,
  public_probes: probes,
};

const casePath = path.join(OUT, `${STAMP}.json`);
fs.writeFileSync(casePath, JSON.stringify(doc, null, 2) + "\n", "utf8");
if (PROMOTE) {
  fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(doc, null, 2) + "\n", "utf8");
  console.log("  latest.json PROMOVIDO a esta captura");
} else {
  console.log("  latest.json intacto (usa --promote para promoverlo)");
}
fs.writeFileSync(path.join(runDir, "capture.log"), raw + "\n", "utf8");
fs.writeFileSync(
  path.join(runDir, "lua_matrix.txt"),
  luaMatrix + "\n",
  "utf8"
);

console.log(`captura OK  ${casePath}`);
console.log(`  pares=${doc.pairs.length}  filas_lua=${doc.lua_matrix.length}  sondas=${doc.public_probes.length}`);
console.log(`  log=${path.join(runDir, "capture.log")}`);
process.exit(0);

// ── utilidades ────────────────────────────────────────────────────────────
function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
function parseHeaders(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) {
      const k = line.slice(0, i).trim().toLowerCase();
      out[k] = line.slice(i + 1).trim();
    }
  }
  return out;
}
