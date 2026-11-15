/**
 * Host half of the APE Stability Console bundle.
 *
 * Owns the only piece of logic that cannot live in a browser: reading the real
 * production state of the APE VPS. Everything here is READ-ONLY.
 *
 * Published as same-origin JSON routes so the Client half needs no cross-origin
 * request and no invented data:
 *
 *   GET  /ape-stability-console/api/state?probe=0|1&gate=0|1&refresh=0|1
 *   POST /ape-stability-console/api/gate      {}   -> re-runs the gate [11] counting
 *
 * The four cards this feeds:
 *   1. availability : systemctl is-active nginx|php8.3-fpm|ape-jit + the ape-*.timer set
 *   2. projection   : gate [11] - bytes, channels and tags of the served list
 *   3. stability    : per-channel score, formula of the skill iptv-stream-stability-score
 *   4. failover     : last 5xx/timeout entries + whether failover is armed, keeping
 *                     provider blocking (401/403/407/429/451/461) apart from 5xx
 *
 * Safety invariants, enforced in code and not by convention:
 *   - The remote command is a CONSTANT. No value from an HTTP request reaches it:
 *     the query string only selects which already-whitelisted section runs.
 *   - Only read-only verbs are used: systemctl is-active/list-timers/list-units,
 *     stat, grep -c, tail, nginx -T (config dump), cat of a state JSON.
 *     There is no systemctl start/stop/restart, no writes, no reload, no redirect.
 *   - Host, user and port are validated against a strict pattern before spawn, so
 *     a hostile environment variable cannot become an ssh option or a shell word.
 *   - SSH runs with BatchMode (never prompts), a bounded timeout and a kill on
 *     overrun, so a dead VPS degrades to `no_computado` instead of hanging the page.
 *   - Anything not measured is `no_computado` WITH its reason. A gap is never 0.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

/** Same-origin route paths claimed by this bundle. */
const ROUTE_STATE = '/ape-stability-console/api/state';
const ROUTE_GATE = '/ape-stability-console/api/gate';

/* ------------------------------------------------------------------- config */

const ENV = {
  host: 'APE_STABILITY_CONSOLE_HOST',
  user: 'APE_STABILITY_CONSOLE_USER',
  port: 'APE_STABILITY_CONSOLE_PORT',
  key: 'APE_STABILITY_CONSOLE_KEY',
  ssh: 'APE_STABILITY_CONSOLE_SSH',
  timeout: 'APE_STABILITY_CONSOLE_TIMEOUT_MS',
  window: 'APE_STABILITY_CONSOLE_WINDOW',
  listFile: 'APE_STABILITY_CONSOLE_LIST',
  workspace: 'APE_STABILITY_CONSOLE_WORKSPACE',
};

const DEFAULTS = {
  host: '178.156.147.234',
  user: 'root',
  port: '22',
  key: process.platform === 'win32'
    ? 'C:\\Users\\HFRC\\.ssh\\id_ed25519_hetzner'
    : '~/.ssh/id_ed25519_hetzner',
  timeoutMs: 25000,
  window: 12000,
  /** Same file the gate [11] reads (symlink target of /var/www/html/lists/...). */
  listFile: '/var/www/html/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8',
};

const SERVICES = ['nginx', 'php8.3-fpm', 'ape-jit'];

/** Root markers used to recognise the workspace the Harness process runs in. */
const ROOT_MARKERS = ['dsh-plugins', 'contracts', 'IPTV_v5.4_MAX_AGGRESSION', '.git'];

const CACHE_MS = 30000;
const BODY_LIMIT_BYTES = 64 * 1024;

/* --------------------------------------------------- stability formula inputs */

/**
 * Weights and baselines come from the skill `iptv-stream-stability-score` (§5).
 * They are copied as CONSTANTS with their source, not tuned here: a weight change
 * is a skill change, and it must be declared there first.
 */
const W = { A: 0.4, L: 0.2, C: 0.3, F: 0.1 };
/** Median zap latency of a good zap, measured baseline of this stack (skill §5, LIVE_CAPTURE:259). */
const P50_REF_SECONDS = 0.649;
/** Provider blocking codes: unavailable, but NEVER mixed with 5xx (skill §5, apE watchdog:152-157). */
const PROVIDER_BLOCK_CODES = [401, 403, 407, 429, 451, 461];
/** 499 = the operator changed channel; excluded from the denominator (skill §5). */
const EXCLUDED_CODES = [499];
/** Minimum samples per channel or the verdict is SKIP, never a zero (skill §6). */
const MIN_SAMPLES = 30;

/* --------------------------------------------------------- remote observation */

/**
 * The one and only remote script. Constant text, LF line endings, read-only
 * commands only. Each section is delimited so a partial run is detectable: a
 * missing section is reported as `no_computado`, not as an empty result.
 */
