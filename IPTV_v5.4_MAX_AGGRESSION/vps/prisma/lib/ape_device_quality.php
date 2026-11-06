<?php
/**
 * ape_device_quality.php — las 3 directivas de imagen, homologadas por SoC.
 *
 * PROBLEMA QUE RESUELVE
 *   push_pq_profile.php aplicaba SIEMPRE los levers MediaTek (pq_*, ai_*) a cualquier device.
 *   En un ONN 4K (Amlogic S905X4) esos settings no existen: se escribian y el chip los ignora.
 *   En un Fire TV (MT8696) faltaban los com.amazon.tv.*, que son SU lever real de imagen.
 *   Resultado: ninguno de los dos recibia la calidad que su hardware puede dar.
 *
 * LAS 3 DIRECTIVAS
 *   AISR  — AI Super Resolution (upscale por hardware)
 *   AIPQ  — AI Picture Quality   (ajuste por escena)
 *   MEMC  — Motion Estimation / Motion Compensation (interpolacion de movimiento)
 *
 * HOMOLOGACION — el principio
 *   Cada capacidad se pide por su NOMBRE. Si el SoC la tiene, se usan sus claves nativas.
 *   Si no la tiene, se aplica el mejor sustituto que SI existe en ese SoC, y se declara cual.
 *   Nunca se escribe una clave que el chip no conoce para "parecer" que se aplico.
 *
 *   CAPACIDAD   Amlogic S905X4 (ONN 4K)          MediaTek MT8696 (Fire TV 4K Max)
 *   AISR        aisr_enable + ai_sr_mode/level     NO TIENE -> sharpen + dynamic_contrast
 *   AIPQ        aipq_enable + ai_pq_mode/pic_mode  PARCIAL  -> dynamic_contrast + picture_mode + NR
 *   MEMC        NO TIENE -> match_content_frame_rate  motion_smoothness (MEMC real por HW)
 *
 * VERIFICADO EN LOS DOS DEVICES
 *   Fire TV AFTKRT / mt8696 : no existe libpqcontrol.so (se comprobo: NO_EXISTE).
 *                             Tiene los com.amazon.tv.* en namespace `system`.
 *   ONN 4K S905X4           : libpqcontrol.so con SetAiSrEnable / SetAipqEnable.
 *                             No tiene los com.amazon.tv.*.
 *
 * Gate: ningun SoC fuera de la allowlist recibe nada (fail-closed, igual que antes).
 */

declare(strict_types=1);

if (!function_exists('ape_quality_soc_family')) {
    /**
     * Familia del SoC a partir de lo que reporta el device.
     * Acepta el nombre del chip, el device_id o el modelo. Devuelve 'amlogic' | 'mtk' | null.
     */
    function ape_quality_soc_family(?string $socOrDevice): ?string
    {
        $s = strtolower(trim((string)$socOrDevice));
        if ($s === '') { return null; }
        // Amlogic: S905X2/X3/X4, S922, g12a/b, aml, droidlogic
        if (preg_match('/amlogic|s905|s922|g12[ab]|aml|droidlogic/', $s) === 1) { return 'amlogic'; }
        // MediaTek: MT8696, MT8695, mt8, fire tv (AFTKA/AFTKRT)
        if (preg_match('/mt86|mediatek|mtk|aftk/', $s) === 1) { return 'mtk'; }
        return null;
    }
}

