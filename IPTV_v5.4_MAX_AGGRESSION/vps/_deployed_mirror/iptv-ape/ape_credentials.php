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
        'line.tivi-ott.net' => [
            'user' => '3JHFTC',
            'pass' => 'U56BDP'
        ],
        // Soporte para alias cortos de servidor que el frontend pueda enviar en 'srv='
        'tivi_01' => [
            'host' => 'line.tivi-ott.net',
            'user' => '3JHFTC',
            'pass' => 'U56BDP'
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

        // 1. Es un Alias Puro? (el Frontend solo envía srv=tivi_01)
        if (isset(self::$providers[$cleanHost]) && isset(self::$providers[$cleanHost]['host'])) {
            return [
                'host' => self::$providers[$cleanHost]['host'],
                'user' => self::$providers[$cleanHost]['user'],
                'pass' => self::$providers[$cleanHost]['pass']
            ];
        }

        // 2. Es un Proveedor Maestreado? (Hard-wire)
        if (isset(self::$providers[$cleanHost])) {
            $master = self::$providers[$cleanHost];
            
            // Auto-Corregir credenciales si están vacías, son 'CRED_MISSING' o tienen typos sospechosos 
            // como 'U56@DP'
            if (empty($providedUser) || $providedUser === 'CRED_MISSING') {
                $providedUser = $master['user'];
            }
            if (empty($providedPass) || $providedPass === 'CRED_MISSING' || $providedPass === 'U56@DP') {
                $providedPass = $master['pass'];
            }
            
            // Si el frontend envía '3JHFTC', GARANTIZAR que use 'U56BDP' (SSOT)
            if ($providedUser === $master['user']) {
                $providedPass = $master['pass'];
            }

            return [
                'host' => $cleanHost,
                'user' => $providedUser,
                'pass' => $providedPass
            ];
        }

        // 3. Proveedor Desconocido (Passthrough)
        return [
            'host' => $cleanHost,
            'user' => $providedUser ?? 'CRED_MISSING',
            'pass' => $providedPass ?? 'CRED_MISSING'
        ];
    }
}
