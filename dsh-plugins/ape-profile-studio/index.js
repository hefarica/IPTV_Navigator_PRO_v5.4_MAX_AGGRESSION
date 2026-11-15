/**
 * Host half of the APE Profile Studio bundle.
 *
 * Owns the only two pieces of logic that cannot live in the browser:
 *   1. reading the workspace artifacts (the 12-profile contract, the project
 *      classifier and the generator profile config), and
 *   2. running that classifier over a pasted `#EXTINF` block.
 *
 * Both are published as same-origin JSON routes so the Client half reads them
 * without a cross-origin request and without inventing data:
 *
 *   GET  /ape-profile-studio/api/state?probe=0|1&refresh=0|1
 *   POST /ape-profile-studio/api/classify   { "line": "<#EXTINF block>" }
 *
 * The routes are read-only observers. They never write a file, never touch the
 * M3U8 generator, never touch the served list and never mutate the Harness
 * runtime. Anything that cannot be measured is reported as `no_computado`
 * together with the exact reason, never as a zero.
 */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Same-origin route paths claimed by this bundle. */
const ROUTE_STATE = '/ape-profile-studio/api/state';
const ROUTE_CLASSIFY = '/ape-profile-studio/api/classify';

/** Workspace-relative artifacts this panel reports on. */
const CONTRACT_REL = 'contracts/ape_profiles_12.json';
const CLASSIFIER_REL = 'IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js';
const CONFIG_REL = 'IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js';

/** Operator-supplied production list. Override with the environment variable. */
const SERVED_LIST_DEFAULT =
  'https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8';
const SERVED_LIST_ENV = 'APE_PROFILE_STUDIO_LIST_URL';

/** Root markers used to recognise the workspace the Harness process runs in. */
const ROOT_MARKERS = ['dsh-plugins', 'contracts', 'IPTV_v5.4_MAX_AGGRESSION', '.git'];

const PROBE_TIMEOUT_MS = 8000;
const PROBE_CACHE_MS = 60000;
const CLI_TIMEOUT_MS = 20000;
const BODY_LIMIT_BYTES = 256 * 1024;

/** Field aliases accepted from the contract and from classifier output. */
const PROFILE_FIELD_ALIASES = {
  id: ['id', 'profile', 'profileId', 'profile_id', 'code', 'key'],
  name: ['name', 'label', 'title', 'displayName', 'display_name'],
  level: ['level', 'levelId', 'level_id', 'qualityLevel'],
  tier: ['tier', 'tierName', 'tier_name', 'family', 'class', 'quality'],
  resolution: ['resolution', 'maxResolution', 'max_resolution', 'res', 'height', 'resolution_cap', 'res_cap'],
  codec: ['codec', 'codecs', 'videoCodec', 'video_codec', 'codec_full', 'codec_string'],
  hdr: ['hdr', 'videoRange', 'video_range', 'dynamic_range'],
  fps: ['fps', 'frameRate', 'frame_rate'],
  bitDepth: ['bit_depth', 'bitDepth', 'bits'],
  fallback: ['fallback', 'fallbackProfile', 'fallback_profile', 'fallbackChain'],
  confidence: ['confidence', 'minConfidence', 'min_confidence', 'score'],
  reason: ['reason', 'rationale', 'note', 'why'],
  channels: ['channels', 'channelCount', 'channel_count', 'count'],
};

const PROFILE_KEYS = ['profile', 'profileId', 'profile_id', 'to', 'target', 'id', 'code'];
const FALLBACK_KEYS = ['fallback', 'fallbackProfile', 'fallback_profile', 'from', 'source'];
const CONFIDENCE_KEYS = ['confidence', 'score', 'confidenceScore', 'certainty'];
const REASON_KEYS = ['reason', 'rationale', 'why', 'explanation', 'note', 'detail'];
const SCORE_KEYS = ['score'];

/**
 * Map one pasted channel block onto the channel shape the project classifier
 * documents (`{name, group, url, probe, truth}`). Only fields that are literally
 * present in the pasted text are filled; `probe` is deliberately absent because
 * a pasted block carries no measurement, and the classifier's own no-probe
 * branch is the honest path for that case.
 */
