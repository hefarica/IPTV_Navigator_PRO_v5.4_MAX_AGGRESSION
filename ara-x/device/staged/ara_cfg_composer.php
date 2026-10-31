<?php
/**
 * ara_cfg_composer.php — I4 · espejo PHP STAGED del compositor de aplicación en device.
 *
 * Estado: STAGED. No está desplegado, no hay endpoint que lo llame y no se ha ejecutado en el VPS.
 *   · `php -l` = NOT_RUN en este host (no hay intérprete PHP local). Ver §NOT_RUN del informe del task.
 *   · Paridad de comportamiento con `ara-x/device/apply_composer.js`, verificada por
 *     `ara-x/tests/device_apply.test.js` comparando ambos sobre los mismos fixtures.
 *
 * Qué hace: traduce la decisión del ADC a
 *   1) `device_settings` = filas "<ns> <key> <val>" (misma forma que `ape_mesh_device_settings()`), y
 *   2) cuerpo de `POST /a/cfg` (JSON por sesión, ≤64 KB, TTL declarado, sin claves duplicadas).
 *
 * Reglas duras: sólo claves de `ara-x/spec/actuator_allowlist.json` (29) y levers VPP (13);
 *   fail-closed por SoC (no medido / no canónico / mismatch); `never_downscale` obligatorio;
 *   wire 8K prohibido; NO toca RESOLUTION/CODECS/BANDWIDTH; no emite props ni namespaces inventados;
 *   no usa ADB ni serial/chip; no usa `buffer_health_pct` como buffer del player.
 */

declare(strict_types=1);

final class AraApplyComposer
{
    public const E_SOC_NOT_MEASURED = 'E_SOC_NOT_MEASURED';
    public const E_SOC_UNMAPPED = 'E_SOC_UNMAPPED';
    public const E_SOC_MISMATCH = 'E_SOC_MISMATCH';
    public const E_KEY_NOT_ALLOWED = 'E_KEY_NOT_ALLOWED';
    public const E_KEY_FORBIDDEN = 'E_KEY_FORBIDDEN';
    public const E_LEVER_NOT_IN_ALLOWLIST = 'E_LEVER_NOT_IN_ALLOWLIST';
    public const E_WIRE_8K = 'E_WIRE_8K';
    public const E_NEVER_DOWNSCALE_REQUIRED = 'E_NEVER_DOWNSCALE_REQUIRED';
    public const E_DEVICE_NOT_ALLOWED = 'E_DEVICE_NOT_ALLOWED';
    public const E_CFG_TOO_LARGE = 'E_CFG_TOO_LARGE';
    public const E_CFG_DUPLICATE_KEY = 'E_CFG_DUPLICATE_KEY';
    public const E_CFG_BAD_KEY = 'E_CFG_BAD_KEY';
    public const E_CFG_BAD_VALUE = 'E_CFG_BAD_VALUE';
    public const E_TTL_OUT_OF_RANGE = 'E_TTL_OUT_OF_RANGE';

    public const MAX_CFG_BYTES = 65536;   // client_max_body_size 64k / MAX_BODY del Lua
    public const MAX_ROWS = 16;           // presupuesto Never-Drop de D4
    public const TTL_MIN = 1;
    public const TTL_MAX = 3600;
    public const TTL_DEFAULT = 300;
    public const THERMAL_MIN_C = 55;
    public const THERMAL_MAX_C = 85;
    public const TIERS = ['minimal', 'balanced', 'quality', 'max_image'];
    public const FPS_TARGETS = [24, 30, 60];
    public const CFG_KEYS = ['pq', 'hdr', 'ua_mode', 'referer_mode', 'source_format', 'audio_codec', 'bit_depth'];
    public const INVERT_CLAMP = ['minimal_post_processing_allowed'];

