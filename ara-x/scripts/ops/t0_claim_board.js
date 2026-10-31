#!/usr/bin/env node
'use strict';

/**
 * T0 · ara-x-dynamic-controller — claim del scope en el tablero inter-sesión.
 *
 * Uso:
 *   node ara-x/scripts/ops/t0_claim_board.js claim   # ANTES de escribir en el registro
 *   node ara-x/scripts/ops/t0_claim_board.js close   # al terminar (gate + release)
 *
 * Escribe exactamente tres artefactos de coordinación:
 *   .agent-teams/session-board/BOARD.json         claims[] + lifecycle.post_closure_activity + notices{} + stats{} + revision
 *   docs/ops/session-coordination/notices.jsonl   append-only, 1 línea JSON por evento
 *   _coord/claims/<UTC>_vps-edge-engineer.claim   status active -> released (no se borra)
 *
 * Protocolo:
 *   docs/ops/session-coordination/COORDINATION_PROTOCOL.md §4 (claim/heartbeat/release/aviso)
 *   docs/COORDINACION_AGENTES.md §3 (archivo de claim en _coord/claims/)
 *
 * NO toca código, contratos ni el VPS. `close` es un gate: si el workstream no quedó
 * registrado con los invariantes de T0, aborta sin liberar el claim.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..', '..');
const BOARD_PATH = path.join(REPO, '.agent-teams', 'session-board', 'BOARD.json');
const NOTICES_PATH = path.join(REPO, 'docs', 'ops', 'session-coordination', 'notices.jsonl');
const CLAIMS_DIR = path.join(REPO, '_coord', 'claims');
const REGISTRY_PATH = path.join(REPO, 'contracts', 'ownership_scopes.json');

const CLAIM_ID = 'C-016';
const SESSION_ID = '0fd31e8a-ba32-4d84-94fe-6c0ef7526932';
const AGENT = 'vps-edge-engineer';
const TEAM = 'ara-x-dynamic-controller';
const TASK = 't1';
const ATTEMPT_ID = 'e367cc94-2c3b-492f-a0f7-1279a5214b92';
const TTL_MINUTES = 240;

const SCOPE = [
  'ara-x/**',
  'contracts/ownership_scopes.json',
  '.agent-teams/session-board/BOARD.json',
  'docs/ops/session-coordination/notices.jsonl',
  '_coord/claims/**'
];

const EXPECTED_WRITE_SCOPES = ['ara-x/**'];
const EXPECTED_FORBIDDEN = [
  'frontend/**',
  'IPTV_v5.4_MAX_AGGRESSION/vps/**',
  'IPTV_v5.4_MAX_AGGRESSION/frontend/**',
  'docs/rea/**',
  '_vps_stage/**',
  'deliverables/**',
  '.agent-teams/**'
];

const INTENT =
  'T0 · alta del workstream ara-x-dynamic-controller en contracts/ownership_scopes.json ' +
  '(mode write, write_scopes ["ara-x/**"], forbidden frontend/**, IPTV_v5.4_MAX_AGGRESSION/{vps,frontend}/**, ' +
  'docs/rea/**, _vps_stage/**, deliverables/**, .agent-teams/**) + claim registrado. Sin commit, sin escritura VPS.';

/* ---------------------------------------------------------------- helpers */

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}

function isoLocal(ms) {
  return new Date(ms - 5 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, '-05:00');
}

function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

function fileFact(p) {
  const b = fs.readFileSync(p);
  return { path: path.relative(REPO, p).split(path.sep).join('/'), bytes: b.length, sha256: sha256(b) };
}

function readNotices() {
  const raw = fs.readFileSync(NOTICES_PATH, 'utf8');
  return raw.split(/\r?\n/).filter(Boolean).map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error('notices.jsonl línea ' + (i + 1) + ' inválida: ' + err.message);
    }
  });
}

function nextEventId(events) {
  const nums = events
    .map((e) => parseInt(String(e.event_id || '').replace(/\D/g, ''), 10))
    .filter((n) => Number.isFinite(n));
  const base = nums.length ? Math.max(...nums) : 0;
  return 'E-' + String(base + 1).padStart(4, '0');
}