function parseExtinfBlock(text) {
  const raw = String(text === undefined || text === null ? '' : text);
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const extinf = lines.find((line) => line.startsWith('#EXTINF')) || '';
  const url = lines.find((line) => !line.startsWith('#')) || '';

  const attrs = {};
  const attributePattern = /([A-Za-z0-9_-]+)="([^"]*)"/g;
  let match = attributePattern.exec(extinf);
  while (match) {
    attrs[match[1].toLowerCase()] = match[2];
    match = attributePattern.exec(extinf);
  }

  const comma = extinf.indexOf(',');
  const displayName = comma >= 0 ? extinf.slice(comma + 1).trim() : '';

  const channel = {
    name: displayName || attrs['tvg-name'] || '',
    group: attrs['group-title'] || '',
    url,
  };
  if (attrs['tvg-id']) channel.tvgId = attrs['tvg-id'];
  if (attrs['tvg-name']) channel.tvgName = attrs['tvg-name'];

  return {
    channel,
    attrs,
    hasExtinf: Boolean(extinf),
    hasUrl: Boolean(url),
    lineCount: lines.length,
    probe: null,
  };
}

/** Cached served-list observation: one network probe per minute at most. */
let listProbeCache = { at: 0, url: '', value: null };

/* ------------------------------------------------------------------ helpers */

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function pickField(source, keys) {
  if (!source || typeof source !== 'object') return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/**
 * Locate the workspace root. The Harness process working directory is the
 * primary candidate; an explicit environment variable wins, and ancestors are
 * checked because a launcher may start the process from a parent directory.
 * Every candidate and its markers are reported so a wrong root is diagnosable
 * instead of silent.
 */
function detectWorkspace() {
  const candidates = [];
  const push = (directory, source) => {
    const resolved = path.resolve(directory);
    if (!candidates.some((candidate) => candidate.path === resolved)) {
      candidates.push({ path: resolved, source });
    }
  };

  const envRoot = process.env.APE_PROFILE_STUDIO_WORKSPACE;
  if (envRoot) push(envRoot, 'env');
  let directory = process.cwd();
  push(directory, 'cwd');
  for (let depth = 1; depth <= 3; depth += 1) {
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
    push(directory, `ancestor+${depth}`);
  }

  for (const candidate of candidates) {
    candidate.markers = ROOT_MARKERS.filter((marker) =>
      existsSync(path.join(candidate.path, marker)),
    );
  }

  const chosen =
    candidates.find((candidate) => candidate.source === 'env' && candidate.markers.length) ||
    candidates.find((candidate) => candidate.source === 'cwd' && candidate.markers.length) ||
    candidates.find((candidate) => candidate.markers.length) ||
    candidates[0];

  return {
    root: chosen.path,
    source: chosen.source,
    candidates: candidates.map((candidate) => ({
      path: candidate.path,
      source: candidate.source,
      markers: candidate.markers,
    })),
  };
}

/**
 * Observe one workspace file: existence, size, mtime, digest and (optionally)
 * its text. Absence is a measured fact with its errno, not an empty value.
 */
async function probeFile(root, relativePath, options = {}) {
  const absolute = path.join(root, relativePath);
  const entry = { relative: relativePath, path: absolute };
  try {
    const info = await stat(absolute);
    if (!info.isFile()) {
      return { ...entry, status: 'not_found', reason: 'la ruta existe pero no es un fichero' };
    }
    const bytes = await readFile(absolute);
    const observed = {
      ...entry,
      status: 'found',
      bytes: info.size,
      mtime: info.mtime.toISOString(),
      sha256: sha256(bytes),
    };
    if (options.withText) observed.text = bytes.toString('utf8');
    return observed;
  } catch (error) {
    return {
      ...entry,
      status: 'not_found',
      reason: error && error.code ? error.code : String((error && error.message) || error),
    };
  }
}

/* ---------------------------------------------------------- contract reader */

/**
 * Accept the shapes a hand-written contract may take: a bare array, an object
 * holding `profiles`/`perfiles` (array or keyed map), or any object whose only
 * array-of-objects property holds the profiles. Anything else is reported as an
 * unrecognised shape with the keys that were seen.
 */
function extractProfileList(document) {
  if (Array.isArray(document)) return { list: document, shape: 'array' };
  if (!document || typeof document !== 'object') return { list: null, shape: typeof document };

  const containers = ['profiles', 'perfiles', 'PROFILES', 'items', 'entries'];
  for (const key of containers) {
    const value = document[key];
    if (Array.isArray(value)) return { list: value, shape: `object.${key}[array]` };
    if (value && typeof value === 'object') {
      const rows = Object.entries(value).map(([id, row]) =>
        row && typeof row === 'object' ? { id, ...row } : { id, value: row },
      );
      if (rows.length) return { list: rows, shape: `object.${key}[map]` };
    }
  }

  const arrayKeys = Object.keys(document).filter(
    (key) => Array.isArray(document[key]) && document[key].length > 0 &&
      typeof document[key][0] === 'object',
  );
  if (arrayKeys.length === 1) {
    return { list: document[arrayKeys[0]], shape: `object.${arrayKeys[0]}[array]` };
  }

  return {
    list: null,
    shape: 'unrecognized',
    keys: Object.keys(document).slice(0, 40),
  };
}

function normalizeProfileRow(row, index) {
  const values = {};
  const mapped = new Set();
  for (const [field, aliases] of Object.entries(PROFILE_FIELD_ALIASES)) {
    const value = pickField(row, aliases);
    if (value !== undefined) {
      values[field] = value;
      for (const alias of aliases) if (row && row[alias] !== undefined) mapped.add(alias);
    }
  }
  const extra = {};
  if (row && typeof row === 'object') {
    for (const [key, value] of Object.entries(row)) {
      if (mapped.has(key)) continue;
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
        if (Object.keys(extra).length < 12) extra[key] = value;
      }
    }
  }
  const key = String(values.id !== undefined ? values.id : `row-${index}`);
  return { key, values, extra };
}

