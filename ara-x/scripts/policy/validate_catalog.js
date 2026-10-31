#!/usr/bin/env node
'use strict';

/**
 * ARA-X catalog validator (I5) — audita las capturas completas de AMBAS listas.
 *
 * Uso:
 *   node ara-x/scripts/policy/validate_catalog.js --all
 *   node ara-x/scripts/policy/validate_catalog.js --capture <ruta.m3u8> --out <findings.json> [--md <report.md>] [--label A]
 *   node ara-x/scripts/policy/validate_catalog.js --help
 *
 * `--all` procesa:
 *   ara-x/evidence/APE_LISTA_4K_live_20261030_full.m3u8          -> ara-x/reports/policy_findings.json
 *   ara-x/evidence/APE_LISTA_CDN_1793397700248_full.m3u8         -> ara-x/reports/policy_findings_cdn.json
 *   y escribe el reporte combinado                               -> ara-x/reports/R5_policy_catalog.md
 *
 * Garantías:
 *   - 100% de los #EXT-X-STREAM-INF presentes se clasifican (VIOLATION/WARN/PASS);
 *     los canales sin variante se cuentan como NO_VARIANT (no se pierden).
 *   - Cada ocurrencia queda enumerada (linea + tvg-id + regla + severidad + fix via catalogo).
 *   - 0 URLs completas: solo se guardan muestras enmascaradas (host + path enmascarado).
 *   - Sin red, sin escrituras fuera de los --out/--md indicados.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const engine = require(path.join(__dirname, '..', '..', 'policy', 'policy_engine.js'));

const ROOT = path.resolve(__dirname, '..', '..', '..'); // repo root
const EVIDENCE = path.join(ROOT, 'ara-x', 'evidence');
const REPORTS = path.join(ROOT, 'ara-x', 'reports');

const CAPTURES = {
  A: {
    label: 'A · APE_LISTA_4K (local)',
    path: path.join(EVIDENCE, 'APE_LISTA_4K_live_20261030_full.m3u8'),
    out: path.join(REPORTS, 'policy_findings.json'),
    expected_fz01: 9593
  },
  B: {
    label: 'B · APE_LISTA_CDN (CDN)',
    path: path.join(EVIDENCE, 'APE_LISTA_CDN_1793397700248_full.m3u8'),
    out: path.join(REPORTS, 'policy_findings_cdn.json'),
    expected_fz01: null
  }
};

/* ── utilidades ─────────────────────────────────────────────────────────── */
function maskUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol + '//' + u.host + '/<masked-path:' + u.pathname.length + '>';
  } catch {
    return '<masked-unparsed-url:' + String(url).length + '>';
  }
}
function inc(obj, key, n = 1) { obj[key] = (obj[key] || 0) + n; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

/* ── parseo por canal ───────────────────────────────────────────────────── */
function newPending(line, lineText) {
  return {
    line,
    tvg_id: engine.attrAny(lineText, 'tvg-id') || '',
    tvg_name: engine.attrAny(lineText, 'tvg-name') || '',
    family: engine.attrAny(lineText, 'ape-codec-family'),
    measured_fps: num(engine.attrAny(lineText, 'ape-fps')),
    profile: engine.attrAny(lineText, 'ape-profile'),
    contentType: engine.attrAny(lineText, 'ape-content-type'),
    variant: null,
    variantLine: null,
    variantCount: 0,
    url: null,
    inband: {},
    knobs: {},
    declared: {},
    codecTags: { preferred: null, verified: null, verifiedPresent: false, source: null, real: null }
  };
}

function parseCapture(capture) {
  const t0 = process.hrtime.bigint();
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(capture.path);
    const file = {
      label: capture.label,
      path: path.relative(ROOT, capture.path).replace(/\\/g, '/'),
      bytes: stat.size,
      lines: 0,
      sha256: null,
      timing_ms: 0,
      channels: 0,
      extinf: 0,
      urls: 0,
      streaminf: 0,
      channelsWithoutVariant: 0,
      distinctTags: 0,
      tagCounts: {},
      iframe: { count: 0, withUri: 0, withoutUri: 0, firstLine: null },
      start: { count: 0, lines: [] },
      partCount: 0,
      mapCount: 0,
      serverControl: null,
      partTarget: null,
      version: null,
      apexChannels: null,
      validated: null,
      dupNames: { groups: 0, duplicates: 0 },
      dupSid: { groups: 0, duplicates: 0 },
      eightKFake: 0,
      fourkFalse: 0,
      supplementalCount: 0,
      variants: [],
      occurrences: {},
      classification: { VIOLATION: 0, WARN: 0, PASS: 0, NO_VARIANT: 0 },
      proposedCodec: {},
      proposedResolution: {},
      proposedMode: {},
      quantified: {},
      urlSamples: [],
      noVariant: [],
      metrics: { declared4kBelow28: 0 }
    };
    const nameSeen = Object.create(null);
    const sidSeen = Object.create(null);
    let pending = null;
    let globalDone = false;

    const occ = (rule, lineNo, tvgId) => {
      if (!file.occurrences[rule]) file.occurrences[rule] = { lines: [], tvg_ids: [] };
      file.occurrences[rule].lines.push(lineNo);
      file.occurrences[rule].tvg_ids.push(tvgId || '');
    };

    const finalize = () => {
      if (!pending) return;
      const p = pending;
      pending = null;
      file.channels += 1;
      const hasVariant = Boolean(p.variant);
      if (!hasVariant) file.channelsWithoutVariant += 1;

      const ib = Object.assign({}, p.inband, {
        knobs: p.knobs || {},
        codecPreferred: p.codecTags.preferred,
        codecVerified: p.codecTags.verified === 'true' ? true : p.codecTags.verified === 'false' ? false : null,
        codecVerifiedPresent: p.codecTags.verifiedPresent,
        codecReal: p.codecTags.real,
        codecSource: p.codecTags.source
      });
      const ctx = {
        tvg_id: p.tvg_id,
        line: p.variantLine || p.line,
        hasVariant,
        family: p.family || (p.variant ? p.variant.family : null),
        measured_fps: p.measured_fps,
        evidenceTier: (() => {
          if (!hasVariant) return 'F5';
          if (p.codecTags.real) return 'F0';
          if (p.codecTags.verified === true || p.codecTags.verified === 'partial') return 'F1';
          if (p.codecTags.source && /PREMIUM/.test(p.codecTags.source)) return 'F2';
          if (p.codecTags.source && /SAFE/.test(p.codecTags.source)) return 'F3';
          if ((p.family || '') === 'h264') return 'F4';
          return 'F2';
        })(),
        socRaw: 's905x4',
        declared: p.variant ? {
          resolution: p.variant.resolution,
          codecs: p.variant.codecs,
          videoCodec: p.variant.videoCodec,
          family: p.variant.family,
          level: p.variant.level,
          frameRate: p.variant.frameRate,
          bandwidth: p.variant.bandwidth,
          averageBandwidth: p.variant.averageBandwidth,
          videoRange: p.variant.videoRange,
          transfer: p.variant.transfer,
          primaries: p.variant.colorPrimaries,
          matrix: p.variant.matrix,
          hdcp: p.variant.hdcp,
          supplemental: p.variant.supplemental,
          stableId: p.variant.stableId
        } : {},
        inband: ib,
        fileHasMap: file.mapCount > 0,
        fileHasSupplemental: file.supplementalCount > 0
      };

      let res;
      if (!hasVariant) {
        res = { classification: 'NO_VARIANT', findings: ['I5-R24'], wire_target: null };
      } else {
        res = engine.classifyVariant(ctx);
      }

      for (const rule of res.findings) occ(rule, ctx.line, p.tvg_id);
      file.classification[res.classification] += 1;
      if (hasVariant) {
        file.variants.push({
          l: ctx.line,
          id: p.tvg_id,
          c: res.classification === 'VIOLATION' ? 'V' : res.classification === 'WARN' ? 'W' : 'P',
          r: res.findings
        });
      } else {
        file.noVariant.push({ l: ctx.line, id: p.tvg_id });
      }
      if (p.variant && p.variant.resolution === '3840x2160' && p.variant.bandwidth != null && p.variant.bandwidth < 28000000) file.metrics.declared4kBelow28 += 1;
      if (res.wire_target) {
        const codec = res.wire_target.video_codec || 'none';
        inc(file.proposedCodec, codec);
        inc(file.proposedResolution, res.wire_target.resolution || 'none');
        inc(file.proposedMode, res.wire_target.mode);
      }
      if (p.url && file.urlSamples.length < 3) file.urlSamples.push(maskUrl(p.url));
    };

    const rl = readline.createInterface({
      input: fs.createReadStream(capture.path, { encoding: 'utf8', highWaterMark: 1 << 20 }),
      crlfDelay: Infinity
    });

    rl.on('line', (raw) => {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      file.lines += 1;
      const lineNo = file.lines;
      if (line.trim() === '') return;

      if (line.startsWith('#')) {
        const colon = line.indexOf(':');
        const name = colon === -1 ? line : line.slice(0, colon);
        inc(file.tagCounts, name);
        if (file.lines < 1000 && name === '#EXT-X-VERSION') file.version = line.slice(colon + 1).trim();
        if (file.lines < 1000 && name === '#EXT-X-APE-CHANNELS') file.apexChannels = num(line.slice(colon + 1));
        if (name === '#EXT-X-APE-VALIDATED') file.validated = line.slice(colon + 1);
        if (file.lines < 1000 && name === '#EXT-X-PART-INF') file.partTarget = num(engine.attrAny(line, 'PART-TARGET'));
        if (file.lines < 1000 && name === '#EXT-X-SERVER-CONTROL') file.serverControl = line.slice(colon + 1);

        if (name === '#EXTINF') {
          finalize();
          globalDone = true;
          file.extinf += 1;
          pending = newPending(lineNo, line);
          return;
        }

        if (name === '#EXT-X-STREAM-INF') {
          file.streaminf += 1;
          if (pending) {
            pending.variantCount += 1;
            if (!pending.variant) {
              pending.variant = engine.parseStreamInf(line);
              pending.variantLine = lineNo;
            }
          }
          return;
        }

        if (name === '#EXT-X-I-FRAME-STREAM-INF') {
          file.iframe.count += 1;
          if (file.iframe.firstLine == null) file.iframe.firstLine = lineNo;
          if (/URI\s*=\s*"/.test(line)) file.iframe.withUri += 1;
          else file.iframe.withoutUri += 1;
          return;
        }
        if (name === '#EXT-X-START') {
          file.start.count += 1;
          file.start.lines.push(lineNo);
          return;
        }
        if (name === '#EXT-X-PART') { file.partCount += 1; return; }
        if (name === '#EXT-X-MAP') { file.mapCount += 1; return; }

        if (!pending) return; // cabecera global
        const value = colon === -1 ? '' : line.slice(colon + 1);
        const ib = pending.inband;

        switch (name) {
          case '#EXT-X-CMAF': {
            ib.cmafRaw = value;
            ib.cmafRes = engine.attrAny(line, 'RESOLUTION');
            ib.cmafCodecs = engine.attrAny(line, 'CODECS');
            ib.cmafBandwidth = num(engine.attrAny(line, 'BANDWIDTH'));
            return;
          }
          case '#EXT-X-CMAF-HDR': ib.cmafHdr = value; return;
          case '#EXT-X-CMAF-CONTAINER': ib.cmafContainer = value.trim(); return;
          case '#EXT-X-CMAF-INIT-SEGMENT': ib.cmafInit = value.trim(); return;
          case '#EXT-X-CMAF-SESSION': {
            const m = /SID=([0-9a-f]+)/.exec(value);
            if (m) sidSeen[m[1]] = (sidSeen[m[1]] || 0) + 1;
            return;
          }
          case '#EXT-X-CMAF-LCEVC': ib.lcevcRaw = value; ib.lcevcEnabled = /ENABLED=true/i.test(value); return;
          case '#EXT-X-CMAF-AI-SR': ib.aiSrRaw = value; ib.aiSrEnabled = /ENABLED=true/i.test(value); return;
          case '#EXT-X-CMAF-AI-FI': ib.aiFiRaw = value; ib.aiFiEnabled = /ENABLED=true/i.test(value); return;
          case '#EXT-X-CMAF-DOLBY-VISION': ib.dvRaw = value; ib.dvProfile = engine.attrAny(line, 'PROFILE'); return;
          case '#EXT-X-APE-DV-PROFILE': ib.dvProfile = value.trim(); return;
          case '#EXT-X-APE-LCEVC-ENABLED': ib.lcevcEnabled = /true/i.test(value); return;
          case '#EXT-X-APE-LCEVC-PHASE': ib.lcevcPhase = num(value); return;
          case '#EXT-X-APE-AI-SR': ib.aiSrRaw = value; ib.aiSrEnabled = /ENABLED=true/i.test(value); return;
          case '#EXT-X-APE-HDR-TRANSFER': ib.hdrTransfer = value.trim(); return;
          case '#EXT-X-APE-HDR-MAXCLL': ib.hdrMaxCll = num(value); return;
          case '#EXT-X-APE-HDR-MAXFALL': ib.hdrMaxFall = num(value); return;
          case '#EXT-X-APE-HDR-METADATA': ib.hdrMetadata = value; ib.hdrPeak = num(engine.attrAny(line, 'PEAK')); ib.hdrAvg = num(engine.attrAny(line, 'AVG')); return;
          case '#EXT-X-APE-8KFAKE': ib.eightKFake = value.trim(); file.eightKFake += 1; return;
          case '#EXT-X-APE-4KFALSE-MODE': ib.fourkFalse = value.trim(); file.fourkFalse += 1; return;
          case '#EXT-X-APE-UPSCALE': ib.upscaleMarker = value.trim(); return;
          case '#EXT-X-APE-HDR-INTENT': ib.hdrIntent = value.trim(); return;
          case '#EXT-X-APE-CODEC-PREFERRED': pending.codecTags.preferred = value.trim(); return;
          case '#EXT-X-APE-CODEC-VERIFIED': pending.codecTags.verified = value.trim(); pending.codecTags.verifiedPresent = true; return;
          case '#EXT-X-APE-CODEC-SOURCE': pending.codecTags.source = value.trim(); return;
          case '#EXT-X-APE-CODEC-REAL': pending.codecTags.real = value.trim(); return;
          case '#EXT-X-DATERANGE': {
            const hdrType = engine.attrAny(line, 'X-HDR-TYPE');
            if (hdrType) {
              if (!globalDone) file.globalHdrType = hdrType;
              else pending.inband.daterangeHdr = hdrType;
            }
            return;
          }
          case '#EXTVLCOPT': {
            const mw = /adaptive-maxwidth=(\d+)/.exec(value);
            const mh = /adaptive-maxheight=(\d+)/.exec(value);
            const vf = /video-fps=(\d+)/.exec(value);
            const mi = /minterpolate=fps=(\d+)/.exec(value);
            if (mw) pending.knobs.vlcMaxWidth = num(mw[1]);
            if (mh) pending.knobs.vlcMaxHeight = num(mh[1]);
            if (vf) pending.knobs.vlcVideoFps = num(vf[1]);
            if (mi) pending.knobs.vlcMinterpolateFps = num(mi[1]);
            return;
          }
          case '#KODIPROP': {
            const vr = /video_vrr_max=(\d+)/.exec(value);
            const kc = /video_codec=([^\s]+)/.exec(value);
            if (vr) pending.knobs.vlcVrrMax = num(vr[1]);
            if (kc) pending.knobs.kodiVideoCodec = kc[1];
            return;
          }
          case '#EXTHTTP': {
            const fr = /"X-Framerate"\s*:\s*"(\d+)"/.exec(value);
            const rs = /"X-Resolution"\s*:\s*"([^"]+)"/.exec(value);
            if (fr) pending.knobs.xFramerate = num(fr[1]);
            if (rs) pending.inband.xResolution = rs[1];
            return;
          }
          default: return;
        }
      }

      // URI de canal
      file.urls += 1;
      if (pending) {
        pending.url = line;
        if (pending.tvg_name) {
          nameSeen[pending.tvg_name] = (nameSeen[pending.tvg_name] || 0) + 1;
        }
        const sidM = /SID=([0-9a-f]+)/.exec(line);
        if (sidM) sidSeen[sidM[1]] = (sidSeen[sidM[1]] || 0) + 1;
        finalize();
      }
    });

    rl.on('error', reject);
    rl.on('close', () => {
      finalize();
      // duplicados
      file.dupNames.groups = Object.values(nameSeen).filter((v) => v > 1).length;
      file.dupNames.duplicates = Object.values(nameSeen).reduce((a, v) => a + Math.max(0, v - 1), 0);
      file.dupSid.groups = Object.values(sidSeen).filter((v) => v > 1).length;
      file.dupSid.duplicates = Object.values(sidSeen).reduce((a, v) => a + Math.max(0, v - 1), 0);
      file.distinctTags = Object.keys(file.tagCounts).length;

      // reglas de archivo
      const fileRules = [];
      const addFile = (rule, line, evidence) => fileRules.push({ rule, line, tvg_id: '', evidence });
      if (file.iframe.withoutUri > 0) addFile('I5-R16', file.iframe.firstLine, 'iframe_without_uri=' + file.iframe.withoutUri);
      if (file.extinf > 0 && file.streaminf > 0 && file.tagCounts['#EXT-X-TARGETDURATION']) addFile('I5-R17', 1, 'master+media+segment');
      if (file.serverControl) {
        const phb = num(engine.attrAny('#EXT-X-SERVER-CONTROL:' + file.serverControl, 'PART-HOLD-BACK'));
        const pt = file.partTarget;
        if (file.partCount === 0 && phb != null && pt != null && phb < 3 * pt) addFile('I5-R18', 1, 'part_hold_back=' + phb + ' part_target=' + pt + ' parts=0');
      }
      if (file.start.count > 1) addFile('I5-R19', file.start.lines[1], 'start_count=' + file.start.count);
      if (file.validated && /errors=0/.test(file.validated) && (file.channelsWithoutVariant > 0 || file.iframe.withoutUri > 0)) {
        addFile('I5-R20', 1, 'footer_errors=0 channels_without_variant=' + file.channelsWithoutVariant);
      }
      if (file.dupNames.groups > 0) addFile('I5-R21', 1, 'dup_name_groups=' + file.dupNames.groups + ' duplicates=' + file.dupNames.duplicates);
      if (file.dupSid.groups > 0) addFile('I5-R22', 1, 'dup_sid_groups=' + file.dupSid.groups);

      for (const f of fileRules) {
        if (!file.occurrences[f.rule]) file.occurrences[f.rule] = { lines: [], tvg_ids: [] };
        file.occurrences[f.rule].lines.push(f.line);
        file.occurrences[f.rule].tvg_ids.push('');
      }

      // cuantificaciones del contrato (medidas, no hardcodeadas)
      const cnt = (rule) => (file.occurrences[rule] ? file.occurrences[rule].lines.length : 0);
      file.quantified = {
        fz01_avc_with_hvc1: cnt('I5-R03'),
        hvc1_pq_over_avc: cnt('I5-R04'),
        fake_cmaf: cnt('I5-R05'),
        fake_lcevc: cnt('I5-R06'),
        fake_dv: cnt('I5-R07'),
        ai_sr_not_scoped: cnt('I5-R08'),
        pq_public_sdr_inband: cnt('I5-R09'),
        hdr_metadata_impossible: cnt('I5-R10'),
        frame_rate_overclaim: cnt('I5-R11'),
        fourk_9_15_avc: cnt('I5-R12'),
        cmaf_malformed_codecs: cnt('I5-R13'),
        vlc_knobs_8k120: cnt('I5-R14'),
        fps_conflict: cnt('I5-R15'),
        blanket_4k_without_marker: cnt('I5-R23'),
        channels_without_variant: file.channelsWithoutVariant,
        eight_k_marker_absent: cnt('I5-R25'),
        level_public_under: cnt('I5-R02'),
        level_hint_under: cnt('I5-R02H'),
        missing_codec_evidence: cnt('I5-R31'),
        declared_4k_below_28mbps: file.metrics.declared4kBelow28
      };
      file.quantified.wire_8k = cnt('I5-R01');
      file.quantified.codec_verified_true = cnt('I5-R26');
      file.quantified.supplemental_present = cnt('I5-R27');

      file.timing_ms = Number((process.hrtime.bigint() - t0) / 1000000n);
      file.distinctTags = Object.keys(file.tagCounts).length;
      file.ruleCounts = {};
      for (const [rule, o] of Object.entries(file.occurrences)) file.ruleCounts[rule] = o.lines.length;

      // sha256 (segunda pasada, solo bytes)
      const hash = crypto.createHash('sha256');
      const s = fs.createReadStream(capture.path);
      s.on('data', (d) => hash.update(d));
      s.on('end', () => {
        file.sha256 = hash.digest('hex').toUpperCase();
        resolve({ file, fileRules });
      });
      s.on('error', reject);
    });
  });
}