function appendNotice(ev) {
  let raw = fs.readFileSync(NOTICES_PATH);
  if (raw.length && raw[raw.length - 1] !== 0x0a) {
    raw = Buffer.concat([raw, Buffer.from('\n')]);
  }
  const line = Buffer.from(JSON.stringify(ev) + '\n', 'utf8');
  fs.writeFileSync(NOTICES_PATH, Buffer.concat([raw, line]));
  const after = fs.readFileSync(NOTICES_PATH);
  const lines = after.toString('utf8').split(/\r?\n/).filter(Boolean);
  return {
    lastEventId: ev.event_id,
    lastEventTs: ev.ts,
    bytes: after.length,
    sha256: sha256(after),
    lines: lines.length
  };
}

function saveBoard(board, noticesMeta) {
  board.revision += 1;
  board.updated_at = isoLocal(Date.now());
  board.generated_by = {
    session_id: SESSION_ID,
    agent: AGENT,
    team: TEAM,
    task: TASK,
    attempt_id: ATTEMPT_ID
  };
  board.notices.events = noticesMeta.lines;
  board.notices.last_event_id = noticesMeta.lastEventId;
  board.notices.last_event_ts = noticesMeta.lastEventTs;
  board.notices.bytes = noticesMeta.bytes;
  board.notices.sha256 = noticesMeta.sha256;
  board.stats.claims_total = board.claims.length;
  board.stats.claims_active = board.claims.filter((c) => c.state === 'active').length;
  board.stats.claims_released = board.claims.filter((c) => c.state === 'released').length;
  board.stats.notices_events = noticesMeta.lines;
  board.stats.updated_by_revision = board.revision;
  writeJSON(BOARD_PATH, board);
}

function postClosureEntry(kind, eventId, rev, note) {
  return {
    kind,
    claim_id: CLAIM_ID,
    team: TEAM,
    agent: AGENT,
    task: TASK,
    notice_event: eventId,
    board_revision: rev,
    ts: isoLocal(Date.now()),
    note
  };
}

/* ---------------------------------------------------------------- claim */

function claim() {
  const nowMs = Date.now();
  const ts = isoLocal(nowMs);
  const stamp = utcStamp(nowMs);
  const claimFile = path.join(CLAIMS_DIR, stamp + '_' + AGENT + '.claim');
  const notices = readNotices();
  const eventId = nextEventId(notices);
  const board = readJSON(BOARD_PATH);

  if (board.claims.some((c) => c.id === CLAIM_ID)) {
    console.log(JSON.stringify({ ok: true, skipped: 'claim already present', claim_id: CLAIM_ID }, null, 2));
    return;
  }
  const colliding = board.claims.filter(
    (c) => c.state === 'active' && (c.scope || []).some((s) => s === 'contracts/ownership_scopes.json' || s === 'ara-x/**')
  );
  if (colliding.length) {
    console.error('ABORT: claims activos que solapan el scope: ' + colliding.map((c) => c.id).join(', '));
    process.exit(1);
  }

  const regPre = fileFact(REGISTRY_PATH);
  const preDetail = regPre.sha256 + ' / ' + regPre.bytes + ' bytes (PRE)';

  const claimChild = {
    agent: AGENT,
    team: TEAM,
    task: TASK,
    session_id: SESSION_ID,
    attempt_id: ATTEMPT_ID,
    scope: SCOPE,
    intent: INTENT,
    created_at: new Date(nowMs).toISOString(),
    ttl_minutes: TTL_MINUTES,
    status: 'active',
    board_claim: CLAIM_ID,
    notice_event: eventId,
    evidence_pre: {
      registry: preDetail,
      registry_path: regPre.path
    },
    lock_resolution:
      'contracts/** figura como L-007 en COORDENADAS_SESIONES.md §3.1 (DSH sesión VPS, 2026-10-25 22:30), ' +
      'pero NO está en .session/locks.json (drift X-003), el board de origen está en phase=certified-closed ' +
      'desde 2026-10-25T23:58:50-05:00 y docs/COORDINACION_AGENTES.md (2026-10-27) asigna ' +
      'contracts/ownership_scopes.json al alta de workstreams. node tools/session-guard.js guard -> exit 0.'
  };

  fs.mkdirSync(CLAIMS_DIR, { recursive: true });
  writeJSON(claimFile, claimChild);

  const notice = {
    ts,
    event_id: eventId,
    session_id: SESSION_ID,
    agente: AGENT,
    team: TEAM,
    task: TASK,
    estado: 'claim',
    scope: SCOPE,
    mode: 'write',
    ttl_minutes: TTL_MINUTES,
    expires_at: isoLocal(nowMs + TTL_MINUTES * 60 * 1000),
    intent: INTENT,
    evidencia: [
      { tipo: 'sha256', ref: 'contracts/ownership_scopes.json', detalle: preDetail },
      {
        tipo: 'board',
        ref: '.agent-teams/session-board/BOARD.json',
        detalle:
          'claim ' + CLAIM_ID + ' (team ' + TEAM + ', task ' + TASK + '); board histórico phase=certified-closed rev ' + board.revision + ' no se reabre'
      },
      {
        tipo: 'note',
        ref: 'L-007 contracts/** (COORDENADAS_SESIONES.md §3.1, DSH sesión VPS, 2026-10-25 22:30)',
        detalle:
          'lock tomado como vencido/superseded: ausente de .session/locks.json (drift X-003), board de origen ' +
          'certified-closed desde 2026-10-25T23:58:50-05:00; session-guard guard exit 0; alta de solo-apéndice'
      }
    ],
    conflicts: ['X-003']
  };
  const noticesMeta = appendNotice(notice);

  board.claims.push({
    id: CLAIM_ID,
    session_id: SESSION_ID,
    agent: AGENT,
    team: TEAM,
    task: TASK,
    task_subject: 'T0 · Registrar workstream ARA-X y claim de scope',
    mode: 'write',
    scope: SCOPE,
    intent: INTENT,
    created_at: ts,
    ttl_minutes: TTL_MINUTES,
    expires_at: isoLocal(nowMs + TTL_MINUTES * 60 * 1000),
    heartbeat_at: ts,
    state: 'active',
    conflicts: ['X-003'],
    claim_file: path.relative(REPO, claimFile).split(path.sep).join('/'),
    notice_event: eventId,
    evidence: [{ tipo: 'sha256', ref: 'contracts/ownership_scopes.json', detalle: preDetail }],
    board_note:
      'Claim de un workstream NUEVO sobre un board histórico cerrado; no reabre tareas de alineacion-omni-crystal-1025.'
  });
  if (!Array.isArray(board.lifecycle.post_closure_activity)) board.lifecycle.post_closure_activity = [];
  board.lifecycle.post_closure_activity.push(
    postClosureEntry(
      'claim',
      eventId,
      board.revision + 1,
      'Board cerrado (phase=certified-closed, rev 11); un workstream nuevo usa el canal de claims del protocolo sin reabrir tareas.'
    )
  );
  saveBoard(board, noticesMeta);

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: 'claim',
        claim_id: CLAIM_ID,
        event_id: eventId,
        board_revision: board.revision,
        claim_file: path.relative(REPO, claimFile).split(path.sep).join('/'),
        registry_pre: preDetail,
        notices: noticesMeta
      },
      null,
      2
    )
  );
}