function readContract(root) {
  return probeFile(root, CONTRACT_REL, { withText: true }).then((file) => {
    if (file.status !== 'found') {
      return {
        status: 'not_found',
        relative: file.relative,
        path: file.path,
        reason: file.reason,
        profiles: [],
        count: null,
      };
    }
    let document;
    try {
      document = JSON.parse(file.text);
    } catch (error) {
      return {
        status: 'invalid_json',
        relative: file.relative,
        path: file.path,
        bytes: file.bytes,
        sha256: file.sha256,
        reason: String((error && error.message) || error),
        profiles: [],
        count: null,
      };
    }

    const extracted = extractProfileList(document);
    if (!extracted.list) {
      return {
        status: 'unrecognized_shape',
        relative: file.relative,
        path: file.path,
        bytes: file.bytes,
        sha256: file.sha256,
        shape: extracted.shape,
        keys: extracted.keys || [],
        profiles: [],
        count: null,
      };
    }

    const profiles = extracted.list.map(normalizeProfileRow);
    const declared = [document.count, document.total, document.profile_count, document.profileCount]
      .find((value) => typeof value === 'number' && Number.isFinite(value));

    return {
      status: 'found',
      relative: file.relative,
      path: file.path,
      bytes: file.bytes,
      mtime: file.mtime,
      sha256: file.sha256,
      shape: extracted.shape,
      count: profiles.length,
      declaredCount: declared === undefined ? null : declared,
      profiles,
      fields: {
        mapped: Object.keys(PROFILE_FIELD_ALIASES).filter((field) =>
          profiles.some((profile) => profile.values[field] !== undefined),
        ),
        extra: Array.from(new Set(profiles.flatMap((profile) => Object.keys(profile.extra)))),
      },
    };
  });
}

/* ------------------------------------------------------------ served list */