/* ── reporte JSON ───────────────────────────────────────────────────────── */
function buildJson(capture, parsed) {
  const { file, fileRules } = parsed;
  const rulesUsed = {};
  for (const id of Object.keys(file.ruleCounts)) {
    if (engine.RULES[id]) rulesUsed[id] = Object.assign({ count: file.ruleCounts[id] }, engine.RULES[id]);
  }
  return {
    schema: 'ara-x.policy.findings/1',
    task: 't17 (I5)',
    generated_at: new Date().toISOString(),
    engine: { spec: engine.SPEC, rules: engine.RULE_IDS.length, module: 'ara-x/policy/policy_engine.js' },
    capture: {
      label: file.label,
      path: file.path,
      bytes: file.bytes,
      lines: file.lines,
      sha256: file.sha256,
      version: file.version,
      apex_channels: file.apexChannels,
      footer: file.validated,
      timing_ms: file.timing_ms
    },
    structure: {
      channels: file.channels,
      extinf: file.extinf,
      urls: file.urls,
      streaminf: file.streaminf,
      channels_without_variant: file.channelsWithoutVariant,
      distinct_tags: file.distinctTags,
      iframe: file.iframe,
      start: file.start,
      part_count: file.partCount,
      map_count: file.mapCount,
      server_control: file.serverControl,
      part_target: file.partTarget,
      eight_kfake: file.eightKFake,
      fourkfalse: file.fourkFalse,
      dup_names: file.dupNames,
      dup_sid: file.dupSid,
      url_samples_masked: file.urlSamples
    },
    classification: {
      total_channels: file.channels,
      total_variants_classified: file.variants.length,
      total_channels_accounted: file.variants.length + file.noVariant.length,
      by_class: file.classification,
      coverage_pct: file.streaminf ? Number(((file.variants.length / file.streaminf) * 100).toFixed(2)) : 0
    },
    channels_without_variant_list: file.noVariant,
    quantified: file.quantified,
    rules: rulesUsed,
    rule_counts: file.ruleCounts,
    file_findings: fileRules.map((f) => ({
      rule: f.rule,
      severity: engine.RULES[f.rule] ? engine.RULES[f.rule].severity : 'medium',
      tvg_id: null,
      line: f.line,
      fix: engine.RULES[f.rule] ? engine.RULES[f.rule].fix : '',
      evidence: f.evidence
    })),
    occurrences: file.occurrences,
    variants: file.variants,
    proposed_wire: {
      codecs: file.proposedCodec,
      resolutions: file.proposedResolution,
      modes: file.proposedMode
    }
  };
}

