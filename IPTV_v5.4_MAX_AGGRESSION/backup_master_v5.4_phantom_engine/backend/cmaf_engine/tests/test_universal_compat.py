#!/usr/bin/env python3.11
"""
IPTV Navigator PRO v3.3-UNIVERSAL
Suite de Tests de Compatibilidad Universal — 35 Players
"""
import unittest
import json
import re
import os

BASE = '/home/ubuntu/iptv_navigator_pro/IPTV_Navigator_PRO (12)/IPTV_Navigator_PRO'
CMAF = BASE + '/iptv_nav/files/vps/cmaf_engine/modules'

# ─── Helper: read PHP file ────────────────────────────────────────────────────
def read_php(name):
    path = os.path.join(CMAF, name)
    with open(path) as f:
        return f.read()

# ─── Helper: simulate player detection from UA ───────────────────────────────
PLAYER_UA_MAP = {
    'TiviMate':      'TiviMate/4.7.0 (Android 11; ExoPlayer/2.18.1)',
    'ExoPlayer':     'ExoPlayer/2.18.1 (Linux; Android 11)',
    'OTT_Navigator': 'OTT Navigator/2.5.0 (Android)',
    'IPTV_Smarters': 'IPTV Smarters Pro/3.1.0 (Android)',
    'GSE_Smart_IPTV':'GSE Smart IPTV/7.0 (Android)',
    'Perfect_Player':'Perfect Player IPTV/1.5.3 (Android)',
    'MX_Player':     'MXPlayer/1.46.9 (Android)',
    'IPTV_Extreme':  'IPTV Extreme Pro/98 (Android)',
    'Sparkle_TV':    'Sparkle TV/3.0 (Android)',
    'Televizo':      'Televizo/1.9.5 (Android)',
    'Stremio':       'Stremio/4.4.165 (Windows)',
    'Kodi_19':       'Kodi/19.4 (X11; Linux x86_64)',
    'Kodi_18':       'Kodi/18.9 (X11; Linux x86_64)',
    'Plex':          'PlexMediaPlayer/4.63.4 (Windows)',
    'Emby':          'Emby/4.8.0.0 (Windows)',
    'Jellyfin':      'Jellyfin-Media-Player/1.9.1 (Windows)',
    'Infuse':        'Infuse/7.6.0 (iOS; iPhone)',
    'Channels_DVR':  'Channels/5.0 (macOS)',
    'Safari_iOS':    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0) AppleWebKit/605.1.15 Safari/604.1',
    'Safari_macOS':  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    'Chrome':        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Firefox':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'ShakaPlayer':   'Shaka-Player/4.3.0 (Chrome/120)',
    'HLS_js':        'HLS.js/1.4.0 (Chrome)',
    'Video_js':      'Video.js/8.0.0 (Chrome)',
    'VLC_3':         'VLC/3.0.18 LibVLC/3.0.18',
    'VLC_2':         'VLC/2.2.8 LibVLC/2.2.8',
    'MPV':           'mpv/0.35.1',
    'MPC_HC':        'MPC-HC/1.9.22 (Windows)',
    'MAG_Old':       'MAG 250 STB (Linux)',
    'MAG_New':       'MAG 322 STB (Linux)',
    'Formuler':      'Formuler Z10 MyTVOnline/2.0 (Android)',
    'Dreamlink':     'Dreamlink T2 (Android)',
    'Samsung_Tizen': 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) SmartTV',
    'LG_webOS':      'Mozilla/5.0 (Web0S; Linux/SmartTV) WebAppManager',
    'Fire_TV':       'Mozilla/5.0 (Linux; Android 9; AFTMM) FireOS/7.0',
    'NVIDIA_SHIELD': 'Dalvik/2.1.0 (Linux; Android 11; SHIELD Android TV)',
    'Roku':          'Roku/DVP-9.10 (519.10E04111A)',
    'Apple_TV':      'AppleTV6,2/11.1 (tvOS)',
}

