#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// E5 · GUARD DE VERDAD UHD (doctrina del propietario, sin tocar CODECS)
// ═══════════════════════════════════════════════════════════════════════════
// Qué garantiza (y qué NO)
//   SÍ: que la METADATA UHD del plano /cdn/ siga siendo sostenible —
//       · CODECS byte a byte intacto (GOLDEN RULE hvc1/hev1, FZ-01)
//       · 8K declarado SOLO si la fuente es >=4K
//       · 8K declarado SOLO con nivel >= L183 (Ley Cardinal 1: L153 = techo 4K@60)
//       · VIDEO-RANGE=PQ sin duplicar, marca #EXT-X-APE-UPSCALE coherente
//       · el VPS no reempaqueta video (no inventa EXT-X-MAP / .m4s / EXT-X-PART)
//       · lo servido es texto (manifiesto), nunca bytes de video
//   NO: no mide pixeles, no ejecuta ffmpeg, no cambia nada, no despliega.
//
// Entradas
//   cases/latest.json (o --cases <ruta>) — salida de capture_uhd.mjs, con:
//     · pairs[]      : cuerpo FUENTE (disco del VPS) vs cuerpo SERVIDO (/cdn/)
//     · lua_matrix[] : matriz del modulo ape_uhd.lua desplegado (riesgo latente)
//
// Salidas
//   texto legible por defecto; --json emite el informe estructurado.
//   exit 0 = PASS / PASS_WITH_DECLARED_RISK
//   exit 1 = algun check `blocker` falla (o `high`/`info` con --strict)
//   exit 2 = error de uso / entrada invalida
//
// Uso
//   node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs
//   node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs --strict --json
//   node _vps_stage/edge/uhd/uhd_doctrine_guard.mjs --selftest
// ═══════════════════════════════════════════════════════════════════════════
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(n);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const STRICT = argv.includes("--strict");
const JSONOUT = argv.includes("--json");
const SELFTEST = argv.includes("--selftest");
const CASES = arg("--cases", path.join(HERE, "cases", "latest.json"));

// ═══ tablas de nivel (ISO/IEC 14496-10 §A.3 · ITU-T H.265 §A.4) ════════════
// HEVC: level_idc -> tamano maximo de imagen (luma samples)
const HEVC_MAX_PX = {
  30: 36864, 60: 122880, 63: 245760, 90: 552960, 93: 983040,
  120: 2228224, 123: 2228224, 150: 8912896, 153: 8912896, 156: 8912896,
  180: 35651584, 183: 35651584, 186: 35651584,
};
// AVC: level_idc decimal -> MaxFS en macrobloques; px = MB * 256
const AVC_MAX_MB = {
  10: 99, 11: 396, 12: 396, 13: 396, 20: 396, 21: 792, 22: 1620,
  30: 1620, 31: 3600, 32: 5120, 40: 8192, 41: 8192, 42: 8704,
  50: 22080, 51: 36864, 52: 36864, 60: 139264, 61: 139264, 62: 139264,
};
const HEVC_LEVEL_FOR_8K = 183; // Level 6.1 — unico nivel que sostiene 8K
const PQ_VALUES = new Set(["PQ", "HLG"]);

// ═══ catálogo de checks ═══════════════════════════════════════════════════
const CHECKS = [
  { id: "UHD-01", name: "CODECS inmutable (GOLDEN RULE / FZ-01)", severity: "blocker", suite: "live" },
  { id: "UHD-02", name: "sin hev1 dentro de EXT-X-STREAM-INF", severity: "blocker", suite: "live" },
  { id: "UHD-03", name: "8K declarado solo si la fuente es >=4K", severity: "blocker", suite: "live" },
  { id: "UHD-04", name: "marca #EXT-X-APE-UPSCALE coherente y unica", severity: "high", suite: "live" },
  { id: "UHD-05", name: "VIDEO-RANGE=PQ sin duplicar ni inventar", severity: "high", suite: "live" },
  { id: "UHD-06", name: "el VPS no reempaqueta video (MAP/m4s/PART)", severity: "blocker", suite: "live" },
  { id: "UHD-07", name: "lo servido es manifiesto (texto), no video", severity: "blocker", suite: "live" },
  { id: "UHD-08", name: "nivel >= capacidad de la resolucion declarada (4K)", severity: "info", suite: "live" },
  { id: "UHD-09", name: "8K declarado exige nivel >= L183 (Ley Cardinal 1)", severity: "blocker", suite: "live" },
  { id: "UHD-10", name: "flag uhd8k no declara 8K sobre fuente <4K", severity: "high", suite: "latent" },
  { id: "UHD-11", name: "flag uhd8k no declara 8K con nivel <L183", severity: "high", suite: "latent" },
  { id: "UHD-12", name: "flag uhd_pq enciende exactamente un PQ", severity: "info", suite: "latent" },
];
const byId = (id) => CHECKS.find((c) => c.id === id);