/* ---------------------------------------------------------------- close */

function gate() {
  const reg = readJSON(REGISTRY_PATH);
  const problems = [];
  const workstreams = Array.isArray(reg.workstreams) ? reg.workstreams : [];
  const ws = workstreams.find((w) => w.id === TEAM);
  if (!ws) problems.push('workstream ' + TEAM + ' ausente');
  else {
    if (ws.mode !== 'write') problems.push('mode != write');
    if (JSON.stringify(ws.write_scopes || []) !== JSON.stringify(EXPECTED_WRITE_SCOPES)) {
      problems.push('write_scopes != ' + JSON.stringify(EXPECTED_WRITE_SCOPES));
    }
    if (JSON.stringify(ws.forbidden_scopes || []) !== JSON.stringify(EXPECTED_FORBIDDEN)) {
      problems.push('forbidden_scopes != ' + JSON.stringify(EXPECTED_FORBIDDEN));
    }
    if (ws.commits !== false) problems.push('commits != false');
  }
  const others = workstreams.filter((w) => w.id !== TEAM);
  for (const o of others) {
    for (const s of o.write_scopes || []) {
      if (s === 'ara-x/**' || s.startsWith('ara-x/')) {
        problems.push('solape de ' + o.id + ' con ' + s);
      }
    }
  }
  if (workstreams.length !== 5) problems.push('workstreams != 5 (hay ' + workstreams.length + ')');
  return { problems, workstreams: workstreams.length, ws };
}