    /** @var array<string,mixed> */
    private array $allowlist;
    /** @var array<string,mixed> */
    private array $leverMap;
    /** @var array<string,bool> */
    private array $allowed = [];
    /** @var array<string,bool> */
    private array $levers = [];
    /** @var array<string,array<string,mixed>> */
    private array $meta = [];
    /** @var array<int,string> */
    private array $canon = [];
    /** @var array<string,string> */
    private array $aliases = [];

    public function __construct(string $specDir)
    {
        $this->allowlist = $this->readJson(rtrim($specDir, '/') . '/actuator_allowlist.json');
        $this->leverMap = $this->readJson(rtrim($specDir, '/') . '/lever_namespace_map.json');

        foreach ($this->allowlist['settings_allowlist']['device_applier']['keys'] as $row) {
            $this->allowed[(string)$row['key']] = true;
        }
        foreach ($this->allowlist['settings_allowlist']['vpp_levers']['keys'] as $k) {
            $this->levers[(string)$k] = true;
        }
        foreach ($this->leverMap['keys'] as $row) {
            $key = (string)$row['key'];
            if (!isset($this->allowed[$key])) {
                throw new RuntimeException('E_SPEC_DRIFT: clave del mapa fuera de la allowlist: ' . $key);
            }
            $this->meta[$key] = [
                'tier' => (string)$row['tier'],
                'ns' => isset($row['ns_hint']) && $row['ns_hint'] ? (string)$row['ns_hint'] : 'global',
                'forbidden' => !empty($row['forbidden_by_contract']),
                'ceiling' => isset($row['ceiling_by_tier']) ? (array)$row['ceiling_by_tier'] : null,
            ];
        }
        $this->canon = array_map('strval', (array)$this->leverMap['soc']['canonical']);
        foreach ((array)$this->leverMap['soc']['alias'] as $from => $to) {
            $this->aliases[strtolower((string)$from)] = (string)$to;
        }
        // Las 3 filas base tienen que existir en la allowlist (si no, E_SPEC_DRIFT).
        foreach (['hdr_conversion_mode', 'match_content_frame_rate', 'minimal_post_processing_allowed'] as $baseKey) {
            if (!isset($this->meta[$baseKey])) {
                throw new RuntimeException('E_SPEC_DRIFT: fila base fuera de la allowlist: ' . $baseKey);
            }
        }
    }

    private function readJson(string $p): array
    {
        $raw = @file_get_contents($p);
        if ($raw === false) {
            throw new RuntimeException('E_SPEC_MISSING: ' . $p);
        }
        $j = json_decode($raw, true);
        if (!is_array($j)) {
            throw new RuntimeException('E_SPEC_BAD_JSON: ' . $p);
        }
        return $j;
    }

    public function resolveSoc($raw): array
    {
        if (!is_string($raw)) {
            return ['raw' => $raw === null ? null : $raw, 'canonical' => null, 'alias_used' => null];
        }
        $trim = trim($raw);
        if ($trim === '') {
            return ['raw' => $raw, 'canonical' => null, 'alias_used' => null];
        }
        $lower = strtolower($trim);
        if (in_array($lower, $this->canon, true)) {
            return ['raw' => $trim, 'canonical' => $lower, 'alias_used' => null];
        }
        if (isset($this->aliases[$lower])) {
            return ['raw' => $trim, 'canonical' => $this->aliases[$lower], 'alias_used' => $trim];
        }
        $d = preg_replace('/[^a-z0-9]/', '', $lower);
        foreach ($this->aliases as $alias => $to) {
            if (preg_replace('/[^a-z0-9]/', '', $alias) === $d) {
                return ['raw' => $trim, 'canonical' => $to, 'alias_used' => $trim];
            }
        }
        foreach ($this->canon as $c) {
            if (preg_replace('/[^a-z0-9]/', '', $c) === $d) {
                return ['raw' => $trim, 'canonical' => $c, 'alias_used' => $trim];
            }
        }
        return ['raw' => $trim, 'canonical' => null, 'alias_used' => null];
    }