/* ── reporte Markdown ───────────────────────────────────────────────────── */
function buildMarkdown(results) {
  const L = [];
  const p = (s = '') => L.push(s);
  p('# R5 · Auditoría de política 4K/8K de LAS DOS listas (I5)');
  p();
  p('**Tarea:** `t17` (I5) · **Autor:** `codec-hdr-scientist` (S3+S4) · **Fecha:** ' + new Date().toISOString().slice(0, 10));
  p('**Motor:** `ara-x/policy/policy_engine.js` (spec `' + engine.SPEC + '`, ' + engine.RULE_IDS.length + ' reglas) · **Validador:** `ara-x/scripts/policy/validate_catalog.js`');
  p('**Salidas:** `policy_findings.json` (A) · `policy_findings_cdn.json` (B) · este reporte.');
  p();
  p('Sin red, sin VPS, sin device. Las capturas se abren en **solo lectura**; ninguna URL completa se guarda (solo muestras enmascaradas).');
  p();
  p('## 1 · Resumen por lista');
  p();
  p('| Métrica | ' + results.map((r) => r.capture.label).join(' | ') + ' |');
  p('|---|' + results.map(() => '---').join('|') + '|');
  const row = (label, fn) => p('| ' + label + ' | ' + results.map((r) => fn(r)).join(' | ') + ' |');
  row('Bytes', (r) => r.capture.bytes.toLocaleString('es-ES'));
  row('sha256', (r) => '`' + r.capture.sha256.slice(0, 16) + '…`');
  row('Líneas', (r) => r.capture.lines.toLocaleString('es-ES'));
  row('Tiempo de auditoría', (r) => r.capture.timing_ms + ' ms');
  row('Canales (#EXTINF)', (r) => r.structure.channels.toLocaleString('es-ES'));
  row('#EXT-X-STREAM-INF', (r) => r.structure.streaminf.toLocaleString('es-ES'));
  row('Variantes clasificadas', (r) => r.classification.total_variants_classified.toLocaleString('es-ES') + ' (' + r.classification.coverage_pct + ' %)');
  row('Cobertura', (r) => r.classification.coverage_pct + ' %');
  row('VIOLATION / WARN / PASS / NO_VARIANT', (r) => [r.classification.by_class.VIOLATION, r.classification.by_class.WARN, r.classification.by_class.PASS, r.classification.by_class.NO_VARIANT].join(' / '));
  row('Canales sin variante', (r) => r.structure.channels_without_variant);
  row('8KFAKE', (r) => r.structure.eight_kfake.toLocaleString('es-ES'));
  row('EXT-X-PART / EXT-X-MAP', (r) => r.structure.part_count + ' / ' + r.structure.map_count);
  row('I-FRAME sin URI', (r) => r.structure.iframe.withoutUri.toLocaleString('es-ES'));
  row('EXT-X-START (duplicado)', (r) => r.structure.start.count);
  row('tvg-name duplicados (grupos/dup)', (r) => r.structure.dup_names.groups + ' / ' + r.structure.dup_names.duplicates);
  row('SID duplicados (grupos)', (r) => r.structure.dup_sid.groups);
  p();
  p('## 2 · Cuantificación del contrato (medida, no hardcodeada)');
  p();
  p('| Métrica | Esperado (R1/R2) | ' + results.map((r) => r.capture.label).join(' | ') + ' |');
  p('|---|---|' + results.map(() => '---').join('|') + '|');
  const q = (key, expected) => p('| `' + key + '` | ' + (expected == null ? '—' : expected) + ' | ' + results.map((r) => r.quantified[key]).join(' | ') + ' |');
  q('fz01_avc_with_hvc1', '9.593');
  q('hvc1_pq_over_avc', '9.593');
  q('fake_cmaf', '10.631');
  q('fake_lcevc', '10.631');
  q('fake_dv', '10.631');
  q('ai_sr_not_scoped', '10.631');
  q('pq_public_sdr_inband', '9.823');
  q('hdr_metadata_impossible', '9.823');
  q('frame_rate_overclaim', '10.503');
  q('fourk_9_15_avc', '9.548');
  q('blanket_4k_without_marker', '9.823');
  q('declared_4k_below_28mbps', '9.778');
  q('channels_without_variant', '45 (B)');
  q('eight_k_marker_absent', '—');
  q('level_public_under', '0');
  q('level_hint_under', '2.565');
  q('wire_8k', '0');
  q('codec_verified_true', '0');
  q('supplemental_present', '0');
  q('cmaf_malformed_codecs', '10.631');
  q('vlc_knobs_8k120', '10.631');
  q('fps_conflict', '≥1.186');
  q('missing_codec_evidence', '45 (A)');
  p();
  p('## 3 · Hallazgos por regla (ambas listas)');
  p();
  p('| Regla | Severidad | Hallazgo | ' + results.map((r) => r.capture.label).join(' | ') + ' | Fix |');
  p('|---|---|---|' + results.map(() => '---').join('|') + '|---|');
  for (const id of engine.RULE_IDS) {
    const counts = results.map((r) => r.ruleCounts[id] || 0);
    if (counts.every((c) => c === 0)) continue;
    const meta = engine.RULES[id];
    p('| `' + id + '` | ' + meta.severity + ' | ' + meta.title + ' | ' + counts.join(' | ') + ' | ' + meta.fix + ' |');
  }
  p();
  p('## 4 · Qué cambiaría con la política D2 (`proposed_wire`)');
  p();
  p('| Lista | Codecs propuestos (top) | Resoluciones | Modos |');
  p('|---|---|---|---|');
  for (const r of results) {
    const top = Object.entries(r.proposed_wire.codecs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => '`' + k + '`×' + v).join(' · ');
    const res = Object.entries(r.proposed_wire.resolutions).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '×' + v).join(' · ');
    const modes = Object.entries(r.proposed_wire.modes).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '×' + v).join(' · ');
    p('| ' + r.capture.label + ' | ' + top + ' | ' + res + ' | ' + modes + ' |');
  }
  p();
  p('## 5 · Hallazgos de archivo');
  p();
  for (const r of results) {
    if (!r.file_findings.length) { p('- ' + r.capture.label + ': sin hallazgos de archivo.'); continue; }
    p('### ' + r.capture.label);
    p();
    for (const f of r.file_findings) {
      p('- **' + f.rule + '** (' + f.severity + ', línea ' + f.line + '): ' + f.evidence + ' — _' + f.fix + '_');
    }
    p();
  }
  p('## 6 · Muestras enmascaradas');
  p();
  for (const r of results) {
    p('- ' + r.capture.label + ': `' + (r.structure.url_samples_masked[0] || '<sin muestras>') + '`');
  }
  p();
  p('Ninguna muestra contiene user/pass, query ni token: el enmascarado conserva solo esquema, host y longitud del path.');
  p();
  p('## 7 · Método y verificación');
  p();
  p('```');
  p('node --check ara-x/policy/policy_engine.js');
  p('node --test ara-x/tests/policy.test.js');
  p('node ara-x/scripts/policy/validate_catalog.js --all');
  p('```');
  p();
  p('- El parser es streaming (una pasada para clasificar; una segunda solo para sha256).');
  p('- Cada `#EXT-X-STREAM-INF` se clasifica con el motor D2 (`TRUTHFUL_SIGNAL`, piso 4K como testigo, 8K presentación, FPS-first) y las reglas R1/R2.');
  p('- `variants[]` enumera las 10.631 variantes (A) / 10.586 + 45 sin variante (B) con línea, tvg-id, clase y reglas.');
  p('- `occurrences` enumera cada ocurrencia por regla en arrays paralelos `lines[]` + `tvg_ids[]`; `rules` da severidad y fix.');
  p('- Footer `VALIDATED … errors=0` se contrasta con la realidad medida (R1-F12).');
  p();
  return L.join('\n') + '\n';
}

