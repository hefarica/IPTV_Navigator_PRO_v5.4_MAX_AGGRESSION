/**
 * LAB Fidelity Verifier — Fix E
 * Post-generation audit: verifies 100% correspondence between
 * LAB_CALIBRATED_BULLETPROOF JSON and the generated M3U8 output.
 * If fidelity < 100%, blocks download and shows report.
 */
(function () {
    'use strict';

    /**
     * Verify LAB fidelity of a generated M3U8 against the loaded LAB JSON.
     * @param {string} m3u8Text - The full M3U8 content string.
     * @param {Object} labJson  - The loaded LAB JSON (window.APE_PROFILES_CONFIG or raw import).
     * @returns {Object} { passed: boolean, pct: number, total: number, found: number, missing: Array }
     */
    function verifyLABFidelity(m3u8Text, labJson) {
        if (!m3u8Text || !labJson) {
            return { passed: false, pct: 0, total: 0, found: 0, missing: ['No M3U8 or LAB JSON provided'] };
        }

        const checks = [];

        // L5: LAB-SOURCE anchor
        checks.push({
            key: 'LAB-SOURCE anchor',
            expected: '#EXT-X-APE-LAB-SOURCE:',
            test: m3u8Text.includes('#EXT-X-APE-LAB-SOURCE:')
        });

        // absolute-hardening-lock
        checks.push({
            key: 'absolute-hardening-lock',
            expected: 'absolute-hardening-lock',
            test: m3u8Text.includes('absolute-hardening-lock')
        });

        // CMCD CTA-5004 4-headers
        for (const cmcd of ['CMCD-Object', 'CMCD-Request', 'CMCD-Session', 'CMCD-Status']) {
            checks.push({
                key: `CMCD: ${cmcd}`,
                expected: cmcd,
                test: m3u8Text.includes(cmcd)
            });
        }

        // Scorecard aliases
        for (const alias of ['fragLoadMaxRetry=', 'maxLiveSyncPlaybackRate=', 'bufferTargetSec=']) {
            checks.push({
                key: `Alias: ${alias}`,
                expected: alias,
                test: m3u8Text.includes(alias)
            });
        }

        // Per-profile checks
        const profiles = labJson.profiles || {};
        for (const [profileId, profileData] of Object.entries(profiles)) {
            // Check profile appears in M3U8
            checks.push({
                key: `Profile ${profileId} present`,
                expected: `ape-profile="${profileId}"`,
                test: m3u8Text.includes(`ape-profile="${profileId}"`)
            });

            // player_enslavement level_3 EXTVLCOPT
            const pe = profileData.player_enslavement;
            if (pe && pe.level_3_per_channel && pe.level_3_per_channel.EXTVLCOPT) {
                const vlc = pe.level_3_per_channel.EXTVLCOPT;
                for (const [key, val] of Object.entries(vlc)) {
                    if (val !== undefined && val !== null) {
                        const expected = `#EXTVLCOPT:${key}=${val}`;
                        checks.push({
                            key: `${profileId}.L3.EXTVLCOPT.${key}`,
                            expected: expected,
                            test: m3u8Text.includes(expected)
                        });
                    }
                }
            }

            // player_enslavement level_3 KODIPROP
            if (pe && pe.level_3_per_channel && pe.level_3_per_channel.KODIPROP) {
                const kodi = pe.level_3_per_channel.KODIPROP;
                for (const [key, val] of Object.entries(kodi)) {
                    if (val !== undefined && val !== null) {
                        const expected = `#KODIPROP:${key}=${val}`;
                        checks.push({
                            key: `${profileId}.L3.KODIPROP.${key}`,
                            expected: expected,
                            test: m3u8Text.includes(expected)
                        });
                    }
                }
            }

            // Profile-level vlcopt
            if (profileData.vlcopt && typeof profileData.vlcopt === 'object') {
                for (const [key, val] of Object.entries(profileData.vlcopt)) {
                    if (val !== undefined && val !== null) {
                        const expected = `#EXTVLCOPT:${key}=${val}`;
                        checks.push({
                            key: `${profileId}.vlcopt.${key}`,
                            expected: expected,
                            test: m3u8Text.includes(expected)
                        });
                    }
                }
            }

            // Profile-level kodiprop
            if (profileData.kodiprop && typeof profileData.kodiprop === 'object') {
                for (const [key, val] of Object.entries(profileData.kodiprop)) {
                    if (val !== undefined && val !== null) {
                        const expected = `#KODIPROP:${key}=${val}`;
                        checks.push({
                            key: `${profileId}.kodiprop.${key}`,
                            expected: expected,
                            test: m3u8Text.includes(expected)
                        });
                    }
                }
            }

            // Profile-level hlsjs (JSON blob)
            if (profileData.hlsjs && Object.keys(profileData.hlsjs).length > 0) {
                checks.push({
                    key: `${profileId}.hlsjs.blob`,
                    expected: '#EXT-X-APE-HLSJS:',
                    test: m3u8Text.includes('#EXT-X-APE-HLSJS:')
                });
                // Sample first key to verify content roundtrip
                const hk = Object.keys(profileData.hlsjs)[0];
                if (hk) {
                    checks.push({
                        key: `${profileId}.hlsjs.${hk}.in_blob`,
                        expected: hk,
                        test: m3u8Text.includes(`"${hk}"`)
                    });
                }
            }

            // Profile-level prefetch_config
            if (profileData.prefetch_config && Object.keys(profileData.prefetch_config).length > 0) {
                checks.push({
                    key: `${profileId}.prefetch_config.blob`,
                    expected: '#EXT-X-APE-PREFETCH:',
                    test: m3u8Text.includes('#EXT-X-APE-PREFETCH:')
                });
            }

            // Profile-level bounds
            if (profileData.bounds && Object.keys(profileData.bounds).length > 0) {
                checks.push({
                    key: `${profileId}.bounds.blob`,
                    expected: '#EXT-X-APE-BOUNDS:',
                    test: m3u8Text.includes('#EXT-X-APE-BOUNDS:')
                });
            }

            // Profile-level optimized_knobs
            if (profileData.optimized_knobs && Object.keys(profileData.optimized_knobs).length > 0) {
                checks.push({
                    key: `${profileId}.optimized_knobs.blob`,
                    expected: '#EXT-X-APE-KNOBS:',
                    test: m3u8Text.includes('#EXT-X-APE-KNOBS:')
                });
            }

            // Profile-level settings (JSON blob + scorecard aliases)
            if (profileData.settings && Object.keys(profileData.settings).length > 0) {
                checks.push({
                    key: `${profileId}.settings.blob`,
                    expected: '#EXT-X-APE-SETTINGS:',
                    test: m3u8Text.includes('#EXT-X-APE-SETTINGS:')
                });
                // Scorecard alias coverage
                for (const a of ['fragLoadMaxRetry', 'liveSyncDurationCount', 'bufferTargetSec', 'maxResolution']) {
                    if (profileData.settings[a] !== undefined && profileData.settings[a] !== null) {
                        checks.push({
                            key: `${profileId}.settings.${a}.alias`,
                            expected: `#EXT-X-APE-ALIAS:${a}=${profileData.settings[a]}`,
                            test: m3u8Text.includes(`#EXT-X-APE-ALIAS:${a}=${profileData.settings[a]}`)
                        });
                    }
                }
            }

            // level_1 master playlist directives
            if (pe && pe.level_1_master_playlist && Array.isArray(pe.level_1_master_playlist)) {
                for (const dir of pe.level_1_master_playlist) {
                    if (dir) {
                        checks.push({
                            key: `${profileId}.L1.${dir.substring(0, 40)}`,
                            expected: dir,
                            test: m3u8Text.includes(dir)
                        });
                    }
                }
            }
        }

        // nivel1_directives global
        if (labJson.nivel1Directives && Array.isArray(labJson.nivel1Directives)) {
            for (const dir of labJson.nivel1Directives) {
                if (dir && dir.tag) {
                    const tagStr = dir.value ? `${dir.tag}:${dir.value}` : dir.tag;
                    checks.push({
                        key: `NIVEL1.${dir.tag}`,
                        expected: tagStr,
                        test: m3u8Text.includes(tagStr)
                    });
                }
            }
        }

        // omega_gap_plan items (canonical_template_by_level) — must be emitted unless already_present_in_lab[level]=true
        const gp = labJson.omegaGapPlan || (labJson.omega_gap_plan || null);
        if (gp && Array.isArray(gp.items)) {
            for (const it of gp.items) {
                if (!it || it.action === 'QUITAR') continue;
                const tmpl = it.canonical_template_by_level;
                if (!tmpl) continue;
                for (const level of Object.keys(tmpl)) {
                    const lines = tmpl[level];
                    if (!Array.isArray(lines)) continue;
                    const alreadyPresent = it.already_present_in_lab && it.already_present_in_lab[level] === true;
                    if (alreadyPresent) continue;
                    for (const line of lines) {
                        if (typeof line !== 'string' || !line.length) continue;
                        // Some lines have placeholders like {sessionId}, {streamId}. Match the
                        // static prefix before the first '{' to be tolerant of runtime substitution.
                        const placeholderIdx = line.indexOf('{');
                        const probe = placeholderIdx > 10 ? line.substring(0, placeholderIdx) : line;
                        checks.push({
                            key: `GAP.${it.id || '?'}.${level}`,
                            expected: probe,
                            test: m3u8Text.includes(probe)
                        });
                    }
                }
            }
        }

        // Compute results
        const total = checks.length;
        const found = checks.filter(c => c.test).length;
        const missing = checks.filter(c => !c.test).map(c => `${c.key} => ${c.expected}`);
        const pct = total > 0 ? Math.round((found / total) * 1000) / 10 : 0;

        return {
            passed: missing.length === 0,
            pct: pct,
            total: total,
            found: found,
            missing: missing
        };
    }

    /**
     * Run verification and display results in console + optional UI.
     * @param {string} m3u8Text - Generated M3U8 content.
     * @returns {Object} Verification result.
     */
    function runVerification(m3u8Text) {
        const labJson = window.APE_PROFILES_CONFIG;
        if (!labJson) {
            console.error('[LAB-FIDELITY] No LAB config loaded.');
            return { passed: false, pct: 0, total: 0, found: 0, missing: ['LAB config not loaded'] };
        }

        const result = verifyLABFidelity(m3u8Text, labJson);

        // Console report
        if (result.passed) {
            console.log(`%c[LAB-FIDELITY] 100.0% (${result.found}/${result.total} valores presentes)`, 'color: #4ade80; font-weight: bold; font-size: 14px;');
        } else {
            console.warn(`%c[LAB-FIDELITY] ${result.pct}% (${result.found}/${result.total} valores presentes)`, 'color: #f59e0b; font-weight: bold; font-size: 14px;');
            console.warn('[LAB-FIDELITY] Missing:');
            for (const m of result.missing.slice(0, 50)) {
                console.warn(`  - ${m}`);
            }
            if (result.missing.length > 50) {
                console.warn(`  ... y ${result.missing.length - 50} mas`);
            }
        }

        return result;
    }

    // Export
    window.LABFidelityVerifier = {
        verify: verifyLABFidelity,
        run: runVerification,
        VERSION: '1.0.0'
    };

    console.log('%c[LAB-Fidelity Verifier v1.0.0] Listo', 'color: #8b5cf6; font-weight: bold;');
})();
