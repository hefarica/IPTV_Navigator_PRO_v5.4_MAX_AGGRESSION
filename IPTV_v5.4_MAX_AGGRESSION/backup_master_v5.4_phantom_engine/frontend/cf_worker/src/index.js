/**
 * CLOUDFLARE WORKER - TOKEN AUTHENTICATION FIXED
 * Version: 2.1.0 - Token System Enhanced
 * 
 * MEJORAS IMPLEMENTADAS:
 * 1. Soporte dual: Authorization header + query parameter
 * 2. Validación consistente de JWT
 * 3. Error handling mejorado
 * 4. Logging detallado
 */

// ========================================
// CONFIGURACIÓN
// ========================================

const CONFIG = {
  JWT_SECRET: 'CAMBIAR_EN_PRODUCCION_32_CHARS_ALEATORIOS_XYZ123',
  JWT_EXPIRY_SECONDS: 21600, // 6 horas
  CACHE_TTL: 3600, // 1 hora
  RATE_LIMIT: {
    enabled: true,
    maxRequests: 100,
    windowMs: 60000 // 1 minuto
  }
};

// ========================================
// CORS HEADERS
// ========================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token, X-Filename, X-Strategy, X-Source, X-Channels, X-Size, X-Action, X-Session-Count, X-Chunk-Id, Content-Encoding',
  'Access-Control-Max-Age': '86400'
};

// ========================================
// EXTRACCIÓN DE TOKEN (DUAL METHOD)
// ========================================

/**
 * Extrae el token JWT del request usando múltiples métodos
 * Prioridad: 1) Authorization header, 2) Query parameter
 */
function extractToken(request) {
  const url = new URL(request.url);

  // MÉTODO 1: Authorization header (ESTÁNDAR HTTP)
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    // Formato: "Bearer eyJhbGci..."
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token && token.length > 10) {
        return { token, method: 'header' };
      }
    }
    // Formato alternativo: "eyJhbGci..." (sin "Bearer")
    if (authHeader && !authHeader.includes(' ') && authHeader.length > 10) {
      return { token: authHeader, method: 'header-raw' };
    }
  }

  // MÉTODO 2: Query parameter (COMPATIBILIDAD)
  const tokenParam = url.searchParams.get('token');
  if (tokenParam && tokenParam.length > 10) {
    return { token: tokenParam, method: 'query' };
  }

  // MÉTODO 3: Header X-Auth-Token (CUSTOM)
  const customHeader = request.headers.get('X-Auth-Token');
  if (customHeader && customHeader.length > 10) {
    return { token: customHeader, method: 'custom-header' };
  }

  return null;
}

// ========================================
// VALIDACIÓN DE JWT (MEJORADA)
// ========================================

/**
 * Valida JWT token con múltiples checks
 */
async function validateToken(tokenString) {
  if (!tokenString || tokenString.length < 10) {
    return { valid: false, error: 'Token vacío o muy corto' };
  }

  try {
    // Decodificar JWT (simplificado - en producción usar librería crypto)
    const parts = tokenString.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Formato JWT inválido (debe tener 3 partes)' };
    }

    // Decodificar payload
    const payload = JSON.parse(atob(parts[1]));

    // Check 1: Verificar expiración
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token expirado' };
    }

    // Check 2: Verificar issued at (no en el futuro)
    if (payload.iat && payload.iat > now + 300) { // 5 min tolerancia
      return { valid: false, error: 'Token emitido en el futuro' };
    }

    // Check 3: Verificar scope (si existe)
    if (payload.scope) {
      const requiredScopes = ['playlist:read', 'canal:access'];
      const hasScope = requiredScopes.some(scope =>
        payload.scope.includes(scope)
      );
      if (!hasScope) {
        return { valid: false, error: 'Token sin permisos suficientes' };
      }
    }

    return {
      valid: true,
      payload,
      user_id: payload.user_id,
      expires_at: payload.exp
    };

  } catch (error) {
    return {
      valid: false,
      error: `Error al decodificar token: ${error.message}`
    };
  }
}

// ========================================
// MIDDLEWARE DE AUTENTICACIÓN
// ========================================

/**
 * Middleware que valida autenticación antes de procesar request
 */