async function probeServedList(url, options = {}) {
  const now = Date.now();
  if (
    !options.refresh &&
    listProbeCache.value &&
    listProbeCache.url === url &&
    now - listProbeCache.at < PROBE_CACHE_MS
  ) {
    return { ...listProbeCache.value, cached: true };
  }

  const started = Date.now();
  const attempts = [];
  const base = {
    url,
    source: process.env[SERVED_LIST_ENV] ? 'env' : 'default',
    probedAt: new Date().toISOString(),
    timeoutMs: PROBE_TIMEOUT_MS,
    fullCount: {
      status: 'no_computado',
      reason:
        'el conteo completo exige descargar la lista entera (~186 MB segun el operador); el sondeo pide solo los primeros bytes',
    },
  };

  const finish = (value) => {
    listProbeCache = { at: Date.now(), url, value };
    return { ...value, cached: false };
  };

  // 1. HEAD: existence, size and cache validators without transferring the body.
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const headers = response.headers;
    attempts.push({ method: 'HEAD', ok: true, status: response.status });
    const head = {
      status: response.ok ? 'computed' : 'no_computado',
      reason: response.ok ? null : `HEAD devolvio HTTP ${response.status}`,
      httpStatus: response.status,
      contentType: headers.get('content-type'),
      contentLength: headers.get('content-length'),
      etag: headers.get('etag'),
      lastModified: headers.get('last-modified'),
      server: headers.get('server'),
    };

    // 2. Range GET: sample the head of the playlist. Sample numbers are always
    //    labelled as samples; they are never presented as the real totals.
    try {
      const ranged = await fetch(url, {
        headers: { Range: 'bytes=0-4095' },
        redirect: 'follow',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const text = await ranged.text();
      const lines = text.split(/\r?\n/);
      const sample = {
        httpStatus: ranged.status,
        acceptedRange: ranged.status === 206,
        contentRange: ranged.headers.get('content-range'),
        bytesSampled: Buffer.byteLength(text),
        linesSampled: lines.length,
        extinfSampled: lines.filter((line) => line.startsWith('#EXTINF')).length,
        startsWithExtm3u: text.startsWith('#EXTM3U'),
        label: 'muestra: solo los primeros bytes, NO es el total de la lista',
      };
      attempts.push({ method: 'GET Range', ok: true, status: ranged.status });
      return finish({
        ...base,
        ...head,
        sample,
        attempts,
        durationMs: Date.now() - started,
      });
    } catch (error) {
      attempts.push({
        method: 'GET Range',
        ok: false,
        reason: String((error && error.message) || error),
      });
      return finish({
        ...base,
        ...head,
        reason:
          head.reason ||
          `HEAD respondio pero el muestreo por Range fallo: ${String((error && error.message) || error)}`,
        status: 'no_computado',
        attempts,
        durationMs: Date.now() - started,
      });
    }
  } catch (error) {
    const reason = String((error && error.message) || error);
    const timedOut = /timeout|timed out|abort/i.test(reason);
    attempts.push({ method: 'HEAD', ok: false, reason });
    return finish({
      ...base,
      status: 'no_computado',
      reason: timedOut
        ? `el endpoint publico no respondio en ${PROBE_TIMEOUT_MS} ms (${reason})`
        : `no se pudo alcanzar el endpoint publico: ${reason}`,
      attempts,
      durationMs: Date.now() - started,
    });
  }
}

/* -------------------------------------------------------------- classifier */

function parseJsonFromText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { ok: false, reason: 'la salida esta vacia' };

  const attempts = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) attempts.push(fenced[1].trim());
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0 && index >= lines.length - 6; index -= 1) {
    attempts.push(lines[index]);
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) attempts.push(trimmed.slice(firstBrace, lastBrace + 1));

  for (const candidate of attempts) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch (error) {
      void error;
    }
  }
  return { ok: false, reason: 'la salida no contiene JSON parseable', head: trimmed.slice(0, 400) };
}

function normalizeClassification(raw) {
  const notes = [];

  if (raw === null || raw === undefined) {
    return { ok: false, status: 'empty_output', reason: 'el clasificador no devolvio nada' };
  }

  if (Array.isArray(raw)) {
    if (!raw.length) return { ok: false, status: 'empty_output', reason: 'el clasificador devolvio un array vacio' };
    const inner = normalizeClassification(raw[0]);
    if (!inner.ok) return inner;
    notes.push('la salida fue un array: se usa el primer elemento');
    return { ...inner, notes: [...(inner.notes || []), ...notes] };
  }

  if (typeof raw !== 'object') {
    const text = String(raw).trim();
    if (/^P[0-5]$/i.test(text)) {
      return {
        ok: true,
        status: 'ok',
        result: { profile: text.toUpperCase(), fallback: null, confidence: null, reason: null },
        notes: ['salida textual simple: solo se pudo derivar el perfil'],
      };
    }
    return {
      ok: false,
      status: 'unrecognized_output',
      reason: 'la salida no es un objeto de clasificacion',
      value: text.slice(0, 200),
    };
  }

  const profile = pickField(raw, PROFILE_KEYS);
  if (profile === undefined) {
    return {
      ok: false,
      status: 'unrecognized_output',
      reason: 'la salida no trae un campo de perfil reconocible',
      keys: Object.keys(raw).slice(0, 40),
    };
  }

  const extra = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      if (Object.keys(extra).length < 16) extra[key] = value;
    }
  }

  const signals = Array.isArray(raw.signals)
    ? raw.signals.filter((signal) => typeof signal === 'string').slice(0, 24)
    : null;

  return {
    ok: true,
    status: 'ok',
    result: {
      profile,
      fallback: pickField(raw, FALLBACK_KEYS) ?? null,
      confidence: pickField(raw, CONFIDENCE_KEYS) ?? null,
      score: pickField(raw, SCORE_KEYS) ?? null,
      reason: pickField(raw, REASON_KEYS) ?? null,
    },
    signals,
    extra,
    notes,
  };
}

