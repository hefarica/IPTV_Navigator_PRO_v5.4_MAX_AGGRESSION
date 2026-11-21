<?php
declare(strict_types=1);

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * APE OMEGA v7.0 — FASE 2 — CAPA 2.3
 * JWT Authentication Module: ape_jwt_auth.php
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PROPÓSITO:
 *   Proteger el endpoint resolve_quality.php contra:
 *   - Scrapers que intentan robar la lista M3U8 completa
 *   - Bots que abusan del proxy APE sin autorización
 *   - Ataques de enumeración de canales
 *
 * DISEÑO (Zero-Redirect, Long-Lived Tokens):
 *   - Tokens de 1 año de duración (no 24h): evita cortes por expiración
 *     durante la reproducción y mantiene el origen oculto en logs del reproductor
 *   - Sin base de datos: el token es autocontenido y verificable con HMAC-SHA256
 *   - Sin redirecciones: el token viaja en el header Authorization o en el
 *     parámetro GET ?_ape_token= (para reproductores que no soportan headers)
 *   - Clave rotativa cada 365 días (configurable)
 *   - Compatible con TiviMate, OTT Navigator, IPTV Smarters, VLC, Kodi
 *
 * ENDPOINTS:
 *   GET /ape/token?device_id=XXXX[&channel_quota=500]
 *       → Emite un JWT vinculado al device_id
 *
 *   GET /resolve_quality.php?ch=ESPN
 *       Authorization: Bearer <JWT>
 *       → Stream (si JWT válido) | 401 JSON (si inválido/expirado)
 *
 * INTEGRACIÓN EN resolve_quality.php (3 líneas):
 *   require_once __DIR__ . '/ape_jwt_auth.php';
 *   ApeJwtAuth::guardOrDie();  // Bloquea si no hay token válido
 *   $deviceId = ApeJwtAuth::currentDeviceId();  // Obtener device_id del token
 *
 * INTEGRACIÓN EN NGINX (para el endpoint /ape/token):
 *   location /ape/token {
 *       fastcgi_pass unix:/var/run/php/php8.1-fpm.sock;
 *       fastcgi_param SCRIPT_FILENAME /var/www/html/ape_jwt_auth.php;
 *       include fastcgi_params;
 *   }
 *
 * @package  cmaf_engine
 * @version  2.3.0
 * @requires PHP 8.1+, ext-hash
 */
class ApeJwtAuth
{
    const VERSION = '2.3.0';

    // ── Configuración ─────────────────────────────────────────────────────────
    // La clave secreta se lee de la variable de entorno APE_JWT_SECRET.
    // Si no existe, se genera y persiste en /etc/iptv-ape/jwt_secret.key
    private const SECRET_ENV_VAR    = 'APE_JWT_SECRET';
    private const SECRET_FILE       = '/etc/iptv-ape/jwt_secret.key';
    private const TOKEN_TTL         = 31536000;  // 1 año en segundos (no 24h)
    private const ALGORITHM         = 'sha256';
    private const DEFAULT_QUOTA     = 500;       // Peticiones/hora por dispositivo
    private const MAX_QUOTA         = 5000;      // Máximo permitido

    // ── Log de fallos (para Fail2Ban) ─────────────────────────────────────────
    private const FAIL_LOG          = '/var/log/nginx/ape-error.log';

    // ── Estado de la petición actual ──────────────────────────────────────────
    private static ?array $currentClaims = null;

    // ══════════════════════════════════════════════════════════════════════════
    // API PÚBLICA
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Punto de entrada para el endpoint /ape/token.
     * Emite un JWT nuevo vinculado al device_id del reproductor.
     * Llamar desde el script PHP que maneja /ape/token.
     */
    public static function handleTokenRequest(): void
    {
        $deviceId = trim($_GET['device_id'] ?? $_POST['device_id'] ?? '');
        $quota    = min(
            (int)($_GET['channel_quota'] ?? self::DEFAULT_QUOTA),
            self::MAX_QUOTA
        );

        if (empty($deviceId) || strlen($deviceId) < 4 || strlen($deviceId) > 128) {
            self::jsonResponse(400, [
                'error'   => 'invalid_device_id',
                'message' => 'device_id must be between 4 and 128 characters',
            ]);
            return;
        }

        // Sanitizar device_id: solo alfanumérico, guiones y guiones bajos
        $deviceId = preg_replace('/[^a-zA-Z0-9\-_]/', '', $deviceId);

        $token = self::issue($deviceId, $quota);

        self::jsonResponse(200, [
            'token'      => $token,
            'device_id'  => $deviceId,
            'expires_in' => self::TOKEN_TTL,
            'expires_at' => date('c', time() + self::TOKEN_TTL),
            'quota'      => $quota,
            'version'    => self::VERSION,
        ]);
    }

