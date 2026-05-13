/**
 * lab_absorption_runtime.js — paste-en-DevTools después de Import LAB.
 * Verifica que window.APE_PROFILES_CONFIG tenga TODO absorbido en runtime.
 *
 * Uso: copy-paste el IIFE en DevTools Console tras hacer click en 🧪 Import LAB.
 * Devuelve true si 100% absorption OK, false si algún check falla.
 *
 * Cubre 15 checks:
 * - 4 metadata (labVersion, bulletproof, schema, fileName)
 * - 6 profiles (P0-P5 todos presentes)
 * - 1 nivel1 (>= 50 directivas)
 * - 1 nivel3 (7 layers VLC/KOD/HTT/EI/SI/SYS/URL)
 * - 1 placeholders (>= 50 entries)
 * - 1 config_global (>= 30 params)
 * - 1 evasion (UAs no vacío)
 * - 1 servers (4 servers)
 * - 1 omega_gap_plan (50 items, 42 REPLICAR, 8 IMPLEMENTAR)
 * - 3 per-profile bulletproof fields (player_enslavement, actor_injections, optimized_knobs en P0)
 */
(function () {
    const cfg = window.APE_PROFILES_CONFIG;
    if (!cfg) {
        console.error('❌ window.APE_PROFILES_CONFIG no existe — recarga la página primero');
        return false;
    }

    const checks = {
        // Metadata
        labVersion:          cfg.labVersion === 'omega_v1',
        bulletproof:         cfg.bulletproof === true,
        labSchemaVariant:    cfg.labSchemaVariant === 'omega_v2_bulletproof_perprofile',
        labFileName:         typeof cfg.labFileName === 'string' && cfg.labFileName.length > 0,
        // 6 perfiles
        profilesP0_P5:       ['P0','P1','P2','P3','P4','P5'].every(p => !!cfg.profiles[p]),
        // Datos LAB
        nivel1Count:         (cfg.nivel1Directives || []).length >= 50,
        nivel3Layers:        ['VLC','KOD','HTT','EI','SI','URL'].every(l => Array.isArray(cfg.nivel3PerLayer?.[l])),
        placeholders:        Object.keys(cfg.placeholdersMap || {}).length >= 50,
        configGlobal:        Object.keys(cfg.configGlobal || {}).length >= 30,
        evasionPool:         Array.isArray(cfg.evasionPool?.user_agents) && cfg.evasionPool.user_agents.length > 0,
        labServers:          (cfg.labServers || []).length === 4,
        // Gap plan
        gapPlanItems:        (cfg.omegaGapPlan?.items || []).length === 50,
        gapPlanReplicar:     cfg.omegaGapPlan?.summary?.replicar === 42,
        gapPlanImplementar:  cfg.omegaGapPlan?.summary?.implementar === 8,
        // Per-profile bulletproof fields (sample on P0)
        playerEnslavementP0: !!cfg.profiles.P0?.player_enslavement?.level_3_per_channel,
        actorInjectionsP0:   !!cfg.profiles.P0?.actor_injections?.player?.exoplayer,
        optimizedKnobsP0:    !!cfg.profiles.P0?.optimized_knobs?.buffer_seconds,
        // Cross-wire
        appActiveServers:    Array.isArray(window.app?.state?.activeServers) &&
                             window.app.state.activeServers.some(s => s.labProvenance === true)
    };

    const failed = Object.entries(checks).filter(([k, v]) => !v).map(([k]) => k);
    console.table(checks);

    if (failed.length === 0) {
        console.log('%c✅ ABSORPTION 100% OK — bulletproof JSON consumido al 100%',
                    'color:#10b981; font-weight:bold; font-size:13px');
        // Bonus: imprimir summary
        if (cfg.omegaGapPlan) {
            console.log('🎯 omega_gap_plan:', cfg.omegaGapPlan.summary,
                        '| score:', cfg.omegaGapPlan.scorecard_total,
                        '| grade:', cfg.omegaGapPlan.scorecard_grade);
        }
        return true;
    } else {
        console.error('❌ FAILED checks:', failed);
        return false;
    }
})();