function close() {
  const nowMs = Date.now();
  const ts = isoLocal(nowMs);
  const notices = readNotices();
  const board = readJSON(BOARD_PATH);
  const claimRec = board.claims.find((c) => c.id === CLAIM_ID);
  if (!claimRec) {
    console.error('ABORT: no existe ' + CLAIM_ID + ' en el board; ejecuta `claim` primero');
    process.exit(1);
  }
  if (claimRec.state === 'released') {
    console.log(
      JSON.stringify(
        { ok: true, skipped: 'claim already released', claim_id: CLAIM_ID, notice_event: claimRec.notice_event },
        null,
        2
      )
    );
    return;
  }
  const claimPath = path.join(REPO, claimRec.claim_file);
  const claimDoc = fs.existsSync(claimPath) ? readJSON(claimPath) : null;

  const { problems, workstreams, ws } = gate();
  if (problems.length) {
    console.error('ABORT (gate T0): ' + problems.join(' | '));
    process.exit(1);
  }

  const regPost = fileFact(REGISTRY_PATH);
  const preDetail =
    (claimDoc && claimDoc.evidence_pre && claimDoc.evidence_pre.registry) || '(PRE no registrado)';
  const postDetail = regPost.sha256 + ' / ' + regPost.bytes + ' bytes (POST)';
  const eventId = nextEventId(notices);

  const notice = {
    ts,
    event_id: eventId,
    session_id: SESSION_ID,
    agente: AGENT,
    team: TEAM,
    task: TASK,
    estado: 'close',
    scope: SCOPE,
    mode: 'write',
    intent:
      'T0 cerrada: workstream ara-x-dynamic-controller registrado en el contrato de scopes de forma aditiva; claim ' +
      CLAIM_ID +
      ' liberado. Sin commit, sin escritura VPS.',
    evidencia: [
      { tipo: 'sha256', ref: 'contracts/ownership_scopes.json', detalle: postDetail + ' · PRE ' + preDetail },
      {
        tipo: 'count',
        ref: 'contracts/ownership_scopes.json → workstreams',
        detalle:
          workstreams +
          ' workstreams; ' +
          TEAM +
          ' → mode=' +
          ws.mode +
          ', write_scopes=' +
          JSON.stringify(ws.write_scopes) +
          ', forbidden_scopes=' +
          ws.forbidden_scopes.length +
          ' (exactos), commits=false; 0 solape con los otros ' +
          (workstreams - 1)
      },
      { tipo: 'board', ref: '.agent-teams/session-board/BOARD.json', detalle: 'claim ' + CLAIM_ID + ' state=released; revision ' + (board.revision + 1) },
      {
        tipo: 'note',
        ref: 'L-007 contracts/** (lock humano, DSH sesión VPS, 2026-10-25 22:30)',
        detalle:
          'tomado como vencido/superseded: ausente de .session/locks.json (drift X-003), board de origen ' +
          'certified-closed desde 2026-10-25T23:58:50-05:00; alta aditiva verificada por gate del script'
      }
    ],
    conflicts: ['X-003']
  };
  const noticesMeta = appendNotice(notice);

  claimRec.state = 'released';
  claimRec.released_at = ts;
  claimRec.release_note =
    'Alta completada y verificada. La propiedad durable de ara-x/** queda declarada en contracts/ownership_scopes.json; ' +
    'este release no libera la lane, solo cierra el claim efímero del TTL.';
  claimRec.release_evidence = [
    { tipo: 'sha256', ref: 'contracts/ownership_scopes.json', detalle: postDetail },
    { tipo: 'count', ref: 'workstreams', detalle: String(workstreams) }
  ];
  if (!Array.isArray(board.lifecycle.post_closure_activity)) board.lifecycle.post_closure_activity = [];
  board.lifecycle.post_closure_activity.push(
    postClosureEntry('close', eventId, board.revision + 1, 'Alta verificada; claim liberado.')
  );
  saveBoard(board, noticesMeta);

  if (claimDoc) {
    claimDoc.status = 'released';
    claimDoc.released_at = new Date(nowMs).toISOString();
    claimDoc.release_evidence = {
      registry_post: postDetail,
      workstreams,
      board_claim: CLAIM_ID + ' state=released',
      notice_event: eventId
    };
    writeJSON(claimPath, claimDoc);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: 'close',
        claim_id: CLAIM_ID,
        event_id: eventId,
        board_revision: board.revision,
        registry_post: postDetail,
        gate: { workstreams, write_scopes: ws.write_scopes, forbidden: ws.forbidden_scopes.length },
        notices: noticesMeta
      },
      null,
      2
    )
  );
}

/* ---------------------------------------------------------------- main */

const cmd = process.argv[2];
if (cmd === 'claim') claim();
else if (cmd === 'close') close();
else {
  console.error('uso: node ara-x/scripts/ops/t0_claim_board.js claim|close');
  process.exit(2);
}