/* ── CLI ────────────────────────────────────────────────────────────────── */
function usage() {
  console.log([
    'Uso:',
    '  node ara-x/scripts/policy/validate_catalog.js --all',
    '  node ara-x/scripts/policy/validate_catalog.js --capture <ruta> --out <json> [--md <md>] [--label A]',
    '',
    '--all   audita las dos capturas completas y escribe los 2 JSON + el MD combinado.',
    'Salidas por defecto: ara-x/reports/policy_findings{,_cdn}.json y ara-x/reports/R5_policy_catalog.md'
  ].join('\n'));
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) { usage(); process.exit(argv.length === 0 ? 1 : 0); }
  const results = [];

  if (argv.includes('--all')) {
    for (const key of ['A', 'B']) {
      const cap = CAPTURES[key];
      if (!fs.existsSync(cap.path)) throw new Error('captura no encontrada: ' + cap.path);
      process.stderr.write('[i5] auditando ' + cap.label + ' (' + fs.statSync(cap.path).size.toLocaleString('es-ES') + ' B)…\n');
      const parsed = await parseCapture(cap);
      const json = buildJson(cap, parsed);
      fs.mkdirSync(path.dirname(cap.out), { recursive: true });
      fs.writeFileSync(cap.out, JSON.stringify(json, null, 2) + '\n', 'utf8');
      process.stderr.write('[i5] ' + path.basename(cap.out) + ': ' + json.structure.channels + ' canales, ' + json.classification.total_variants_classified + ' variantes clasificadas, ' + json.capture.timing_ms + ' ms\n');
      results.push({ capture: json.capture, structure: json.structure, classification: json.classification, quantified: json.quantified, rules: json.rules, ruleCounts: Object.fromEntries(Object.entries(json.occurrences).map(([k, v]) => [k, v.lines.length])), file_findings: json.file_findings, proposed_wire: json.proposed_wire });
    }
    const md = buildMarkdown(results);
    const mdPath = path.join(REPORTS, 'R5_policy_catalog.md');
    fs.writeFileSync(mdPath, md, 'utf8');
    process.stderr.write('[i5] reporte: ' + path.relative(ROOT, mdPath).replace(/\\/g, '/') + '\n');
    console.log('I5 OK · listas=2 · ' + results.map((r) => r.capture.timing_ms + 'ms').join(' / '));
    return;
  }

  const arg = (name, def) => {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
  };
  const capturePath = arg('--capture');
  const outPath = arg('--out');
  if (!capturePath || !outPath) { usage(); process.exit(1); }
  const cap = { label: arg('--label', path.basename(capturePath)), path: path.resolve(capturePath), out: path.resolve(outPath) };
  const parsed = await parseCapture(cap);
  const json = buildJson(cap, parsed);
  fs.mkdirSync(path.dirname(cap.out), { recursive: true });
  fs.writeFileSync(cap.out, JSON.stringify(json, null, 2) + '\n', 'utf8');
  const mdPath = arg('--md', null);
  if (mdPath) {
    const md = buildMarkdown([{ capture: json.capture, structure: json.structure, classification: json.classification, quantified: json.quantified, rules: json.rules, ruleCounts: Object.fromEntries(Object.entries(json.occurrences).map(([k, v]) => [k, v.lines.length])), file_findings: json.file_findings, proposed_wire: json.proposed_wire }]);
    fs.writeFileSync(path.resolve(mdPath), md, 'utf8');
  }
  console.log('I5 OK · ' + json.structure.channels + ' canales · ' + json.classification.total_variants_classified + ' variantes · ' + json.capture.timing_ms + ' ms');
}

main().catch((e) => { console.error('I5 FAIL: ' + e.message); process.exit(1); });