async function authenticateRequest(request) {
  const url = new URL(request.url);

  // Rutas que NO requieren autenticación
  const publicPaths = [
    '/health',
    '/token/generate',
    '/stats',
    '/upload-m3u',
    '/public/playlist.m3u8',
    '/download/playlist.m3u8',
    '/v1/feed',
    '/feed',
    '/link/year',
    '/public/icons/',  // Iconos de calidad (ULTRA HD, FULL HD, SD)
    '/data/probes/'    // CSV de resultados de probe (público para lectura)
  ];

  const isPublic = publicPaths.some(path => url.pathname === path || url.pathname.startsWith(path));
  if (isPublic) {
    return { authenticated: true, public: true };
  }

  // Extraer token
  const tokenData = extractToken(request);
  if (!tokenData) {
    return {
      authenticated: false,
      error: 'No se encontró token (usa Authorization header o ?token=xxx)',
      status: 401
    };
  }

  // Validar token
  const validation = await validateToken(tokenData.token);
  if (!validation.valid) {
    return {
      authenticated: false,
      error: `Token inválido: ${validation.error}`,
      status: 401,
      details: {
        method: tokenData.method,
        token_preview: tokenData.token.substring(0, 20) + '...'
      }
    };
  }

  // Autenticación exitosa
  return {
    authenticated: true,
    user_id: validation.user_id,
    payload: validation.payload,
    method: tokenData.method,
    token: tokenData.token
  };
}

// ========================================
// GENERACIÓN DE TOKEN (MEJORADA)
// ========================================

async function generateToken(user_id, expires_in = CONFIG.JWT_EXPIRY_SECONDS) {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const payload = {
    user_id: user_id,
    expires_in: expires_in,
    scope: 'playlist:read,canal:access',
    iat: now,
    exp: now + expires_in
  };

  // Codificar (simplificado - en producción usar crypto API)
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));

  // Firma (simplificado - en producción usar HMAC SHA256)
  const signature = btoa(CONFIG.JWT_SECRET);

  const token = `${encodedHeader}.${encodedPayload}.${signature}`;

  return {
    token,
    user_id,
    expires_in,
    expires_at: new Date((now + expires_in) * 1000).toISOString(),
    usage: {
      method1: `Authorization: Bearer ${token}`,
      method2: `?token=${token}`,
      method3: `X-Auth-Token: ${token}`
    }
  };
}

// ========================================
// OBTENER PLAYLIST FIEL DESDE R2 (CON CACHÉ)
// ========================================

let cachedPlaylist = null; // Renamed to reflect it holds full structure
let cacheTimestamp = 0;

async function getPlaylistFromR2(env) {
  const now = Date.now();

  // Usar caché si es válido (1 hora)
  if (cachedPlaylist && (now - cacheTimestamp) < CONFIG.CACHE_TTL * 1000) {
    return cachedPlaylist;
  }

  try {
    // Buscar playlists en R2
    const list = await env.CHANNELS_R2.list({ prefix: 'playlists/' });

    if (!list.objects || list.objects.length === 0) {
      throw new Error('No playlists found in R2');
    }

    // Ordenar por fecha y tomar el más reciente
    const sorted = list.objects.sort((a, b) =>
      new Date(b.uploaded || 0) - new Date(a.uploaded || 0)
    );
    const latestKey = sorted[0].key;

    const object = await env.CHANNELS_R2.get(latestKey);
    if (!object) {
      throw new Error('M3U8 file not found in R2');
    }

    const m3u8Content = await object.text();

    // Parsear M3U8 (MODO FIEL CASTELLANO)
    const playlistData = parseM3U8Faithful(m3u8Content);

    // Actualizar caché
    cachedPlaylist = playlistData;
    cacheTimestamp = now;

    return playlistData;

  } catch (error) {
    // Si falla R2, usar caché antiguo si existe
    if (cachedPlaylist) {
      console.warn('R2 failed, using stale cache');
      return cachedPlaylist;
    }
    throw error;
  }
}

// ========================================
// PARSER M3U8 "FIEL COPIA"
// ========================================