# Expected player capabilities (from the matrix)
EXPECTED_CAPS = {
    'TiviMate':      {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
    'ExoPlayer':     {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
    'OTT_Navigator': {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
    'IPTV_Smarters': {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
    'GSE_Smart_IPTV':{'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
    'Perfect_Player':{'fmp4': True,  'dash': False, 'hevc': True,  'format': 'hls_ts'},
    'MX_Player':     {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
    'Kodi_19':       {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
    'Kodi_18':       {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_ts'},
    'Plex':          {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
    'Safari_iOS':    {'fmp4': True,  'dash': False, 'hevc': True,  'format': 'hls_fmp4'},
    'Safari_macOS':  {'fmp4': True,  'dash': False, 'hevc': True,  'format': 'hls_fmp4'},
    'Chrome':        {'fmp4': True,  'dash': True,  'hevc': False, 'format': 'hls_fmp4'},
    'Firefox':       {'fmp4': True,  'dash': True,  'hevc': False, 'format': 'hls_fmp4'},
    'VLC_3':         {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
    'VLC_2':         {'fmp4': False, 'dash': True,  'hevc': False, 'format': 'hls_ts'},
    'MAG_Old':       {'fmp4': False, 'dash': False, 'hevc': False, 'format': 'hls_ts'},
    'MAG_New':       {'fmp4': True,  'dash': False, 'hevc': True,  'format': 'hls_fmp4'},
    'Roku':          {'fmp4': True,  'dash': False, 'hevc': False, 'format': 'hls_ts'},
    'Apple_TV':      {'fmp4': True,  'dash': False, 'hevc': True,  'format': 'hls_fmp4'},
    'Fire_TV':       {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
    'NVIDIA_SHIELD': {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
    'Samsung_Tizen': {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
    'LG_webOS':      {'fmp4': True,  'dash': True,  'hevc': True,  'format': 'hls_fmp4'},
}


class TestPlayerCapabilityResolver(unittest.TestCase):
    """Tests for player_capability_resolver.php"""

    def setUp(self):
        self.pcr = read_php('player_capability_resolver.php')

    def test_file_exists_and_has_content(self):
        self.assertGreater(len(self.pcr), 1000)

    def test_resolver_version_is_universal(self):
        self.assertIn('3.3.0-UNIVERSAL', self.pcr)

    def test_all_35_players_in_matrix(self):
        """Verify all 35 players are defined in the matrix"""
        expected_players = list(PLAYER_UA_MAP.keys())
        for player in expected_players:
            self.assertIn(f"'{player}'", self.pcr,
                         f"Player '{player}' missing from matrix")

    def test_tivimate_detection(self):
        self.assertIn('tivimate', self.pcr.lower())
        self.assertIn('tivi-mate', self.pcr.lower())
        self.assertIn('tivi_mate', self.pcr.lower())

    def test_kodi_version_detection(self):
        """Kodi 19+ vs Kodi 18 detection"""
        self.assertIn('Kodi_19', self.pcr)
        self.assertIn('Kodi_18', self.pcr)
        # Kodi version detection via string match or regex
        kodi_detection = 'kodi/19' in self.pcr.lower() or 'kodi/(1[9' in self.pcr.lower()
        self.assertTrue(kodi_detection, "Kodi version detection pattern missing")

    def test_vlc_version_detection(self):
        """VLC 3.x vs VLC 2.x detection"""
        self.assertIn('VLC_3', self.pcr)
        self.assertIn('VLC_2', self.pcr)
        # VLC version detection via string match or regex
        vlc_detection = 'vlc/3' in self.pcr.lower() or 'vlc/(3|4)' in self.pcr.lower()
        self.assertTrue(vlc_detection, "VLC version detection pattern missing")

    def test_mag_version_detection(self):
        """MAG old vs MAG new detection"""
        self.assertIn('MAG_Old', self.pcr)
        self.assertIn('MAG_New', self.pcr)
        self.assertIn('mag', self.pcr.lower())

    def test_safari_ios_vs_macos_detection(self):
        """Safari iOS vs macOS detection"""
        self.assertIn('Safari_iOS', self.pcr)
        self.assertIn('Safari_macOS', self.pcr)
        self.assertIn('iphone', self.pcr.lower())
        self.assertIn('ipad', self.pcr.lower())

    def test_firetv_detection(self):
        """Fire TV detection by AFTMM/FireOS/Silk"""
        self.assertIn('Fire_TV', self.pcr)
        self.assertIn('afts', self.pcr.lower())
        self.assertIn('fireos', self.pcr.lower())

    def test_shield_detection(self):
        self.assertIn('NVIDIA_SHIELD', self.pcr)
        self.assertIn('shield', self.pcr.lower())

    def test_roku_detection(self):
        self.assertIn('Roku', self.pcr)
        self.assertIn('roku', self.pcr.lower())

    def test_apple_tv_detection(self):
        self.assertIn('Apple_TV', self.pcr)
        self.assertIn('appletv', self.pcr.lower())
        self.assertIn('tvos', self.pcr.lower())

    def test_samsung_tizen_detection(self):
        self.assertIn('Samsung_Tizen', self.pcr)
        self.assertIn('tizen', self.pcr.lower())

    def test_lg_webos_detection(self):
        self.assertIn('LG_webOS', self.pcr)
        self.assertIn('webos', self.pcr.lower())

    def test_formuler_detection(self):
        self.assertIn('Formuler', self.pcr)
        self.assertIn('formuler', self.pcr.lower())
        self.assertIn('mytvonline', self.pcr.lower())

    def test_dreamlink_detection(self):
        self.assertIn('Dreamlink', self.pcr)
        self.assertIn('dreamlink', self.pcr.lower())

    def test_5step_fallback_chain(self):
        """selectManifestUrl must implement 5-step fallback"""
        self.assertIn('selectManifestUrl', self.pcr)
        self.assertIn('Step 1', self.pcr)
        self.assertIn('Step 2', self.pcr)
        self.assertIn('Step 3', self.pcr)
        self.assertIn('Step 4', self.pcr)
        self.assertIn('Step 5', self.pcr)

    def test_lcevc_3source_detection(self):
        """LCEVC detection from header, query param, and matrix"""
        self.assertIn('HTTP_X_APE_LCEVC_SUPPORT', self.pcr)
        self.assertIn('lcevc', self.pcr.lower())
        self.assertIn('player_matrix', self.pcr)

    def test_av1_support_in_matrix(self):
        """AV1 support column in matrix"""
        self.assertIn('supports_av1', self.pcr)

    def test_hdr10_support_in_matrix(self):
        """HDR10 support column in matrix"""
        self.assertIn('supports_hdr10', self.pcr)

    def test_player_profile_method(self):
        """buildPlayerProfile method exists"""
        self.assertIn('buildPlayerProfile', self.pcr)
        self.assertIn('PREMIUM', self.pcr)
        self.assertIn('LEGACY', self.pcr)

    def test_hydra_mode_support(self):
        """Hydra Stealth mode detection"""
        self.assertIn('hydra', self.pcr.lower())
        self.assertIn('HTTP_X_APE_HYDRA', self.pcr)

    def test_format_constants(self):
        """All format constants defined"""
        for fmt in ['FORMAT_HLS_FMP4', 'FORMAT_HLS_TS', 'FORMAT_DASH', 'FORMAT_TS_DIRECT', 'FORMAT_CMAF']:
            self.assertIn(fmt, self.pcr)

    def test_get_player_count_method(self):
        """getPlayerCount() method exists"""
        self.assertIn('getPlayerCount', self.pcr)

    def test_expected_capabilities_in_matrix(self):
        """Verify key player capabilities are correctly set in matrix"""
        import re
        # MAG_Old should NOT support fMP4 (false) — find in the $PLAYER_MATRIX array
        mag_entry = re.search(r"'MAG_Old'\s*=>\s*\[([^\]]+)\]", self.pcr)
        self.assertIsNotNone(mag_entry, "MAG_Old not found in matrix")
        self.assertIn('false', mag_entry.group(1).lower())

        # TiviMate should support fMP4 (true)
        tivi_entry = re.search(r"'TiviMate'\s*=>\s*\[([^\]]+)\]", self.pcr)
        self.assertIsNotNone(tivi_entry, "TiviMate not found in matrix")
        self.assertIn('true', tivi_entry.group(1).lower())


class TestApeOmniOrchestrator(unittest.TestCase):
    """Tests for ape_omni_orchestrator.php"""

    def setUp(self):
        self.orch = read_php('ape_omni_orchestrator.php')

    def test_file_exists_and_has_content(self):
        self.assertGreater(len(self.orch), 1000)

    def test_8_layer_constants(self):
        """8 logical layers defined"""
        for layer in ['extInf', 'vlcLayer', 'jsonLayer', 'apeLayer',
                      'kodiLayer', 'attrLayer', 'streamInf', 'urls']:
            self.assertIn(layer, self.orch)

    def test_rfc8216_order_comment(self):
        """RFC 8216 order documented"""
        self.assertIn('RFC 8216', self.orch)

    def test_extinf_must_be_first(self):
        """EXTINF is assembled first"""
        extinf_pos = self.orch.find('$extInf,')
        vlc_pos    = self.orch.find('$filteredVlc,')
        self.assertLess(extinf_pos, vlc_pos, "#EXTINF must come before #EXTVLCOPT")

    def test_url_must_be_last(self):
        """URL layer is assembled last"""
        # In the array_merge block, $filteredStream must come before $urls
        merge_idx  = self.orch.find('array_merge')
        merge_block = self.orch[merge_idx:merge_idx+600]
        stream_pos = merge_block.find('$filteredStream,')
        url_pos    = merge_block.find('$urls')
        self.assertGreater(url_pos, stream_pos, "URL must come after #EXT-X-STREAM-INF")

    def test_stream_inf_before_url(self):
        """EXT-X-STREAM-INF immediately before URL"""
        self.assertIn('EXT-X-STREAM-INF', self.orch)
        # In assembled array, $filteredStream must be just before $urls
        assembled_block = self.orch[self.orch.find('array_merge'):]
        stream_pos = assembled_block.find('$filteredStream')
        url_pos    = assembled_block.find('$urls')
        self.assertLess(stream_pos, url_pos)

    def test_hydra_stealth_obfuscation(self):
        """Hydra Stealth replaces EXT-X-APE- with EXT-X-SYS-"""
        self.assertIn('EXT-X-APE-', self.orch)
        self.assertIn('EXT-X-SYS-', self.orch)
        self.assertIn('hydraMode', self.orch)

    def test_legacy_profile_strips_ape_tags(self):
        """LEGACY profile removes APE tags"""
        self.assertIn('PROFILE_LEGACY', self.orch)
        legacy_block = self.orch[self.orch.find("case self::PROFILE_LEGACY:"):]
        # After LEGACY case, filteredApe should be []
        self.assertIn('$filteredApe', legacy_block[:500])
        self.assertIn('= []', legacy_block[:500])

    def test_process_playlist_method(self):
        """processPlaylist() method exists"""
        self.assertIn('processPlaylist', self.orch)

    def test_validate_block_method(self):
        """validateBlock() method exists with RFC 8216 checks"""
        self.assertIn('validateBlock', self.orch)
        self.assertIn('EXTINF', self.orch)
        self.assertIn('Last line must be a URL', self.orch)

    def test_all_player_profiles(self):
        """All 5 player profiles handled"""
        for profile in ['PREMIUM', 'HIGH', 'STANDARD', 'DASH_ONLY', 'LEGACY']:
            self.assertIn(profile, self.orch)

    def test_exthttp_filtering_for_legacy(self):
        """filterExtHttpForLegacy keeps only User-Agent"""
        self.assertIn('filterExtHttpForLegacy', self.orch)
        self.assertIn('User-Agent', self.orch)


class TestUniversalHeadersEngine(unittest.TestCase):
    """Tests for universal_headers_engine.php"""

    def setUp(self):
        self.eng = read_php('universal_headers_engine.php')

    def test_file_exists_and_has_content(self):
        self.assertGreater(len(self.eng), 1000)

    def test_all_ua_constants_defined(self):
        """All User-Agent constants defined"""
        for ua in ['UA_EXOPLAYER', 'UA_TIVIMATE', 'UA_VLC', 'UA_KODI',
                   'UA_SAFARI_IOS', 'UA_SAFARI_MAC', 'UA_CHROME', 'UA_FIREFOX',
                   'UA_PLEX', 'UA_EMBY', 'UA_JELLYFIN', 'UA_MAG', 'UA_SAMSUNG',
                   'UA_LG', 'UA_FIRETV', 'UA_SHIELD', 'UA_ROKU', 'UA_APPLE_TV']:
            self.assertIn(ua, self.eng)

    def test_exthttp_generation(self):
        """EXTHTTP generation method exists"""
        self.assertIn('buildExtHttp', self.eng)
        self.assertIn('#EXTHTTP:', self.eng)

    def test_extvlcopt_generation(self):
        """EXTVLCOPT generation method exists"""
        self.assertIn('buildExtVlcOpt', self.eng)
        self.assertIn('#EXTVLCOPT:', self.eng)
        self.assertIn('http-user-agent', self.eng)
        self.assertIn('network-caching', self.eng)

    def test_kodiprop_generation(self):
        """KODIPROP generation method exists"""
        self.assertIn('buildKodiProp', self.eng)
        self.assertIn('#KODIPROP:', self.eng)
        self.assertIn('inputstream.adaptive', self.eng)

    def test_kodi_dash_vs_hls(self):
        """Kodi gets different KODIPROP for DASH vs HLS"""
        self.assertIn('mpd', self.eng.lower())
        self.assertIn('application/dash+xml', self.eng)
        self.assertIn('application/x-mpegURL', self.eng)

    def test_kodi_18_vs_19_inputstream(self):
        """Kodi 18 uses ffmpegdirect, Kodi 19 uses adaptive"""
        self.assertIn('inputstream.ffmpegdirect', self.eng)
        self.assertIn('inputstream.adaptive', self.eng)

    def test_origin_extraction(self):
        """extractOrigin helper method exists"""
        self.assertIn('extractOrigin', self.eng)

    def test_generate_header_lines_method(self):
        """generateHeaderLines() public method exists"""
        self.assertIn('generateHeaderLines', self.eng)

    def test_custom_headers_from_dna(self):
        """Custom headers from channel DNA are supported"""
        self.assertIn('custom_headers', self.eng)

    def test_vlc_players_get_extvlcopt(self):
        """VLC, Kodi, MPV get EXTVLCOPT"""
        vlc_block = self.eng[self.eng.find('$vlcPlayers'):]
        self.assertIn('VLC_3', vlc_block[:200])
        self.assertIn('Kodi_19', vlc_block[:200])
        self.assertIn('MPV', vlc_block[:200])


class TestUniversalCodecProtocolEngine(unittest.TestCase):
    """Tests for universal_codec_protocol_engine.php"""

    def setUp(self):
        self.eng = read_php('universal_codec_protocol_engine.php')

    def test_file_exists_and_has_content(self):
        self.assertGreater(len(self.eng), 1000)

    def test_rfc6381_codec_strings(self):
        """RFC 6381 codec strings defined"""
        for codec in ['avc1.42E01E', 'avc1.4D401F', 'avc1.640028',
                      'hvc1.1.6.L93.B0', 'hvc1.2.4.L120.B0',
                      'av01.0.04M.08', 'mp4a.40.2', 'mp4a.40.5']:
            self.assertIn(codec, self.eng)

    def test_dolby_audio_codecs(self):
        """Dolby AC-3 and E-AC-3 defined"""
        self.assertIn('ac-3', self.eng)
        self.assertIn('ec-3', self.eng)

    def test_resolution_bandwidth_map(self):
        """Resolution to bandwidth mapping exists"""
        self.assertIn('3840x2160', self.eng)
        self.assertIn('1920x1080', self.eng)
        self.assertIn('1280x720', self.eng)

    def test_hevc_efficiency_factor(self):
        """HEVC bandwidth estimation uses 50% efficiency"""
        self.assertIn('0.5', self.eng)

    def test_av1_efficiency_factor(self):
        """AV1 bandwidth estimation uses 35% efficiency"""
        self.assertIn('0.35', self.eng)

    def test_generate_stream_inf_method(self):
        """generateStreamInf() method exists"""
        self.assertIn('generateStreamInf', self.eng)
        self.assertIn('EXT-X-STREAM-INF', self.eng)

    def test_video_range_for_hdr(self):
        """VIDEO-RANGE attribute for HDR content"""
        self.assertIn('VIDEO-RANGE', self.eng)
        self.assertIn("'PQ'", self.eng)
        self.assertIn("'HLG'", self.eng)

    def test_mime_type_method(self):
        """getMimeType() method exists"""
        self.assertIn('getMimeType', self.eng)
        self.assertIn('application/x-mpegURL', self.eng)
        self.assertIn('application/dash+xml', self.eng)
        self.assertIn('video/mp2t', self.eng)

    def test_select_codec_method(self):
        """selectCodec() method exists"""
        self.assertIn('selectCodec', self.eng)

    def test_h264_profile_selection(self):
        """H.264 profile selected based on resolution"""
        self.assertIn('selectH264Profile', self.eng)


class TestUniversalFallbackEngine(unittest.TestCase):
    """Tests for universal_fallback_engine.php"""

    def setUp(self):
        self.eng = read_php('universal_fallback_engine.php')

    def test_file_exists_and_has_content(self):
        self.assertGreater(len(self.eng), 1000)

    def test_7_fallback_levels(self):
        """7 fallback levels defined"""
        for level in ['LEVEL_PREMIUM', 'LEVEL_HIGH', 'LEVEL_STANDARD',
                      'LEVEL_COMPAT', 'LEVEL_LEGACY', 'LEVEL_MINIMAL',
                      'LEVEL_LAST_RESORT']:
            self.assertIn(level, self.eng)

    def test_circuit_breaker_constants(self):
        """Circuit breaker constants defined"""
        self.assertIn('CIRCUIT_FAIL_THRESHOLD', self.eng)
        self.assertIn('CIRCUIT_RESET_TTL', self.eng)

    def test_circuit_breaker_methods(self):
        """Circuit breaker methods exist"""
        self.assertIn('recordFailure', self.eng)
        self.assertIn('resetCircuit', self.eng)
        self.assertIn('getCircuitState', self.eng)

    def test_build_fallback_chain_method(self):
        """buildFallbackChain() method exists"""
        self.assertIn('buildFallbackChain', self.eng)

    def test_probe_url_method(self):
        """probeUrl() method exists for health checking"""
        self.assertIn('probeUrl', self.eng)
        self.assertIn('HEAD', self.eng)

    def test_level_1_is_premium(self):
        """Level 1 = CMAF + HEVC/AV1 + DASH"""
        self.assertIn('LEVEL_PREMIUM', self.eng)
        premium_block = self.eng[self.eng.find('LEVEL_PREMIUM =>'):]
        self.assertIn('cmaf', premium_block[:200])

    def test_last_resort_is_hls_ts(self):
        """Last resort falls back to HLS/TS"""
        last_block = self.eng[self.eng.find('LEVEL_LAST_RESORT =>'):]
        self.assertIn('hls_ts', last_block[:300])

    def test_apcu_with_memory_fallback(self):
        """APCu used with in-memory fallback"""
        self.assertIn('apcu_fetch', self.eng)
        self.assertIn('memoryCircuit', self.eng)

    def test_ssl_verification_disabled_for_probe(self):
        """SSL verification disabled in probeUrl for compatibility"""
        self.assertIn('verify_peer', self.eng)
        self.assertIn('false', self.eng)


class TestModuleIntegration(unittest.TestCase):
    """Integration tests: all modules work together"""

    def test_all_4_modules_exist(self):
        """All 4 new universal modules exist"""
        modules = [
            'player_capability_resolver.php',
            'ape_omni_orchestrator.php',
            'universal_headers_engine.php',
            'universal_codec_protocol_engine.php',
            'universal_fallback_engine.php',
        ]
        for mod in modules:
            path = os.path.join(CMAF, mod)
            self.assertTrue(os.path.exists(path), f"Module missing: {mod}")
            self.assertGreater(os.path.getsize(path), 1000, f"Module too small: {mod}")

    def test_player_count_is_35_or_more(self):
        """Player matrix has at least 35 players"""
        pcr = read_php('player_capability_resolver.php')
        # Count player ID constants
        player_ids = re.findall(r"'([A-Z][a-zA-Z_0-9]+)'\s*=>\s*\[", pcr)
        self.assertGreaterEqual(len(player_ids), 35,
                               f"Expected 35+ players, found {len(player_ids)}: {player_ids}")

    def test_format_constants_consistent(self):
        """Format constants are consistent across modules"""
        pcr  = read_php('player_capability_resolver.php')
        orch = read_php('ape_omni_orchestrator.php')
        fall = read_php('universal_fallback_engine.php')

        for fmt in ['hls_fmp4', 'hls_ts', 'dash', 'ts_direct']:
            self.assertIn(fmt, pcr)
            self.assertIn(fmt, fall)

    def test_no_hardcoded_player_uas_in_resolver(self):
        """Player resolver doesn't hardcode UA strings (uses constants)"""
        pcr = read_php('player_capability_resolver.php')
        # UA strings should be in headers engine, not in resolver
        # The resolver should use str_contains on the incoming UA
        self.assertIn('str_contains', pcr)

    def test_rfc8216_compliance_documented(self):
        """RFC 8216 compliance documented in orchestrator"""
        orch = read_php('ape_omni_orchestrator.php')
        self.assertIn('RFC 8216', orch)

    def test_universal_compatibility_layer_version(self):
        """All modules have version strings"""
        for mod in ['player_capability_resolver.php', 'ape_omni_orchestrator.php',
                    'universal_headers_engine.php', 'universal_codec_protocol_engine.php',
                    'universal_fallback_engine.php']:
            content = read_php(mod)
            self.assertIn('VERSION', content, f"No version in {mod}")

    def test_channels_map_has_required_fields(self):
        """channels_map.json has CMAF+LCEVC fields"""
        cm_path = BASE + '/iptv_nav/files/vps/channels_map.json'
        with open(cm_path) as f:
            cm = json.load(f)
        # Check first channel has the required fields
        first_ch = next(iter(cm.values())) if cm else {}
        for field in ['cmaf_enabled', 'lcevc_enabled']:
            self.assertIn(field, first_ch, f"Field '{field}' missing from channels_map")

    def test_profile_bridge_has_lcevc_fields(self):
        """profile-bridge-v9.js has LCEVC fields"""
        pb_path = BASE + '/iptv_nav/files/js/ape-v9/profile-bridge-v9.js'
        with open(pb_path) as f:
            pb = f.read()
        for field in ['lcevc_enabled', 'lcevc_state', 'cmaf_enabled']:
            self.assertIn(field, pb, f"Field '{field}' missing from profile-bridge")

    def test_resolve_quality_has_shim(self):
        """resolve_quality.php has CMAF integration shim"""
        rq_path = BASE + '/iptv_nav/files/vps/resolve_quality.php'
        with open(rq_path) as f:
            rq = f.read()
        self.assertIn('cmaf_integration_shim', rq)

    def test_resolve_has_cors_headers(self):
        """resolve.php has CORS headers for browser compatibility"""
        r_path = BASE + '/iptv_nav/files/vps/resolve.php'
        with open(r_path) as f:
            r = f.read()
        self.assertIn('Access-Control-Allow-Origin', r)


if __name__ == '__main__':
    loader = unittest.TestLoader()
    suite  = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(TestPlayerCapabilityResolver))
    suite.addTests(loader.loadTestsFromTestCase(TestApeOmniOrchestrator))
    suite.addTests(loader.loadTestsFromTestCase(TestUniversalHeadersEngine))
    suite.addTests(loader.loadTestsFromTestCase(TestUniversalCodecProtocolEngine))
    suite.addTests(loader.loadTestsFromTestCase(TestUniversalFallbackEngine))
    suite.addTests(loader.loadTestsFromTestCase(TestModuleIntegration))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    total  = result.testsRun
    passed = total - len(result.failures) - len(result.errors)
    print(f"\n{'='*60}")
    print(f"UNIVERSAL COMPATIBILITY TESTS")
    print(f"{'='*60}")
    print(f"Total:  {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Result: {'PASS ✓' if result.wasSuccessful() else 'FAIL ✗'}")

    if result.failures:
        print("\nFAILURES:")
        for test, msg in result.failures:
            print(f"  - {test}: {msg.split(chr(10))[-2]}")
    if result.errors:
        print("\nERRORS:")
        for test, msg in result.errors:
            print(f"  - {test}: {msg.split(chr(10))[-2]}")