    /** Pasos térmicos: SOLO con prov=measured (null != frío). */
    public function thermalSteps($thermal, $limits): array
    {
        if (!is_array($thermal) || ($thermal['prov'] ?? null) !== 'measured') {
            return ['steps' => 0, 'prov' => is_array($thermal) ? (string)($thermal['prov'] ?? 'unavailable') : 'unavailable', 'source' => 'none'];
        }
        $validLimits = $this->validThermalLimits($limits);
        if (isset($thermal['temp_c']) && is_numeric($thermal['temp_c']) && $validLimits !== null) {
            $t = (float)$thermal['temp_c'];
            if ($t >= $validLimits['critical_c']) return ['steps' => 3, 'prov' => 'measured', 'source' => 'temp_c'];
            if ($t >= $validLimits['severe_c']) return ['steps' => 2, 'prov' => 'measured', 'source' => 'temp_c'];
            if ($t >= $validLimits['moderate_c']) return ['steps' => 1, 'prov' => 'measured', 'source' => 'temp_c'];
            return ['steps' => 0, 'prov' => 'measured', 'source' => 'temp_c'];
        }
        $st = $thermal['status'] ?? null;
        if (!is_int($st)) {
            return ['steps' => 0, 'prov' => 'measured', 'source' => 'status_none'];
        }
        $steps = $st <= 1 ? 0 : ($st === 2 ? 1 : ($st <= 4 ? 2 : 3));
        return ['steps' => $steps, 'prov' => 'measured', 'source' => 'pm_thermal_status'];
    }

    public function validThermalLimits($limits): ?array
    {
        if (!is_array($limits)) {
            return null;
        }
        $prev = self::THERMAL_MIN_C - 1;
        $out = [];
        foreach (['light_c', 'moderate_c', 'severe_c', 'critical_c'] as $k) {
            $v = $limits[$k] ?? null;
            if (!is_int($v) || $v < self::THERMAL_MIN_C || $v > self::THERMAL_MAX_C || $v <= $prev) {
                return null;
            }
            $out[$k] = $v;
            $prev = $v;
        }
        return $out;
    }

    public function lowerTier(string $tier, int $steps): string
    {
        $i = array_search($tier, self::TIERS, true);
        if ($i === false) {
            return self::TIERS[0];
        }
        return self::TIERS[max(0, $i - $steps)];
    }

    /** Cuenta claves repetidas en un JSON plano (json_decode() se queda con la última: hay que mirar el texto). */
    public static function findDuplicateJsonKeys(string $text): array
    {
        $counts = [];
        if (preg_match_all('/"([A-Za-z0-9_]+)"\s*:/', $text, $m)) {
            foreach ($m[1] as $k) {
                $counts[$k] = ($counts[$k] ?? 0) + 1;
            }
        }
        return array_keys(array_filter($counts, static fn (int $n): bool => $n > 1));
    }

