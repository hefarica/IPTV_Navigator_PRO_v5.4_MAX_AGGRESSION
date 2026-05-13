<?php
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FALLBACK PROXY — OMEGA CERO-CREDENCIALES v1.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Propósito: Enmascarar el #EXT-X-APE-FALLBACK-DIRECT para que la lista M3U8
 * NUNCA exponga el host, usuario ni contraseña del proveedor IPTV.
 *
 * Flujo:
 *   Lista M3U8 → #EXT-X-APE-FALLBACK-DIRECT:https://tu-vps/fallback_proxy.php?t=TOKEN
 *   Reproductor llama al proxy → proxy resuelve TOKEN → redirige o proxea al origen real
 *
 * Modos disponibles:
 *   MODE_REDIRECT  → Emite HTTP 302 al origen real (más rápido, origen visible en logs del player)
 *   MODE_PROXY     → Proxea el stream completo (origen 100% invisible, más carga en VPS)
 *   MODE_REWRITE   → Devuelve un M3U8 mínimo con la URL real (compatible con todos los players)
 *
 * Seguridad:
 *   - El TOKEN es un HMAC-SHA256 del ch_id + timestamp truncado (ventana de 5 minutos)
 *   - La tabla de orígenes NUNCA sale del servidor
 *   - Rate limiting: máx 20 requests/minuto por IP
 * ═══════════════════════════════════════════════════════════════════════════
 */

declare(strict_types=1);

// ── CONFIGURACIÓN — EDITAR ANTES DE SUBIR AL VPS ──────────────────────────

/** Clave secreta para firmar tokens. Cambiar por una cadena aleatoria de 64+ chars. */
const FALLBACK_SECRET = '070cf70b0232f6ca0830d9341419c37606b6950a488bfcbb75f4d9dc07680046';

/** Modo de operación: 'redirect' | 'proxy' | 'rewrite' */
const FALLBACK_MODE = 'rewrite';

/** Ventana de validez del token en segundos (300 = 5 minutos) */
const TOKEN_WINDOW = 300;

/** Máximo de requests por IP por minuto (rate limiting) */
const RATE_LIMIT = 20;

/** Ruta al archivo de log */
const FALLBACK_LOG = '/var/log/ape/fallback.log';

/**
 * TABLA DE ORÍGENES — Esta tabla VIVE SOLO EN EL SERVIDOR, nunca en la lista.
 *
 * Formato: 'ch_id' => 'URL_de_origen_real'
 *
 * Para poblarla automáticamente desde resolve_quality_unified.php,
 * ver la función rq_get_fallback_url() al final de este archivo.
 */
const ORIGIN_TABLE = [
    // Ejemplo — reemplazar con los canales reales:
    '1'    => 'http://nov202gg.xyz:80/live/2bltzll4p2/0qtujkrjal/1.m3u8',
    '2'    => 'http://nov202gg.xyz:80/live/2bltzll4p2/0qtujkrjal/2.m3u8',
    // ... (4143 entradas generadas por el script Python adjunto)
];

// ── FIN DE CONFIGURACIÓN ──────────────────────────────────────────────────


// ── PUNTO DE ENTRADA ──────────────────────────────────────────────────────

// Rate limiting básico con APCu (si está disponible)
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if (function_exists('apcu_fetch')) {
    $rateKey = 'fallback_rl_' . md5($clientIp);
    $hits = (int)apcu_fetch($rateKey);
    if ($hits >= RATE_LIMIT) {
        http_response_code(429);
        header('Retry-After: 60');
        exit('Too Many Requests');
    }
    apcu_store($rateKey, $hits + 1, 60);
}

$token  = trim($_GET['t'] ?? '');
$chId   = trim($_GET['ch'] ?? '');

// Si viene token, validarlo y resolver el ch_id
if ($token !== '') {
    $chId = fallback_verify_token($token);
    if ($chId === null) {
        fallback_log('WARN', "Token inválido o expirado: {$token} desde {$clientIp}");
        http_response_code(403);
        exit('Token inválido o expirado');
    }
}

if ($chId === '' || !isset(ORIGIN_TABLE[$chId])) {
    fallback_log('WARN', "Canal no encontrado: ch={$chId} desde {$clientIp}");
    http_response_code(404);
    exit('Canal no encontrado');
}

$originUrl = ORIGIN_TABLE[$chId];
fallback_log('INFO', "Fallback ch={$chId} → {$originUrl} desde {$clientIp}");

// Despachar según el modo configurado
switch (FALLBACK_MODE) {
    case 'redirect':
        fallback_redirect($originUrl);
        break;
    case 'proxy':
        fallback_proxy($originUrl);
        break;
    case 'rewrite':
    default:
        fallback_rewrite($originUrl, $chId);
        break;
}
exit;


// ── FUNCIONES ─────────────────────────────────────────────────────────────

/**
 * Genera un token HMAC-SHA256 para un ch_id dado.
 * Llamar desde el generador de la lista para construir la URL enmascarada.
 *
 * @param  string $chId  ID del canal
 * @return string        Token URL-safe
 */