if (!function_exists('ape_quality_levers')) {
    /**
     * Las claves exactas que ese SoC entiende, con su namespace.
     *
     * Devuelve  [ 'global' => [...], 'system' => [...], 'secure' => [...], 'prop' => [...] ]
     *   global/system/secure -> `settings put <ns> <k> <v>`
     *   prop                 -> `setprop <k> <v>`  (no persiste en reboot)
     */
    function ape_quality_levers(string $family, string $profile = 'max_image'): array
    {
        // ── base comun: lo que AMBOS chips entienden, cada uno con su valor ──
        $base = array(
            'global' => array(
                'always_hdr'                 => 1,
                'hdr_force_conversion_type'  => 4,   // HDR10+ tier
                'hdr_output_type'            => 4,
                'match_content_frame_rate'   => 1,   // 24p/30p/60p auto — tambien sirve como MEMC de entrada
                'user_preferred_resolution_height' => 2160,
                'user_preferred_refresh_rate'      => '60.0',
                'window_animation_scale'     => '0.0',
                'transition_animation_scale' => '0.0',
                'animator_duration_scale'    => '0.0',
                'stay_on_while_plugged_in'   => 3,
                'low_power'                  => 0,
            ),
            'system' => array(
                'screen_off_timeout'         => 2147483647,
            ),
            'secure' => array(
                'display_color_mode'         => 3,
                'screensaver_enabled'        => 0,
            ),
            'prop'   => array(),
        );

        if ($family === 'amlogic') {
            // ── ONN 4K / S905X4: AISR y AIPQ REALES por hardware (libpqcontrol.so) ──
            $base['global'] = array_merge($base['global'], array(
                // AISR — AI Super Resolution
                'aisr_enable'        => 1,
                'ai_sr_level'        => 3,
                'ai_sr_mode'         => 3,
                'ai_pic_mode'        => 3,
                // AIPQ — AI Picture Quality
                'aipq_enable'        => 1,
                'ai_pq_mode'         => 3,
                // HDR: manda negrita (3 = conversion forzada). El S905X4 la soporta.
                'hdr_conversion_mode' => 3,
                // GPU: Mali con Vulkan real
                'force_hw_ui'                       => 1,
                'force_gpu_rendering'               => 1,
                'hardware_accelerated_rendering_enabled' => 1,
            ));
            $base['system'] = array_merge($base['system'], array(
                'aipq_enable' => 1,
                'aisr_enable' => 1,
                'ai_pq_mode'  => 3,
                'ai_sr_mode'  => 3,
            ));
            $base['prop']['debug.hwui.renderer'] = 'skiavk';   // Vulkan: el S905X4 lo tiene completo
            // MEMC: el S905X4 NO tiene interpolacion por HW. NO se inventa: se declara.
            $base['_homologacion'] = array(
                'AISR' => 'nativo',
                'AIPQ' => 'nativo',
                'MEMC' => 'no_disponible_en_soc -- se conserva match_content_frame_rate=1 (respeta el fps de la fuente)',
            );
        } elseif ($family === 'mtk') {
            // ── Fire TV 4K Max / MT8696: sin AISR/AIPQ de Amlogic, CON MEMC real ──
            $base['global'] = array_merge($base['global'], array(
                // HDR: el MT8696 usa negociacion (2), no conversion forzada
                'hdr_conversion_mode' => 2,
                // sharpness / denoise del vendor (namespace global en este Fire OS)
                'pq_sharpness_enable' => 1,
                'pq_dnr_enable'       => 1,
                'pq_hdr_enable'       => 1,
                'pq_hdr_mode'         => 1,
                'pq_ai_fbc_enable'    => 1,   // AI frame/block compensation: SI lo tiene MTK
            ));
            $base['system'] = array_merge($base['system'], array(
                // MEMC real del MT8696 (1=low, 2=med, 3=high)
                'com.amazon.tv.motion_smoothness'      => 2,
                // AIPQ parcial: Amazon expone contraste dinamico por HW
                'com.amazon.tv.dynamic_contrast'       => 'high',
                'com.amazon.tv.picture_mode'           => 'movie',
                'com.amazon.tv.noise_reduction'        => 'auto',
                'com.amazon.tv.color_temperature'      => 'cool',
                // sharpen del panel (el sweet spot medido es 50-70)
                'com.amazon.tv.picture_sharpness'      => 65,
            ));
            $base['prop']['debug.hwui.renderer'] = 'skiagl';   // Vulkan parcial: skiagl, NO skiavk
            $base['prop']['debug.media.video.frc'] = 'true';   // frame rate control para ExoPlayer
            $base['_homologacion'] = array(
                'AISR' => 'no_disponible_en_soc -- homologo: com.amazon.tv.picture_sharpness=65 + dynamic_contrast=high',
                'AIPQ' => 'parcial -- homologo: com.amazon.tv.dynamic_contrast/picture_mode/noise_reduction',
                'MEMC' => 'nativo -- com.amazon.tv.motion_smoothness=2',
            );
        } else {
            // SoC desconocido: solo la base comun, sin inventar claves.
            $base['_homologacion'] = array(
                'AISR' => 'soc_desconocido -- no se aplica',
                'AIPQ' => 'soc_desconocido -- no se aplica',
                'MEMC' => 'soc_desconocido -- no se aplica',
            );
        }

        // ── variantes de perfil ──
        if ($profile === 'off') {
            foreach (array('global', 'system', 'secure') as $ns) {
                foreach ($base[$ns] as $k => $v) {
                    if (is_int($v)) { $base[$ns][$k] = 0; }
                }
            }
            $base['global']['always_hdr'] = 0;
        } elseif ($profile === 'sports') {
            // deporte: preservar textura en movimiento -> apagar denoise, subir MEMC
            if ($family === 'mtk') {
                $base['system']['com.amazon.tv.noise_reduction']   = 'off';
                $base['system']['com.amazon.tv.motion_smoothness'] = 3;
            }
            if ($family === 'amlogic') {
                $base['global']['ai_sr_level'] = 3;      // SR alto ayuda en movimiento
                $base['system']['ai_pq_mode']  = 3;
            }
            unset($base['global']['pq_dnr_enable'], $base['global']['pq_ai_dnr_enable']);
        } elseif ($profile === 'cinema') {
            if ($family === 'mtk') {
                $base['system']['com.amazon.tv.motion_smoothness'] = 1;   // menos SOE en cine
                $base['system']['com.amazon.tv.picture_mode']      = 'movie';
            }
            if ($family === 'amlogic') {
                $base['system']['aipq_enable'] = 1;      // AIPQ full en cine
            }
        }
        // max_image (default): SR + denoise al maximo

        return $base;
    }
}