const REMOTE_SCRIPT = [
  'set -u',
  'L="{list}"',
  'W={window}',
  'echo "@@SVC"',
  'for u in nginx php8.3-fpm ape-jit; do printf "%s|%s\\n" "$u" "$(systemctl is-active "$u" 2>&1 | head -1)"; done',
  'echo "@@TIMERS"',
  'systemctl list-timers --all --no-pager --no-legend "ape-*.timer" 2>/dev/null | sed "/^$/d" | awk "{print \\$NF}" | sort',
  'echo "@@TUNIT"',
  'systemctl list-units --all --no-pager --no-legend "ape-*.timer" 2>/dev/null | awk "{print \\$1\\"|\\"\\$3\\"|\\"\\$4}"',
  'echo "@@PROJ"',
  'if [ -f "$L" ]; then',
  '  printf "%s|%s|%s|%s|%s|%s\\n" "$(stat -c%s "$L" 2>/dev/null || echo 0)" "$(grep -c "^#EXTINF" "$L" 2>/dev/null)" "$(grep -c "^#EXTSHIMOTT:" "$L" 2>/dev/null)" "$(grep -c "^#EXT-X-APE-" "$L" 2>/dev/null)" "$(( $(date +%s) - $(stat -c%Y "$L" 2>/dev/null || date +%s) ))" "$L"',
  'else',
  '  printf "MISSING|||||%s\\n" "$L"',
  'fi',
  'echo "@@WDJ"',
  'cat /var/lib/ape/module-watchdog.json 2>/dev/null || echo "{}"',
  'echo "@@PULSE"',
  'tail -n "$W" /var/log/nginx/playlist_access.log 2>/dev/null | sed -nE "s#.*\\"(GET|HEAD|POST) /pulse/([0-9]+)[^\\"]*\\" ([0-9]{3}) .*rt=([0-9.]+).*#\\2|\\3|\\4#p" | head -4000',
  'echo "@@STATUS"',
  'tail -n "$W" /var/log/nginx/playlist_access.log 2>/dev/null | sed -nE "s#.*\\" [0-9]{3} .*#&#p" | sed -nE "s#.*\\" ([0-9]{3}) .*#\\1#p" | sort | uniq -c | sort -rn | head -25',
  'echo "@@SEG"',
  'SEG=$(tail -n "$W" /var/log/nginx/playlist_access.log 2>/dev/null | grep -c "/seg/")',
  'DEC=$(tail -n "$W" /var/log/nginx/playlist_access.log 2>/dev/null | sed -nE "s#.*\\"GET /seg/([A-Za-z0-9+/=_-]+)[^\\"]*\\".*#\\1#p" | head -200 | while read -r b; do printf "%s" "$b" | base64 -d 2>/dev/null | head -c 200; echo; done | grep -c "^http")',
  'ATTR=$(tail -n "$W" /var/log/nginx/playlist_access.log 2>/dev/null | sed -nE "s#.*\\"GET /seg/([A-Za-z0-9+/=_-]+)[^\\"]*\\".*#\\1#p" | head -200 | while read -r b; do printf "%s" "$b" | base64 -d 2>/dev/null | head -c 200; echo; done | grep -cE "^https?://[^ ]*/[0-9]{6,}\\.(ts|m4s|mp4)$")',
  'SAMPLE=$(tail -n "$W" /var/log/nginx/playlist_access.log 2>/dev/null | sed -nE "s#.*\\"GET /seg/([A-Za-z0-9+/=_-]+)[^\\"]*\\".*#\\1#p" | head -1 | while read -r b; do printf "%s" "$b" | base64 -d 2>/dev/null | head -c 120; done)',
  'printf "%s|%s|%s|%s\\n" "$SEG" "$DEC" "$ATTR" "$SAMPLE"',
  'echo "@@ERRCLASS"',
  'E=/var/log/nginx/playlist_error.log',
  'if [ -f "$E" ]; then',
  '  for p in "upstream timed out:upstream_timed_out" "upstream prematurely closed:upstream_prematurely_closed" "no live upstreams:no_live_upstreams" "connect() failed:connect_failed" "FastCGI sent in stderr:fastcgi_stderr" "SSL_do_handshake:ssl_handshake" "recv() failed:recv_failed"; do',
  '    k="${p%%:*}"; n="${p##*:}"; c=$(grep -cF "$k" "$E" 2>/dev/null); printf "%s|%s\\n" "$n" "${c:-0}";',
  '  done',
  '  c=$(grep -c "\\[error\\]" "$E" 2>/dev/null); printf "total_error|%s\\n" "${c:-0}"',
  '  c=$(grep -c "\\[warn\\]" "$E" 2>/dev/null); printf "total_warn|%s\\n" "${c:-0}"',
  'else',
  '  echo "missing|1"',
  'fi',
  'echo "@@ERRL"',
  'if [ -f "$E" ]; then grep -E "upstream timed out|upstream prematurely closed|no live upstreams|connect\\(\\) failed|recv\\(\\) failed" "$E" 2>/dev/null | tail -n 6 | cut -c1-190; else echo "MISSING"; fi',
  'echo "@@FAILOVER"',
  'nginx -T 2>/dev/null | grep -cE "^[[:space:]]*proxy_next_upstream[[:space:]]" || true',
  'nginx -T 2>/dev/null | grep -E "^[[:space:]]*proxy_next_upstream[[:space:]]" | sed -E "s/^[[:space:]]+//" | sort -u | head -6',
  'nginx -T 2>/dev/null | grep -cE "^[[:space:]]*upstream[[:space:]]+[A-Za-z0-9_.-]+[[:space:]]*\\{" || true',
  'nginx -T 2>/dev/null | grep -cE "[[:space:]]backup[[:space:]]*;" || true',
  'nginx -T 2>/dev/null | grep -cE "proxy_cache_use_stale" || true',
  'echo "@@END"',
].join('\n');

function renderRemoteScript(options) {
  const listFile = String(options.listFile || DEFAULTS.listFile);
  // Absolute, printable, and with NO `..` segment: the path is the only variable
  // that reaches the remote script, so it must not walk out of its directory.
  if (!/^\/[A-Za-z0-9._/-]{1,200}$/.test(listFile) || listFile.split('/').includes('..')) {
    throw new Error(`ruta de lista no permitida: ${listFile}`);
  }
  const window = Number(options.window);
  const safeWindow = Number.isInteger(window) && window >= 500 && window <= 200000
    ? window
    : DEFAULTS.window;
  return REMOTE_SCRIPT.replace('{list}', listFile).replace('{window}', String(safeWindow));
}