function fallback_generate_token(string $chId): string
{
    $window = (int)(time() / TOKEN_WINDOW);
    $payload = $chId . '|' . $window;
    $sig = hash_hmac('sha256', $payload, FALLBACK_SECRET);
    // Codificar ch_id en Base64 URL-safe para ocultar el número
    $encoded = rtrim(strtr(base64_encode($chId), '+/', '-_'), '=');
    return $encoded . '.' . substr($sig, 0, 32);
}

/**
 * Verifica un token y devuelve el ch_id si es válido, null si no.
 */
function fallback_verify_token(string $token): ?string
{
    $parts = explode('.', $token, 2);
    if (count($parts) !== 2) return null;

    [$encodedId, $sig] = $parts;

    // Decodificar ch_id
    $chId = base64_decode(strtr($encodedId, '-_', '+/') . '==');
    if ($chId === false || $chId === '') return null;

    // Verificar firma en ventana actual y anterior (tolerancia de 1 ventana)
    $now = (int)(time() / TOKEN_WINDOW);
    foreach ([$now, $now - 1] as $window) {
        $payload  = $chId . '|' . $window;
        $expected = substr(hash_hmac('sha256', $payload, FALLBACK_SECRET), 0, 32);
        if (hash_equals($expected, $sig)) {
            return (string)$chId;
        }
    }

    return null;
}

/**
 * MODO REDIRECT: HTTP 302 al origen real.
 * Ventaja: mínima carga en el VPS.
 * Desventaja: el reproductor ve la URL de origen en los logs.
 */
function fallback_redirect(string $originUrl): void
{
    if (!headers_sent()) {
        http_response_code(302);
        header('Location: ' . $originUrl);
        header('Cache-Control: no-store, no-cache');
    }
}

/**
 * MODO REWRITE: Devuelve un M3U8 mínimo con la URL real.
 * Ventaja: compatible con TODOS los reproductores (VLC, Kodi, TiviMate, etc.)
 * La URL real solo aparece en el M3U8 secundario, no en la lista principal.
 */
function fallback_rewrite(string $originUrl, string $chId): void
{
    if (!headers_sent()) {
        http_response_code(200);
        header('Content-Type: application/vnd.apple.mpegurl; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('X-APE-Fallback-Mode: REWRITE');
        header('X-APE-Channel: ' . $chId);
    }
    echo "#EXTM3U\n";
    echo "#EXTINF:-1,Canal {$chId} [FALLBACK]\n";
    echo "#EXTVLCOPT:network-caching=60000\n";
    echo "#EXTVLCOPT:http-reconnect=true\n";
    echo $originUrl . "\n";
}

/**
 * MODO PROXY: Proxea el stream completo a través del VPS.
 * Ventaja: el origen es 100% invisible para el reproductor.
 * Desventaja: consume ancho de banda del VPS.
 */
function fallback_proxy(string $originUrl): void
{
    $ch = curl_init($originUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_USERAGENT      => 'APE-FallbackProxy/1.0',
        CURLOPT_HTTPHEADER     => ['Accept: */*'],
        CURLOPT_HEADERFUNCTION => function ($curl, $header) {
            // Reenviar solo headers seguros al cliente
            $safe = ['Content-Type', 'Content-Length', 'Transfer-Encoding'];
            foreach ($safe as $h) {
                if (stripos($header, $h . ':') === 0 && !headers_sent()) {
                    header(rtrim($header));
                }
            }
            return strlen($header);
        },
        CURLOPT_WRITEFUNCTION  => function ($curl, $data) {
            echo $data;
            if (ob_get_level() > 0) ob_flush();
            flush();
            return strlen($data);
        },
    ]);

    if (!headers_sent()) {
        http_response_code(200);
        header('X-APE-Fallback-Mode: PROXY');
    }

    curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) {
        fallback_log('ERROR', "Proxy falló para {$originUrl}: {$err}");
    }
}

/**
 * Logger simple.
 */
function fallback_log(string $level, string $msg): void
{
    $dir = dirname(FALLBACK_LOG);
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $line = '[' . date('Y-m-d H:i:s') . '] [' . $level . '] ' . $msg . PHP_EOL;
    @file_put_contents(FALLBACK_LOG, $line, FILE_APPEND | LOCK_EX);
}

/**
 * Función de integración con resolve_quality_unified.php
 *
 * Llamar desde el generador de la lista para obtener la URL enmascarada:
 *
 *   $maskedUrl = rq_get_fallback_url($chId, 'https://iptv-ape.duckdns.org/fallback_proxy.php');
 *   // Resultado: https://iptv-ape.duckdns.org/fallback_proxy.php?t=TOKEN
 *
 * En la lista M3U8 se emite:
 *   #EXT-X-APE-FALLBACK-DIRECT:https://iptv-ape.duckdns.org/fallback_proxy.php?t=TOKEN
 */
function rq_get_fallback_url(string $chId, string $proxyBase): string
{
    $token = fallback_generate_token($chId);
    return rtrim($proxyBase, '/') . '?t=' . urlencode($token);
}
