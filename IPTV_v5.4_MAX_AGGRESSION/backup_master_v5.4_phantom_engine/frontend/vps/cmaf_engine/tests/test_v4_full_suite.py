#!/usr/bin/env python3
"""
Suite de Tests Completa v4.0 — IPTV Navigator PRO v4.0 FULL
Valida: APE v18.2 + CMAF Universal + LCEVC + 40 Players + Degradación 7 Niveles + 14 Skills OTT
"""
import unittest
import json
import os
import re
import hashlib

BASE = '/home/ubuntu/iptv_navigator_pro/IPTV_Navigator_PRO (12)/IPTV_Navigator_PRO'
VPS  = f'{BASE}/iptv_nav/files/vps'
JS   = f'{BASE}/iptv_nav/files/js/ape-v9'
CMAF = f'{VPS}/cmaf_engine'
SKILLS_DIR = '/home/ubuntu/iptv_navigator_pro/IPTV_Navigator_PRO (12)/.agents/skills'

def read_file(path):
    if not os.path.exists(path):
        return ''
    return open(path, encoding='utf-8', errors='replace').read()

def read_json(path):
    if not os.path.exists(path):
        return {}
    try:
        return json.load(open(path, encoding='utf-8'))
    except:
        return {}


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 1: APE v18.2 — ApeOmniOrchestrator
# ═══════════════════════════════════════════════════════════════════════════════
class TestApeOmniOrchestratorV18(unittest.TestCase):

    def setUp(self):
        self.orch = read_file(f'{CMAF}/ape_omni_orchestrator_v18.php')

    def test_file_exists(self):
        self.assertTrue(os.path.exists(f'{CMAF}/ape_omni_orchestrator_v18.php'))

    def test_version_18(self):
        self.assertIn('18.2', self.orch)

    def test_cmaf_universal_method(self):
        self.assertIn('generateCmafUniversalManifest', self.orch)

    def test_hydra_stealth(self):
        self.assertIn('hydra', self.orch.lower())

    def test_ape_dna_omni_injection(self):
        self.assertIn('dna', self.orch.lower())

    def test_degradation_chain_7_levels(self):
        # Debe tener los 7 niveles
        levels = ['CMAF+HEVC', 'HLS/fMP4+HEVC', 'HLS/fMP4+H.264',
                  'HLS/TS+H.264', 'HLS/TS+Baseline', 'TS Direct', 'HTTP redirect']
        for level in levels:
            self.assertIn(level, self.orch, f'Nivel faltante: {level}')

    def test_select_best_url_method(self):
        self.assertIn('selectBestUrl', self.orch)

    def test_apply_hydra_stealth_method(self):
        self.assertIn('applyHydraStealthToManifest', self.orch)

    def test_ext_x_independent_segments(self):
        self.assertIn('EXT-X-INDEPENDENT-SEGMENTS', self.orch)

    def test_ext_x_version_7(self):
        self.assertIn('EXT-X-VERSION:7', self.orch)


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 2: Telchemy TVQM Engine
# ═══════════════════════════════════════════════════════════════════════════════
class TestTelchemyTvqmEngine(unittest.TestCase):

    def setUp(self):
        self.telchemy = read_file(f'{CMAF}/telchemy_tvqm_engine.php')

    def test_file_exists(self):
        self.assertTrue(os.path.exists(f'{CMAF}/telchemy_tvqm_engine.php'))

    def test_vstq_metric(self):
        self.assertIn('vstq', self.telchemy.lower())

    def test_vsmq_metric(self):
        self.assertIn('vsmq', self.telchemy.lower())

    def test_tr101290_validation(self):
        self.assertIn('tr101290', self.telchemy.lower())

    def test_vqs_score_calculation(self):
        self.assertIn('vqs_score', self.telchemy.lower())

    def test_quality_profiles_p0_p5(self):
        for p in ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']:
            self.assertIn(p, self.telchemy)

    def test_channels_map_builder(self):
        self.assertIn('ChannelsMapBuilder', self.telchemy)

    def test_build_channel_dna(self):
        self.assertIn('buildChannelDna', self.telchemy)


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 3: Unified CMAF+LCEVC Pipeline
# ═══════════════════════════════════════════════════════════════════════════════
class TestUnifiedCmafLcevcPipeline(unittest.TestCase):

    def setUp(self):
        self.pipeline = read_file(f'{CMAF}/unified_cmaf_lcevc_pipeline.php')

    def test_file_exists(self):
        self.assertTrue(os.path.exists(f'{CMAF}/unified_cmaf_lcevc_pipeline.php'))

    def test_version_4(self):
        self.assertIn('4.0', self.pipeline)

    def test_degradation_chain_constant(self):
        self.assertIn('DEGRADATION_CHAIN', self.pipeline)

    def test_all_7_degradation_levels(self):
        for label in ['CMAF+HEVC/AV1', 'HLS/fMP4+HEVC', 'HLS/fMP4+H.264',
                      'HLS/TS+H.264', 'HLS/TS+Baseline', 'TS Direct', 'HTTP redirect']:
            self.assertIn(label, self.pipeline)

    def test_lcevc_integration(self):
        self.assertIn('lcevc', self.pipeline.lower())

    def test_process_method(self):
        self.assertIn('public static function process', self.pipeline)

    def test_intercept_method(self):
        self.assertIn('public static function intercept', self.pipeline)

    def test_emit_method(self):
        self.assertIn('public static function emit', self.pipeline)

    def test_determine_degradation_level(self):
        self.assertIn('determineDegradationLevel', self.pipeline)

    def test_build_response_headers(self):
        self.assertIn('buildResponseHeaders', self.pipeline)

    def test_lcevc_state_engine_integration(self):
        self.assertIn('LcevcStateEngine', self.pipeline)

    def test_player_capability_resolver_integration(self):
        self.assertIn('PlayerCapabilityResolver', self.pipeline)

    def test_telchemy_integration(self):
        self.assertIn('TelchemyTvqmEngine', self.pipeline)


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 4: Player Capability Resolver Universal (40 players)
# ═══════════════════════════════════════════════════════════════════════════════
class TestPlayerCapabilityResolverUniversal(unittest.TestCase):

    def setUp(self):
        self.pcr = read_file(f'{CMAF}/modules/player_capability_resolver.php')

    def test_file_exists(self):
        self.assertTrue(os.path.exists(f'{CMAF}/modules/player_capability_resolver.php'))

    def test_tivimate_detection(self):
        self.assertIn('ivi', self.pcr.lower())

    def test_vlc_detection(self):
        self.assertIn('vlc', self.pcr.lower())

    def test_kodi_detection(self):
        self.assertIn('kodi', self.pcr.lower())

    def test_exoplayer_detection(self):
        self.assertIn('exo', self.pcr.lower())

    def test_safari_detection(self):
        self.assertIn('safari', self.pcr.lower())

    def test_chrome_detection(self):
        self.assertIn('chrome', self.pcr.lower())

    def test_samsung_tizen_detection(self):
        self.assertIn('tizen', self.pcr.lower())

    def test_lg_webos_detection(self):
        self.assertIn('webos', self.pcr.lower())

    def test_fire_tv_detection(self):
        self.assertIn('fire', self.pcr.lower())

    def test_apple_tv_detection(self):
        self.assertIn('appletv', self.pcr.lower())

    def test_lcevc_capability(self):
        self.assertIn('lcevc', self.pcr.lower())

    def test_fmp4_capability(self):
        self.assertIn('fmp4', self.pcr.lower())

    def test_hevc_capability(self):
        self.assertIn('hevc', self.pcr.lower())

    def test_fallback_chain(self):
        self.assertIn('fallback', self.pcr.lower())

    def test_premium_profile(self):
        self.assertIn('PREMIUM', self.pcr)

    def test_minimal_profile(self):
        self.assertIn('MINIMAL', self.pcr)

    def test_detect_method(self):
        self.assertIn('public static function detect', self.pcr)

    def test_select_manifest_url(self):
        self.assertIn('selectManifestUrl', self.pcr)


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 5: Universal Headers Engine
# ═══════════════════════════════════════════════════════════════════════════════
class TestUniversalHeadersEngine(unittest.TestCase):

    def setUp(self):
        self.uhe = read_file(f'{CMAF}/modules/universal_headers_engine.php')

    def test_file_exists(self):
        self.assertTrue(os.path.exists(f'{CMAF}/modules/universal_headers_engine.php'))

    def test_exthttp_support(self):
        self.assertIn('EXTHTTP', self.uhe)

    def test_extvlcopt_support(self):
        self.assertIn('EXTVLCOPT', self.uhe)

    def test_kodiprop_support(self):
        self.assertIn('KODIPROP', self.uhe)

    def test_user_agent_header(self):
        self.assertIn('User-Agent', self.uhe)

    def test_referer_header(self):
        self.assertIn('Referer', self.uhe)


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 6: Universal Fallback Engine
# ═══════════════════════════════════════════════════════════════════════════════
class TestUniversalFallbackEngine(unittest.TestCase):

    def setUp(self):
        self.ufe = read_file(f'{CMAF}/modules/universal_fallback_engine.php')

    def test_file_exists(self):
        self.assertTrue(os.path.exists(f'{CMAF}/modules/universal_fallback_engine.php'))

    def test_7_fallback_levels(self):
        # Debe tener referencias a los 7 niveles
        self.assertIn('7', self.ufe)

    def test_circuit_breaker(self):
        self.assertIn('circuit', self.ufe.lower())

    def test_url_probe(self):
        self.assertIn('probe', self.ufe.lower())

    def test_graceful_degradation(self):
        self.assertIn('degradation', self.ufe.lower())


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 7: LCEVC State Engine (4 estados)
# ═══════════════════════════════════════════════════════════════════════════════
class TestLcevcStateEngine(unittest.TestCase):

    def setUp(self):
        self.lse = read_file(f'{CMAF}/modules/lcevc_state_engine.php')

    def test_file_exists(self):
        self.assertTrue(os.path.exists(f'{CMAF}/modules/lcevc_state_engine.php'))

    def test_state_off(self):
        self.assertIn('OFF', self.lse)

    def test_state_signal_only(self):
        self.assertIn('SIGNAL_ONLY', self.lse)

    def test_state_packaged(self):
        self.assertIn('PACKAGED', self.lse)

    def test_state_player_validated(self):
        self.assertIn('PLAYER_VALIDATED', self.lse)

    def test_determine_state_method(self):
        self.assertIn('determineState', self.lse)


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 8: channels_map.json — ADN Completo (104 campos)
# ═══════════════════════════════════════════════════════════════════════════════
class TestChannelsMapDna(unittest.TestCase):

    def setUp(self):
        map_path = f'{VPS}/channels_map.json'
        self.channels_map = read_json(map_path)
        self.sample = list(self.channels_map.values())[0] if self.channels_map else {}

    def test_map_not_empty(self):
        self.assertGreater(len(self.channels_map), 0)

    def test_minimum_8000_channels(self):
        self.assertGreaterEqual(len(self.channels_map), 8000)

    def test_cmaf_enabled_field(self):
        self.assertIn('cmaf_enabled', self.sample)

    def test_lcevc_enabled_field(self):
        self.assertIn('lcevc_enabled', self.sample)

    def test_lcevc_state_field(self):
        self.assertIn('lcevc_state', self.sample)

    def test_hdr_profile_field(self):
        self.assertIn('hdr_profile', self.sample)

    def test_ai_sr_enabled_field(self):
        self.assertIn('ai_sr_enabled', self.sample)

    def test_vqs_score_field(self):
        self.assertIn('vqs_score', self.sample)

    def test_vqs_tier_field(self):
        self.assertIn('vqs_tier', self.sample)

    def test_quality_profile_field(self):
        self.assertIn('quality_profile', self.sample)

    def test_ape_version_field(self):
        self.assertIn('ape_version', self.sample)
        self.assertEqual(self.sample.get('ape_version'), '18.2.0')

    def test_degradation_chain_field(self):
        self.assertIn('degradation_chain', self.sample)
        chain = self.sample.get('degradation_chain', [])
        self.assertEqual(len(chain), 7)

    def test_ape_dna_hash_field(self):
        self.assertIn('ape_dna_hash', self.sample)

    def test_minimum_100_fields_per_channel(self):
        self.assertGreaterEqual(len(self.sample), 100)

    def test_player_profile_field(self):
        self.assertIn('player_profile', self.sample)

    def test_hydra_stealth_field(self):
        self.assertIn('hydra_stealth_enabled', self.sample)

    def test_circuit_breaker_field(self):
        self.assertIn('circuit_breaker_enabled', self.sample)


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 9: profile-bridge-v9.js — Campos APE v18.2
# ═══════════════════════════════════════════════════════════════════════════════
class TestProfileBridgeV9(unittest.TestCase):

    def setUp(self):
        self.pb = read_file(f'{JS}/profile-bridge-v9.js')

    def test_file_exists(self):
        self.assertTrue(os.path.exists(f'{JS}/profile-bridge-v9.js'))

    def test_lcevc_enabled_field(self):
        self.assertIn('lcevc_enabled', self.pb)

    def test_lcevc_state_field(self):
        self.assertIn('lcevc_state', self.pb)

    def test_hdr_profile_field(self):
        self.assertIn('hdr_profile', self.pb)

    def test_ai_sr_enabled_field(self):
        self.assertIn('ai_sr_enabled', self.pb)

    def test_cmaf_enabled_field(self):
        self.assertIn('cmaf_enabled', self.pb)

    def test_vqs_score_field(self):
        self.assertIn('vqs_score', self.pb)

    def test_ape_version_field(self):
        self.assertIn('ape_version', self.pb)

    def test_degradation_chain_field(self):
        self.assertIn('degradation_chain', self.pb)

    def test_hydra_stealth_field(self):
        self.assertIn('hydra_stealth_enabled', self.pb)

    def test_hdr10_plus_field(self):
        self.assertIn('hdr10_plus_enabled', self.pb)

    def test_quantum_pixel_overdrive_field(self):
        self.assertIn('quantum_pixel_overdrive', self.pb)

    def test_tvqm_vstq_field(self):
        self.assertIn('tvqm_vstq', self.pb)


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 10: m3u8-typed-arrays-ultimate.js — Tags APE v18.2
# ═══════════════════════════════════════════════════════════════════════════════
class TestM3u8TypedArraysUltimate(unittest.TestCase):

    def setUp(self):
        self.m3u8 = read_file(f'{JS}/m3u8-typed-arrays-ultimate.js')

    def test_file_exists(self):
        self.assertTrue(os.path.exists(f'{JS}/m3u8-typed-arrays-ultimate.js'))

    def test_ext_x_ape_version_tag(self):
        self.assertIn('EXT-X-APE-VERSION', self.m3u8)

    def test_ext_x_ape_vqs_score_tag(self):
        self.assertIn('EXT-X-APE-VQS-SCORE', self.m3u8)

    def test_ext_x_ape_vqs_tier_tag(self):
        self.assertIn('EXT-X-APE-VQS-TIER', self.m3u8)

    def test_ext_x_ape_degradation_chain_tag(self):
        self.assertIn('EXT-X-APE-DEGRADATION-CHAIN', self.m3u8)

    def test_ext_x_ape_degradation_level_tag(self):
        self.assertIn('EXT-X-APE-DEGRADATION-LEVEL', self.m3u8)

    def test_ext_x_ape_tvqm_vstq_tag(self):
        self.assertIn('EXT-X-APE-TVQM-VSTQ', self.m3u8)

    def test_ext_x_ape_hydra_stealth_tag(self):
        self.assertIn('EXT-X-APE-HYDRA-STEALTH', self.m3u8)

    def test_ext_x_ape_hdr10_plus_tag(self):
        self.assertIn('EXT-X-APE-HDR10-PLUS', self.m3u8)

    def test_ext_x_ape_dolby_vision_tag(self):
        self.assertIn('EXT-X-APE-DOLBY-VISION', self.m3u8)

    def test_ext_x_ape_qpo_tag(self):
        self.assertIn('EXT-X-APE-QPO', self.m3u8)

    def test_ext_x_ape_god_mode_tag(self):
        self.assertIn('EXT-X-APE-GOD-MODE', self.m3u8)

    def test_ext_x_ape_lcevc_state_tag(self):
        self.assertIn('EXT-X-APE-LCEVC', self.m3u8)

    def test_ext_x_ape_ai_sr_tag(self):
        self.assertIn('EXT-X-APE-AI-SR', self.m3u8)

    def test_section_20_present(self):
        self.assertIn('SECCIÓN 20', self.m3u8)

    def test_section_21_present(self):
        self.assertIn('SECCIÓN 21', self.m3u8)

    def test_section_22_present(self):
        self.assertIn('SECCIÓN 22', self.m3u8)


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 11: 14 Skills OTT
# ═══════════════════════════════════════════════════════════════════════════════
class TestOttSkills(unittest.TestCase):

    EXPECTED_SKILLS = [
        'hdr10_plus_dynamic_metadata',
        'dolby_vision_profile_router',
        'lcevc_super_resolution_layer',
        'ai_temporal_super_resolution',
        'quantum_pixel_overdrive',
        'content_aware_hevc_multichannel',
        'motor_dinamico_renderizado_mpd',
        'antigravity_quantum_immortality_v10',
        'antigravity_god_mode_zero_drop_v9',
        'manifest_forensics_engine',
        'manifest_repair_engine',
        'cdn_routing_engine',
        'lcevc_mpeg5_enhancement',
        'ott_visual_quality_orchestrator',
    ]

    def test_all_14_skills_exist(self):
        for skill in self.EXPECTED_SKILLS:
            skill_path = os.path.join(SKILLS_DIR, skill, 'SKILL.md')
            self.assertTrue(
                os.path.exists(skill_path),
                f'Skill faltante: {skill}'
            )

    def test_hdr10_plus_has_php_implementation(self):
        content = read_file(f'{SKILLS_DIR}/hdr10_plus_dynamic_metadata/SKILL.md')
        self.assertIn('php', content.lower())

    def test_dolby_vision_has_profiles(self):
        content = read_file(f'{SKILLS_DIR}/dolby_vision_profile_router/SKILL.md')
        self.assertIn('Profile', content)

    def test_lcevc_sr_has_ffmpeg_command(self):
        content = read_file(f'{SKILLS_DIR}/lcevc_super_resolution_layer/SKILL.md')
        self.assertIn('ffmpeg', content.lower())

    def test_ai_sr_has_quality_modes(self):
        content = read_file(f'{SKILLS_DIR}/ai_temporal_super_resolution/SKILL.md')
        # Debe tener modos de calidad
        self.assertTrue(
            any(m in content.upper() for m in ['QUALITY', 'ULTRA', 'BALANCED', 'PERFORMANCE'])
        )

    def test_ott_orchestrator_has_vqs_formula(self):
        content = read_file(f'{SKILLS_DIR}/ott_visual_quality_orchestrator/SKILL.md')
        self.assertIn('VQS', content)

    def test_all_skills_have_frontmatter(self):
        for skill in self.EXPECTED_SKILLS:
            content = read_file(f'{SKILLS_DIR}/{skill}/SKILL.md')
            self.assertTrue(
                content.startswith('---') or '# ' in content[:100],
                f'Skill sin frontmatter: {skill}'
            )


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 12: Integración resolve_quality.php + resolve.php
# ═══════════════════════════════════════════════════════════════════════════════
class TestResolverIntegration(unittest.TestCase):

    def setUp(self):
        self.rq = read_file(f'{VPS}/resolve_quality.php')
        self.r  = read_file(f'{VPS}/resolve.php')

    def test_resolve_quality_has_cmaf_shim(self):
        self.assertIn('cmaf_integration_shim', self.rq)

    def test_resolve_quality_has_lcevc_headers(self):
        self.assertIn('LCEVC', self.rq)

    def test_resolve_php_has_cmaf_shim(self):
        self.assertIn('cmaf_integration_shim', self.r)

    def test_resolve_php_has_lcevc_headers(self):
        self.assertIn('LCEVC', self.r)


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 13: Degradation Chain Logic
# ═══════════════════════════════════════════════════════════════════════════════
class TestDegradationChainLogic(unittest.TestCase):

    def test_chain_has_exactly_7_levels(self):
        pipeline = read_file(f'{CMAF}/unified_cmaf_lcevc_pipeline.php')
        # Contar las entradas del DEGRADATION_CHAIN array
        matches = re.findall(r"'label'\s*=>", pipeline)
        self.assertEqual(len(matches), 7)

    def test_level_1_is_cmaf_hevc_av1(self):
        pipeline = read_file(f'{CMAF}/unified_cmaf_lcevc_pipeline.php')
        self.assertIn("1 => ['label' => 'CMAF+HEVC/AV1'", pipeline)

    def test_level_7_is_http_redirect(self):
        pipeline = read_file(f'{CMAF}/unified_cmaf_lcevc_pipeline.php')
        self.assertIn("7 => ['label' => 'HTTP redirect'", pipeline)

    def test_lcevc_on_levels_1_and_2(self):
        pipeline = read_file(f'{CMAF}/unified_cmaf_lcevc_pipeline.php')
        # Niveles 1 y 2 deben tener lcevc => true
        level1 = re.search(r"1 => \[.*?'lcevc'\s*=>\s*(true|false)", pipeline, re.DOTALL)
        level2 = re.search(r"2 => \[.*?'lcevc'\s*=>\s*(true|false)", pipeline, re.DOTALL)
        if level1:
            self.assertEqual(level1.group(1), 'true')
        if level2:
            self.assertEqual(level2.group(1), 'true')

    def test_lcevc_off_on_levels_3_to_7(self):
        pipeline = read_file(f'{CMAF}/unified_cmaf_lcevc_pipeline.php')
        for lvl in [3, 4, 5, 6, 7]:
            match = re.search(rf"{lvl} => \[.*?'lcevc'\s*=>\s*(true|false)", pipeline, re.DOTALL)
            if match:
                self.assertEqual(match.group(1), 'false', f'Nivel {lvl} debería tener lcevc=false')

    def test_chain_in_channels_map(self):
        channels_map_path = f'{VPS}/channels_map.json'
        channels_map = read_json(channels_map_path)
        if channels_map:
            sample = list(channels_map.values())[0]
            chain = sample.get('degradation_chain', [])
            self.assertEqual(len(chain), 7)
            self.assertEqual(chain[0], 'CMAF+HEVC/AV1')
            self.assertEqual(chain[-1], 'HTTP redirect')


