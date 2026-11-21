/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLOUDFLARE M3U8 NATIVE ADAPTER - IPTV Navigator PRO
 * ═══════════════════════════════════════════════════════════════════════════
 * Version: 2.0.0 FINAL
 * Date: 10 Enero 2026
 * Uniqueness: <1% del código total (modificación mínima)
 * Compatible with: IPTV Navigator PRO v4.4.0+
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN (CAMBIAR 1 LÍNEA PARA ACTIVAR)
// ═══════════════════════════════════════════════════════════════════════════

const USE_CLOUDFLARE = true;  // ✅ Activar Cloudflare Workers con M3U8 nativo
// ❌ false = Usar backend local (VPS)

// ═══════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

const API_ENDPOINTS = {
  cloudflare: {
    base: 'https://ape-redirect-api-m3u8-native.beticosa1.workers.dev',
    health: '/health',
    token: '/token/generate',
    channels: '/channels',
    groups: '/groups',
    playlist: '/playlist.m3u8',  // ✅ M3U8 NATIVO
    canal: '/canal/',
    stats: '/stats',
    reload: '/admin/reload'
  },
  local: {
    base: 'http://localhost:8080',
    health: '/health',
    token: '/api/token',
    channels: '/api/channels',
    groups: '/api/groups',
    playlist: '/playlist.m3u8',
    canal: '/stream/',
    stats: '/api/stats'
  }
};

// Seleccionar endpoint activo
const API = USE_CLOUDFLARE ? API_ENDPOINTS.cloudflare : API_ENDPOINTS.local;

console.log(`🌍 API Mode: ${USE_CLOUDFLARE ? 'Cloudflare Workers (M3U8 Native)' : 'Local Backend'}`);
console.log(`🔗 Base URL: ${API.base}`);

// ═══════════════════════════════════════════════════════════════════════════
// JWT TOKEN MANAGER
// ═══════════════════════════════════════════════════════════════════════════

class JWTManager {
  constructor() {
    this.storageKey = 'ape_jwt_token';
    this.expiresKey = 'ape_jwt_expires';
    this.token = localStorage.getItem(this.storageKey);
    this.expiresAt = localStorage.getItem(this.expiresKey);
  }

  async getToken() {
    if (this.isValid()) {
      console.log('✅ Using cached JWT token');
      return this.token;
    }

    console.log('🔄 Refreshing JWT token...');
    return await this.refresh();
  }

  isValid() {
    if (!this.token || !this.expiresAt) {
      return false;
    }

    const expiresDate = new Date(this.expiresAt);
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutos de buffer

    return expiresDate.getTime() - bufferTime > now.getTime();
  }

  async refresh() {
    try {
      const userId = this.getUserId();
      const expiresIn = 21600; // 6 horas

      const response = await fetch(
        `${API.base}${API.token}?user_id=${userId}&expires_in=${expiresIn}`
      );

      if (!response.ok) {
        throw new Error(`Token generation failed: ${response.status}`);
      }

      const data = await response.json();

      this.token = data.token;
      this.expiresAt = data.expires_at;

      localStorage.setItem(this.storageKey, this.token);
      localStorage.setItem(this.expiresKey, this.expiresAt);

      console.log('✅ JWT token refreshed successfully');
      console.log('⏰ Expires at:', this.expiresAt);

      return this.token;
    } catch (error) {
      console.error('❌ Failed to refresh JWT token:', error);
      throw error;
    }
  }

  getUserId() {
    let userId = localStorage.getItem('ape_user_id');
    if (!userId) {
      userId = 'user_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('ape_user_id', userId);
    }
    return userId;
  }

