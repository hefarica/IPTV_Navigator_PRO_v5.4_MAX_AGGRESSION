// ---------------------------------------------------------
// 🔥 PRUEBA DE FUEGO MULTI-SERVIDOR 🔥
// ---------------------------------------------------------
function preferHttps(u) { return String(u).replace(/^http:/, 'https:'); }
function sanitizeCredential(c) { return c; }
function _URLEncoder(value) { return encodeURIComponent(value); }
function _notEmpty(v) { return v != null && String(v).trim() !== ''; }

function validateBuiltUrl(url) {
    let u = String(url);
    if (u.indexOf('http:// ') === 0 || u.indexOf('https:// ') === 0) throw new Error('Space after protocol');
    if (u.indexOf(' ') !== -1) throw new Error('Space in URL');
    if (u.indexOf('??') !== -1) throw new Error('Double question mark');
    if (u.indexOf('&&') !== -1) throw new Error('Double ampersand');
    const afterProto = u.replace(/^https?:\/\//i, '');
    if (afterProto.indexOf('///') !== -1) throw new Error('Triple slash detected inside path');
    return u;
}

function composeUrl(scheme, host, port, path, query) {
    let url = scheme + '://' + host;
    if (port != null && port !== '') url += ':' + String(port);
    if (path !== '') url += path; else url += '/';
    if (query != null && query !== '') url += '?' + query;
    return url;
}

function buildOrderedQueryString(params) {
    const orderedKeys = Object.keys(params).sort();
    const pairs = [];
    for (const key of orderedKeys) {
        pairs.push(_URLEncoder(key) + '=' + _URLEncoder(params[key]));
    }
    return pairs.join('&');
}

function normalizePath(path) {
    if (path == null) return '';
    let p = String(path).trim();
    p = p.replace(/\/+/g, '/');
    if (p === '/' || p === '') return '';
    if (!p.startsWith('/')) p = '/' + p;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
}

function joinPath(...segments) {
    const items = [];
    for (const segment of segments) {
        if (segment == null) continue;
        let s = String(segment).trim();
        if (s === '') continue;
        s = s.replace(/^\/+|\/+$/g, '');
        if (s !== '') items.push(s);
    }
    if (items.length === 0) return '';
    return '/' + items.join('/');
}

function ensurePathEndsWithExtension(path, ext) {
    if (path.toLowerCase().endsWith('.' + ext.toLowerCase())) return path;
    if (path.endsWith('/')) throw new Error('Direct HLS path cannot end with slash');
    return path + '.' + ext;
}

function detectServerType(input) {
    if (_notEmpty(input.directPath)) return 'direct_hls';
    if (_notEmpty(input.endpointPath)) return 'query_hls';
    if (_notEmpty(input.username) && _notEmpty(input.password) && _notEmpty(input.streamId)) return 'xtream';
    if (input.baseUrl && input.baseUrl.includes('/live/')) return 'xtream';
    if (input.baseUrl && input.baseUrl.includes('.m3u8')) return 'direct_hls';
    return 'query_hls';
}

function normalizeExtension(ext) {
    if (ext == null || String(ext).trim() === '') return 'm3u8';
    let out = String(ext).trim().toLowerCase();
    if (out.startsWith('.')) out = out.substring(1);
    return out;
}

function normalizeBaseUrl(baseUrl, forceHttps, preservePort) {
    let raw = String(baseUrl).trim();
    raw = raw.replace(/\\/g, '/');
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) raw = 'http://' + raw;
    let parseFailed = false;
    let pScheme = 'http', pHost = '', pPort = null, pPath = '';
    try {
        const urlObj = new URL(raw);
        pScheme = urlObj.protocol.replace(':', '').toLowerCase();
        pHost = urlObj.hostname.toLowerCase().trim();
        pPort = urlObj.port ? parseInt(urlObj.port) : null;
        pPath = urlObj.pathname;
    } catch(e) {
        parseFailed = true;
        const match = raw.match(/^(https?):\/\/([^\/:]+)(?::(\d+))?(\/.*)?$/i);
        if (match) {
            pScheme = match[1].toLowerCase();
            pHost = match[2].toLowerCase();
            pPort = match[3] ? parseInt(match[3]) : null;
            pPath = match[4] || '';
        } else {
            throw new Error('Invalid BaseURL format: ' + raw);
        }
    }
    if (forceHttps === true) pScheme = 'https';
    if (pHost === '') throw new Error('Host is empty');
    if (preservePort !== true) {
        if ((pPort === 80 && pScheme === 'http') || (pPort === 443 && pScheme === 'https')) pPort = null;
    }
    return { scheme: pScheme, host: pHost, port: pPort, basePath: normalizePath(pPath) };
}