function parseM3U8Faithful(content) {
  const lines = content.split('\n');
  const result = {
    globalHeaders: '',
    channels: []
  };

  let bufferHeaders = [];
  let isHeaderSection = true;
  let currentChannel = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detectar inicio de un canal (#EXTINF usualmente marca el inicio del bloque)
    if (line.startsWith('#EXTINF:')) {
      isHeaderSection = false;

      // Si ya teníamos un canal en proceso, guardarlo (caso raro de bloques pegados)
      if (currentChannel) {
        result.channels.push(currentChannel);
      }

      // Iniciar nuevo canal
      currentChannel = {
        rawBlock: '', // Todos los headers del canal
        url: '',
        meta: {} // Datos extraídos para lógica (id, group, etc)
      };

      // Extraer metadata básica para filtrado
      const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
      if (tvgIdMatch) currentChannel.meta.id = tvgIdMatch[1];

      const groupMatch = line.match(/group-title="([^"]*)"/);
      if (groupMatch) currentChannel.meta.group = groupMatch[1];

      const nameMatch = line.match(/,(.+)$/);
      if (nameMatch) currentChannel.meta.name = nameMatch[1];

      // fallback id
      if (!currentChannel.meta.id && currentChannel.meta.name) {
        currentChannel.meta.id = currentChannel.meta.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      }

      // Agregar línea actual al bloque
      currentChannel.rawBlock += line + '\n';

    } else if (isHeaderSection) {
      // Estamos en la cabecera global (antes del primer EXTINF)
      result.globalHeaders += line + '\n';

    } else if (line.startsWith('#')) {
      // Es un tag parte del bloque del canal actual
      if (currentChannel) {
        currentChannel.rawBlock += line + '\n';
      } else {
        // Tags huérfanos antes del primer canal pero después de headers globales?
        // Tratarlos como headers globales tardíos si no hay canal activo
        result.globalHeaders += line + '\n';
      }

    } else {
      // ES UNA URL (Línea que no empieza con #)
      if (currentChannel) {
        currentChannel.url = line;
        // El canal está completo, guardarlo
        result.channels.push(currentChannel);
        currentChannel = null;
      }
    }
  }

  // Debug Stats
  console.log(`Parsed Faithful: ${result.channels.length} channels, Header size: ${result.globalHeaders.length}`);
  return result;
}

// ========================================
// HANDLER: REDIRECT DE CANAL (ARREGLADO)
// ========================================

async function handleCanalRedirect(request, env, auth) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const match = pathname.match(/\/canal\/([^\/]+)\.m3u8$/);
  if (!match) {
    return new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400, headers: corsHeaders });
  }
  const canalId = match[1];

  try {
    const playlist = await getPlaylistFromR2(env);

    // Buscar canal
    const channel = playlist.channels.find(ch => ch.meta.id === canalId);

    if (!channel || !channel.url) {
      return new Response(JSON.stringify({ error: 'Channel not found' }), { status: 404, headers: corsHeaders });
    }

    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': channel.url,
        'Cache-Control': 'public, max-age=300'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}

// ========================================
// HANDLER: GENERAR PLAYLIST M3U8 (AUTHENTICATED)
// ========================================

