<?php

/**
 * ═══════════════════════════════════════════════════════════════════
 * APE CREDENTIALS (SSOT) — Single Source of Truth
 * ═══════════════════════════════════════════════════════════════════
 * Este módulo contiene la autoridad absoluta sobre las contraseñas
 * de Xtream Codes para el IPTV Navigator PRO.
 * Previene errores 407 (Proxy Authentication Required) inyectando
 * las credenciales correctas incluso si el M3U8 viene malformado 
 * (p. ej. con password 'U56@DP' en vez de 'U56BDP').
 */

class ApeCredentials
{
    /**
     * @var array<string, array{user: string, pass: string}>
     * Host como llave primaria. Si el host coincide, se imponen estas credenciales maestra.
     */
    private static array $providers = [
        // Servidor 1: tivi-ott
        'line.tivi-ott.net' => [
            'user' => '3JHFTC',
            'pass' => 'U56BDP'
        ],
        // Servidor 2: nov202gg
        'nov202gg.xyz:80' => [
            'host' => 'http://nov202gg.xyz:80',
            'user' => '2bltzll4p2',
            'pass' => '0qtujkrjal'
        ],
        // Servidor 3: ky-tv
        'ky-tv.cc:80' => [
            'host' => 'http://ky-tv.cc:80',
            'user' => 'sjUumYrmCj',
            'pass' => 'KndjvFyunE'
        ],
        // Soporte para alias cortos de servidor que el frontend pueda enviar en 'srv='
        'tivi_01' => [
            'host' => 'line.tivi-ott.net',
            'user' => '3JHFTC',
            'pass' => 'U56BDP'
        ],
        'nova_01' => [
            'host' => 'http://nov202gg.xyz:80',
            'user' => '2bltzll4p2',
            'pass' => '0qtujkrjal'
        ],
        'kytv_01' => [
            'host' => 'http://ky-tv.cc:80',
            'user' => 'sjUumYrmCj',
            'pass' => 'KndjvFyunE'
        ]
    ];

    /**
     * Resuelve, sanea y consolida las credenciales.
     * 
     * @param string $host El host original o alias (ej. 'line.tivi-ott.net' o 'tivi_01')
     * @param string|null $providedUser Usuario extraído del request (si aplica)
     * @param string|null $providedPass Contraseña extraída del request (si aplica)
     * @return array{host: string, user: string, pass: string}
     */
    public static function resolve(string $host, ?string $providedUser = null, ?string $providedPass = null): array
    {
        $cleanHost = preg_replace('#^https?://#', '', rtrim($host, '/'));
        $cleanHostForLookup = $cleanHost; // Lookup against the exact string (which might include :80)
        $cleanHostStripped = explode(':', $cleanHost)[0]; // Fallback if they didn't include the port

        // --- INYECCIÓN SSOT DINÁMICA ---
        // Leer la lista blanca alimentada por el UI y fusionar con la memoria en tiempo real
        $dynamicFile = __DIR__ . '/whitelist_dynamic.json';
        if (file_exists($dynamicFile)) {
            $dynContent = file_get_contents($dynamicFile);
            if ($dynContent) {
                $decoded = json_decode($dynContent, true);
                if (is_array($decoded)) {
                    self::$providers = array_merge(self::$providers, $decoded);
                }
            }
        }
        // -------------------------------

        // 1. Es un Alias Puro? (el Frontend solo envía srv=tivi_01)
        if (isset(self::$providers[$cleanHostForLookup]) && isset(self::$providers[$cleanHostForLookup]['host'])) {
            return [
                'host' => self::$providers[$cleanHostForLookup]['host'],
                'user' => self::$providers[$cleanHostForLookup]['user'],
                'pass' => self::$providers[$cleanHostForLookup]['pass']
            ];
        }

        // 2. Es un Proveedor Maestreado? (Hard-wire)
        $matchedKey = null;
        if (isset(self::$providers[$cleanHostForLookup])) {
            $master = self::$providers[$cleanHostForLookup];
            $matchedKey = $cleanHostForLookup;
        } elseif (isset(self::$providers[$cleanHostStripped])) {
            $master = self::$providers[$cleanHostStripped];
            $matchedKey = $cleanHostStripped;
        }

        if (isset($master)) {

            // REGLA ABSOLUTA: Las credenciales guardadas por el usuario son sagradas.
            // Solo completar campos vacíos o CRED_MISSING. NUNCA sobrescribir valores reales.
            if (empty($providedUser) || $providedUser === 'CRED_MISSING') {
                $providedUser = $master['user'];
            }
            if (empty($providedPass) || $providedPass === 'CRED_MISSING') {
                $providedPass = $master['pass'];
            }

            // Host: usar el del maestro si está declarado, sino construir desde la key
            $fallbackHost = 'http://' . ltrim($matchedKey, '/');
            $finalHost = $master['host'] ?? $fallbackHost;

            return [
                'host' => $finalHost,
                'user' => $providedUser,
                'pass' => $providedPass
            ];
        }

        // 3. Proveedor Desconocido (Passthrough)
        return [
            'host' => $host, // Preservar la URL completa original
            'user' => $providedUser ?? 'CRED_MISSING',
            'pass' => $providedPass ?? 'CRED_MISSING'
        ];
    }
}