if (!function_exists('ape_quality_plan')) {
    /**
     * Plan completo para un device: familia detectada, levers a escribir y homologacion declarada.
     * Nunca lanza. SoC desconocido devuelve ok:false con razon.
     */
    function ape_quality_plan(?string $socOrDevice, string $profile = 'max_image'): array
    {
        $family = ape_quality_soc_family($socOrDevice);
        if ($family === null) {
            return array(
                'ok' => false,
                'soc_input' => $socOrDevice,
                'reason' => 'soc_desconocido',
                'levers' => array(),
                'homologacion' => array(),
            );
        }
        $levers = ape_quality_levers($family, $profile);
        $homolog = isset($levers['_homologacion']) ? $levers['_homologacion'] : array();
        unset($levers['_homologacion']);

        $total = 0;
        foreach ($levers as $ns => $kv) { $total += count($kv); }

        return array(
            'ok' => true,
            'soc_input' => $socOrDevice,
            'family' => $family,
            'profile' => $profile,
            'levers' => $levers,
            'levers_total' => $total,
            'homologacion' => $homolog,
        );
    }
}

if (!function_exists('ape_quality_commands')) {
    /**
     * Traduce el plan a comandos shell listos para `adb shell`.
     * Un solo string, separado por `;` — adb lo ejecuta en una sesion.
     */
    function ape_quality_commands(array $plan): string
    {
        if (empty($plan['ok'])) { return ''; }
        $out = array();
        foreach (array('global', 'system', 'secure') as $ns) {
            if (empty($plan['levers'][$ns])) { continue; }
            foreach ($plan['levers'][$ns] as $k => $v) {
                $out[] = 'settings put ' . $ns . ' ' . $k . ' ' . $v;
            }
        }
        if (!empty($plan['levers']['prop'])) {
            foreach ($plan['levers']['prop'] as $k => $v) {
                $out[] = 'setprop ' . $k . ' ' . $v;
            }
        }
        return implode('; ', $out);
    }
}
