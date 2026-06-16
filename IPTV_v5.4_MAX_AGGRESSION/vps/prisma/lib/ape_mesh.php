<?php
/**
 * ape_mesh.php — F2 malla descentralizada (fan-out de motores DECISORES, sin transcode).
 * Reusable por ape-feedforward.php (one-shot) y ape-feedforward-stream.php (SSE).
 *
 * Devuelve presets = metadata player-blind (#EXT-X-APE-* / #EXTVLCOPT / #KODIPROP).
 * El render real lo hace el on-device; estos presets NUNCA van en STREAM-INF.
 */
if (!function_exists('ape_mesh_presets')) {

    function ape_mesh_presets($chId, array $streamInfo, array $health, $ct) {
        $MODULES = '/var/www/html/cmaf_engine/modules/';
        $engines = array();
        $presets = array();

        $call = function ($modFile, $class, callable $invoke) use ($MODULES, &$engines, &$presets) {
            try {
                if (@is_file($MODULES . $modFile)) {
                    require_once $MODULES . $modFile;
                    if (class_exists($class)) {
                        $d = $invoke();
                        if (is_array($d)) {
                            $engines[$class] = count($d);
                            foreach ($d as $l) { if (is_string($l) && $l !== '') $presets[] = $l; }
                        }
                    }
                }
            } catch (\Throwable $e) {
                @error_log('[ape_mesh] ' . $class . ': ' . $e->getMessage());
            }
        };

        // NeuroBuffer: API 2 pasos (calculateAggression → buildApeTags)
        $call('neuro_buffer_controller.php', 'NeuroBufferController', function () use ($chId, $streamInfo) {
            $bufferPct = (float)(isset($streamInfo['bufferPct']) ? $streamInfo['bufferPct'] : 50);
            $profile = NeuroBufferController::calculateAggression($chId, $bufferPct, array());
            $out = array();
            if (method_exists('NeuroBufferController', 'buildApeTags')) {
                foreach ((array)NeuroBufferController::buildApeTags($profile) as $t) { if (is_string($t) && $t !== '') $out[] = $t; }
            }
            return $out;
        });
        $call('lcevc_phase4_injector.php',    'LcevcPhase4Injector',    function () use ($streamInfo, $health, $ct) { return LcevcPhase4Injector::getDirectives($streamInfo, $health, $ct); });
        $call('hdr10plus_dynamic_engine.php', 'Hdr10PlusDynamicEngine', function () use ($streamInfo, $health, $ct) { return Hdr10PlusDynamicEngine::getDirectives($streamInfo, $health, $ct); });

        $presets = array_values(array_unique($presets));
        return array('engines' => $engines, 'presets' => $presets);
    }

    /**
     * device_settings = el subconjunto HONESTO que el daemon (aplicador puro) SÍ puede escribir
     * vía Android Settings a un player 3rd-party en curso. Los EXTVLCOPT/KODIPROP son list-level
     * (llegan por la lista, no por el daemon) y NO van aquí.
     * Formato: "<ns> <key> <val>" (lo valida la allowlist del SettingsApplier).
     */
    function ape_mesh_device_settings(array $streamInfo) {
        $ds = array('global match_content_frame_rate 1'); // universal, SDR-safe, impacto real (anti-judder)
        $hdr = isset($streamInfo['hdr_type']) ? strtolower($streamInfo['hdr_type']) : '';
        // hdr_conversion SOLO si el canal probó HDR real (truth-guard; nunca sobre SDR)
        if ($hdr === 'pq' || $hdr === 'hlg' || strpos($hdr, 'hdr10') !== false
            || strpos($hdr, 'dolby') !== false || strpos($hdr, 'dvhe') !== false || strpos($hdr, 'dv') === 0) {
            $ds[] = 'global hdr_conversion_mode 1';
        }
        return $ds;
    }

    /** Estado por-device que el VPS correlaciona del tráfico que proxea (qué canal/decode juega). Vacío si aún no hay. */
    function ape_device_state($device) {
        $device = preg_replace('/[^0-9A-Za-z_.\-]/', '', (string)$device);
        if ($device === '') return array();
        $f = '/dev/shm/ape_device_state/' . $device . '.json';
        if (is_file($f)) { $j = json_decode(@file_get_contents($f), true); if (is_array($j)) return $j; }
        return array();
    }

    /** Construye streamInfo+health desde los params GET (URL-2). */
    function ape_mesh_inputs_from_get() {
        $streamInfo = array(
            'hdr_type'  => isset($_GET['hdr'])   ? preg_replace('/[^0-9A-Za-z+._-]/', '', $_GET['hdr'])   : '',
            'width'     => (int)(isset($_GET['w']) ? $_GET['w'] : 0),
            'height'    => (int)(isset($_GET['h']) ? $_GET['h'] : 0),
            'codec'     => isset($_GET['codec']) ? preg_replace('/[^0-9A-Za-z+._-]/', '', $_GET['codec']) : '',
            'bufferPct' => (float)(isset($_GET['buf']) ? $_GET['buf'] : 50),
        );
        $health = array('riskScore' => (float)(isset($_GET['risk']) ? $_GET['risk'] : 0));
        $ct = (isset($_GET['ct']) && in_array($_GET['ct'], array('sports','cinema','news','default'), true)) ? $_GET['ct'] : 'default';
        return array($streamInfo, $health, $ct);
    }
}