    /** @return array{ok:bool,session:string,body:string,bytes:int,ttl_s:int,ttl_declared:bool,keys:array<int,string>,errors:array<int,array<string,mixed>>} */
    public function composeCfg(array $args): array
    {
        $errors = [];
        $session = isset($args['session']) && is_string($args['session']) ? trim($args['session']) : '';
        if ($session === '') {
            $errors[] = ['code' => self::E_CFG_BAD_KEY, 'detail' => 'session'];
        }
        $out = [];
        $values = isset($args['values']) && is_array($args['values']) ? $args['values'] : [];
        foreach ($values as $k => $v) {
            if (!in_array((string)$k, self::CFG_KEYS, true)) {
                $errors[] = ['code' => self::E_CFG_BAD_KEY, 'detail' => (string)$k];
                continue;
            }
            if (!is_int($v) || $v < -1000 || $v > 1000) {
                $errors[] = ['code' => self::E_CFG_BAD_VALUE, 'detail' => (string)$k];
                continue;
            }
            $out[(string)$k] = $v;
        }
        $ttlDeclared = array_key_exists('ttl', $args);
        $ttl = $ttlDeclared ? $args['ttl'] : self::TTL_DEFAULT;
        if (!is_int($ttl)) {
            $errors[] = ['code' => self::E_TTL_OUT_OF_RANGE, 'detail' => 'ttl'];
            $ttl = self::TTL_DEFAULT;
        }
        $ttl = max(self::TTL_MIN, min(self::TTL_MAX, (int)$ttl));
        $out['ttl'] = $ttl;

        $body = json_encode($out, JSON_UNESCAPED_SLASHES);
        if (!is_string($body)) {
            $body = '{}';
        }
        foreach (self::findDuplicateJsonKeys($body) as $dup) {
            $errors[] = ['code' => self::E_CFG_DUPLICATE_KEY, 'detail' => $dup];
        }
        $bytes = strlen($body);
        if ($bytes > self::MAX_CFG_BYTES) {
            $errors[] = ['code' => self::E_CFG_TOO_LARGE, 'detail' => $bytes . '>' . self::MAX_CFG_BYTES];
        }
        $keys = array_values(array_filter(array_keys($out), static fn ($k) => $k !== 'ttl'));
        return [
            'ok' => count($errors) === 0,
            'session' => $session,
            'body' => $body,
            'bytes' => $bytes,
            'ttl_s' => $ttl,
            'ttl_declared' => $ttlDeclared,
            'keys' => $keys,
            'errors' => $errors,
        ];
    }

    /** Valida un cuerpo `/a/cfg` ya serializado (duplicados incluidos). */
    public function parseCfgBody(string $text): array
    {
        $errors = [];
        $bytes = strlen($text);
        if ($bytes > self::MAX_CFG_BYTES) {
            $errors[] = ['code' => self::E_CFG_TOO_LARGE, 'detail' => $bytes . '>' . self::MAX_CFG_BYTES];
        }
        foreach (self::findDuplicateJsonKeys($text) as $dup) {
            $errors[] = ['code' => self::E_CFG_DUPLICATE_KEY, 'detail' => $dup];
        }
        $obj = json_decode($text, true);
        if (!is_array($obj)) {
            $errors[] = ['code' => self::E_CFG_BAD_VALUE, 'detail' => 'json'];
        } else {
            foreach ($obj as $k => $v) {
                if (!in_array((string)$k, self::CFG_KEYS, true) && $k !== 'ttl') {
                    $errors[] = ['code' => self::E_CFG_BAD_KEY, 'detail' => (string)$k];
                }
                if (!is_int($v)) {
                    $errors[] = ['code' => self::E_CFG_BAD_VALUE, 'detail' => (string)$k];
                }
            }
            if (!isset($obj['ttl']) || !is_int($obj['ttl'])) {
                $errors[] = ['code' => self::E_TTL_OUT_OF_RANGE, 'detail' => 'ttl_missing'];
            }
        }
        return ['ok' => count($errors) === 0, 'bytes' => $bytes, 'value' => $obj, 'errors' => $errors];
    }

