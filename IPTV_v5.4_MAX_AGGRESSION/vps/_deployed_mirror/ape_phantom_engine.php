<?php
/**
 * UA Phantom Engine v3.0 - BACKEND REAL-TIME
 * ========================================================
 * Traducción 1:1 de `ua_phantom_engine_v3.js` para mantener 
 * la sincronización estocástica determinista en el servidor.
 */

class UAPhantomEngine {
    private static array $ALL_UAS = [
        'Mozilla/5.0 (Linux; Android 12; Xiaomi MiTV Build/SKQ1.211006.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.5304.141 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 11; SHIELD Android TV Build/RQ1A.210205.004) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; Chromecast) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.5249.126 Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/5.0 Chrome/85.0.4183.93 TV Safari/537.36',
        'Mozilla/5.0 (Linux; Android 9; AFTSSS Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Silk/116.4.4 like Chrome/116.0.5845.164 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; Pixel 6 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.5615.135 Mobile Safari/537.36',
        'VLC/3.0.18 LibVLC/3.0.18',
        'Lavf/60.3.100',
        'ExoPlayer/2.19.0 (Linux;Android 12) ExoPlayerLib/2.19.0',
        'OTT Navigator/1.6.8.3 (Linux;Android 12;es_CO)',
        'TiviMate/4.7.0 (Linux;Android 12;NVIDIA SHIELD Android TV)',
        'Kodi/20.2 (Linux;Android 12;aarch64) App_Bitness/64 Version/20.2-Nexus',
        'IPTVnator/0.14.0',
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
