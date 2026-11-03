<?php
declare(strict_types=1);

/**
 * APE CODEC FALLBACK MATRIX v1.0 (2026-11-01)
 * Same SSOT as frontend ape-hevc-cascade.js and ARA CodecFallbackMatrix.
 *
 * Policy: if a real 4K exists -> 4K@120 -> 4K@60 -> 4K@30.
 * If none of those play -> best NATIVE resolution of the channel.
 * A <4K channel never declares 4K.
 */

function ape_fallback_rows(): array
{
    static $rows = [
        ['id' => '8k120', 'codec' => 'hvc1.2.4.L186.B0', 'hev1' => 'hev1.2.4.L186.B0', 'width' => 8192, 'height' => 4320, 'fps' => 120, 'resolution' => '8192x4320', 'native' => '8K'],
        ['id' => '8k60',  'codec' => 'hvc1.2.4.L183.B0', 'hev1' => 'hev1.2.4.L183.B0', 'width' => 8192, 'height' => 4320, 'fps' => 60,  'resolution' => '8192x4320', 'native' => '8K'],
        ['id' => '8k30',  'codec' => 'hvc1.2.4.L180.B0', 'hev1' => 'hev1.2.4.L180.B0', 'width' => 8192, 'height' => 4320, 'fps' => 30,  'resolution' => '8192x4320', 'native' => '8K'],
        ['id' => '4k120', 'codec' => 'hvc1.2.4.L156.B0', 'hev1' => 'hev1.2.4.L156.B0', 'width' => 4096, 'height' => 2160, 'fps' => 120, 'resolution' => '4096x2160', 'native' => '4K'],
        ['id' => '4k60',  'codec' => 'hvc1.2.4.L153.B0', 'hev1' => 'hev1.2.4.L153.B0', 'width' => 4096, 'height' => 2160, 'fps' => 60,  'resolution' => '4096x2160', 'native' => '4K'],
        ['id' => '4k30',  'codec' => 'hvc1.2.4.L150.B0', 'hev1' => 'hev1.2.4.L150.B0', 'width' => 4096, 'height' => 2160, 'fps' => 30,  'resolution' => '4096x2160', 'native' => '4K'],
        ['id' => 'dci60', 'codec' => 'hvc1.2.4.L123.B0', 'hev1' => 'hev1.2.4.L123.B0', 'width' => 2048, 'height' => 1080, 'fps' => 60,  'resolution' => '2048x1080', 'native' => '2K'],
        ['id' => 'hd50',  'codec' => 'hvc1.2.4.L123.B0', 'hev1' => 'hev1.2.4.L123.B0', 'width' => 1920, 'height' => 1080, 'fps' => 50,  'resolution' => '1920x1080', 'native' => 'FHD'],
        ['id' => '2k30',  'codec' => 'hvc1.2.4.L120.B0', 'hev1' => 'hev1.2.4.L120.B0', 'width' => 2048, 'height' => 1080, 'fps' => 30,  'resolution' => '2048x1080', 'native' => '2K'],
        ['id' => '720p60', 'codec' => 'hvc1.2.4.L93.B0', 'hev1' => 'hev1.2.4.L93.B0', 'width' => 1280, 'height' => 720, 'fps' => 60,   'resolution' => '1280x720', 'native' => 'HD'],
        ['id' => '720p33', 'codec' => 'hvc1.2.4.L93.B0', 'hev1' => 'hev1.2.4.L93.B0', 'width' => 1280, 'height' => 720, 'fps' => 33.7, 'resolution' => '1280x720', 'native' => 'HD'],
        ['id' => '480p16', 'codec' => 'hvc1.2.4.L90.B0', 'hev1' => 'hev1.2.4.L90.B0', 'width' => 854,  'height' => 480, 'fps' => 30,   'resolution' => '854x480',  'native' => 'SD'],
        ['id' => '480p43', 'codec' => 'hvc1.2.4.L90.B0', 'hev1' => 'hev1.2.4.L90.B0', 'width' => 720,  'height' => 480, 'fps' => 30,   'resolution' => '720x480',  'native' => 'SD'],
    ];
    return $rows;
}

function ape_fallback_chains(): array
{
    return [
        '8k120' => ['4k120', '4k60', '4k30', '8k60', '8k30'],
        '8k60' => ['4k120', '4k60', '4k30', '8k30'],
        '8k30' => ['4k120', '4k60', '4k30'],
        '4k120' => ['4k60', '4k30', 'dci60', 'hd50', '2k30', '720p60', '720p33', '480p16', '480p43'],
        '4k60' => ['4k30', 'dci60', 'hd50', '2k30', '720p60', '720p33', '480p16', '480p43'],
        '4k30' => ['dci60', 'hd50', '2k30', '720p60', '720p33', '480p16', '480p43'],
        'dci60' => ['hd50', '2k30', '720p60', '720p33', '480p16', '480p43'],
        'hd50' => ['2k30', '720p60', '720p33', '480p16', '480p43'],
        '2k30' => ['720p60', '720p33', '480p16', '480p43'],
        '720p60' => ['720p33', '480p16', '480p43'],
        '720p33' => ['480p16', '480p43'],
        '480p16' => ['480p43'],
        '480p43' => [],
    ];
}

function ape_fallback_chain(string $codec, string $resolution = '', float $fps = 0.0): array
{
    $rows = ape_fallback_rows();
    $byId = [];
    foreach ($rows as $r) {
        $byId[$r['id']] = $r;
    }
    $wanted = strtolower(trim($codec));
    $res = '';
    if (preg_match('/(\d{3,5})\s*[xX]\s*(\d{3,5})/', $resolution, $m)) {
        $res = ((int) $m[1]) . 'x' . ((int) $m[2]);
    }
    $primary = null;
    if ($wanted !== '') {
        foreach ($rows as $r) {
            if (strtolower($r['codec']) === $wanted && ($res === '' || $r['resolution'] === $res)) {
                $primary = $r;
                break;
            }
        }
        if ($primary === null) {
            foreach ($rows as $r) {
                if (strtolower($r['codec']) === $wanted) {
                    $primary = $r;
                    break;
                }
            }
        }
    }
    if ($primary === null && $res !== '') {
        foreach ($rows as $r) {
            if ($r['resolution'] === $res) {
                $primary = $r;
                break;
            }
        }
    }
    if ($primary === null) {
        return ['policy' => 'BEST_4K_THEN_NATIVE', 'primary' => null, 'chain' => []];
    }
    $chains = ape_fallback_chains();
    $chain = [];
    foreach ($chains[$primary['id']] ?? [] as $id) {
        if (isset($byId[$id])) {
            $chain[] = $byId[$id];
        }
    }
    return ['policy' => 'BEST_4K_THEN_NATIVE', 'primary' => $primary, 'chain' => $chain];
}

function ape_fallback_codecs(string $codec, string $resolution = '', float $fps = 0.0): array
{
    $result = ape_fallback_chain($codec, $resolution, $fps);
    return array_map(static fn(array $r): string => $r['codec'], $result['chain']);
}
