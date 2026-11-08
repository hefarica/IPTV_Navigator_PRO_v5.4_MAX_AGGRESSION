/* ═══════════════════════════════════════════════════════════════════════════
 * GOBIERNO VPS -> PLAYER
 *
 * El panel de IPTV Navigator configura la matriz; el VPS GENERA la lista que
 * consumen los players (OTT Navigator, VLC, Kodi, TiviMate, la APK). Cada canal
 * de esa lista apunta a /jit/go/{id} con el perfil resuelto, asi que el player
 * reproduce la salida YA PROCESADA. No se le pide al player que filtre.
 *
 * VERDAD MEDIDA que manda sobre el diseno (skill ape-image-pipeline-truth):
 *   - `#EXTVLCOPT:video-filter=` es INERTE por POLITICA de VLC
 *     ("unsafe option ... ignored for security reasons"). No es sintaxis.
 *   - Los filtros de pixel los ejecuta el worker FFmpeg del JIT.
 *   - El VPP del SoC (AI-SR/AI-PQ) es el unico lever de pixeles en el device,
 *     y no se gobierna desde aqui.
 *
 * Por eso la lista NO emite video-filter: emite el perfil dentro de la URL y
 * solo las directivas que cada motor SI lee.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* Capacidad por motor: que directiva lee de verdad y que NO se le puede pedir. */
const PLAYER_ENGINES = {
  vlc: {
    label: 'VLC / libVLC',
    reads: ['network-caching', 'http-user-agent', 'http-referrer', 'clock-jitter'],
    ignores: ['video-filter (unsafe option por politica)', 'kodi *', 'adaptive-*']
  },
  kodi: {
    label: 'Kodi (inputstream.adaptive)',
    reads: ['inputstream.adaptive.*', 'network-caching'],
    ignores: ['EXTVLCOPT exclusivas', 'video-filter']
  },
  tivimate: {
    label: 'TiviMate',
    reads: ['EXTHTTP de un solo valor', 'tvg-*', 'group-title'],
    ignores: ['EXTHTTP multi-valor con comas', 'EXTVLCOPT', 'KODIPROP']
  },
  ott: {
    label: 'OTT Navigator',
    reads: ['EXTVLCOPT http-user-agent/http-referrer', 'KODIPROP', 'EXTATTRFROMURL'],
    ignores: ['video-filter (no documentado en su changelog)']
  },
  apk: {
    label: 'APK ape-crystal-agent (Media3)',
    reads: ['la URL y sus cabeceras', 'HLS via HlsMediaSource', 'DASH via DashMediaSource'],
    ignores: ['EXTVLCOPT', 'KODIPROP', 'video-filter en la lista']
  }
};

/* Estado de gobierno: que perfil se aplica a cada canal y con que receta.
 * Se persiste aparte de la config global para poder tener canales con perfiles
 * distintos conviviendo. */
const GOVERNANCE_FILE = process.env.GOVERNANCE_FILE || '/opt/ape-jit/governance.json';

let governance = { defaultProfile: 'P4.5', channels: {} };

function loadGovernance() {
  try {
    if (!fs.existsSync(GOVERNANCE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(GOVERNANCE_FILE, 'utf8'));
    if (raw && typeof raw === 'object') governance = Object.assign({}, governance, raw);
  } catch (_) { /* corrupto -> defaults */ }
}

function saveGovernance() {
  try { fs.writeFileSync(GOVERNANCE_FILE, JSON.stringify(governance, null, 2)); return true; }
  catch (_) { return false; }
}

loadGovernance();

function profileForChannel(id) {
  const ch = String(id);
  const row = governance.channels && governance.channels[ch];
  const p = (row && row.profile) || governance.defaultProfile;
  return profileMatrix[p] ? p : 'P4.5';
}

/* Directivas que SI se pueden emitir, por motor. Se derivan de PLAYER_ENGINES:
 * nada que el motor ignore llega a la lista. */
function engineDirectives(engine, profile) {
  const p = profileMatrix[profile] || profileMatrix['P4.5'];
  const out = [];
  out.push('#EXT-X-APE-PROFILE:' + profile);
  out.push('#EXT-X-APE-TARGET:' + p.outW + 'x' + p.outH + ';MODE=' + p.scaleMode + ';DITHER=' + p.dither);
  // declaracion honesta del responsable del procesamiento
  out.push('#EXT-X-APE-PROCESSING:DOMAIN=vps_jit;PLAYER_FILTERS=0;REASON=video-filter-es-inerte-en-playlist');
  if (engine === 'vlc' || engine === 'kodi' || engine === 'ott') {
    // network-caching SI lo lee VLC (medido); el resto no se emite
    out.push('#EXTVLCOPT:network-caching=3000');
    out.push('#EXTVLCOPT:clock-jitter=0');
  }
  if (engine === 'kodi') {
    out.push('#KODIPROP:inputstream.adaptive.stream_selection_type=manual-osd');
  }
  return out;
}

/* Genera la lista M3U8 de gobierno. Cada canal apunta a /jit/go/{id} con su
 * perfil; el JIT resuelve a la ejecucion con esa matriz aplicada. */
function buildGovernedLineup(opts) {
  const o = opts || {};
  const engine = String(o.engine || 'ott');
  const base = String(o.base || 'https://iptv-ape.duckdns.org');
  const map = loadMap();
  const ids = Object.keys(map).filter((id) => map[id] && map[id].url);
  const lines = [
    '#EXTM3U',
    '#EXT-X-APE-GOVERNANCE:VERSION=1;DEFAULT_PROFILE=' + governance.defaultProfile +
      ';ENGINE=' + engine + ';CHANNELS=' + ids.length,
    '#EXT-X-APE-ENGINE:' + engine + ';READS=' + PLAYER_ENGINES[engine].reads.join('|') +
      ';IGNORES=' + PLAYER_ENGINES[engine].ignores.join('|')
  ];
  let emitted = 0;
  for (const id of ids) {
    const prof = profileForChannel(id);
    const ch = map[id];
    const name = (ch && ch.name) ? String(ch.name).replace(/[,]/g, ' ') : ('Canal ' + id);
    const grp = (ch && ch.group) ? String(ch.group).replace(/[,]/g, ' ') : 'APE';
    lines.push('#EXTINF:-1 tvg-id="' + id + '" tvg-chno="' + id + '" group-title="' + grp + '",' + name);
    for (const d of engineDirectives(engine, prof)) lines.push(d);
    lines.push(base + '/jit/go/' + encodeURIComponent(id) + '?p=' + encodeURIComponent(prof) + '&e=' + encodeURIComponent(engine));
    lines.push('');
    emitted++;
  }
  return { text: lines.join('\n'), emitted, engine, ids };
}