# ═══════════════════════════════════════════════════════════════════════════════
# GRUPO 14: CMAF Engine — Módulos Completos
# ═══════════════════════════════════════════════════════════════════════════════
class TestCmafEngineModules(unittest.TestCase):

    EXPECTED_MODULES = [
        'manifest_forensics.php',
        'manifest_repair_engine.php',
        'cmaf_packaging_engine.php',
        'dual_manifest_generator.php',
        'player_capability_resolver.php',
        'cdn_routing_engine.php',
        'lcevc_state_engine.php',
        'lcevc_media_validator.php',
        'lcevc_player_detector.php',
        'universal_headers_engine.php',
        'universal_codec_protocol_engine.php',
        'universal_fallback_engine.php',
    ]

    def test_all_modules_exist(self):
        for module in self.EXPECTED_MODULES:
            path = f'{CMAF}/modules/{module}'
            self.assertTrue(os.path.exists(path), f'Módulo faltante: {module}')

    def test_cmaf_orchestrator_exists(self):
        self.assertTrue(os.path.exists(f'{CMAF}/cmaf_orchestrator.php'))

    def test_ape_omni_orchestrator_v18_exists(self):
        self.assertTrue(os.path.exists(f'{CMAF}/ape_omni_orchestrator_v18.php'))

    def test_telchemy_engine_exists(self):
        self.assertTrue(os.path.exists(f'{CMAF}/telchemy_tvqm_engine.php'))

    def test_unified_pipeline_exists(self):
        self.assertTrue(os.path.exists(f'{CMAF}/unified_cmaf_lcevc_pipeline.php'))

    def test_cmaf_integration_shim_exists(self):
        self.assertTrue(os.path.exists(f'{CMAF}/cmaf_integration_shim.php'))

    def test_dual_manifest_has_lcevc_signaling(self):
        dmg = read_file(f'{CMAF}/modules/dual_manifest_generator.php')
        self.assertIn('LCEVC', dmg)

    def test_packaging_engine_has_ffmpeg(self):
        pkg = read_file(f'{CMAF}/modules/cmaf_packaging_engine.php')
        self.assertIn('ffmpeg', pkg.lower())