    /**
     * Verifica el JWT de la petición actual.
     * Si es inválido, responde 401 y termina la ejecución.
     * Si es válido, la ejecución continúa normalmente.
     *
     * Integración en resolve_quality.php:
     *   ApeJwtAuth::guardOrDie();
     */
    public static function guardOrDie(): void
    {
        $token = self::extractToken();

        if ($token === null) {
            self::logFail('missing_token');
            self::jsonResponse(401, [
                'error'   => 'missing_token',
                'message' => 'Authorization header or _ape_token parameter required',
            ]);
            exit;
        }

        $claims = self::verify($token);

        if ($claims === null) {
            self::logFail('invalid_signature');
            self::jsonResponse(401, [
                'error'   => 'invalid_token',
                'message' => 'Token signature is invalid or token is malformed',
            ]);
            exit;
        }

        if (time() > ($claims['exp'] ?? 0)) {
            self::logFail('expired');
            self::jsonResponse(401, [
                'error'   => 'token_expired',
                'message' => 'Token has expired. Request a new token at /ape/token',
                'expired_at' => date('c', $claims['exp'] ?? 0),
            ]);
            exit;
        }

        // Verificar cuota de peticiones por hora
        if (!self::checkQuota($claims)) {
            self::logFail('quota_exceeded');
            self::jsonResponse(429, [
                'error'   => 'quota_exceeded',
                'message' => 'Hourly channel request quota exceeded',
                'quota'   => $claims['quota'] ?? self::DEFAULT_QUOTA,
                'retry_after' => 3600,
            ]);
            exit;
        }

        // Token válido — guardar claims para uso posterior
        self::$currentClaims = $claims;
    }

    /**
     * Verifica el JWT pero no termina la ejecución si es inválido.
     * Útil para endpoints donde el JWT es opcional.
     *
     * @return bool True si el token es válido, false si no
     */
    public static function verify_soft(): bool
    {
        $token = self::extractToken();
        if ($token === null) {
            return false;
        }
        $claims = self::verify($token);
        if ($claims === null || time() > ($claims['exp'] ?? 0)) {
            return false;
        }
        self::$currentClaims = $claims;
        return true;
    }

    /**
     * Retorna el device_id del token de la petición actual.
     * Solo válido después de llamar a guardOrDie() o verify_soft().
     */
    public static function currentDeviceId(): string
    {
        return self::$currentClaims['sub'] ?? 'anonymous';
    }

    /**
     * Retorna todos los claims del token actual.
     */
    public static function currentClaims(): array
    {
        return self::$currentClaims ?? [];
    }

    /**
     * Emite un nuevo JWT para un device_id dado.
     *
     * @param string $deviceId  Identificador único del dispositivo
     * @param int    $quota     Máximo de peticiones por hora
     * @return string           JWT firmado
     */
    public static function issue(string $deviceId, int $quota = self::DEFAULT_QUOTA): string
    {
        $now = time();

        $header = self::base64UrlEncode(json_encode([
            'alg' => 'HS256',
            'typ' => 'JWT',
        ]));

        $payload = self::base64UrlEncode(json_encode([
            'iss'   => 'ape-omega-v7',
            'sub'   => $deviceId,
            'iat'   => $now,
            'exp'   => $now + self::TOKEN_TTL,
            'quota' => $quota,
            'v'     => self::VERSION,
        ]));

        $signature = self::base64UrlEncode(
            hash_hmac(self::ALGORITHM, "{$header}.{$payload}", self::getSecret(), true)
        );

        return "{$header}.{$payload}.{$signature}";
    }

