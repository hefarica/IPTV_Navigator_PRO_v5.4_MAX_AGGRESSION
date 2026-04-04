<?php
/**
 * UA Phantom Engine v3.0 - BACKEND REAL-TIME
 * ========================================================
 * Traducción 1:1 de `ua_phantom_engine_v3.js` para mantener 
 * la sincronización estocástica determinista en el servidor.
 */

class UAPhantomEngine {
    private static array $ALL_UAS = [
    ];

    private static int $epochSeed = 0;

    /**
     * @param int $timestamp 
     */
    public static function init(int $timestamp): void {
        // En backend, nos basamos en una hora truncada si no hay epoch fuerte
        // para que sea determinista pero que rote.
        $hours = floor($timestamp / 1000 / 3600);
        self::$epochSeed = (int) $hours; 
    }

    private static function checkInit(): void {
        if (self::$epochSeed === 0) {
            self::init(time() * 1000);
        }
    }

    /**
     * Hash criptográfico idéntico a djb2 de JS
     */
    private static function _djb2(string $str): int {
        $hash = 5381;
        $len = strlen($str);
        for ($i = 0; $i < $len; $i++) {
            $char = ord($str[$i]);
            // (hash << 5) + hash == hash * 33
            // JS usa enteros de 32 bits, por lo que aplicamos máscara para forzar overflow.
            $hash = (($hash << 5) + $hash + $char) & 0xFFFFFFFF;
        }
        return abs($hash); // Forzar positivo
    }

    public static function getForChannel(int $channelIndex, string $channelName = ''): string {
        self::checkInit();
        $targetStr = "{$channelIndex}_{$channelName}_" . self::$epochSeed;
        $hash = self::_djb2($targetStr);
        $total = count(self::$ALL_UAS);
        
        // Simular Math.floor de JS
        $index = $hash % $total;
        return self::$ALL_UAS[$index];
    }

    public static function getForZapping(int $channelIndex, string $channelName): string {
        self::checkInit();
        $nonce = floor(microtime(true) * 1000); 
        $targetStr = "{$channelIndex}_{$channelName}_{$nonce}";
        $hash = self::_djb2($targetStr);
        $total = count(self::$ALL_UAS);
        
        $index = $hash % $total;
        return self::$ALL_UAS[$index];
    }

    public static function getForRecovery(int $errorCode, int $channelIndex, string $channelName): string {
        self::checkInit();
        $primeJump = 13;
        if ($errorCode === 407) $primeJump = 37;
        if ($errorCode === 403) $primeJump = 23;
        if ($errorCode === 429) $primeJump = 53;
        if ($errorCode >= 500)  $primeJump = 89;

        $targetStr = "{$channelIndex}_{$channelName}_" . self::$epochSeed;
        $hash = self::_djb2($targetStr);
        $total = count(self::$ALL_UAS);
        
        $index = ($hash + $primeJump + mt_rand(1, 10)) % $total;
        return self::$ALL_UAS[$index];
    }
}