/* -------------------------------------------------------------- ssh plumbing */

function resolveConfig() {
  const env = process.env;
  const host = (env[ENV.host] || DEFAULTS.host).trim();
  const user = (env[ENV.user] || DEFAULTS.user).trim();
  const port = String(env[ENV.port] || DEFAULTS.port).trim();
  const keyPath = (env[ENV.key] || DEFAULTS.key).trim();
  const disabled = String(env[ENV.ssh] || '').toLowerCase();
  const timeoutRaw = Number(env[ENV.timeout]);
  const windowRaw = Number(env[ENV.window]);

  const problems = [];
  // Strict patterns: an environment variable must not be able to smuggle an ssh
  // option (-oProxyCommand=...) or a shell word into the command.
  if (!/^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(host)) {
    problems.push(`host invalido: ${JSON.stringify(host)}`);
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(user)) {
    problems.push(`usuario invalido: ${JSON.stringify(user)}`);
  }
  if (!/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    problems.push(`puerto invalido: ${JSON.stringify(port)}`);
  }
  if (disabled === 'off' || disabled === '0' || disabled === 'false' || disabled === 'no') {
    problems.push(`sondeo ssh desactivado por ${ENV.ssh}`);
  }
  if (!keyPath || !existsSync(keyPath)) {
    problems.push(`la clave privada no existe en ${keyPath}`);
  }

  return {
    host,
    user,
    port,
    keyPath,
    enabled: problems.length === 0,
    problems,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw >= 2000 && timeoutRaw <= 120000
      ? timeoutRaw
      : DEFAULTS.timeoutMs,
    window: Number.isFinite(windowRaw) && windowRaw >= 500 && windowRaw <= 200000
      ? windowRaw
      : DEFAULTS.window,
    listFile: (env[ENV.listFile] || DEFAULTS.listFile).trim(),
    source: {
      host: env[ENV.host] ? 'env' : 'default',
      user: env[ENV.user] ? 'env' : 'default',
      key: env[ENV.key] ? 'env' : 'default',
    },
  };
}

/** Candidates for the ssh binary: an explicit override first, then PATH, then the Windows default. */
function sshCandidates() {
  const override = process.env.APE_STABILITY_CONSOLE_SSH_BIN;
  const list = [];
  if (override) list.push(override);
  list.push('ssh');
  if (process.platform === 'win32') list.push('C:\\Windows\\System32\\OpenSSH\\ssh.exe');
  return list;
}

function runSsh(binary, args, input, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const started = Date.now();
    let child;
    try {
      child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      resolve({
        ok: false,
        reason: `no se pudo lanzar ${binary}: ${String((error && error.message) || error)}`,
        durationMs: 0,
      });
      return;
    }

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...value, durationMs: Date.now() - started, stdout, stderr });
    };

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch (error) {
        void error;
      }
      finish({ ok: false, reason: `timeout ${timeoutMs} ms al leer el VPS` });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 4 * 1024 * 1024) {
        try {
          child.kill('SIGKILL');
        } catch (error) {
          void error;
        }
        finish({ ok: false, reason: 'la salida remota supero 4 MiB' });
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 40000) stderr = stderr.slice(-40000);
    });
    child.on('error', (error) => {
      finish({
        ok: false,
        reason: `spawn fallo (${binary}): ${String((error && error.message) || error)}`,
      });
    });
    child.on('close', (code) => {
      finish({
        ok: code === 0,
        exitCode: code,
        reason: code === 0 ? null : `ssh termino con codigo ${code}`,
      });
    });
    child.stdin.on('error', (error) => void error);
    child.stdin.end(input);
  });
}

/** One cached remote observation. Concurrent callers share the in-flight promise. */
let remoteCache = { at: 0, key: '', value: null, inflight: null };

async function observeRemote(config, options) {
  const cacheKey = `${config.host}|${config.user}|${config.port}|${config.window}|${config.listFile}`;
  const now = Date.now();
  if (
    !options.refresh &&
    remoteCache.value &&
    remoteCache.key === cacheKey &&
    now - remoteCache.at < CACHE_MS
  ) {
    return { ...remoteCache.value, cached: true };
  }
  if (remoteCache.inflight && remoteCache.key === cacheKey) {
    const shared = await remoteCache.inflight;
    return { ...shared, cached: true, shared: true };
  }

  const args = [
    '-i', config.keyPath,
    '-p', config.port,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'PasswordAuthentication=no',
    '-o', 'PreferredAuthentications=publickey',
    '-o', `ConnectTimeout=${Math.min(15, Math.ceil(config.timeoutMs / 1000))}`,
    '-o', 'ConnectionAttempts=1',
    '-o', 'LogLevel=ERROR',
    `${config.user}@${config.host}`,
    'bash -s',
  ];

  const input = `${renderRemoteScript({
    listFile: config.listFile,
    window: config.window,
  })}\n`;

  // Evidence of the exact command, with the key path reduced to its basename so a
  // full home path never lands in a screenshot or a shared report.
  const command = {
    binary: 'ssh',
    target: `${config.user}@${config.host}:${config.port}`,
    keyBasename: path.basename(config.keyPath),
    mode: 'BatchMode, publickey only, no PTY',
    payload: 'bash -s < whitelisted read-only script',
    timeoutMs: config.timeoutMs,
    windowLines: config.window,
    listFile: config.listFile,
  };

  const run = (async () => {
    const attempts = [];
    for (const binary of sshCandidates()) {
      const result = await runSsh(binary, args, input, config.timeoutMs);
      attempts.push({ binary, ok: result.ok, exitCode: result.exitCode ?? null, reason: result.reason ?? null });
      if (result.ok) {
        const parsed = parseRemote(result.stdout);
        const value = { ok: true, ...parsed, command, attempts, durationMs: result.durationMs };
        remoteCache = { at: Date.now(), key: cacheKey, value, inflight: null };
        return value;
      }
      // A missing binary is the only case worth retrying with the next candidate.
      if (!/ENOENT|spawn fallo/i.test(String(result.reason || ''))) {
        const value = {
          ok: false,
          status: 'no_computado',
          reason: result.reason,
          stderrTail: String(result.stderr || '').slice(-600),
          command,
          attempts,
          durationMs: result.durationMs,
        };
        remoteCache = { at: Date.now(), key: cacheKey, value, inflight: null };
        return value;
      }
    }
    const value = {
      ok: false,
      status: 'no_computado',
      reason: 'no hay binario ssh disponible en este host',
      command,
      attempts,
    };
    remoteCache = { at: Date.now(), key: cacheKey, value, inflight: null };
    return value;
  })();

  remoteCache = { at: remoteCache.at, key: cacheKey, value: remoteCache.value, inflight: run };
  return run;
}