async function tryModuleInterface(scriptPath, channel) {
  try {
    const info = await stat(scriptPath);
    const url = `${pathToFileURL(scriptPath).href}?mtime=${info.mtimeMs}`;
    const mod = await import(url);
    const exportNames = [
      'classify',
      'classifyChannel',
      'classifyExtinf',
      'classifyExtInf',
      'classifyLine',
      'classifyExtinfLine',
    ];
    const holders = [mod, mod && typeof mod.default === 'object' ? mod.default : null];
    let fn;
    let exportName;
    for (const holder of holders) {
      if (!holder) continue;
      for (const name of exportNames) {
        if (typeof holder[name] === 'function') {
          fn = holder[name];
          exportName = name;
          break;
        }
      }
      if (fn) break;
    }
    if (!fn && mod && typeof mod.default === 'function') {
      fn = mod.default;
      exportName = 'default';
    }
    if (!fn) {
      return {
        ok: false,
        interface: 'module',
        reason: 'el modulo se importo pero no exporta una funcion clasificadora',
        exports: Object.keys(mod || {}).slice(0, 30),
      };
    }
    const output = await fn(channel);
    return { ok: true, interface: 'module', via: `module:${exportName}`, output };
  } catch (error) {
    return {
      ok: false,
      interface: 'module',
      reason: String((error && error.message) || error),
    };
  }
}

function runNodeCli(scriptPath, cwd, line, args) {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGKILL');
      } catch (error) {
        void error;
      }
      resolve({
        ok: false,
        reason: `timeout ${CLI_TIMEOUT_MS} ms`,
        stdout: stdout.slice(-1500),
        stderr: stderr.slice(-1500),
      });
    }, CLI_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 400000) {
        try {
          child.kill('SIGKILL');
        } catch (error) {
          void error;
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 40000) stderr = stderr.slice(-40000);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, reason: `spawn fallo: ${String((error && error.message) || error)}` });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: true, exitCode: code, stdout, stderr });
    });
    child.stdin.on('error', (error) => {
      void error;
    });
    child.stdin.end(line.endsWith('\n') ? line : `${line}\n`);
  });
}

async function tryCliInterface(scriptPath, cwd, line) {
  // A CLI is only admissible when the script actually reads stdin. A script
  // whose CLI mode prints its own built-in case would otherwise return a
  // classification of a DIFFERENT channel, which is exactly the kind of false
  // result this panel must never show.
  let readsStdin = false;
  try {
    const text = await readFile(scriptPath, 'utf8');
    readsStdin = /process\s*\.\s*stdin/.test(text);
  } catch (error) {
    return { ok: false, interface: 'cli', attempts: [{ interface: 'cli', ok: false, reason: String((error && error.message) || error) }] };
  }
  if (!readsStdin) {
    return {
      ok: false,
      interface: 'cli',
      attempts: [
        {
          interface: 'cli',
          ok: false,
          reason:
            'el script no lee stdin: su modo CLI solo puede devolver un caso interno del propio script, no el bloque pegado; se omite para no presentar un resultado ajeno',
        },
      ],
    };
  }

  const attempts = [];
  for (const args of [['--json'], []]) {
    const run = await runNodeCli(scriptPath, cwd, line, args);
    const label = `cli:node script ${args.join(' ') || '(sin argumentos)'}`.trim();
    if (!run.ok) {
      attempts.push({ interface: label, ok: false, reason: run.reason });
      continue;
    }
    if (run.exitCode !== 0) {
      attempts.push({
        interface: label,
        ok: false,
        reason: `exit code ${run.exitCode}`,
        stderr: String(run.stderr || '').slice(-600),
      });
      continue;
    }
    const parsed = parseJsonFromText(run.stdout);
    if (!parsed.ok) {
      attempts.push({
        interface: label,
        ok: false,
        reason: parsed.reason,
        stdoutHead: String(run.stdout || '').slice(0, 400),
      });
      continue;
    }
    return { ok: true, interface: 'cli', via: label, output: parsed.value, attempts };
  }
  return { ok: false, interface: 'cli', attempts };
}

