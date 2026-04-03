<?php
/**
 * APE GUARDIAN ENGINE v16
 * Telemetry Logger para /dev/shm — 0% Overhead
 */
class GuardianTelemetry {
    private static $ramFile = '/dev/shm/guardian_exchange.json';
    private static $lockFile = '/dev/shm/guardian.lock';
    
    public static function log(string $msg, string $type = 'log') {
        self::updateState([
            'log' => $msg,
            'suggestion' => ($type === 'suggest') ? $msg : null
        ]);
    }
    
    public static function sessionPing(float $latencyMs, bool $isError = false) {
        self::updateState([
            'latency' => $latencyMs,
            'error' => $isError ? 1 : 0,
            'ping' => 1
        ]);
    }

    private static function updateState(array $payload) {
        $fp = @fopen(self::$lockFile, 'c+');
        if (!$fp) return;
        
        if (flock($fp, LOCK_EX | LOCK_NB)) {
            $state = [
                'active_sessions' => 0,
                'avg_bandwidth_mbps' => 0.0,
                'avg_latency_ms' => 0,
                'total_errors' => 0,
                'suggestions' => [],
                'logs' => [],
                'last_update' => time()
            ];
            
            if (file_exists(self::$ramFile)) {
                $raw = @file_get_contents(self::$ramFile);
                if ($raw) {
                    $decoded = @json_decode($raw, true);
                    if (is_array($decoded)) $state = array_merge($state, $decoded);
                }
            }
            
            // Decaimiento natural de sesiones después de 12 segundos sin pings
            if (time() - $state['last_update'] > 12) {
                $state['active_sessions'] = 0;
            }
            
            if (isset($payload['ping'])) {
                // Al ser peticiones muy rápidas, sumamos como sesión virtual pseudo-random
                if ($state['active_sessions'] === 0) $state['active_sessions'] = 1;
                else if (rand(1,10) > 8) $state['active_sessions']++;
                
                // Reducción simple: Cada 10s se purga el 20% de sesiones (decay)
                // Se asume 10mbps de base (estimado)
                $targetLatency = $payload['latency'];
                $state['avg_latency_ms'] = round(($state['avg_latency_ms'] * 0.7) + ($targetLatency * 0.3));
                
                // Base width estimation from active sessions and average streaming profiles
                // En M3U8 el bandwidth real se extrae del proxy, aquí hacemos un mock-up educacional
                $state['avg_bandwidth_mbps'] = round($state['active_sessions'] * 12.5, 1);
            }
            if (isset($payload['error']) && $payload['error']) {
                $state['total_errors']++;
            }
            if (isset($payload['log'])) {
                array_unshift($state['logs'], $payload['log']);
                $state['logs'] = array_slice($state['logs'], 0, 10);
            }
            if (isset($payload['suggestion']) && $payload['suggestion']) {
                array_unshift($state['suggestions'], $payload['suggestion']);
                $state['suggestions'] = array_slice($state['suggestions'], 0, 3);
            }
            
            $state['last_update'] = time();
            file_put_contents(self::$ramFile, json_encode($state));
            
            flock($fp, LOCK_UN);
        }
        fclose($fp);
    }
}