/* -------------------------------------------------------------------- parsing */

function splitSections(text) {
  const sections = {};
  let current = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const marker = /^@@([A-Z]+)$/.exec(line.trim());
    if (marker) {
      current = marker[1];
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  return sections;
}

function parseRemote(text) {
  const sections = splitSections(text);
  const missing = ['SVC', 'TIMERS', 'PROJ', 'PULSE', 'STATUS', 'SEG', 'ERRCLASS', 'FAILOVER', 'END']
    .filter((name) => !sections[name]);
  return {
    sections: Object.keys(sections),
    missingSections: missing,
    complete: missing.length === 0,
    services: (sections.SVC || []).map((line) => {
      const [unit, state] = line.split('|');
      return { unit, state: (state || '').trim() || 'desconocido' };
    }).filter((row) => row.unit),
    timers: (sections.TIMERS || []).map((line) => line.trim()).filter(Boolean),
    timerUnits: (sections.TUNIT || []).map((line) => {
      const [name, active, sub] = line.split('|');
      return { name, active, sub };
    }).filter((row) => row.name),
    projection: (sections.PROJ || [])[0] === undefined
      ? null
      : (() => {
          const parts = String(sections.PROJ[0]).split('|');
          if (parts[0] === 'MISSING') {
            return { status: 'missing', path: parts[5] || null };
          }
          return {
            status: 'measured',
            bytes: Number(parts[0]),
            channels: Number(parts[1]),
            tags: Number(parts[2]),
            apeLines: Number(parts[3]),
            ageSeconds: Number(parts[4]),
            path: parts[5] || null,
          };
        })(),
    watchdog: (() => {
      const raw = (sections.WDJ || []).join('').trim();
      if (!raw) return { status: 'missing', reason: 'el fichero de estado del vigilante llego vacio' };
      try {
        return { status: 'found', document: JSON.parse(raw) };
      } catch (error) {
        return {
          status: 'invalid_json',
          reason: String((error && error.message) || error),
          head: raw.slice(0, 200),
        };
      }
    })(),
    pulse: (sections.PULSE || []).map((line) => {
      const [channel, status, rt] = line.split('|');
      const code = Number(status);
      const latency = Number(rt);
      if (!channel || !Number.isFinite(code)) return null;
      return {
        channel,
        status: code,
        rt: Number.isFinite(latency) ? latency : null,
      };
    }).filter(Boolean),
    statusHistogram: (sections.STATUS || []).map((line) => {
      const match = /^\s*(\d+)\s+(\S+)\s*$/.exec(line);
      if (!match) return null;
      const code = Number(match[2]);
      return {
        count: Number(match[1]),
        status: match[2],
        code: Number.isFinite(code) ? code : null,
      };
    }).filter(Boolean),
    segments: (() => {
      const parts = String((sections.SEG || [])[0] || '').split('|');
      return {
        requests: Number(parts[0]) || 0,
        decoded: Number(parts[1]) || 0,
        attributable: Number(parts[2]) || 0,
        sample: parts[3] || null,
      };
    })(),
    errorClasses: (sections.ERRCLASS || []).map((line) => {
      const [name, count] = line.split('|');
      return { name, count: Number(count) || 0 };
    }).filter((row) => row.name),
    errorLines: (sections.ERRL || []).filter((line) => line && line !== 'MISSING'),
    failover: (() => {
      // Positional block: a count, then that many directive lines, then three more
      // counts. The pointer advances so directives can never be read as a count.
      const rows = (sections.FAILOVER || []).map((line) => line.trim()).filter(Boolean);
      let cursor = 0;
      const nextCount = Number(rows[cursor]) || 0;
      cursor += 1;
      const directives = rows.slice(cursor, cursor + nextCount);
      cursor += nextCount;
      return {
        nextUpstreamCount: nextCount,
        nextUpstreamDirectives: directives,
        upstreamBlocks: Number(rows[cursor]) || 0,
        backupServers: Number(rows[cursor + 1]) || 0,
        cacheUseStale: Number(rows[cursor + 2]) || 0,
        raw: rows.slice(0, 10),
      };
    })(),
  };
}

/* ----------------------------------------------------- the stability formula */

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isProviderBlock(code) {
  return PROVIDER_BLOCK_CODES.includes(code);
}

function isSuccess(code) {
  return (code >= 200 && code < 400);
}

function isServerError(code) {
  return code >= 500 && code <= 599;
}

/**
 * Score one channel exactly as the skill defines it, and renormalise over the
 * components actually computed (§7). A missing component is null and named, never
 * a zero: putting 0 in C would invent a freeze.
 */
function scoreChannel(channel, samples, context) {
  const total = samples.length;
  const successes = samples.filter((row) => isSuccess(row.status)).length;
  const serverErrors = samples.filter((row) => isServerError(row.status)).length;
  const blocked = samples.filter((row) => isProviderBlock(row.status)).length;
  const notFound = samples.filter((row) => row.status === 404).length;
  const excluded = samples.filter((row) => EXCLUDED_CODES.includes(row.status)).length;
  const zero = samples.filter((row) => row.status === 0 || row.status === null).length;
  const denom = successes + serverErrors + blocked + zero;

  const noComputado = [];
  const computed = {};

  // A - availability (weight 0.40)
  if (denom === 0) {
    noComputado.push('A: no hay muestras puntuables en la ventana (denominador 0)');
  } else {
    computed.A = successes / denom;
  }

  // L - zap latency (weight 0.20). 5xx and 499 are excluded: a 502 latency is not
  // a zap, and a 499 is a request the operator aborted, so its rt is truncated.
  const latencies = samples
    .filter((row) => row.rt !== null && !isServerError(row.status) && !EXCLUDED_CODES.includes(row.status))
    .map((row) => row.rt);
  const excludedFromL = samples.filter((row) => EXCLUDED_CODES.includes(row.status)).length;
  const p50 = median(latencies);
  if (!p50) {
    noComputado.push(
      `L: sin muestras de rt utilizables (excluidos 5xx y 499; ${excludedFromL} muestras 499 fuera)`,
    );
  } else {
    computed.L = clamp01(1 - (p50 / P50_REF_SECONDS - 1) / 2);
  }

  // C - segment continuity (weight 0.30): only when the chain is attributable.
  if (context.segmentAttribution.possible) {
    computed.C = context.segmentAttribution.value;
  } else {
    noComputado.push(`C: ${context.segmentAttribution.reason}`);
  }

  // F - freshness (weight 0.10): requires the X-APE-Pulse header to be persisted.
  if (context.freshness.possible) {
    computed.F = context.freshness.value;
  } else {
    noComputado.push(`F: ${context.freshness.reason}`);
  }

  // Renormalise over present weights (§7).
  const present = Object.keys(computed);
  const weightSum = present.reduce((sum, key) => sum + W[key], 0);
  const score = weightSum > 0
    ? (100 * present.reduce((sum, key) => sum + W[key] * computed[key], 0)) / weightSum
    : null;

  // Verdict (§6). SKIP is not a zero, and the grey band is named, not invented.
  const fivexxLastFiveMin = samples.slice(-20).filter((row) => isServerError(row.status)).length;
  const blockedRatio = total > 0 ? blocked / total : 0;
  let verdict;
  let verdictReason;
  if (computed.A === undefined) {
    // Without the availability axis there is no score: 40 % of the weight is
    // missing and the rest describes a population that never completed a zap.
    verdict = 'SKIP';
    verdictReason =
      'sin muestras puntuables (A no computado): un score sin el eje de disponibilidad no es un score, y no se rellena con 0';
  } else if (total < MIN_SAMPLES) {
    verdict = 'SKIP';
    verdictReason = `n=${total} < ${MIN_SAMPLES} muestras minimas`;
  } else if (blockedRatio > 0.5) {
    verdict = 'SKIP';
    verdictReason = `bloqueo_proveedor ${blocked}/${total} (>50%): es un caso para el proveedor, no para la lista`;
  } else if (computed.A < 0.9) {
    verdict = 'FAIL';
    verdictReason = `A=${computed.A.toFixed(3)} < 0.90`;
  } else if (serverErrors >= 5) {
    verdict = 'FAIL';
    verdictReason = `${serverErrors} respuestas 5xx en la ventana`;
  } else if (computed.C !== undefined && computed.C < 0.7) {
    verdict = 'FAIL';
    verdictReason = `C=${computed.C.toFixed(3)} < 0.70`;
  } else if (
    computed.A >= 0.98 &&
    computed.L >= 0.7 &&
    (computed.C === undefined || computed.C >= 0.9) &&
    fivexxLastFiveMin === 0
  ) {
    verdict = 'PASS';
    verdictReason = 'A>=0.98, L>=0.70, C>=0.90 o no computado, sin 5xx recientes';
  } else {
    verdict = 'SIN_VEREDICTO';
    verdictReason =
      'la skill define PASS (A>=0.98) y FAIL (A<0.90) pero no etiqueta la banda intermedia; se declara sin veredicto en vez de inventar uno';
  }

  return {
    channel,
    n: total,
    successes,
    serverErrors,
    blocked,
    notFound,
    excluded,
    zero,
    excludedFromL,
    p50,
    A: computed.A ?? null,
    L: computed.L ?? null,
    C: computed.C ?? null,
    F: computed.F ?? null,
    // A SKIP has no score by definition: it means the evidence is insufficient, so
    // a number here would be a zero in disguise. A/L stay visible so the reason is
    // diagnosable (e.g. A=0 with 326 provider blocks), never averaged.
    score: verdict === 'SKIP' ? null : score === null ? null : Math.round(score * 10) / 10,
    confianza: present.length === Object.keys(W).length ? 'completa' : 'parcial',
    componentes: present,
    noComputado,
    bloqueoProveedor: blocked,
    veredicto: verdict,
    veredictoRazon: verdictReason,
  };
}

function buildStability(remote) {
  const samplesByChannel = new Map();
  for (const row of remote.pulse || []) {
    if (!samplesByChannel.has(row.channel)) samplesByChannel.set(row.channel, []);
    samplesByChannel.get(row.channel).push(row);
  }

  // Attribution attempt for C, measured (not assumed): the /seg/ URIs are base64 of
  // an upstream URL; if none of them carries a channel identifier, the chain
  // /pulse -> /seg is not attributable and C is declared NO COMPUTADO with the count.
  const seg = remote.segments || { requests: 0, decoded: 0, attributable: 0, sample: null };
  const attribution = seg.attributable > 0
    ? { possible: true, value: null, reason: 'atribucion presente pero la formula de gap no se aplico' }
    : {
        possible: false,
        reason:
          `0 de ${seg.decoded} URIs /seg/ muestreadas llevan id de canal en la URL decodificada ` +
          `(peticiones /seg/ en la ventana: ${seg.requests}); la cadena /pulse -> /seg no es atribuible ` +
          `y la skill prohibe estimarla`,
      };

  const freshness = {
    possible: false,
    reason:
      'el log_format ape_playlist no registra $sent_http_x_ape_pulse y el header no se persiste: sin serie historica no hay F',
  };

  const rows = [];
  for (const [channel, samples] of samplesByChannel) {
    rows.push(scoreChannel(channel, samples, { segmentAttribution: attribution, freshness }));
  }
  // Channels WITH a real score first (worst score at the top, which is the useful
  // order for an operator); channels that only produced SKIP after them, by sample
  // count, so a 1-sample row never outranks a channel that was actually measured.
  rows.sort((a, b) => {
    const ea = a.score === null ? 1 : 0;
    const eb = b.score === null ? 1 : 0;
    if (ea !== eb) return ea - eb;
    if (ea === 0) return a.score - b.score;
    return b.n - a.n;
  });

  const verdicts = { PASS: 0, FAIL: 0, SKIP: 0, SIN_VEREDICTO: 0 };
  for (const row of rows) verdicts[row.veredicto] = (verdicts[row.veredicto] || 0) + 1;
  const withEvidence = rows.filter((row) => row.n >= MIN_SAMPLES && row.A !== null).length;

  return {
    status: rows.length ? 'computed' : 'no_computado',
    reason: rows.length
      ? null
      : 'la ventana del log no contiene ninguna peticion /pulse/<id> puntuable',
    formula:
      'S = 100 * sum(w_i * X_i) / sum(w_i) sobre los componentes computados; w: A=0.40 L=0.20 C=0.30 F=0.10 (skill iptv-stream-stability-score §5). ' +
      'Un veredicto SKIP no lleva score: evidencia insuficiente no es un cero.',
    p50RefSeconds: P50_REF_SECONDS,
    minSamples: MIN_SAMPLES,
    windowLines: null,
    channels: rows.length,
    withEvidence,
    totalPulseSamples: (remote.pulse || []).length,
    verdicts,
    rows: rows.slice(0, 24),
    attribution,
    freshness,
    providerBlockCodes: PROVIDER_BLOCK_CODES,
    excludedCodes: EXCLUDED_CODES,
  };
}

/* ------------------------------------------------------- failover / error card */

function buildFailover(remote) {
  const classes = {};
  for (const row of remote.errorClasses || []) classes[row.name] = row.count;

  const providerBlock = (remote.statusHistogram || [])
    .filter((row) => row.code !== null && isProviderBlock(row.code))
    .reduce((sum, row) => sum + row.count, 0);
  const serverErrors = (remote.statusHistogram || [])
    .filter((row) => row.code !== null && isServerError(row.code))
    .reduce((sum, row) => sum + row.count, 0);
  const excluded = (remote.statusHistogram || [])
    .filter((row) => row.code !== null && EXCLUDED_CODES.includes(row.code))
    .reduce((sum, row) => sum + row.count, 0);

  const networkEvents = (classes.upstream_timed_out || 0) +
    (classes.upstream_prematurely_closed || 0) +
    (classes.no_live_upstreams || 0) +
    (classes.connect_failed || 0) +
    (classes.recv_failed || 0);

  const failover = remote.failover || {};
  const armed = (failover.nextUpstreamCount || 0) > 0;
  const multiBackend = (failover.upstreamBlocks || 0) > 0 && (failover.backupServers || 0) > 0;

  return {
    status: remote.missingSections.includes('FAILOVER') ? 'no_computado' : 'computed',
    errorLog: {
      file: '/var/log/nginx/playlist_error.log',
      measured: 'es el error_log de nginx (error_log ... warn), NO un access_log: no contiene codigos de estado en formato de acceso',
      totalError: classes.total_error ?? null,
      totalWarn: classes.total_warn ?? null,
      fastcgiStderr: classes.fastcgi_stderr ?? null,
      networkEvents,
      classes,
      note:
        `de ${classes.total_error ?? 0} lineas [error], ${classes.fastcgi_stderr ?? 0} son mensajes PHP por FastCGI y solo ${networkEvents} son eventos de red reales ` +
        '(upstream timed out / prematurely closed / no live upstreams / connect / recv)',
    },
    lastNetworkLines: remote.errorLines || [],
    accessWindow: {
      providerBlock,
      serverErrors,
      excluded,
      histogram: remote.statusHistogram || [],
      note: '401/403/407/429/451/461 se cuentan como bloqueo del proveedor y NUNCA como fallo de red',
    },
    failoverArmed: {
      armed,
      multiBackend,
      nextUpstreamDirectives: failover.nextUpstreamDirectives || [],
      upstreamBlocks: failover.upstreamBlocks ?? null,
      backupServers: failover.backupServers ?? null,
      cacheUseStale: failover.cacheUseStale ?? null,
      reason: armed
        ? multiBackend
          ? 'proxy_next_upstream presente y ademas hay upstream con backup: failover entre backends armado'
          : 'proxy_next_upstream presente (reintento de nginx ante error/timeout) pero NO hay bloques upstream con servidor backup: no hay failover entre backends'
        : 'no hay ninguna directiva proxy_next_upstream activa en la configuracion volcada por nginx -T',
    },
  };
}

/* ------------------------------------------------------------- availability */

function buildAvailability(remote) {
  const services = (remote.services || []).map((row) => ({
    unit: row.unit,
    state: row.state,
    ok: row.state === 'active',
  }));
  const timers = remote.timers || [];
  const units = remote.timerUnits || [];
  const deadTimers = units.filter((row) => row.active && row.active !== 'active');
  const watchdog = remote.watchdog || { status: 'missing' };

  return {
    status: services.length ? 'computed' : 'no_computado',
    reason: services.length ? null : 'systemctl no devolvio ninguna unidad',
    services,
    servicesOk: services.filter((row) => row.ok).length,
    timers: {
      count: timers.length,
      names: timers,
      deadTimers,
      note:
        'systemctl list-timers --all "ape-*.timer": un timer listado en inactive/dead esta declarado pero NO armado',
    },
    watchdog: {
      status: watchdog.status,
      reason: watchdog.reason ?? null,
      ts: watchdog.document ? watchdog.document.ts : null,
      verdict: watchdog.document ? watchdog.document.verdict : null,
      fallos: watchdog.document ? watchdog.document.fallos : null,
      modules: watchdog.document && Array.isArray(watchdog.document.modulos)
        ? watchdog.document.modulos.map((row) => ({
            module: row.module,
            status: row.status,
            detail: row.detail,
          }))
        : [],
    },
  };
}

/* -------------------------------------------------------------- projection */

function buildProjection(remote, options) {
  const live = remote.projection;
  const watchdogRow = (remote.watchdog && remote.watchdog.document && Array.isArray(remote.watchdog.document.modulos))
    ? remote.watchdog.document.modulos.find((row) => row.module === 'proyeccion')
    : null;

  const gate = {
    status: watchdogRow ? 'computed' : 'no_computado',
    reason: watchdogRow ? null : 'el vigilante no trae fila `proyeccion` en esta lectura',
    ts: remote.watchdog && remote.watchdog.document ? remote.watchdog.document.ts : null,
    verdict: watchdogRow ? watchdogRow.status : null,
    detail: watchdogRow ? watchdogRow.detail : null,
    /** The gate passes only when channels > 0, one tag per channel and zero APE lines. */
    expected: 'l_ch > 0 && l_tag == l_ch && l_ape == 0',
  };

  let liveBlock;
  if (!options.gate) {
    liveBlock = {
      status: 'not_measured',
      reason:
        'no se recontaron los 186 MB en esta lectura: la tarjeta muestra la medicion del gate [11] (cada 60 s) y el boton "medir ahora" lanza el recuento real',
    };
  } else if (!live) {
    liveBlock = { status: 'no_computado', reason: 'la seccion @@PROJ no llego en la respuesta del VPS' };
  } else if (live.status === 'missing') {
    liveBlock = { status: 'no_computado', reason: `la lista no existe en ${live.path}` };
  } else {
    const consistent = live.channels > 0 && live.tags === live.channels && live.apeLines === 0;
    liveBlock = {
      status: 'computed',
      bytes: live.bytes,
      channels: live.channels,
      tags: live.tags,
      apeLines: live.apeLines,
      ageSeconds: live.ageSeconds,
      path: live.path,
      consistent,
      verdict: consistent ? 'ok' : 'fail',
      check: `canales=${live.channels} tags=${live.tags} ape=${live.apeLines} bytes=${live.bytes}`,
    };
  }

  return { gate, live: liveBlock };
}

/* ----------------------------------------------------------------- transport */

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

/** Locate the workspace root so the panel can also report local artifacts. */
function detectWorkspace() {
  const candidates = [];
  const push = (directory, source) => {
    const resolved = path.resolve(directory);
    if (!candidates.some((candidate) => candidate.path === resolved)) {
      candidates.push({ path: resolved, source });
    }
  };
  const envRoot = process.env[ENV.workspace];
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
    candidate.markers = ROOT_MARKERS.filter((marker) => existsSync(path.join(candidate.path, marker)));
  }
  const chosen =
    candidates.find((c) => c.source === 'env' && c.markers.length) ||
    candidates.find((c) => c.source === 'cwd' && c.markers.length) ||
    candidates.find((c) => c.markers.length) ||
    candidates[0];
  return {
    root: chosen.path,
    source: chosen.source,
    candidates: candidates.map((c) => ({ path: c.path, source: c.source, markers: c.markers })),
  };
}