// ═══ parseo de manifiestos ═════════════════════════════════════════════════
const AUDIO = /^(mp4a|ac-3|ec-3|opus|flac|alac|mp3)/i;

function parseAttrs(s) {
  const out = {};
  const re = /([A-Za-z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let m;
  while ((m = re.exec(s)) !== null) out[m[1]] = m[3] !== undefined ? m[3] : m[2];
  return out;
}

function parseMaster(body) {
  const text = String(body ?? "");
  const lines = text.split(/\r?\n/);
  const variants = [];
  const markers = [];
  for (const line of lines) {
    if (line.startsWith("#EXT-X-APE-UPSCALE:")) {
      markers.push(line);
      continue;
    }
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const attrs = parseAttrs(line.slice(line.indexOf(":") + 1));
    const res = /^(\d+)x(\d+)$/.exec(attrs.RESOLUTION || "");
    const codecs = (attrs.CODECS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const video = codecs.find((c) => !AUDIO.test(c)) || null;
    variants.push({
      raw: line,
      resolution: attrs.RESOLUTION || null,
      width: res ? Number(res[1]) : null,
      height: res ? Number(res[2]) : null,
      codecs: attrs.CODECS || null,
      codec_list: codecs,
      video_codec: video,
      video_range: attrs["VIDEO-RANGE"] || null,
      pq_in_line: (line.match(/VIDEO-RANGE=/g) || []).length,
      bandwidth: attrs.BANDWIDTH ? Number(attrs.BANDWIDTH) : null,
    });
  }
  return {
    body: text,
    is_manifest: /^\uFEFF?#EXTM3U/.test(text.trimStart()),
    variants,
    markers,
    marker_count: markers.length,
    marker: markers[0] || null,
    has_map: /#EXT-X-MAP:/.test(text),
    has_m4s: /\.m4s\b/.test(text),
    has_part: /#EXT-X-PART:/.test(text),
    pq_total: (text.match(/VIDEO-RANGE=/g) || []).length,
  };
}

// ═══ nivel declarado -> capacidad en px ════════════════════════════════════
function levelCapacity(codec) {
  if (!codec) return { kind: "none", maxPx: null, level: null };
  let m = /^hvc[1e]\.\d+\.\w+\.L(\d+)/i.exec(codec);
  if (m) {
    const idc = Number(m[1]);
    return { kind: "hevc", level: `L${idc}`, maxPx: HEVC_MAX_PX[idc] ?? null };
  }
  m = /^avc[13]\.([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(codec);
  if (m) {
    const idc = parseInt(m[3], 16);
    const mb = AVC_MAX_MB[idc];
    return { kind: "avc", level: `L${idc}`, maxPx: mb ? mb * 256 : null };
  }
  if (/^av01\./i.test(codec)) return { kind: "av1", level: null, maxPx: null };
  if (/^vvc1\.|^vvi1\./i.test(codec)) return { kind: "vvc", level: null, maxPx: null };
  return { kind: "other", level: null, maxPx: null };
}

// ═══ evaluación de un par fuente→servido (suite live) ══════════════════════
function evalPair(pair) {
  const src = parseMaster(pair.source_body);
  const srv = parseMaster(pair.served_body);
  const results = [];
  const push = (id, ok, detail) => results.push({ id, ok, detail, severity: byId(id).severity });

  // UHD-01 · CODECS inmutable, variante por variante
  {
    const a = src.variants.map((v) => v.codecs);
    const b = srv.variants.map((v) => v.codecs);
    const same = a.length === b.length && a.every((x, i) => x === b[i]);
    push("UHD-01", same,
      same ? `${a.length} variante(s), CODECS identico`
           : `fuente=${JSON.stringify(a)} servido=${JSON.stringify(b)}`);
  }

  // UHD-02 · GOLDEN RULE en lo servido
  {
    const bad = srv.variants.filter((v) => v.codec_list.some((c) => /^hev1/i.test(c)));
    push("UHD-02", bad.length === 0,
      bad.length ? `${bad.length} variante(s) con hev1 en STREAM-INF` : "0 hev1 en STREAM-INF");
  }

  // UHD-03 · 8K solo con fuente >= 4K
  {
    const srv8k = srv.variants.filter((v) => v.width >= 7680);
    const srcMaxW = Math.max(0, ...src.variants.map((v) => v.width || 0));
    const ok = srv8k.length === 0 || srcMaxW >= 3840;
    push("UHD-03", ok, srv8k.length === 0
      ? `sin 8K declarado (fuente max ${srcMaxW}px)`
      : `8K declarado; fuente max ${srcMaxW}px -> ${ok ? "permitido" : "PROHIBIDO"}`);
  }

  // UHD-04 · marca coherente con el cambio real
  {
    const changed = src.variants.some((v, i) => srv.variants[i] && v.resolution !== srv.variants[i].resolution);
    const topSrv = srv.variants[0]?.resolution || "";
    if (!changed) {
      push("UHD-04", srv.marker_count === 0,
        srv.marker_count === 0 ? "sin cambios: sin marca (ok)" : `marca sin cambio: ${srv.marker}`);
    } else {
      const declared = /declared=(\d+x\d+)/.exec(srv.marker || "");
      const ok = srv.marker_count === 1 && declared && declared[1] === topSrv;
      push("UHD-04", !!ok, `marca=${JSON.stringify(srv.marker)} top_servido=${topSrv}`);
    }
  }

  // UHD-05 · PQ una vez por variante, sin inventar y sin perder el de la fuente
  {
    const dup = srv.variants.filter((v) => v.pq_in_line > 1);
    const invalid = srv.variants.filter((v) => v.video_range && !PQ_VALUES.has(v.video_range));
    const lost = src.variants.some((v, i) => v.video_range && srv.variants[i] && !srv.variants[i].video_range);
    const ok = dup.length === 0 && invalid.length === 0 && !lost;
    push("UHD-05", ok,
      `dup=${dup.length} valores_invalidos=${invalid.length} perdido=${lost ? 1 : 0} pq_total_servido=${srv.pq_total}`);
  }

  // UHD-06 · sin reempaquetado (no inventar MAP / .m4s / PART)
  {
    const addMap = srv.has_map && !src.has_map;
    const addM4s = srv.has_m4s && !src.has_m4s;
    const addPart = srv.has_part && !src.has_part;
    push("UHD-06", !(addMap || addM4s || addPart),
      `map+=${addMap} m4s+=${addM4s} part+=${addPart}`);
  }

  // UHD-07 · lo servido es texto
  push("UHD-07", srv.is_manifest,
    srv.is_manifest ? "empieza por #EXTM3U" : "NO es manifiesto (posible video)");

  // UHD-08 · nivel >= capacidad (solo declaraciones 4K: riesgo aceptado por el propietario)
  {
    const bad = [];
    for (const [i, v] of srv.variants.entries()) {
      if (!v.width || !v.height || !v.video_codec) continue;
      if (v.width >= 7680) continue; // 8K lo cubre UHD-09
      const cap = levelCapacity(v.video_codec);
      if (cap.maxPx === null) continue;
      const px = v.width * v.height;
      if (px > cap.maxPx) bad.push(`#${i + 1} ${v.resolution}@${v.video_codec} (max ${cap.maxPx}px)`);
    }
    push("UHD-08", bad.length === 0,
      bad.length ? `declarativo 4K por encima del nivel: ${bad.join(" · ")}` : "todas las variantes 4K caben en su nivel");
  }

  // UHD-09 · 8K exige nivel >= L183 (Ley Cardinal 1 · techo L153 = 4K@60)
  {
    const bad = [];
    for (const [i, v] of srv.variants.entries()) {
      if (!v.width || v.width < 7680 || !v.video_codec) continue;
      const cap = levelCapacity(v.video_codec);
      const lv = /L(\d+)/.exec(v.video_codec);
      const idc = lv ? Number(lv[1]) : null;
      if (cap.kind !== "hevc" || idc === null || idc < HEVC_LEVEL_FOR_8K) {
        bad.push(`#${i + 1} ${v.resolution}@${v.video_codec}`);
      }
    }
    push("UHD-09", bad.length === 0,
      bad.length
        ? `${bad.length} variante(s) declaran 8K con nivel insuficiente: ${bad.join(" · ")}`
        : "todo 8K declarado lleva nivel >= L183");
  }

  return { id: pair.id, results, src, srv };
}

// ═══ evaluación latente: matriz del modulo desplegado (suite latent) ════════
function evalMatrix(rows) {
  const tops = new Map(rows.filter((r) => r.kind === "top").map((r) => [r.case, Number(r.value)]));
  const cases = rows.filter((r) => r.kind === "case");
  const out = [];

  // UHD-10 · ninguna fila declara 8K si el top de la fuente es < 3840
  {
    const bad = cases.filter((r) => /7680x4320/.test(r.resolutions) && !(tops.get(r.case) >= 3840));
    out.push({
      id: "UHD-10",
      severity: byId("UHD-10").severity,
      ok: bad.length === 0,
      detail: bad.length
        ? bad.map((r) => `${r.case}/${r.variant}: 8K con top=${tops.get(r.case) ?? "?"}px`).join(" · ")
        : "ninguna fila declara 8K sobre fuente <4K",
    });
  }

  // UHD-11 · si declara 8K, el nivel del codec debe ser >= L183
  {
    const bad = cases.filter((r) => {
      if (!/7680x4320/.test(r.resolutions)) return false;
      const lv = /L(\d+)/.exec(r.codecs || "");
      return !lv || Number(lv[1]) < HEVC_LEVEL_FOR_8K;
    });
    out.push({
      id: "UHD-11",
      severity: byId("UHD-11").severity,
      ok: bad.length === 0,
      detail: bad.length
        ? bad.map((r) => `${r.case}/${r.variant}: 8K con ${r.codecs}`).join(" · ")
        : "todo 8K declarado lleva nivel >= L183",
    });
  }

  // UHD-12 · el flag uhd_pq enciende exactamente un PQ y no toca el resto
  {
    const withPq = cases.filter((r) => r.variant.includes("+pq"));
    const base = cases.filter((r) => r.variant === "declare_auto");
    const bad = withPq.filter((r) => r.pq_count !== 1).length + base.filter((r) => r.pq_count !== 0).length;
    out.push({
      id: "UHD-12",
      severity: byId("UHD-12").severity,
      ok: bad === 0,
      detail: bad === 0
        ? `+pq=${withPq.length} fila(s) con 1 PQ · base=${base.length} fila(s) con 0`
        : `${bad} fila(s) con conteo PQ inesperado`,
    });
  }

  return out;
}

// ═══ informe ═══════════════════════════════════════════════════════════════
function report(live, latent) {
  const all = [
    ...live.flatMap((p) => p.results.map((r) => ({ ...r, pair: p.id }))),
    ...latent.map((r) => ({ ...r, pair: "lua_matrix" })),
  ];
  const blockers = all.filter((r) => !r.ok && r.severity === "blocker");
  const highs = all.filter((r) => !r.ok && r.severity === "high");
  const infos = all.filter((r) => !r.ok && r.severity === "info");
  const verdict = blockers.length ? "FAIL" : highs.length ? "PASS_WITH_DECLARED_RISK" : "PASS";
  return { verdict, blockers, highs, infos, all };
}

function printHuman(doc, rep) {
  const o = [];
  o.push(`E5 · GUARD UHD — captura: ${doc.label || "?"}  (${doc.captured_at || "?"})`);
  if (doc.meta) {
    o.push(`   VPS ${doc.meta.host || "?"} · nginx -T ${String(doc.meta.nginx_T_sha256 || "").slice(0, 16)}… · flags uhd=${JSON.stringify({
      uhd_auto: doc.meta.flags_json?.uhd_auto, uhd4k: doc.meta.flags_json?.uhd4k,
      uhd8k: doc.meta.flags_json?.uhd8k, uhd_pq: doc.meta.flags_json?.uhd_pq,
    })}`);
  }
  o.push("");
  const order = ["UHD-01", "UHD-02", "UHD-03", "UHD-04", "UHD-05", "UHD-06", "UHD-07", "UHD-08", "UHD-09"];
  for (const id of order) {
    const rows = rep.all.filter((r) => r.id === id);
    if (!rows.length) continue;
    o.push(`${id} · ${byId(id).name}`);
    for (const r of rows) o.push(`   ${r.ok ? "ok  " : "FAIL"} ${String(r.pair).padEnd(26)} ${r.detail}`);
  }
  o.push("");
  o.push("UHD-10..12 · latente (matriz del módulo ape_uhd.lua desplegado)");
  for (const r of rep.all.filter((x) => /^UHD-(10|11|12)$/.test(x.id))) {
    o.push(`   ${r.ok ? "ok  " : "FAIL"} ${r.id} ${r.detail}`);
  }
  o.push("");
  o.push(`VEREDICTO: ${rep.verdict}   blocker=${rep.blockers.length} high=${rep.highs.length} info=${rep.infos.length}`);
  if (rep.blockers.length) {
    o.push("");
    o.push("BLOCKERS (declaración insostenible — familia FZ-01):");
    for (const r of rep.blockers) o.push(`  · ${r.id} ${r.pair}: ${r.detail}`);
  }
  if (rep.highs.length) {
    o.push("");
    o.push("Riesgos declarados / latentes:");
    for (const r of rep.highs) o.push(`  · ${r.id} ${r.pair}: ${r.detail}`);
  }
  if (rep.infos.length) {
    o.push("");
    o.push("Informativos (decisión del propietario: RESOLUTION declarativa):");
    for (const r of rep.infos) o.push(`  · ${r.id} ${r.pair}: ${r.detail}`);
  }
  console.log(o.join("\n"));
}

// ═══ selftest: sabotajes que el guard DEBE cazar ═══════════════════════════
function selftest(doc) {
  const base = doc.pairs.find((p) => p.id === "master_1080_avc") || doc.pairs[0];
  const base4k = doc.pairs.find((p) => p.id === "master_4k_hevc") || doc.pairs[0];
  if (!base) {
    console.error("selftest: la captura no trae pares");
    process.exit(2);
  }
  const clone = (p) => JSON.parse(JSON.stringify(p));
  const cases = [
    {
      id: "S1_codecs_mutado", expect: "UHD-01",
      pair: (() => { const p = clone(base); p.served_body = p.served_body.replace(/CODECS="avc1\.640028/, 'CODECS="hvc1.2.4.L153.B0'); return p; })(),
    },
    {
      id: "S2_hev1_en_stream_inf", expect: "UHD-02",
      pair: (() => { const p = clone(base4k); p.served_body = p.served_body.replace("hvc1.2.4.L153.B0", "hev1.2.4.L153.B0"); return p; })(),
    },
    {
      id: "S3_8k_sobre_fuente_1080", expect: "UHD-03",
      pair: (() => { const p = clone(base); p.served_body = p.served_body.replace("RESOLUTION=3840x2160", "RESOLUTION=7680x4320"); return p; })(),
    },
    {
      id: "S4_pq_duplicado", expect: "UHD-05",
      pair: (() => { const p = clone(base4k); p.served_body = p.served_body.replace(/,VIDEO-RANGE=PQ/g, ",VIDEO-RANGE=PQ,VIDEO-RANGE=PQ"); return p; })(),
    },
    {
      id: "S5_repack_cmaf_inventado", expect: "UHD-06",
      pair: (() => { const p = clone(base4k); p.served_body = p.served_body.replace("#EXTM3U\n", '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n'); return p; })(),
    },
    {
      id: "S6_binario_servido", expect: "UHD-07",
      pair: (() => { const p = clone(base4k); p.served_body = "\u0000\u0000garbage-bytes"; return p; })(),
    },
    {
      id: "S7_8k_con_L153", expect: "UHD-09",
      // [t35] Sabotaje REAL: fuerza 8K sobre un cuerpo con L153. Antes era un
      // `replace("L153","L153")` no-op que sólo acertaba mientras la captura
      // base fuese la PRE-fix (que ya declaraba 7680x4320 por el bug E5-F4);
      // al promoverse una captura post-fix el control se apagaba en silencio.
      pair: (() => {
        const p = clone(base4k);
        p.served_body = p.served_body.replace(/RESOLUTION=\d+x\d+/, "RESOLUTION=7680x4320");
        return p;
      })(),
    },
  ];

  let bad = 0;
  console.log("E5 · SELFTEST del guard (cada sabotaje debe hacer fallar su check)");
  for (const c of cases) {
    const res = evalPair(c.pair);
    const hit = res.results.find((r) => r.id === c.expect && !r.ok);
    if (!hit) bad++;
    console.log(`  ${hit ? "ok  " : "FAIL"} ${c.id.padEnd(26)} esperado ${c.expect} -> ${hit ? String(hit.detail).slice(0, 92) : "NO DETECTADO"}`);
  }
  // control negativo: los pares REALES no deben tener blockers... salvo el hallazgo
  // de 8K con L153, que es el defecto vivo que este guard existe para señalar.
  const live = doc.pairs.map(evalPair);
  const known = new Set(["UHD-09"]);
  const unexpected = report(live, evalMatrix(doc.lua_matrix || [])).blockers.filter((b) => !known.has(b.id));
  const controlOk = unexpected.length === 0;
  if (!controlOk) bad++;
  console.log(`  ${controlOk ? "ok  " : "FAIL"} ${"control_negativo".padEnd(26)} sin blockers inesperados -> ${unexpected.map((x) => x.id + "@" + x.pair).join(",") || "ninguno"}`);
  console.log(`\nSELFTEST: ${bad === 0 ? "PASS" : "FAIL"} (${cases.length + 1 - bad}/${cases.length + 1})`);
  process.exit(bad === 0 ? 0 : 1);
}

// ═══ main ═════════════════════════════════════════════════════════════════
if (!fs.existsSync(CASES)) {
  console.error(`FATAL: no existe la captura ${CASES}\n  genera una con: node _vps_stage/edge/uhd/capture_uhd.mjs`);
  process.exit(2);
}
const doc = JSON.parse(fs.readFileSync(CASES, "utf8"));
if (!Array.isArray(doc.pairs) || doc.pairs.length === 0) {
  console.error("FATAL: la captura no trae pairs[]");
  process.exit(2);
}
try {
  doc.meta.flags_json = doc.meta && doc.meta.flags ? JSON.parse(doc.meta.flags) : null;
} catch { /* flags no parseables: se ignora */ }

if (SELFTEST) selftest(doc);

const live = doc.pairs.map(evalPair);
const latent = evalMatrix(doc.lua_matrix || []);
const rep = report(live, latent);

if (JSONOUT) {
  console.log(JSON.stringify({
    schema: "e5.uhd.guard/1",
    cases: CASES,
    label: doc.label || null,
    captured_at: doc.captured_at || null,
    meta: doc.meta || {},
    checks: CHECKS,
    verdict: rep.verdict,
    counts: { blockers: rep.blockers.length, high: rep.highs.length, info: rep.infos.length },
    results: rep.all,
  }, null, 2));
} else {
  printHuman(doc, rep);
}

const fail = rep.blockers.length > 0 || (STRICT && (rep.highs.length > 0 || rep.infos.length > 0));
process.exit(fail ? 1 : 0);