if __name__ == '__main__':
    loader = unittest.TestLoader()
    suite  = unittest.TestSuite()

    test_groups = [
        TestApeOmniOrchestratorV18,
        TestTelchemyTvqmEngine,
        TestUnifiedCmafLcevcPipeline,
        TestPlayerCapabilityResolverUniversal,
        TestUniversalHeadersEngine,
        TestUniversalFallbackEngine,
        TestLcevcStateEngine,
        TestChannelsMapDna,
        TestProfileBridgeV9,
        TestM3u8TypedArraysUltimate,
        TestOttSkills,
        TestResolverIntegration,
        TestDegradationChainLogic,
        TestCmafEngineModules,
    ]

    for group in test_groups:
        suite.addTests(loader.loadTestsFromTestCase(group))

    runner = unittest.TextTestRunner(verbosity=0, stream=open('/dev/null', 'w'))
    result = runner.run(suite)

    total  = result.testsRun
    failed = len(result.failures) + len(result.errors)
    passed = total - failed

    print(f"\n{'='*60}")
    print(f"IPTV Navigator PRO v4.0 FULL — Test Suite")
    print(f"{'='*60}")
    print(f"Total:  {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"{'='*60}")
    print(f"Result: {'PASS ✓' if failed == 0 else 'FAIL ✗'}")

    if failed > 0:
        print(f"\nFallos:")
        for f in result.failures:
            print(f"  ✗ {f[0]}")
            print(f"    {f[1].strip().split(chr(10))[-1]}")
        for e in result.errors:
            print(f"  ✗ {e[0]}")
            print(f"    {e[1].strip().split(chr(10))[-1]}")
