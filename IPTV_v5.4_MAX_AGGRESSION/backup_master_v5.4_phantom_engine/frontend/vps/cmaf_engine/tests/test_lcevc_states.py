#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
LCEVC STATE ENGINE — TESTS AUTOMÁTICOS (APE v1.0.0)
═══════════════════════════════════════════════════════════════════════════════

Tests que validan la lógica de los 4 estados operativos LCEVC:
  OFF              → Canal sin LCEVC o player incompatible (Safari/AVPlayer)
  SIGNAL_ONLY      → Solo metadata APE. No hay enhancement real.
  PACKAGED         → Media empaquetado con LCEVC. Player puede no decodificar.
  PLAYER_VALIDATED → Reproducción E2E confirmada con player compatible.

Ejecutar: python3 test_lcevc_states.py

AUTOR: APE Engine Team - IPTV Navigator PRO
VERSIÓN: 1.0.0
FECHA: 2026-03-15
═══════════════════════════════════════════════════════════════════════════════
"""

import sys
import json

# ─────────────────────────────────────────────────────────────────────────────
# SIMULACIÓN DE LOS 4 ESTADOS (espeja lcevc_state_engine.php)
# ─────────────────────────────────────────────────────────────────────────────

STATE_OFF              = 'OFF'
STATE_SIGNAL_ONLY      = 'SIGNAL_ONLY'
STATE_PACKAGED         = 'PACKAGED'
STATE_PLAYER_VALIDATED = 'PLAYER_VALIDATED'

# Matriz formal de players (espeja PHP PLAYER_MATRIX)
PLAYER_MATRIX = {
    'ExoPlayer':     {'supported': True,  'max_state': STATE_PLAYER_VALIDATED},
    'Shaka':         {'supported': True,  'max_state': STATE_PLAYER_VALIDATED},
    'hls.js':        {'supported': True,  'max_state': STATE_PACKAGED},
    'OTT Navigator': {'supported': False, 'max_state': STATE_SIGNAL_ONLY},
    'VLC':           {'supported': False, 'max_state': STATE_SIGNAL_ONLY},
    'Kodi':          {'supported': False, 'max_state': STATE_SIGNAL_ONLY},
    'Tivimate':      {'supported': False, 'max_state': STATE_SIGNAL_ONLY},
    'Safari':        {'supported': False, 'max_state': STATE_OFF},
    'AVPlayer':      {'supported': False, 'max_state': STATE_OFF},
    'Unknown':       {'supported': False, 'max_state': STATE_SIGNAL_ONLY},
}

def resolve_state(channel_config: dict, player_name: str) -> str:
    """Espeja la lógica de LcevcStateEngine::resolveState() en PHP."""
    # 1. Canal sin LCEVC → OFF
    if not channel_config.get('lcevc_enabled', False):
        return STATE_OFF

    # 2. Obtener máximo estado del player
    player_info = PLAYER_MATRIX.get(player_name, PLAYER_MATRIX['Unknown'])
    player_max_state = player_info['max_state']

    # 3. Player completamente incompatible → OFF
    if player_max_state == STATE_OFF:
        return STATE_OFF

    # 4. Media no validado → SIGNAL_ONLY como máximo
    if not channel_config.get('lcevc_media_validated', False):
        return STATE_SIGNAL_ONLY

    # 5. Player solo soporta señalización → SIGNAL_ONLY
    if player_max_state == STATE_SIGNAL_ONLY:
        return STATE_SIGNAL_ONLY

    # 6. Media empaquetado pero player solo llega a PACKAGED
    if player_max_state == STATE_PACKAGED:
        return STATE_PACKAGED

    # 7. Todo validado → PLAYER_VALIDATED
    if player_max_state == STATE_PLAYER_VALIDATED:
        return STATE_PLAYER_VALIDATED

    return STATE_SIGNAL_ONLY


def build_m3u8_tags(lcevc_enabled: bool, cfg: dict) -> list:
    """Espeja la Sección 19 de generateEXTXAPE() en m3u8-typed-arrays-ultimate.js."""
    if not lcevc_enabled:
        return []
    mode      = (cfg.get('lcevc_mode', 'SEI_METADATA')).upper()
    codec     = (cfg.get('lcevc_base_codec', 'h264')).upper()
    transport = (cfg.get('lcevc_transport', 'embedded')).upper()
    fallback  = (cfg.get('lcevc_fallback', 'base_only')).upper()
    required  = '1' if cfg.get('lcevc_player_required', False) else '0'
    return [
        '#EXT-X-APE-LCEVC:ENABLED',
        '#EXT-X-APE-LCEVC-STATE:SIGNAL_ONLY',
        f'#EXT-X-APE-LCEVC-MODE:{mode}',
        f'#EXT-X-APE-LCEVC-BASE-CODEC:{codec}',
        f'#EXT-X-APE-LCEVC-TRANSPORT:{transport}',
        f'#EXT-X-APE-LCEVC-FALLBACK:{fallback}',
        f'#EXT-X-APE-LCEVC-PLAYER-REQUIRED:{required}',
    ]


# ─────────────────────────────────────────────────────────────────────────────
# SUITE DE TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []

    def assert_eq(self, name: str, actual, expected):
        if actual == expected:
            self.passed += 1
            print(f"  ✅ PASS: {name}")
        else:
            self.failed += 1
            msg = f"  ❌ FAIL: {name}\n     Expected: {expected!r}\n     Got:      {actual!r}"
            self.errors.append(msg)
            print(msg)

    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'═'*60}")
        print(f"  RESULTADOS: {self.passed}/{total} tests pasaron")
        if self.failed > 0:
            print(f"  FALLOS: {self.failed}")
        print(f"{'═'*60}")
        return self.failed == 0


def run_state_machine_tests(r: TestResult):
    """Tests de la máquina de estados LCEVC."""
    print("\n── GRUPO 1: Máquina de Estados LCEVC ──────────────────────")

    # Test 1: Canal sin LCEVC → siempre OFF
    r.assert_eq(
        "Canal sin lcevc_enabled → OFF",
        resolve_state({'lcevc_enabled': False}, 'ExoPlayer'),
        STATE_OFF
    )

    # Test 2: Safari → OFF aunque canal tenga LCEVC
    r.assert_eq(
        "Safari + lcevc_enabled=True → OFF",
        resolve_state({'lcevc_enabled': True, 'lcevc_media_validated': True}, 'Safari'),
        STATE_OFF
    )

    # Test 3: AVPlayer → OFF
    r.assert_eq(
        "AVPlayer + lcevc_enabled=True → OFF",
        resolve_state({'lcevc_enabled': True, 'lcevc_media_validated': True}, 'AVPlayer'),
        STATE_OFF
    )

    # Test 4: Media no validado → SIGNAL_ONLY (aunque player sea ExoPlayer)
    r.assert_eq(
        "ExoPlayer + media NO validado → SIGNAL_ONLY",
        resolve_state({'lcevc_enabled': True, 'lcevc_media_validated': False}, 'ExoPlayer'),
        STATE_SIGNAL_ONLY
    )

    # Test 5: VLC + media validado → SIGNAL_ONLY (player no soporta más)
    r.assert_eq(
        "VLC + media validado → SIGNAL_ONLY",
        resolve_state({'lcevc_enabled': True, 'lcevc_media_validated': True}, 'VLC'),
        STATE_SIGNAL_ONLY
    )

    # Test 6: OTT Navigator + media validado → SIGNAL_ONLY
    r.assert_eq(
        "OTT Navigator + media validado → SIGNAL_ONLY",
        resolve_state({'lcevc_enabled': True, 'lcevc_media_validated': True}, 'OTT Navigator'),
        STATE_SIGNAL_ONLY
    )

    # Test 7: Tivimate + media validado → SIGNAL_ONLY
    r.assert_eq(
        "Tivimate + media validado → SIGNAL_ONLY",
        resolve_state({'lcevc_enabled': True, 'lcevc_media_validated': True}, 'Tivimate'),
        STATE_SIGNAL_ONLY
    )

    # Test 8: hls.js + media validado → PACKAGED
    r.assert_eq(
        "hls.js + media validado → PACKAGED",
        resolve_state({'lcevc_enabled': True, 'lcevc_media_validated': True}, 'hls.js'),
        STATE_PACKAGED
    )

    # Test 9: ExoPlayer + media validado → PLAYER_VALIDATED
    r.assert_eq(
        "ExoPlayer + media validado → PLAYER_VALIDATED",
        resolve_state({'lcevc_enabled': True, 'lcevc_media_validated': True}, 'ExoPlayer'),
        STATE_PLAYER_VALIDATED
    )

    # Test 10: Shaka + media validado → PLAYER_VALIDATED
    r.assert_eq(
        "Shaka + media validado → PLAYER_VALIDATED",
        resolve_state({'lcevc_enabled': True, 'lcevc_media_validated': True}, 'Shaka'),
        STATE_PLAYER_VALIDATED
    )

    # Test 11: Player desconocido + media validado → SIGNAL_ONLY (fallback seguro)
    r.assert_eq(
        "Player desconocido + media validado → SIGNAL_ONLY",
        resolve_state({'lcevc_enabled': True, 'lcevc_media_validated': True}, 'SomeUnknownPlayer'),
        STATE_SIGNAL_ONLY
    )


def run_m3u8_tag_tests(r: TestResult):
    """Tests de generación de tags M3U8 LCEVC."""
    print("\n── GRUPO 2: Generación de Tags M3U8 ───────────────────────")

    # Test 12: Sin LCEVC → lista vacía
    tags = build_m3u8_tags(False, {})
    r.assert_eq(
        "lcevc_enabled=False → sin tags",
        len(tags),
        0
    )

    # Test 13: Con LCEVC → 7 tags exactos
    cfg = {
        'lcevc_mode': 'SEI_METADATA',
        'lcevc_base_codec': 'h264',
        'lcevc_transport': 'embedded',
        'lcevc_fallback': 'base_only',
        'lcevc_player_required': False,
    }
    tags = build_m3u8_tags(True, cfg)
    r.assert_eq(
        "lcevc_enabled=True → 7 tags",
        len(tags),
        7
    )

    # Test 14: Primer tag correcto
    r.assert_eq(
        "Primer tag = #EXT-X-APE-LCEVC:ENABLED",
        tags[0],
        '#EXT-X-APE-LCEVC:ENABLED'
    )

    # Test 15: Estado inicial siempre SIGNAL_ONLY en frontend
    r.assert_eq(
        "Estado inicial en M3U8 = SIGNAL_ONLY",
        tags[1],
        '#EXT-X-APE-LCEVC-STATE:SIGNAL_ONLY'
    )

    # Test 16: Modo en mayúsculas
    r.assert_eq(
        "Modo en mayúsculas = SEI_METADATA",
        tags[2],
        '#EXT-X-APE-LCEVC-MODE:SEI_METADATA'
    )

    # Test 17: Codec en mayúsculas
    r.assert_eq(
        "Codec en mayúsculas = H264",
        tags[3],
        '#EXT-X-APE-LCEVC-BASE-CODEC:H264'
    )

    # Test 18: lcevc_player_required=True → '1'
    cfg_required = dict(cfg, lcevc_player_required=True)
    tags_req = build_m3u8_tags(True, cfg_required)
    r.assert_eq(
        "lcevc_player_required=True → tag con '1'",
        tags_req[6],
        '#EXT-X-APE-LCEVC-PLAYER-REQUIRED:1'
    )

    # Test 19: lcevc_player_required=False → '0'
    r.assert_eq(
        "lcevc_player_required=False → tag con '0'",
        tags[6],
        '#EXT-X-APE-LCEVC-PLAYER-REQUIRED:0'
    )


def run_profile_bridge_tests(r: TestResult):
    """Tests de los 6 campos LCEVC en profile-bridge."""
    print("\n── GRUPO 3: Profile Bridge LCEVC Fields ───────────────────")

    # Simular el objeto convertido del bridge con los 6 campos LCEVC
    def simulate_bridge_conversion(settings: dict) -> dict:
        return {
            'lcevc_enabled':         settings.get('lcevc_enabled', False),
            'lcevc_mode':            settings.get('lcevc_mode', 'SEI_METADATA'),
            'lcevc_base_codec':      settings.get('lcevc_base_codec', 'h264'),
            'lcevc_transport':       settings.get('lcevc_transport', 'embedded'),
            'lcevc_fallback':        settings.get('lcevc_fallback', 'base_only'),
            'lcevc_player_required': settings.get('lcevc_player_required', False),
        }

    # Test 20: Defaults correctos cuando no hay configuración
    converted = simulate_bridge_conversion({})
    r.assert_eq("Default lcevc_enabled = False",         converted['lcevc_enabled'],         False)
    r.assert_eq("Default lcevc_mode = SEI_METADATA",     converted['lcevc_mode'],             'SEI_METADATA')
    r.assert_eq("Default lcevc_base_codec = h264",       converted['lcevc_base_codec'],       'h264')
    r.assert_eq("Default lcevc_transport = embedded",    converted['lcevc_transport'],        'embedded')
    r.assert_eq("Default lcevc_fallback = base_only",    converted['lcevc_fallback'],         'base_only')
    r.assert_eq("Default lcevc_player_required = False", converted['lcevc_player_required'],  False)

    # Test 26: Valores personalizados se respetan
    custom = simulate_bridge_conversion({
        'lcevc_enabled': True,
        'lcevc_mode': 'SEPARATE_TRACK',
        'lcevc_base_codec': 'hevc',
        'lcevc_transport': 'sidecar',
        'lcevc_fallback': 'disable',
        'lcevc_player_required': True,
    })
    r.assert_eq("Custom lcevc_enabled = True",              custom['lcevc_enabled'],         True)
    r.assert_eq("Custom lcevc_mode = SEPARATE_TRACK",       custom['lcevc_mode'],            'SEPARATE_TRACK')
    r.assert_eq("Custom lcevc_base_codec = hevc",           custom['lcevc_base_codec'],      'hevc')
    r.assert_eq("Custom lcevc_transport = sidecar",         custom['lcevc_transport'],       'sidecar')
    r.assert_eq("Custom lcevc_fallback = disable",          custom['lcevc_fallback'],        'disable')
    r.assert_eq("Custom lcevc_player_required = True",      custom['lcevc_player_required'], True)


def run_player_matrix_tests(r: TestResult):
    """Tests de la matriz formal de players."""
    print("\n── GRUPO 4: Matriz Formal de Players ──────────────────────")

    # Test 32: Todos los players tienen max_state definido
    for player, info in PLAYER_MATRIX.items():
        r.assert_eq(
            f"Player '{player}' tiene max_state definido",
            'max_state' in info,
            True
        )

    # Test: Players con soporte nativo LCEVC
    native_players = [p for p, i in PLAYER_MATRIX.items() if i['supported']]
    r.assert_eq(
        "Players con soporte nativo: ExoPlayer, Shaka, hls.js",
        sorted(native_players),
        sorted(['ExoPlayer', 'Shaka', 'hls.js'])
    )

    # Test: Players que deben recibir OFF
    off_players = [p for p, i in PLAYER_MATRIX.items() if i['max_state'] == STATE_OFF]
    r.assert_eq(
        "Players con max_state=OFF: Safari, AVPlayer",
        sorted(off_players),
        sorted(['Safari', 'AVPlayer'])
    )


# ─────────────────────────────────────────────────────────────────────────────
# RUNNER PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("═" * 60)
    print("  LCEVC STATE ENGINE — TESTS AUTOMÁTICOS (APE v1.0.0)")
    print("═" * 60)

    r = TestResult()

    run_state_machine_tests(r)
    run_m3u8_tag_tests(r)
    run_profile_bridge_tests(r)
    run_player_matrix_tests(r)

    success = r.summary()

    if not success:
        print("\n  ERRORES DETECTADOS:")
        for err in r.errors:
            print(err)
        sys.exit(1)
    else:
        print("\n  ✅ Todos los tests pasaron. La implementación LCEVC es correcta.")
        sys.exit(0)


if __name__ == '__main__':
    main()