    /**
     * Compone la aplicación. Mismo contrato de salida que `apply_composer.js#compose`.
     * @param array{policy?:array,measured?:array,cfg?:array} $input
     */
    public function compose(array $input): array
    {
        $policy = is_array($input['policy'] ?? null) ? $input['policy'] : [];
        $measured = is_array($input['measured'] ?? null) ? $input['measured'] : [];
        $errors = [];
        $warnings = [];
        $skipped = [];
        $clamped = [];
        $ignored = [];

        $rawSoc = $measured['soc'] ?? ($measured['soc_raw'] ?? null);
        $soc = $this->resolveSoc($rawSoc);
        if ($rawSoc === null || (is_string($rawSoc) && trim($rawSoc) === '')) {
            $errors[] = ['code' => self::E_SOC_NOT_MEASURED];
        }
        foreach (['serial', 'serial_number', 'chip', 'soc_serial', 'device_serial'] as $k) {
            if (array_key_exists($k, $measured) || array_key_exists($k, $policy)) {
                $ignored[] = $k;
            }
        }
        $bufferMs = null;
        if (isset($measured['player_runtime']['buffer_ms']) && is_int($measured['player_runtime']['buffer_ms'])) {
            $bufferMs = $measured['player_runtime']['buffer_ms'];
        }
        $bhp = $measured['player']['buffer_health_pct'] ?? ($measured['player_runtime']['buffer_health_pct'] ?? null);
        if ($bhp !== null) {
            $ignored[] = 'buffer_health_pct';
            $warnings[] = 'buffer_health_pct_ignored';
        }

        $denied = [];
        $policySoc = $this->resolveSoc($policy['device']['soc'] ?? null);
        if ($soc['canonical'] === null) {
            $denied[] = ['code' => self::E_SOC_UNMAPPED, 'detail' => $soc['raw']];
        }
        if ($soc['canonical'] !== null && $policySoc['canonical'] !== null && $policySoc['canonical'] !== $soc['canonical']) {
            $denied[] = ['code' => self::E_SOC_MISMATCH, 'detail' => $policySoc['canonical'] . '!=' . $soc['canonical']];
        }

        $display = is_array($policy['display'] ?? null) ? $policy['display'] : [];
        if (($display['wire_resolution'] ?? null) === '7680x4320') {
            $denied[] = ['code' => self::E_WIRE_8K, 'detail' => 'wire_resolution'];
        }
        if (($display['eight_k'] ?? null) === 'native') {
            $denied[] = ['code' => self::E_WIRE_8K, 'detail' => 'eight_k_native'];
        }
        if ($soc['canonical'] !== null && ($display['never_downscale'] ?? null) !== true) {
            $denied[] = ['code' => self::E_NEVER_DOWNSCALE_REQUIRED, 'detail' => 'never_downscale!=true'];
        }

        $leversIn = is_array($policy['device']['levers'] ?? null) ? $policy['device']['levers'] : [];
        ksort($leversIn);
        $accepted = [];
        foreach ($leversIn as $key => $v) {
            $key = (string)$key;
            if (!isset($this->meta[$key])) {
                $errors[] = ['code' => self::E_KEY_NOT_ALLOWED, 'detail' => $key];
                continue;
            }
            if ($this->meta[$key]['forbidden']) {
                $errors[] = ['code' => self::E_KEY_FORBIDDEN, 'detail' => $key];
                continue;
            }
            if (!isset($this->levers[$key])) {
                $errors[] = ['code' => self::E_LEVER_NOT_IN_ALLOWLIST, 'detail' => $key];
                continue;
            }
            if (!is_int($v)) {
                $skipped[] = ['key' => $key, 'code' => 'value_out_of_domain'];
                continue;
            }
            $accepted[$key] = $v;
        }

        $hardFail = count($errors) > 0 || count($denied) > 0;
        $allowed = !$hardFail && (($policy['device']['allowed'] ?? null) === true);

        $tierReq = in_array($policy['processing']['tier'] ?? null, self::TIERS, true)
            ? (string)$policy['processing']['tier'] : 'max_image';
        $limitsIn = $policy['thermal']['limits'] ?? null;
        $thermalLimits = $this->validThermalLimits($limitsIn);
        if ($limitsIn !== null && $thermalLimits === null) {
            $warnings[] = 'thermal_limits_invalid';
        }
        $th = $this->thermalSteps($measured['thermal'] ?? null, $thermalLimits);
        if ($th['prov'] !== 'measured') {
            $warnings[] = 'thermal_unavailable';
        }
        $tierEff = $this->lowerTier($tierReq, (int)$th['steps']);

        $target = [];
        if ($soc['canonical'] !== null && !$hardFail) {
            $target = ['hdr_conversion_mode' => 1, 'match_content_frame_rate' => 1, 'minimal_post_processing_allowed' => 0];
        }
        if ($allowed) {
            foreach ($accepted as $k => $v) {
                $target[$k] = $v;
            }
        }
        foreach ($this->meta as $key => $meta) {
            if (!array_key_exists($key, $target) || $meta['ceiling'] === null) {
                continue;
            }
            $ceil = $meta['ceiling'][$tierEff] ?? null;
            if ($ceil === null) {
                continue;
            }
            $v = (int)$target[$key];
            $next = in_array($key, self::INVERT_CLAMP, true) ? max($v, (int)$ceil) : min($v, (int)$ceil);
            if ($next !== $v) {
                $clamped[] = ['key' => $key, 'from' => $v, 'to' => $next];
                $target[$key] = $next;
            }
        }
        if (!$allowed && !$hardFail) {
            foreach (array_keys($accepted) as $k) {
                $skipped[] = ['key' => $k, 'code' => 'device_not_allowed'];
            }
        }

        $tierIdx = ['T0' => 0, 'T1' => 1, 'T2' => 2, 'T3' => 3, 'T4' => 4];
        $rows = [];
        $seen = [];
        $ordered = [];
        foreach ($target as $k => $v) {
            $ordered[] = ['key' => (string)$k, 'value' => (int)$v, 'tier' => $tierIdx[$this->meta[$k]['tier']] ?? 9];
        }
        usort($ordered, static function (array $a, array $b): int {
            if ($a['tier'] !== $b['tier']) {
                return $a['tier'] <=> $b['tier'];
            }
            return strcmp($a['key'], $b['key']);
        });
        foreach ($ordered as $row) {
            $key = $row['key'];
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            if (count($rows) >= self::MAX_ROWS) {
                $warnings[] = 'rows_truncated';
                break;
            }
            $rows[] = $this->meta[$key]['ns'] . ' ' . $key . ' ' . $row['value'];
        }

        $cfg = null;
        if (isset($input['cfg']) && is_array($input['cfg'])) {
            $cfg = $this->composeCfg($input['cfg']);
            if (!$cfg['ok']) {
                $errors[] = ['code' => $cfg['errors'][0]['code'], 'detail' => 'cfg'];
            }
        }

        $fpsTarget = in_array($policy['fps']['target'] ?? null, self::FPS_TARGETS, true) ? (int)$policy['fps']['target'] : null;
        if ($fpsTarget === null) {
            $warnings[] = 'cadence_unknown';
        }

        $state = ($hardFail || !$allowed) ? 'denied' : (count($skipped) || count($clamped) ? 'partial' : (count($rows) ? 'applied' : 'noop'));
        $reason = $hardFail ? ($denied[0]['code'] ?? $errors[0]['code']) : ($allowed ? null : self::E_DEVICE_NOT_ALLOWED);

        return [
            'ok' => count($errors) === 0 && count($denied) === 0,
            'allowed' => $allowed,
            'state' => $state,
            'reason' => $reason,
            'denials' => $denied,
            'soc' => ['raw' => $soc['raw'], 'canonical' => $soc['canonical'], 'gate' => $soc['canonical'] !== null ? 'allowlisted' : 'not_allowlisted', 'alias_used' => $soc['alias_used']],
            'rows' => $rows,
            'cfg' => $cfg,
            'intents' => [
                'fps_target' => $fpsTarget,
                'processing_tier' => $tierReq,
                'effective_tier' => $tierEff,
                'thermal_steps' => (int)$th['steps'],
                'thermal_source' => $th['source'],
                'thermal_prov' => $th['prov'],
                'thermal_limits' => $thermalLimits,
                'never_downscale' => ($display['never_downscale'] ?? null) === true,
                'buffer_ms' => $bufferMs,
            ],
            'skipped' => $skipped,
            'clamped' => $clamped,
            'warnings' => array_values(array_unique($warnings)),
            'ignored_inputs' => array_values(array_unique($ignored)),
            'errors' => $errors,
            'limits' => ['max_cfg_bytes' => self::MAX_CFG_BYTES, 'max_rows' => self::MAX_ROWS, 'ttl_min_s' => self::TTL_MIN, 'ttl_max_s' => self::TTL_MAX],
        ];
    }
}
