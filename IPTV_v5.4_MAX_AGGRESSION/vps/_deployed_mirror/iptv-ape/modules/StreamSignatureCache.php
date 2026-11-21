<?php
declare(strict_types=1);

/**
 * MÓDULO 9: StreamSignatureCache — Caché de Firmas de Stream
 * ============================================================
 * Permite omitir el pipeline completo cuando la misma solicitud
 * ya fue procesada recientemente.
 *
 * Estrategia de almacenamiento:
 * 1. APCu (si está disponible) — caché en memoria, muy rápido
 * 2. Archivos (fallback) — caché en disco, robusto
 *
 * Firma = MD5(contenido_hash + capability_fingerprint)
 * TTL: 300s para listas, 30s para canales individuales
 *
 * En cache HIT: se omite todo el pipeline (0ms de procesamiento)
 * En cache MISS: se ejecuta el pipeline y se almacena el resultado
 *
 * @package ResolveQuality v2.5 ULTRA
 * @module  StreamSignatureCache
 */

class StreamSignatureCache
{
    /** Directorio base para caché en archivo */
    private readonly string $cacheDir;

    /** Prefijo de clave para APCu (evita colisiones) */
    private readonly string $cachePrefix;

    /** Indica si APCu está disponible y habilitado */
    private readonly bool $apcuAvailable;

    /**
     * Constructor.
     *
     * @param string $cacheDir Directorio base para caché en archivo
     */
    public function __construct(string $cacheDir = '/tmp/resolve_cache')
    {
        $this->cacheDir = $cacheDir;
        $this->cachePrefix = 'rq_';
        $this->apcuAvailable = extension_loaded('apcu') && function_exists('apcu_enabled') && apcu_enabled();

        // Crear directorio si no existe
        if (!is_dir($this->cacheDir)) {
            @mkdir($this->cacheDir, 0755, true);
        }
    }

    /**
     * Genera una firma única para la solicitud.
     *
     * La firma incluye todos los parámetros relevantes:
     * - Hash del contenido M3U
     * - User-Agent del reproductor
     * - Huella de cabeceras HTTP
     *
     * @param  array  $params Parámetros que identifican la solicitud de forma única
     * @return string Firma MD5 de 32 caracteres
     */
    public function getSignature(array $params): string
    {
        ksort($params);
        return md5($this->cachePrefix . json_encode($params, JSON_UNESCAPED_UNICODE));
    }

    /**
     * Obtiene datos cacheados para una firma dada.
     *
     * Verifica la caducidad antes de devolver los datos.
     * Si la entrada expiró, se elimina y se devuelve null.
     *
     * @param  string     $signature Firma de la solicitud
     * @return array|null Datos cacheados o null si no hay hit o expiró
     */
    public function getCached(string $signature): ?array
    {
        // Intentar APCu primero (más rápido)
        if ($this->apcuAvailable) {
            $success = false;
            $data = apcu_fetch($signature, $success);
            return $success ? $data : null;
        }

        // Fallback: caché basada en archivo
        $file = $this->cacheDir . '/' . $signature . '.cache';
        if (!file_exists($file)) {
            return null;
        }

        $content = @file_get_contents($file);
        if ($content === false) {
            return null;
        }

        $cached = json_decode($content, true);
        if (!is_array($cached)) {
            return null;
        }

        // Verificar que no haya expirado
        $expiresAt = $cached['expires_at'] ?? 0;
        if (time() > $expiresAt) {
            @unlink($file);
            return null;
        }

        return $cached['data'] ?? null;
    }

    /**
     * Almacena datos en caché con un TTL determinado.
     *
     * @param string $signature   Firma de la solicitud (clave de caché)
     * @param array  $data        Datos a cachear (pipeline output o M3U)
     * @param int    $ttlSeconds  Tiempo de vida en segundos
     */
    public function setCached(string $signature, array $data, int $ttlSeconds = 300): void
    {
        $cacheEntry = [
            'data'       => $data,
            'expires_at' => time() + $ttlSeconds,
            'created_at' => time(),
        ];

        // Intentar APCu primero
        if ($this->apcuAvailable) {
            apcu_store($signature, $cacheEntry, $ttlSeconds);
            return;
        }

        // Fallback: archivo con bloqueo para evitar condiciones de carrera
        $file = $this->cacheDir . '/' . $signature . '.cache';
        @file_put_contents($file, json_encode($cacheEntry, JSON_UNESCAPED_UNICODE), LOCK_EX
        );
    }

    /**
     * Invalida entradas de caché que coincidan con un patrón.
     *
     * Útil para limpiar caché cuando se actualiza una lista o canal.
     *
     * @param string $pattern Patrón de firma para invalidar (substring)
     */
    public function invalidate(string $pattern): void
    {
        if ($this->apcuAvailable) {
            // APCu: buscar y eliminar claves que contengan el patrón
            if (function_exists('apcu_cache_info')) {
                $info = apcu_cache_info(user_cache: true);
                if (isset($info['cache_list'])) {
                    foreach ($info['cache_list'] as $entry) {
                        $key = is_array($entry) ? ($entry['info'] ?? '') : (string) $entry;
                        if (str_contains($key, $pattern)) {
                            apcu_delete($key);
                        }
                    }
                }
            }
            return;
        }

        // Fallback: eliminar archivos que coincidan con el patrón
        $files = glob($this->cacheDir . '/*' . $pattern . '*.cache');
        if (is_array($files)) {
            foreach ($files as $file) {
                @unlink($file);
            }
        }
    }

    /**
     * Limpia toda la caché (APCu y archivos).
     *
     * Se puede usar como mantenimiento periódico o al desplegar
     * una nueva versión del resolver.
     */
    public function clearAll(): void
    {
        if ($this->apcuAvailable) {
            apcu_clear_cache();
        }

        // Eliminar todos los archivos de caché
        $files = glob($this->cacheDir . '/*.cache');
        if (is_array($files)) {
            foreach ($files as $file) {
                @unlink($file);
            }
        }
    }
}
