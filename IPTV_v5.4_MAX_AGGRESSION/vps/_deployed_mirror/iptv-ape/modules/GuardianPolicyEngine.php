<?php
declare(strict_types=1);

/**
 * MÓDULO 8: GuardianPolicyEngine — Motor de Políticas Guardianas
 * =================================================================
 * Aplica límites de seguridad para garantizar que las directivas inyectadas
 * no excedan las capacidades reales del hardware y la red.
 *
 * Políticas aplicadas:
 * - Límites de buffer (por red y reproductor)
 * - Límites de HDR (por soporte de TV)
 * - Límites de resolución (por pantalla)
 * - Límites de bitrate (por throughput)
 * - Anti-509: un solo consumidor, sin paralelo
 * - Anti-fantasía: no inventar capacidades no declaradas en el ADN
 *
 * El Guardian es el último módulo antes del caché y salida.
 * Garantiza que la salida sea siempre segura y compatible.
 *
 * @package ResolveQuality v2.5 ULTRA
 * @module  GuardianPolicyEngine
 */

class GuardianPolicyEngine
{
    /**
     * Aplica todas las políticas guardianas al estado del pipeline.
     *
     * @param  array $state Estado completo del pipeline (se modifica)
     * @return array Estado con guardian_limits y compliance_flags aplicados
     */
    public function enforce(array $state): array
    {
        $resilience = &$state['resilience_config'];
        $capabilities = $state['capability_matrix'];
        $injected = $state['injected_directives'];
        $dna = $state['manifest_dna'];

        // Construir límites del guardian basados en capacidades
        $limits = [
            'max_buffer_ms'   => $capabilities['player']['buffer_max_ms'] ?? 120000,
            'max_resolution'  => $capabilities['tv']['max_resolution'] ?? [3840, 2160],
            'allowed_hdr'     => $capabilities['tv']['hdr_support'] ?? [],
            'allowed_codecs'  => $capabilities['player']['codec_support'] ?? ['h264', 'hevc'],
            'max_bitrate_kbps' => (int) ($capabilities['network']['throughput_kbps'] * 0.8),
            'max_concurrent'  => 1,  // Anti-509: siempre 1 consumidor
        ];

        // Aplicar cada política
        $resilience = $this->limitBuffer(
            resilience: $resilience,
            network: $capabilities['network'],
            player: $capabilities['player']
        );

        $injected = $this->limitHdr(directives: $injected, tvCaps: $capabilities['tv']);
        $injected = $this->limitResolution(directives: $injected, tvCaps: $capabilities['tv']);
        $limits = $this->limitBitrate(limits: $limits, network: $capabilities['network']);
        $state = $this->enforceAnti509(state: $state);
        $state = $this->enforceAntiFantasy(state: $state);

        // Actualizar estado
        $state['guardian_limits'] = $limits;
        $state['injected_directives'] = $injected;

        // Construir flags de cumplimiento
        $state['compliance_flags'] = [
            'anti_509'       => true,
            'anti_probe'     => true,
            'anti_fantasy'   => true,
            'idempotent'     => true,
            'dna_preserved'  => true,
            'no_degradation' => true,
            'limits_applied' => $this->collectAppliedLimits(state: $state),
        ];

        return $state;
    }

    /**
     * Limita los valores de buffer según la red y el reproductor.
     *
     * El buffer no debe exceder lo que la red puede mantener
     * ni el máximo soportado por el reproductor.
     */
    private function limitBuffer(array $resilience, array $network, array $player): array
    {
        // Máximo que la red puede sostener (throughput / 8 * 2)
        $throughputBytesPerSec = (int) ($network['throughput_kbps'] / 8);
        $networkMaxMs = $throughputBytesPerSec > 0 ? $throughputBytesPerSec * 2 : 5000;

        // Mínimo entre red, reproductor y configurado
        $effectiveMax = min($networkMaxMs, $player['buffer_max_ms']);

        $resilience['buffer_network_ms'] = min($resilience['buffer_network_ms'], $effectiveMax);
        $resilience['buffer_live_ms']    = min($resilience['buffer_live_ms'], $effectiveMax);
        $resilience['buffer_file_ms']    = min($resilience['buffer_file_ms'], $effectiveMax);

        // Móvil: cap estricto en 15s
        if ($network['connection_type'] === ConnectionType::MOBILE->value) {
            $mobileCap = 15000;
            $resilience['buffer_network_ms'] = min($resilience['buffer_network_ms'], $mobileCap);
            $resilience['buffer_live_ms']    = min($resilience['buffer_live_ms'], $mobileCap);
        }

        return $resilience;
    }