/** Local evidence: does the loopback copy of this repo carry a list snapshot? */
async function probeLocalList(workspaceRoot) {
  const candidates = [
    'scratch/APE_LISTA_HARNESS.m3u8',
    'scratch/LISTA_ACTUAL.m3u8',
  ];
  const rows = [];
  for (const relative of candidates) {
    const absolute = path.join(workspaceRoot, relative);
    try {
      const info = await stat(absolute);
      rows.push({ relative, status: 'found', bytes: info.size, mtime: info.mtime.toISOString() });
    } catch (error) {
      rows.push({
        relative,
        status: 'not_found',
        reason: error && error.code ? error.code : String((error && error.message) || error),
      });
    }
  }
  return rows;
}

/* ---------------------------------------------------------------- state build */

async function buildState(options) {
  const started = Date.now();
  const config = resolveConfig();
  const workspace = detectWorkspace();

  const base = {
    plugin: { name: '@local/ape-stability-console', version: '1.0.0' },
    generatedAt: new Date().toISOString(),
    workspace,
    vps: {
      target: `${config.user}@${config.host}:${config.port}`,
      keyBasename: path.basename(config.keyPath),
      enabled: config.enabled,
      problems: config.problems,
      source: config.source,
      timeoutMs: config.timeoutMs,
      windowLines: config.window,
    },
    probe: Boolean(options.probe),
    gate: Boolean(options.gate),
  };

  if (!options.probe) {
    return {
      ok: true,
      ...base,
      status: 'not_probed',
      reason:
        'primera pintura sin sondeo: el panel lanza el sondeo read-only al VPS en una segunda peticion para no bloquear la pagina',
      availability: null,
      projection: null,
      stability: null,
      failover: null,
      localLists: await probeLocalList(workspace.root),
    };
  }

  if (!config.enabled) {
    const reason = config.problems.join('; ');
    return {
      ok: true,
      ...base,
      status: 'no_computado',
      reason,
      availability: { status: 'no_computado', reason },
      projection: { status: 'no_computado', reason, gate: null, live: null },
      stability: { status: 'no_computado', reason },
      failover: { status: 'no_computado', reason },
      localLists: await probeLocalList(workspace.root),
    };
  }

  const remote = await observeRemote(config, { refresh: Boolean(options.refresh) });

  if (!remote.ok) {
    const reason = remote.reason || 'el sondeo remoto no devolvio datos';
    return {
      ok: true,
      ...base,
      status: 'no_computado',
      reason,
      remote: {
        status: remote.status || 'failed',
        reason,
        stderrTail: remote.stderrTail || null,
        command: remote.command,
        attempts: remote.attempts,
        durationMs: remote.durationMs ?? null,
      },
      availability: { status: 'no_computado', reason },
      projection: { status: 'no_computado', reason, gate: null, live: null },
      stability: { status: 'no_computado', reason },
      failover: { status: 'no_computado', reason },
      localLists: await probeLocalList(workspace.root),
    };
  }

  const availability = buildAvailability(remote);
  const projection = buildProjection(remote, { gate: Boolean(options.gate) });
  const stability = buildStability(remote);
  stability.windowLines = config.window;
  const failover = buildFailover(remote);

  const noComputado = [];
  if (remote.missingSections.length) {
    noComputado.push(`secciones ausentes en la respuesta del VPS: ${remote.missingSections.join(', ')}`);
  }
  if (projection.gate.status !== 'computed') noComputado.push(`gate [11]: ${projection.gate.reason}`);
  if (projection.live.status !== 'computed') noComputado.push(`recuento de proyeccion: ${projection.live.reason}`);
  if (stability.status !== 'computed') noComputado.push(`score por canal: ${stability.reason}`);
  noComputado.push(
    `componente C (continuidad, peso 0.30): ${stability.attribution.reason} - pesos renormalizados sobre los componentes presentes`,
  );
  noComputado.push(`componente F (frescura, peso 0.10): ${stability.freshness.reason}`);
  if (stability.channels > 0 && stability.withEvidence === 0) {
    noComputado.push(
      `ninguno de los ${stability.channels} canales de la ventana alcanza n>=${stability.minSamples}: todos salen SKIP, que no es un cero`,
    );
  }
  if (!failover.failoverArmed.armed) noComputado.push(`failover: ${failover.failoverArmed.reason}`);

  return {
    ok: true,
    ...base,
    status: 'computed',
    remote: {
      status: 'ok',
      complete: remote.complete,
      sections: remote.sections,
      command: remote.command,
      attempts: remote.attempts,
      durationMs: remote.durationMs ?? null,
      cached: Boolean(remote.cached),
    },
    availability,
    projection,
    stability,
    failover,
    noComputado,
    localLists: await probeLocalList(workspace.root),
    totalDurationMs: Date.now() - started,
  };
}