async function classifyLine(root, line) {
  const started = Date.now();
  const parsed = parseExtinfBlock(line);
  const input = {
    name: parsed.channel.name || null,
    group: parsed.channel.group || null,
    url: parsed.channel.url || null,
    hasExtinf: parsed.hasExtinf,
    hasUrl: parsed.hasUrl,
    lineCount: parsed.lineCount,
    probe: null,
    note:
      'un bloque pegado no aporta probe medido: se entrega el canal sin probe y el clasificador usa su propia rama sin evidencia',
  };

  if (!parsed.channel.name && !parsed.channel.group && !parsed.channel.url) {
    return {
      ok: false,
      status: 'unparsable_input',
      reason:
        'la entrada no trae ni nombre de canal (texto tras la coma del #EXTINF), ni group-title, ni URL',
      input,
      tried: [],
      durationMs: Date.now() - started,
    };
  }

  const classifier = await probeFile(root, CLASSIFIER_REL);
  if (classifier.status !== 'found') {
    return {
      ok: false,
      status: 'classifier_missing',
      reason: `el clasificador no existe en ${CLASSIFIER_REL} (${classifier.reason})`,
      classifier: { status: classifier.status, relative: classifier.relative, path: classifier.path, reason: classifier.reason },
      input,
      tried: [],
      durationMs: Date.now() - started,
    };
  }

  const tried = [];

  const moduleAttempt = await tryModuleInterface(classifier.path, parsed.channel);
  if (moduleAttempt.ok) {
    const normalized = normalizeClassification(moduleAttempt.output);
    tried.push({ interface: 'module', ok: normalized.ok, via: moduleAttempt.via, note: normalized.reason });
    if (normalized.ok) {
      return {
        ok: true,
        status: 'ok',
        via: moduleAttempt.via,
        result: normalized.result,
        signals: normalized.signals,
        extra: normalized.extra || {},
        notes: normalized.notes || [],
        input,
        classifier: { status: 'found', relative: classifier.relative, sha256: classifier.sha256, bytes: classifier.bytes },
        tried,
        durationMs: Date.now() - started,
      };
    }
  } else {
    tried.push({ interface: 'module', ok: false, reason: moduleAttempt.reason, exports: moduleAttempt.exports });
  }

  const cliAttempt = await tryCliInterface(classifier.path, root, line);
  tried.push(...(cliAttempt.attempts || []));
  if (cliAttempt.ok) {
    const normalized = normalizeClassification(cliAttempt.output);
    tried.push({ interface: 'cli', ok: normalized.ok, via: cliAttempt.via, note: normalized.reason });
    if (normalized.ok) {
      return {
        ok: true,
        status: 'ok',
        via: cliAttempt.via,
        result: normalized.result,
        signals: normalized.signals,
        extra: normalized.extra || {},
        notes: normalized.notes || [],
        input,
        classifier: { status: 'found', relative: classifier.relative, sha256: classifier.sha256, bytes: classifier.bytes },
        tried,
        durationMs: Date.now() - started,
      };
    }
  }

  return {
    ok: false,
    status: 'unsupported_interface',
    reason:
      'el clasificador existe pero no expuso ninguna interfaz usable: se probo un export de modulo (classify/classifyChannel/classifyExtinf/classifyLine/default) y, solo si el script lee stdin, la CLI `node <script> --json`',
    classifier: { status: 'found', relative: classifier.relative, sha256: classifier.sha256, bytes: classifier.bytes },
    expected: {
      module: 'export function classify(channel) -> { profile, fallback, confidence, reason }',
      cli: 'node ape-profile-classifier.js --json leyendo el bloque por stdin -> JSON por stdout',
    },
    input,
    tried,
    durationMs: Date.now() - started,
  };
}

/* ---------------------------------------------------------------- transport */

function sendJson(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-length', Buffer.byteLength(text));
  res.end(text);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT_BYTES) {
      const error = new Error(`el cuerpo supera ${BODY_LIMIT_BYTES} bytes`);
      error.code = 'BODY_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function servedListUrl() {
  const override = process.env[SERVED_LIST_ENV];
  return override && override.trim() ? override.trim() : SERVED_LIST_DEFAULT;
}