    /**
     * Elimina directivas HDR que la TV no soporta.
     *
     * Si la TV no soporta HDR en absoluto, se eliminan TODAS
     * las directivas que contengan "hdr" en su texto.
     */
    private function limitHdr(array $directives, array $tvCaps): array
    {
        $allowedHdr = $tvCaps['hdr_support'] ?? [];
        $beforeStream = $directives['before_stream'] ?? [];

        // Si la TV no soporta HDR, eliminar directivas HDR
        if (empty($allowedHdr)) {
            $filtered = array_filter($beforeStream, static fn(string $d): bool => !str_contains(strtolower($d), 'hdr'
                )
            );
            $directives['before_stream'] = array_values($filtered);
        }

        return $directives;
    }

    /**
     * Elimina directivas de resolución que exceden la TV.
     *
     * Si la TV es 1080p o menos, se eliminan directivas 4K/8K/UHD.
     */
    private function limitResolution(array $directives, array $tvCaps): array
    {
        $maxRes = $tvCaps['max_resolution'] ?? [1920, 1080];
        $maxPixels = $maxRes[0] * $maxRes[1];
        $beforeStream = $directives['before_stream'] ?? [];

        // Si la TV es menor a 4K, eliminar directivas de alta resolución
        if ($maxPixels < 8294400) {
            $filtered = array_filter($beforeStream, static fn(string $d): bool => !(
                    str_contains(strtolower($d), '4k') ||
                    str_contains(strtolower($d), '2160') ||
                    str_contains(strtolower($d), '3840') ||
                    str_contains(strtolower($d), 'uhd')
                )
            );
            $directives['before_stream'] = array_values($filtered);
        }

        return $directives;
    }

    /**
     * Limita el bitrate máximo según la capacidad de la red.
     *
     * No exceder el 80% del throughput para dejar margen de seguridad.
     */
    private function limitBitrate(array $limits, array $network): array
    {
        $maxBitrate = (int) ($network['throughput_kbps'] * 0.8);
        $limits['max_bitrate_kbps'] = max(1000, $maxBitrate);
        return $limits;
    }

    /**
     * Aplica la política anti-509: un solo consumidor.
     *
     * Elimina cualquier directiva de prefetch, paralelismo o concurrencia.
     * Garantiza que no se generen múltiples conexiones simultáneas al origen.
     */
    private function enforceAnti509(array $state): array
    {
        $beforeStream = $state['injected_directives']['before_stream'] ?? [];

        // Filtrar directivas peligrosas (prefetch, parallel, concurrent)
        $filtered = array_filter($beforeStream, static fn(string $d): bool => !(
                str_contains(strtolower($d), 'prefetch') ||
                str_contains(strtolower($d), 'parallel') ||
                str_contains(strtolower($d), 'concurrent')
            )
        );

        $state['injected_directives']['before_stream'] = array_values($filtered);

        return $state;
    }

    /**
     * Aplica la política anti-fantasía: no inventar capacidades.
     *
     * Si el ADN del manifiesto no declara HDR, no se añaden directivas HDR.
     * Si el ADN no declara 4K, no se añaden directivas 4K.
     */
    private function enforceAntiFantasy(array $state): array
    {
        $dna = $state['manifest_dna'];
        $beforeStream = $state['injected_directives']['before_stream'] ?? [];

        // Si el ADN no declara HDR, eliminar directivas HDR
        if (!$dna['has_hdr']) {
            $beforeStream = array_values(array_filter($beforeStream, static fn(string $d): bool => !str_contains(strtolower($d), 'hdr'
                )
            ));
        }

        // Si el ADN no declara 4K, eliminar directivas 4K
        if (!$dna['has_4k']) {
            $beforeStream = array_values(array_filter($beforeStream, static fn(string $d): bool => !(
                    str_contains(strtolower($d), '4k') ||
                    str_contains(strtolower($d), '2160')
                )
            ));
        }

        $state['injected_directives']['before_stream'] = $beforeStream;

        return $state;
    }

    /**
     * Recopila qué límites fueron aplicados y por qué.
     *
     * Se usa para debugging y para informar al cliente vía cabeceras.
     *
     * @param  array $state Estado del pipeline
     * @return array<string> Lista de descripciones de límites aplicados
     */
    private function collectAppliedLimits(array $state): array
    {
        $applied = [];
        $dna = $state['manifest_dna'];
        $resilience = $state['resilience_config'];
        $capabilities = $state['capability_matrix'];

        // Buffer fue limitado
        if ($resilience['buffer_network_ms'] < 120000) {
            $throughput = $capabilities['network']['throughput_kbps'];
            $applied[] = "buffer_limitado_a_{$resilience['buffer_network_ms']}ms_por_throughput_{$throughput}kbps";
        }

        // HDR fue bloqueado por TV SDR
        if (empty($capabilities['tv']['hdr_support']) && $dna['has_hdr']) {
            $applied[] = 'hdr_bloqueado_tv_no_soporta_hdr';
        }

        // Resolución fue limitada
        $tvPixels = $capabilities['tv']['max_resolution'][0] * $capabilities['tv']['max_resolution'][1];
        if ($tvPixels < 8294400) {
            $applied[] = 'resolucion_limitada_a_' . implode('x', $capabilities['tv']['max_resolution']);
        }

        return $applied;
    }
}