  clearToken() {
    this.token = null;
    this.expiresAt = null;
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.expiresKey);
    console.log('🗑️ JWT token cleared');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYLIST LOADER (M3U8 NATIVO)
// ═══════════════════════════════════════════════════════════════════════════

async function loadPlaylist(options = {}) {
  console.log('📡 Loading playlist from Cloudflare Worker...');

  const jwtManager = new JWTManager();
  const token = await jwtManager.getToken();

  // Construir URL con filtros opcionales
  let url = `${API.base}${API.playlist}`;
  const params = new URLSearchParams();

  if (options.group) {
    params.append('group', options.group);
  }

  if (params.toString()) {
    url += '?' + params.toString();
  }

  console.log('🔗 Request URL:', url);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to load playlist: ${response.status} ${response.statusText}`);
  }

  // ✅ RESPUESTA ES M3U8 PURO (NO JSON)
  const m3u8Content = await response.text();

  console.log('✅ Playlist loaded successfully');
  console.log('📝 Format: M3U8 Native');
  console.log('📊 Size:', m3u8Content.length, 'bytes');

  // Parsear con ape-ultra-parser.js existente
  if (typeof APEUltraParser !== 'undefined') {
    const parser = new APEUltraParser();
    const result = parser.parse(m3u8Content);
    console.log('✅ Parsed with APEUltraParser:', result);
    return result;
  } else {
    // Fallback: parsing básico
    console.warn('⚠️ APEUltraParser not found, using basic parsing');
    return parseM3U8Basic(m3u8Content);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BASIC M3U8 PARSER (FALLBACK)
// ═══════════════════════════════════════════════════════════════════════════

function parseM3U8Basic(m3u8Content) {
  const channels = [];
  const lines = m3u8Content.split('\n');
  let currentChannel = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      // Parse EXTINF line
      const nameMatch = line.match(/,(.*)$/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      const groupMatch = line.match(/group-title="([^"]*)"/);
      const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);

      currentChannel = {
        name: nameMatch ? nameMatch[1].trim() : 'Unknown',
        logo: logoMatch ? logoMatch[1] : '',
        group: groupMatch ? groupMatch[1] : '',
        tvg_id: tvgIdMatch ? tvgIdMatch[1] : ''
      };
    } else if (line && !line.startsWith('#')) {
      // URL line
      currentChannel.url = line;
      channels.push({ ...currentChannel });
      currentChannel = {};
    }
  }

  return {
    channels: channels,
    total: channels.length,
    format: 'M3U8',
    parser: 'basic'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANNELS API
// ═══════════════════════════════════════════════════════════════════════════

async function loadChannels(options = {}) {
  console.log('📡 Loading channels list from API...');

  const jwtManager = new JWTManager();
  const token = await jwtManager.getToken();

  // Construir URL con parámetros
  const params = new URLSearchParams({
    page: options.page || 1,
    limit: options.limit || 50
  });

  if (options.group) params.append('group', options.group);
  if (options.search) params.append('search', options.search);

  const url = `${API.base}${API.channels}?${params.toString()}`;
  console.log('🔗 Request URL:', url);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to load channels: ${response.status}`);
  }

  const data = await response.json();
  console.log('✅ Channels loaded:', data);

  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUPS API
// ═══════════════════════════════════════════════════════════════════════════

async function loadGroups() {
  console.log('📡 Loading groups from API...');

  const jwtManager = new JWTManager();
  const token = await jwtManager.getToken();

  const url = `${API.base}${API.groups}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to load groups: ${response.status}`);
  }

  const data = await response.json();
  console.log('✅ Groups loaded:', data);

  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

async function healthCheck() {
  console.log('🏥 Checking API health...');

  const url = `${API.base}${API.health}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ API Health:', data);

    return data;
  } catch (error) {
    console.error('❌ Health check failed:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS API
// ═══════════════════════════════════════════════════════════════════════════

async function loadStats() {
  console.log('📊 Loading stats from API...');

  const url = `${API.base}${API.stats}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load stats: ${response.status}`);
  }

  const data = await response.json();
  console.log('✅ Stats loaded:', data);

  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT API
// ═══════════════════════════════════════════════════════════════════════════

window.CloudflareM3U8Adapter = {
  USE_CLOUDFLARE,
  API,
  JWTManager,
  loadPlaylist,
  loadChannels,
  loadGroups,
  healthCheck,
  loadStats,
  parseM3U8Basic
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

if (USE_CLOUDFLARE) {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  CLOUDFLARE M3U8 NATIVE ADAPTER INITIALIZED                   ║
║  Version: 2.0.0 FINAL                                        ║
║  Mode: Cloudflare Workers                                    ║
║  Format: M3U8 Native (NO JSON)                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  // Auto health check
  healthCheck().catch(err => {
    console.error('⚠️ Initial health check failed:', err);
  });
}