    /**
     * Verifica un JWT y retorna sus claims si es válido, null si no.
     *
     * @param string $token JWT a verificar
     * @return array|null   Claims del token o null si es inválido
     */
    public static function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$header, $payload, $signature] = $parts;

        // Verificar firma con comparación de tiempo constante (anti timing-attack)
        $expectedSig = self::base64UrlEncode(
            hash_hmac(self::ALGORITHM, "{$header}.{$payload}", self::getSecret(), true)
        );

        if (!hash_equals($expectedSig, $signature)) {
            return null;
        }

        $claims = @json_decode(self::base64UrlDecode($payload), true);
        if (!is_array($claims)) {
            return null;
        }

        return $claims;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MÉTODOS PRIVADOS
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Extrae el token JWT de la petición actual.
     * Soporta: Authorization header, ?_ape_token= GET param, Cookie ape_token
     */
    private static function extractToken(): ?string
    {
        // 1. Authorization: Bearer <token> (reproductores con soporte de headers)
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($authHeader, 'Bearer ')) {
            return trim(substr($authHeader, 7));
        }

        // 2. ?_ape_token=<token> (reproductores sin soporte de headers custom)
        if (!empty($_GET['_ape_token'])) {
            return trim($_GET['_ape_token']);
        }

        // 3. Cookie ape_token (navegadores y Smart TVs con WebView)
        if (!empty($_COOKIE['ape_token'])) {
            return trim($_COOKIE['ape_token']);
        }

        return null;
    }

    /**
     * Verifica la cuota de peticiones por hora del dispositivo.
     * Usa un contador en /tmp/ para no necesitar base de datos.
     */
    private static function checkQuota(array $claims): bool
    {
        $quota    = (int)($claims['quota'] ?? self::DEFAULT_QUOTA);
        $deviceId = preg_replace('/[^a-zA-Z0-9\-_]/', '', $claims['sub'] ?? 'unknown');
        $hour     = date('YmdH');
        $file     = "/tmp/ape_quota_{$deviceId}_{$hour}.cnt";

        $count = (int)(@file_get_contents($file) ?: 0);
        if ($count >= $quota) {
            return false;
        }

        @file_put_contents($file, $count + 1, LOCK_EX);

        // Limpiar archivos de cuota de horas anteriores (housekeeping)
        if ($count === 0) {
            $pattern = "/tmp/ape_quota_{$deviceId}_*.cnt";
            foreach (glob($pattern) as $oldFile) {
                if ($oldFile !== $file) {
                    @unlink($oldFile);
                }
            }
        }

        return true;
    }

    /**
     * Obtiene o genera la clave secreta JWT.
     * Prioridad: variable de entorno → archivo → generación nueva
     */
    private static function getSecret(): string
    {
        // 1. Variable de entorno (más segura — ideal para Docker/K8s)
        $envSecret = getenv(self::SECRET_ENV_VAR);
        if (!empty($envSecret) && strlen($envSecret) >= 32) {
            return $envSecret;
        }

        // 2. Archivo persistente
        if (file_exists(self::SECRET_FILE)) {
            $secret = trim(file_get_contents(self::SECRET_FILE));
            if (strlen($secret) >= 32) {
                return $secret;
            }
        }

        // 3. Generar nueva clave y persistir
        $secret = bin2hex(random_bytes(32));  // 256 bits de entropía
        $dir    = dirname(self::SECRET_FILE);
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        @file_put_contents(self::SECRET_FILE, $secret, LOCK_EX);
        @chmod(self::SECRET_FILE, 0600);

        return $secret;
    }

    /**
     * Escribe en el log de fallos para que Fail2Ban pueda detectar el patrón.
     * Formato: [APE-JWT-FAIL] ip=X.X.X.X reason=REASON
     */
    private static function logFail(string $reason): void
    {
        $ip    = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $token = self::extractToken() ?? '';
        $entry = sprintf(
            "[%s] [APE-JWT-FAIL] ip=%s reason=%s token=%s\n",
            date('d/M/Y:H:i:s O'),
            $ip,
            $reason,
            substr($token, 0, 20) . (strlen($token) > 20 ? '...' : '')
        );
        @file_put_contents(self::FAIL_LOG, $entry, FILE_APPEND | LOCK_EX);
    }

    /**
     * Envía una respuesta JSON y termina la ejecución.
     */
    private static function jsonResponse(int $statusCode, array $data): void
    {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        header('X-APE-Auth-Version: ' . self::VERSION);
        // No revelar información de infraestructura
        header_remove('X-Powered-By');
        header_remove('Server');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
    }
}

// ── Punto de entrada para el endpoint /ape/token ──────────────────────────────
// Si este archivo es llamado directamente (no incluido), manejar la petición de token
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    ApeJwtAuth::handleTokenRequest();
}