async function buildState(options) {
  const workspace = detectWorkspace();
  const [contract, classifier, config] = await Promise.all([
    readContract(workspace.root),
    probeFile(workspace.root, CLASSIFIER_REL),
    probeFile(workspace.root, CONFIG_REL),
  ]);

  const servedList = options.probe
    ? await probeServedList(servedListUrl(), { refresh: options.refresh })
    : {
        status: 'not_probed',
        reason: 'sondeo desactivado en esta peticion (probe=0); el panel lo lanza aparte para pintar primero',
        url: servedListUrl(),
        source: process.env[SERVED_LIST_ENV] ? 'env' : 'default',
        fullCount: { status: 'no_computado', reason: 'no sondado todavia' },
      };

  return {
    ok: true,
    plugin: { name: '@local/ape-profile-studio', version: '1.0.0' },
    generatedAt: new Date().toISOString(),
    workspace,
    artifacts: {
      contract: { relative: CONTRACT_REL, status: contract.status, path: contract.path },
      classifier: {
        relative: CLASSIFIER_REL,
        status: classifier.status,
        path: classifier.path,
        bytes: classifier.bytes ?? null,
        mtime: classifier.mtime ?? null,
        sha256: classifier.sha256 ?? null,
        reason: classifier.reason ?? null,
      },
      config: {
        relative: config.relative,
        status: config.status,
        path: config.path,
        bytes: config.bytes ?? null,
        sha256: config.sha256 ?? null,
        reason: config.reason ?? null,
      },
    },
    contract,
    classifierInterface: {
      module:
        'export function classify(channel) -> { profile, fallback, confidence, reason }; channel = { name, group, url, probe?, truth? }',
      cli: 'node ape-profile-classifier.js --json leyendo el bloque por stdin -> JSON por stdout (solo se usa si el script lee stdin)',
      inputMapping:
        'el bloque pegado se mapea a { name: texto tras la coma del #EXTINF, group: group-title, url: primera linea no-tag }; probe NO se inventa',
      probeOrder: ['module', 'cli'],
    },
    servedList,
  };
}

async function handleState(req, res) {
  try {
    const requestUrl = new URL(req.url || ROUTE_STATE, 'http://localhost');
    const probe = requestUrl.searchParams.get('probe');
    const refresh = requestUrl.searchParams.get('refresh');
    const state = await buildState({
      probe: probe === null ? true : !['0', 'false', 'no'].includes(probe.toLowerCase()),
      refresh: refresh === '1' || refresh === 'true',
    });
    sendJson(res, 200, state);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      status: 'state_failed',
      reason: String((error && error.message) || error),
    });
  }
}

async function handleClassify(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, status: 'method_not_allowed', allow: ['POST'] });
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      status: error && error.code === 'BODY_TOO_LARGE' ? 'body_too_large' : 'invalid_json',
      reason: String((error && error.message) || error),
    });
    return;
  }
  const line = body && typeof body.line === 'string' ? body.line : '';
  if (!line.trim()) {
    sendJson(res, 400, { ok: false, status: 'empty_input', reason: 'falta la linea #EXTINF a clasificar' });
    return;
  }
  try {
    const workspace = detectWorkspace();
    const outcome = await classifyLine(workspace.root, line);
    sendJson(res, outcome.ok ? 200 : 200, { ...outcome, workspace: { root: workspace.root, source: workspace.source } });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      status: 'classify_failed',
      reason: String((error && error.message) || error),
    });
  }
}

/* ------------------------------------------------------------------- bundle */

export function apply(ctx) {
  ctx.inject(['webServer'], (scope) => {
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: ROUTE_STATE, handler: handleState }),
      'ape-profile-studio: state route',
    );
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: ROUTE_CLASSIFY, handler: handleClassify }),
      'ape-profile-studio: classify route',
    );
  });
}

/** Exported for the reproducible self-check; the Loader only needs `apply`. */
export const __testing = {
  ROUTE_STATE,
  ROUTE_CLASSIFY,
  CONTRACT_REL,
  CLASSIFIER_REL,
  detectWorkspace,
  extractProfileList,
  normalizeProfileRow,
  normalizeClassification,
  parseExtinfBlock,
  parseJsonFromText,
  buildState,
  classifyLine,
  probeServedList,
  handleState,
  handleClassify,
};