async function handleState(req, res) {
  try {
    const requestUrl = new URL(req.url || ROUTE_STATE, 'http://localhost');
    const flag = (name, fallback) => {
      const raw = requestUrl.searchParams.get(name);
      if (raw === null) return fallback;
      return !['0', 'false', 'no'].includes(raw.toLowerCase());
    };
    const state = await buildState({
      probe: flag('probe', true),
      gate: flag('gate', false),
      refresh: flag('refresh', false),
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

/** POST-only: re-runs the expensive gate [11] recount. Read-only, but costly. */
async function handleGate(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, status: 'method_not_allowed', allow: ['POST'] });
    return;
  }
  try {
    await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      status: error && error.code === 'BODY_TOO_LARGE' ? 'body_too_large' : 'invalid_json',
      reason: String((error && error.message) || error),
    });
    return;
  }
  try {
    const state = await buildState({ probe: true, gate: true, refresh: true });
    sendJson(res, 200, state);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      status: 'gate_failed',
      reason: String((error && error.message) || error),
    });
  }
}

/* ------------------------------------------------------------------- bundle */

export function apply(ctx) {
  ctx.inject(['webServer'], (scope) => {
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: ROUTE_STATE, handler: handleState }),
      'ape-stability-console: state route',
    );
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: ROUTE_GATE, handler: handleGate }),
      'ape-stability-console: gate route',
    );
  });
}

/** Exported for the reproducible self-check; the Loader only needs `apply`. */
export const __testing = {
  ROUTE_STATE,
  ROUTE_GATE,
  ENV,
  DEFAULTS,
  W,
  P50_REF_SECONDS,
  MIN_SAMPLES,
  PROVIDER_BLOCK_CODES,
  EXCLUDED_CODES,
  SERVICES,
  REMOTE_SCRIPT,
  renderRemoteScript,
  resolveConfig,
  parseRemote,
  splitSections,
  scoreChannel,
  buildStability,
  buildFailover,
  buildAvailability,
  buildProjection,
  detectWorkspace,
  buildState,
  handleState,
  handleGate,
};