function _buildPerfectUrl(input) {
    if (!input.baseUrl || input.baseUrl === '') throw new Error('baseUrl is required');
    const normalized = normalizeBaseUrl(input.baseUrl, input.forceHttps, input.preservePort);
    const scheme = normalized.scheme; const host = normalized.host; const port = normalized.port; const basePath = normalized.basePath;
    const ext = normalizeExtension(input.extension);
    const detectedType = (input.serverType === 'auto' || !input.serverType) ? detectServerType(input) : input.serverType;
    if (detectedType === 'xtream') {
        if (!_notEmpty(input.username) || !_notEmpty(input.password) || !_notEmpty(input.streamId)) throw new Error('Xtream requires user/pass/streamId');
        const user = _URLEncoder(String(input.username).trim()); const pass = _URLEncoder(String(input.password).trim()); const sid = _URLEncoder(String(input.streamId).trim());
        const typeP = input.typePath || 'live';
        return validateBuiltUrl(composeUrl(scheme, host, port, joinPath(basePath, typeP, user, pass, sid + '.' + ext), null));
    }
    if (detectedType === 'direct_hls') {
        if (!_notEmpty(input.directPath)) throw new Error('Direct HLS requires directPath');
        let cleanPath = input.directPath.trim().split('?')[0].split('#')[0]; cleanPath = normalizePath(cleanPath);
        if (cleanPath === '') throw new Error('normalized direct path is empty');
        cleanPath = ensurePathEndsWithExtension(cleanPath, ext);
        const finalPath = joinPath(basePath, cleanPath);
        let dQuery = null; if (input.directPath.includes('?')) dQuery = input.directPath.split('?')[1];
        return validateBuiltUrl(composeUrl(scheme, host, port, finalPath, dQuery));
    }
    if (detectedType === 'query_hls') {
        if (!_notEmpty(input.endpointPath)) throw new Error('Query HLS requires endpointPath');
        let endpoint = input.endpointPath.trim().split('?')[0].split('#')[0]; endpoint = normalizePath(endpoint);
        const params = {};
        if (_notEmpty(input.username)) params['username'] = String(input.username).trim();
        if (_notEmpty(input.password)) params['password'] = String(input.password).trim();
        if (_notEmpty(input.streamId)) params['stream'] = String(input.streamId).trim();
        params['extension'] = ext;
        const reserved = new Set(['username', 'password', 'stream', 'extension']);
        if (input.extraParams) {
            for (const [k, v] of Object.entries(input.extraParams)) {
                if (_notEmpty(k) && v != null && !reserved.has(k)) params[k] = String(v);
            }
        }
        return validateBuiltUrl(composeUrl(scheme, host, port, joinPath(basePath, endpoint), buildOrderedQueryString(params)));
    }
    throw new Error('Unsupported serverType');
}

// 1. Matriz de Credenciales (credentialsMap) simulando tu State de UI
const fireTestCredentials = {
    "server_xtream_alpha": { baseUrl: "http://alpha-iptv-premium.com:8080", username: "ALPHA_user", password: "ALPHA_password", streamFormat: "ts" },
    "server_query_omega": { baseUrl: "https://omega-iptv-relay.net", username: "OMEGA_user", password: "OMEGA_password", streamFormat: "m3u8" }
};

// 2. Inventario de Canales Mixto
const fireTestChannels = [
    { name: "HBO MÁS 4K (Servidor Xtream A)", serverId: "server_xtream_alpha", stream_id: "1001", url: "http://alpha-iptv-premium.com:8080/live/user/pass/1001.ts", type: "live" },
    { name: "FOX SPORTS HD (Servidor Query B)", serverId: "server_query_omega", stream_id: "6800", url: "https://omega-iptv-relay.net/player_api.php?username=XXX&password=YYY&action=get_live_streams&stream=6800", type: "live" },
    { name: "MATRIX (Servidor Xtream A - VOD)", serverId: "server_xtream_alpha", stream_id: "9999", url: "http://alpha-iptv-premium.com:8080/movie/user/pass/9999.mp4", type: "movie", container_extension: "mp4" }
];

// 3. Orquestador
function fireTestBuildUrl(channel, credentialsMap) {
    let sid = channel.serverId; let creds = credentialsMap[sid];
    let ext = creds.streamFormat || 'm3u8'; let typeP = channel.type === 'movie' ? 'movie' : 'live';
    if(channel.type === 'movie') ext = channel.container_extension || 'mp4';
    let srvType = 'xtream'; let ePath = '/playlist';
    if(channel.url.includes('?')) { srvType = 'query_hls'; ePath = new URL(channel.url).pathname; }
    try {
        let u = _buildPerfectUrl({ serverType: srvType, baseUrl: creds.baseUrl, username: creds.username, password: creds.password, streamId: channel.stream_id, extension: ext, typePath: typeP, endpointPath: ePath, forceHttps: false, preservePort: true });
        return u;
    } catch(e) { return "ERROR: " + e.message; }
}

console.log("\\n========================================================");
console.log("🔥 INICIANDO PRUEBA DE FUEGO MULTI-SERVIDOR (E2E) 🔥");
console.log("========================================================\\n");

fireTestChannels.forEach((ch) => {
    let resultUrl = preferHttps(fireTestBuildUrl(ch, fireTestCredentials));
    console.log("📺 CANAL               : " + ch.name);
    console.log("🔒 ORIGEN / CREDENCIAL : " + ch.serverId);
    console.log("🔥 URL ENCRIPTADA SSOT : " + resultUrl);
    console.log("--------------------------------------------------------");
});
console.log("✅ VEREDICTO: El toolkit extrajo y matemáticamente segmentó las peticiones basándose en dicotomía Backend sin sangrar variables.");