async function handlePlaylistGeneration(request, env, auth) {
  const url = new URL(request.url);
  const group = url.searchParams.get('group');

  try {
    const playlist = await getPlaylistFromR2(env);
    let channels = playlist.channels;

    if (group) {
      channels = channels.filter(ch => ch.meta.group && ch.meta.group.includes(group));
    }

    // Reconstrucción Faithful pero con Redirects
    let m3u8 = playlist.globalHeaders; // Usar cabecera original

    for (const ch of channels) {
      // Usar bloque original del canal
      m3u8 += ch.rawBlock;
      // Reemplazar URL original con URL del Worker
      m3u8 += `${url.origin}/canal/${ch.meta.id}.m3u8?token=${auth.token}\n`;
    }

    return new Response(m3u8, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Content-Disposition': 'attachment; filename="playlist.m3u8"',
        'X-Total-Channels': channels.length.toString()
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}

// ========================================
// MAIN HANDLER
// ========================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ========================================
    // ENDPOINT: /health
    // ========================================
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'OK',
        version: '2.1.0 - Token System Enhanced',
        storage: 'Cloudflare R2',
        format: 'M3U8 Native (NO JSON)',
        auth: {
          methods: ['Authorization: Bearer', 'Query: ?token=', 'Header: X-Auth-Token'],
          jwt_expiry: CONFIG.JWT_EXPIRY_SECONDS
        },
        config: {
          cache_ttl: CONFIG.CACHE_TTL,
          jwt_expiry: CONFIG.JWT_EXPIRY_SECONDS,
          rate_limit: CONFIG.RATE_LIMIT.enabled
        },
        timestamp: new Date().toISOString()
      }, null, 2), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ========================================
    // ENDPOINT: /token/generate
    // ========================================
    if (url.pathname === '/token/generate') {
      const user_id = url.searchParams.get('user_id') || 'anonymous';
      const expires_in = parseInt(url.searchParams.get('expires_in')) || CONFIG.JWT_EXPIRY_SECONDS;

      const tokenData = await generateToken(user_id, expires_in);

      return new Response(JSON.stringify(tokenData, null, 2), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ========================================
    // ENDPOINT: /stats
    // ========================================
    if (url.pathname === '/stats') {
      try {
        const playlist = await getPlaylistFromR2(env);
        // Groups calculation might need fix since 'meta' is inside
        const groups = [...new Set(playlist.channels.map(ch => ch.meta.group).filter(Boolean))];
        return new Response(JSON.stringify({
          success: true,
          storage: 'Cloudflare R2',
          format: 'M3U8 Faithful',
          metadata: {
            total: playlist.channels.length,
            groups: groups.length,
            parsedAt: new Date(cacheTimestamp).toISOString()
          },
          config: CONFIG,
          timestamp: new Date().toISOString()
        }, null, 2), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ========================================
    // ENDPOINT: /public/playlist.m3u8 (FAITHFUL REPRODUCTION)
    // ========================================
    if (url.pathname === '/public/playlist.m3u8') {
      try {
        const playlist = await getPlaylistFromR2(env);
        const group = url.searchParams.get('group');

        let channels = playlist.channels;
        if (group) {
          channels = channels.filter(ch => ch.meta.group && ch.meta.group.includes(group));
        }

        // 1. INYECTAR HEADER GLOBAL ORIGINAL
        let m3u8 = playlist.globalHeaders;

        // Header extra solo para debug/versión
        if (!m3u8.includes('#EXTREM: APE ULTIMATE')) {
          m3u8 += '#EXTREM: APE ULTIMATE - FAITHFUL REPRODUCTION MODE\n';
        }

        for (const ch of channels) {
          // 2. INYECTAR BLOQUE DE CANAL ORIGINAL (Tags, Logos, Props)
          m3u8 += ch.rawBlock;

          let streamUrl = ch.url;

          m3u8 += `${streamUrl}\n`;
        }

        return new Response(m3u8, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Cache-Control': 'public, max-age=3600',
            'X-Total-Channels': channels.length.toString(),
            'X-Mode': 'Faithful'
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    // ========================================
    // ENDPOINT: /download/playlist.m3u8 (FAITHFUL DOWNLOAD)
    // ========================================
    if (url.pathname === '/download/playlist.m3u8') {
      try {
        const playlist = await getPlaylistFromR2(env);
        const group = url.searchParams.get('group');
        const filename = url.searchParams.get('filename') || `APE_PLAYLIST_${new Date().toISOString().split('T')[0]}.m3u8`;

        let channels = playlist.channels;
        if (group) {
          channels = channels.filter(ch => ch.meta.group && ch.meta.group.includes(group));
        }

        let m3u8 = playlist.globalHeaders;

        for (const ch of channels) {
          m3u8 += ch.rawBlock;
          let streamUrl = ch.url;
          m3u8 += `${streamUrl}\n`;
        }

        return new Response(m3u8, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'X-Total-Channels': channels.length.toString()
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    // ========================================
    // ENDPOINT: /public/icons/* - Serve quality icons from R2
    // ========================================
    if (url.pathname.startsWith('/public/icons/')) {
      try {
        const iconName = url.pathname.replace('/public/icons/', '');
        
        // Validar nombre del archivo
        const allowedIcons = ['quality-ultra-hd.png', 'quality-full-hd.png', 'quality-sd.png',
                              'quality-ultra-hd.svg', 'quality-full-hd.svg', 'quality-sd.svg'];
        
        if (!allowedIcons.includes(iconName)) {
          return new Response(JSON.stringify({ error: 'Icon not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Buscar en R2
        const iconKey = `icons/${iconName}`;
        const iconObject = await env.CHANNELS_R2.get(iconKey);
        
        if (!iconObject) {
          return new Response(JSON.stringify({ error: 'Icon not found in storage' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Determinar content-type
        const contentType = iconName.endsWith('.svg') 
          ? 'image/svg+xml' 
          : 'image/png';
        
        return new Response(iconObject.body, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000', // 1 año
            'X-Icon-Name': iconName
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ========================================
    // ENDPOINT: /link/year - Generate 1-year token URL
    // ========================================
    if (url.pathname === '/link/year') {
      const user_id = url.searchParams.get('user_id') || 'public';
      const ONE_YEAR_SECONDS = 31536000; // 365 days

      const tokenData = await generateToken(user_id, ONE_YEAR_SECONDS);

      const publicUrls = {
        playlist_streaming: `${url.origin}/public/playlist.m3u8`,
        playlist_download: `${url.origin}/download/playlist.m3u8`,
        playlist_with_token: `${url.origin}/playlist.m3u8?token=${tokenData.token}`,
        canal_example: `${url.origin}/canal/3.m3u8?token=${tokenData.token}`,
        valid_until: tokenData.expires_at,
        note: 'Use "playlist_streaming" for VLC/Kodi - NO authentication needed!'
      };

      return new Response(JSON.stringify({
        success: true,
        message: 'URLs generated - Valid for 1 YEAR',
        urls: publicUrls,
        token: tokenData.token,
        expires_at: tokenData.expires_at
      }, null, 2), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ========================================
    // ENDPOINT: /upload-m3u (RAW UPLOAD)
    // ========================================
    if (url.pathname === '/upload-m3u' && request.method === 'POST') {
      try {
        const m3u8Content = await request.text();

        if (!m3u8Content || m3u8Content.length === 0) {
          return new Response(JSON.stringify({ error: 'Empty body' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const channelCount = (m3u8Content.match(/#EXTINF:/g) || []).length;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const r2Key = `playlists/APE_ULTIMATE_v9.0_${timestamp}.m3u8`;

        await env.CHANNELS_R2.put(r2Key, m3u8Content, {
          httpMetadata: {
            contentType: 'application/vnd.apple.mpegurl',
            cacheControl: 'public, max-age=3600'
          },
          customMetadata: {
            channels: channelCount.toString(),
            uploaded_at: new Date().toISOString(),
            source: request.headers.get('X-Source') || 'frontend_upload',
            filename: request.headers.get('X-Filename') || 'playlist.m3u8',
            strategy: request.headers.get('X-Strategy') || 'default'
          }
        });

        // Invalidar cache
        cachedPlaylist = null;
        cacheTimestamp = 0;

        return new Response(JSON.stringify({
          success: true,
          message: 'M3U8 saved to R2 (RAW - original URLs preserved)',
          r2_key: r2Key,
          public_url: `${url.origin}/public/playlist.m3u8`,
          channels: channelCount,
          size_bytes: m3u8Content.length,
          uploaded_at: new Date().toISOString()
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        return new Response(JSON.stringify({
          error: 'Upload failed',
          message: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ========================================
    // ENDPOINT: /data/probes/upload - Subir CSV de resultados de probe
    // ========================================
    if (url.pathname === '/data/probes/upload' && request.method === 'PUT') {
      try {
        const csv = await request.text();
        
        if (!csv || csv.length === 0) {
          return new Response(JSON.stringify({ error: 'Empty CSV body' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const timestamp = new Date().toISOString().split('T')[0];
        const rowCount = (csv.match(/\n/g) || []).length;

        // Guardar con fecha para histórico
        await env.CHANNELS_R2.put(`probes/probe_${timestamp}.csv`, csv, {
          httpMetadata: { contentType: 'text/csv' },
          customMetadata: {
            rows: rowCount.toString(),
            uploaded_at: new Date().toISOString(),
            source: request.headers.get('X-Source') || 'probe_server'
          }
        });

        // Guardar como "latest" para acceso rápido
        await env.CHANNELS_R2.put('probes/probe_latest.csv', csv, {
          httpMetadata: { contentType: 'text/csv' },
          customMetadata: {
            rows: rowCount.toString(),
            uploaded_at: new Date().toISOString(),
            source: request.headers.get('X-Source') || 'probe_server'
          }
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'Probe results CSV uploaded to R2',
          files: {
            dated: `probes/probe_${timestamp}.csv`,
            latest: 'probes/probe_latest.csv'
          },
          rows: rowCount,
          size_bytes: csv.length,
          uploaded_at: new Date().toISOString()
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          error: 'CSV upload failed',
          message: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ========================================
    // ENDPOINT: /data/probes/* - Descargar CSV de resultados de probe
    // ========================================
    if (url.pathname.startsWith('/data/probes/') && request.method === 'GET') {
      try {
        const filename = url.pathname.split('/').pop();
        
        // Validar nombre del archivo
        if (!filename || (!filename.endsWith('.csv') && filename !== 'list')) {
          return new Response(JSON.stringify({ error: 'Invalid filename. Must end with .csv or be "list"' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Listar archivos disponibles
        if (filename === 'list') {
          const list = await env.CHANNELS_R2.list({ prefix: 'probes/' });
          const files = list.objects.map(obj => ({
            key: obj.key,
            size: obj.size,
            uploaded: obj.uploaded
          }));
          return new Response(JSON.stringify({
            success: true,
            files: files
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Descargar archivo específico
        const object = await env.CHANNELS_R2.get(`probes/${filename}`);
        
        if (!object) {
          return new Response(JSON.stringify({ 
            error: 'CSV not found',
            hint: 'Use /data/probes/list to see available files'
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(object.body, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/csv',
            'Cache-Control': 'public, max-age=3600',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'X-Rows': object.customMetadata?.rows || 'unknown',
            'X-Uploaded-At': object.customMetadata?.uploaded_at || 'unknown'
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          error: 'Failed to retrieve CSV',
          message: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ========================================
    // CAPA DE AUTENTICACIÓN (Rutas Protegidas)
    // ========================================
    const auth = await authenticateRequest(request);

    if (!auth.authenticated) {
      return new Response(JSON.stringify({
        error: auth.error || 'Authentication Required',
        status: 401,
        details: auth.details,
        help: {
          methods: ['Authorization: Bearer <JWT>', '?token=<JWT>'],
          generate: `${url.origin}/token/generate`
        }
      }, null, 2), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ========================================
    // RUTAS PROTEGIDAS (Requieren JWT)
    // ========================================

    // 1. R2 Multipart Upload - Create (Initiate)
    if (url.pathname === '/upload/mpu/create' && request.method === 'POST') {
      try {
        const { filename, metadata, contentType } = await request.json();
        const key = `playlists/${filename}`;
        const mpu = await env.CHANNELS_R2.createMultipartUpload(key, {
          httpMetadata: { contentType: contentType || 'application/vnd.apple.mpegurl' },
          customMetadata: { ...metadata, uploadedAt: new Date().toISOString() },
        });
        return new Response(JSON.stringify({ success: true, uploadId: mpu.uploadId, key }), { status: 200, headers: corsHeaders });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders }); }
    }

    // 2. R2 Multipart Upload - Part
    if (url.pathname === '/upload/mpu/part' && request.method === 'PUT') {
      try {
        const key = url.searchParams.get('key');
        const uploadId = url.searchParams.get('uploadId');
        const partNumber = parseInt(url.searchParams.get('partNumber'));

        if (!key || !uploadId || isNaN(partNumber)) {
          return new Response(JSON.stringify({ error: 'Missing parameters: key, uploadId, and partNumber are required' }), { status: 400, headers: corsHeaders });
        }

        const mpu = env.CHANNELS_R2.resumeMultipartUpload(key, uploadId);
        const mpuPart = await mpu.uploadPart(partNumber, request.body);

        return new Response(JSON.stringify({
          success: true,
          partNumber: mpuPart.partNumber,
          etag: mpuPart.etag
        }), { status: 200, headers: corsHeaders });
      } catch (e) {
        console.error('MPU Part Error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 3. R2 Multipart Upload - Complete
    if (url.pathname === '/upload/mpu/complete' && request.method === 'POST') {
      try {
        const { key, uploadId, parts } = await request.json();

        if (!key || !uploadId || !Array.isArray(parts)) {
          return new Response(JSON.stringify({ error: 'Missing parameters: key, uploadId, and parts array are required' }), { status: 400, headers: corsHeaders });
        }

        // VALIDACIÓN CRÍTICA: Ordenar y verificar secuencia
        parts.sort((a, b) => a.partNumber - b.partNumber);
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].partNumber !== i + 1) {
            throw new Error(`Part numbers must be sequential. Expected ${i + 1}, got ${parts[i].partNumber}`);
          }
        }

        const mpu = env.CHANNELS_R2.resumeMultipartUpload(key, uploadId);
        const completeResult = await mpu.complete(parts);

        // Invalidar caché local del worker
        cachedPlaylist = null;
        cacheTimestamp = 0;

        return new Response(JSON.stringify({
          success: true,
          key,
          public_url: `${url.origin}/public/playlist.m3u8`,
          finalETag: completeResult.etag,
          size: completeResult.size,
          uploaded: completeResult.uploaded
        }), { status: 200, headers: corsHeaders });
      } catch (e) {
        console.error('MPU Complete Error:', e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 4. R2 Multipart Upload - Abort
    if (url.pathname === '/upload/mpu/abort' && request.method === 'POST') {
      try {
        const { key, uploadId } = await request.json();
        const mpu = env.CHANNELS_R2.resumeMultipartUpload(key, uploadId);
        await mpu.abort();
        return new Response(JSON.stringify({ success: true, message: 'Aborted' }), { status: 200, headers: corsHeaders });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders }); }
    }

    // 5. Playlists (Auth Required)
    if (url.pathname === '/playlist.m3u8') return await handlePlaylistGeneration(request, env, auth);
    if (url.pathname.startsWith('/canal/')) return await handleCanalRedirect(request, env, auth);

    // 6. UI API Endpoints
    if (url.pathname === '/channels') {
      try {
        const playlist = await getPlaylistFromR2(env);
        return new Response(JSON.stringify({ success: true, total: playlist.channels.length, channels: playlist.channels.slice(0, 50) }), { headers: corsHeaders });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders }); }
    }

    if (url.pathname === '/groups') {
      try {
        const playlist = await getPlaylistFromR2(env);
        const groups = [...new Set(playlist.channels.map(ch => ch.meta?.group).filter(Boolean))].sort();
        return new Response(JSON.stringify({ success: true, total: groups.length, groups }), { headers: corsHeaders });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders }); }
    }

    // 7. Session Sync API (Optional/Compatibility)
    if (url.pathname === '/api/sessions/index' && request.method === 'PUT') {
      try {
        await env.CHANNELS_R2.put('sessions/_index.json.gz', request.body, { httpMetadata: { contentType: 'application/gzip' } });
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders }); }
    }

    if (url.pathname.startsWith('/api/sessions/chunk/') && request.method === 'PUT') {
      try {
        const chunkId = url.pathname.split('/').pop();
        await env.CHANNELS_R2.put(`sessions/chunk_${chunkId}.json.gz`, request.body, { httpMetadata: { contentType: 'application/gzip' } });
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders }); }
    }

    // Default 404
    return new Response(JSON.stringify({
      error: 'Endpoint not found',
      available_endpoints: [
        'GET /health (Public)',
        'GET /token/generate (Public)',
        'GET /stats (Public)',
        'POST /upload-m3u (Public)',
        'PUT /data/probes/upload (Public) - Upload probe CSV',
        'GET /data/probes/probe_latest.csv (Public) - Download latest probe results',
        'GET /data/probes/list (Public) - List all probe CSVs',
        'POST /upload/mpu/create (Auth)',
        'PUT /upload/mpu/part (Auth)',
        'POST /upload/mpu/complete (Auth)',
        'GET /playlist.m3u8 (Auth)',
        'GET /public/playlist.m3u8 (Public)'
      ]
    }, null, 2), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
};

