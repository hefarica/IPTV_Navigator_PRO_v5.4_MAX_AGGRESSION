#!/usr/bin/env python3
"""
Sandbox static tests for ConvivaQoEServer Phase 2.

Gate 3 SANDBOX SAFETY:
  - Read-only file analysis · NO PHP execution
  - NO SQLite writes (would require PHP runtime + sqlite ext)
  - NO /dev/shm writes (would require Linux)
  - Validates STRUCTURE + INVARIANTS via grep/regex + JSON schema

Run:
  cd <repo_root>
  python3 -m pytest IPTV_v5.4_MAX_AGGRESSION/vps/prisma/tests/test_conviva_phase2_static.py -v
"""
import json
import os
import re
import unittest

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
PRISMA   = os.path.dirname(THIS_DIR)                   # vps/prisma
LIB      = os.path.join(PRISMA, 'lib')
API      = os.path.join(PRISMA, 'api')


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


class TestConvivaEventEndpoint(unittest.TestCase):

    def setUp(self):
        self.path = os.path.join(API, 'conviva-event.php')
        self.src = read(self.path)

    def test_file_exists(self):
        self.assertTrue(os.path.exists(self.path))

    def test_method_guard_post_only(self):
        self.assertIn("'POST'", self.src)
        self.assertIn('http_response_code(405)', self.src)

    def test_requires_qoe_server(self):
        self.assertIn("require_once __DIR__ . '/../lib/conviva_qoe_server.php'", self.src)

    def test_calls_validate_then_dispatch(self):
        # validateEvent CALL must come before dispatch CALL (correct flow order).
        # Skip PHP comment lines (// and * ) to avoid matching docstring mentions.
        non_comment_lines = []
        for i, line in enumerate(self.src.splitlines()):
            stripped = line.lstrip()
            if stripped.startswith('//') or stripped.startswith('*') or stripped.startswith('/*'):
                continue
            non_comment_lines.append((i, line))
        body = '\n'.join(l for _, l in non_comment_lines)
        v_call = re.search(r'ConvivaQoEServer::validateEvent\s*\(', body)
        d_call = re.search(r'ConvivaQoEServer::dispatch\s*\(', body)
        self.assertIsNotNone(v_call, 'validateEvent call not found in code (non-comment)')
        self.assertIsNotNone(d_call, 'dispatch call not found in code (non-comment)')
        self.assertLess(v_call.start(), d_call.start(),
                        'validateEvent() must be called before dispatch()')

    def test_handles_empty_body(self):
        self.assertIn("empty_body", self.src)

    def test_handles_invalid_json(self):
        self.assertIn("invalid_json", self.src)

    def test_response_contentType(self):
        self.assertIn("'Content-Type: application/json", self.src)

    def test_exception_returns_500(self):
        self.assertIn('http_response_code(500)', self.src)
        self.assertIn("'server_error'", self.src)


class TestConvivaQoEServer(unittest.TestCase):

    def setUp(self):
        self.path = os.path.join(LIB, 'conviva_qoe_server.php')
        self.src = read(self.path)

    def test_file_exists(self):
        self.assertTrue(os.path.exists(self.path))

    def test_version_phase2(self):
        self.assertIn("VERSION = '1.1.0-phase2'", self.src)

    def test_imports_persistence(self):
        self.assertIn("require_once __DIR__ . '/conviva_persistence.php'", self.src)

    def test_validate_event_signature(self):
        self.assertIn('public static function validateEvent(array $event): array', self.src)

    def test_dispatch_signature(self):
        self.assertIn('public static function dispatch(string $sessionId, array $event): array', self.src)

    def test_dispatch_calls_persistence(self):
        # Phase 2 wire: dispatch must invoke persistence
        self.assertIn('getPersistence()->persist(', self.src)

    def test_persistence_silent_fail_safe(self):
        # Catch + log but do NOT abort dispatch
        self.assertIn('catch (Throwable $e)', self.src)
        self.assertIn('non-fatal', self.src)

    def test_decision_engine_5_triggers(self):
        # Paridad con cliente JS
        for trigger in [
            'FORCE_SURVIVAL_MODE',
            'DEGRADE_QUALITY',
            'REDUCE_DECODER_LOAD',
            'PRELOAD_NEXT_CHANNEL',
            'PROMOTE_QUALITY',
            'NO_ACTION',
        ]:
            self.assertIn(trigger, self.src, f'Missing decision branch: {trigger}')

    def test_thresholds_paridad_with_client(self):
        self.assertIn('RBR_SURVIVAL_THRESHOLD   = 0.02', self.src)
        self.assertIn('QOE_DEGRADE_THRESHOLD    = 50', self.src)
        self.assertIn('FDR_REDUCE_LOAD_THRESHOLD = 5', self.src)
        self.assertIn('VST_PRELOAD_THRESHOLD_MS = 3000', self.src)
        self.assertIn('QOE_PROMOTE_THRESHOLD    = 80', self.src)

    def test_setPersistence_di_method(self):
        # DI hook for tests
        self.assertIn('public static function setPersistence(?ConvivaPersistence $p): void', self.src)

    def test_event_types_complete(self):
        for et in [
            'first_frame', 'rebuffer_start', 'rebuffer_end',
            'bitrate_change', 'frame_drop', 'quality_change',
            'error', 'end_session',
        ]:
            self.assertIn(f"'{et}'", self.src)


class TestConvivaPersistence(unittest.TestCase):

    def setUp(self):
        self.path = os.path.join(LIB, 'conviva_persistence.php')
        self.src = read(self.path)

    def test_file_exists(self):
        self.assertTrue(os.path.exists(self.path))

    def test_version_phase2(self):
        self.assertIn("VERSION = '1.0.0-phase2'", self.src)

    def test_default_paths(self):
        self.assertIn("DEFAULT_DB_PATH      = '/opt/netshield/data/conviva.db'", self.src)
        self.assertIn("DEFAULT_BUFFER_PATH  = '/dev/shm/conviva-events.log'", self.src)

    def test_constructor_supports_injection(self):
        # Test injection via ctor for sandbox-safe testing
        self.assertIn('public function __construct(', self.src)
        self.assertIn('?string $dbPath = null', self.src)
        self.assertIn('?string $bufferPath = null', self.src)

    def test_init_idempotent_create_table(self):
        self.assertIn('CREATE TABLE IF NOT EXISTS conviva_events', self.src)
        self.assertIn('CREATE INDEX IF NOT EXISTS', self.src)

    def test_sqlite_wal_mode(self):
        self.assertIn("PRAGMA journal_mode=WAL", self.src)

    def test_persist_dual_channel(self):
        self.assertIn("writeSqlite(", self.src)
        self.assertIn("writeBuffer(", self.src)

    def test_buffer_rotation(self):
        self.assertIn("rotateBufferLocked(", self.src)
        self.assertIn("ftruncate(", self.src)

    def test_chmod_644_per_doctrine(self):
        # Per feedback_dev_shm_permissions_nginx_worker
        self.assertIn("chmod($this->bufferPath, 0644)", self.src)

    def test_lock_ex_for_concurrent_writes(self):
        self.assertIn("flock($fh, LOCK_EX)", self.src)

    def test_silent_fail_safe(self):
        # All public methods catch Throwable + log
        for method in ['writeSqlite', 'writeBuffer', 'readRecent', 'readBufferTail']:
            self.assertIn(f"private function {method}", self.src + ' ') if method.startswith('write') else self.assertIn(f"public function {method}", self.src)
        # Throwable catch present
        self.assertGreater(self.src.count('catch (Throwable $e)'), 3)

    def test_read_methods_exist_for_phase3(self):
        # Phase 3 WebSocket bridge will use these
        self.assertIn('public function readRecent(', self.src)
        self.assertIn('public function readBufferTail(', self.src)


class TestConvivaEventSchema(unittest.TestCase):

    def setUp(self):
        self.path = os.path.join(LIB, 'conviva_event_schema.json')
        with open(self.path, encoding='utf-8') as f:
            self.schema = json.load(f)

    def test_file_exists(self):
        self.assertTrue(os.path.exists(self.path))

    def test_json_schema_draft_2020_12(self):
        self.assertEqual(self.schema.get('$schema'),
                         'https://json-schema.org/draft/2020-12/schema')

    def test_version_field_required(self):
        self.assertIn('version', self.schema['required'])

    def test_required_fields_complete(self):
        for f in ['version', 'session_id', 'device_id', 'player',
                  'channel', 'event_type', 'timestamp_ms']:
            self.assertIn(f, self.schema['required'])

    def test_player_enum_includes_smart_tv_players(self):
        players = self.schema['properties']['player']['enum']
        for p in ['OTT_Navigator', 'TiviMate', 'VLC', 'Kodi', 'ExoPlayer']:
            self.assertIn(p, players)

    def test_event_type_enum_complete(self):
        types = self.schema['properties']['event_type']['enum']
        for t in ['first_frame', 'rebuffer_start', 'rebuffer_end',
                  'frame_drop', 'error', 'end_session']:
            self.assertIn(t, types)

    def test_no_additional_properties_top_level(self):
        self.assertFalse(self.schema.get('additionalProperties', True))


class TestPhase2Integration(unittest.TestCase):
    """Verify that all 3 Phase 2 files are properly linked."""

    def test_api_loads_qoe_server(self):
        api_src = read(os.path.join(API, 'conviva-event.php'))
        self.assertIn('conviva_qoe_server.php', api_src)

    def test_qoe_server_loads_persistence(self):
        qoe_src = read(os.path.join(LIB, 'conviva_qoe_server.php'))
        self.assertIn('conviva_persistence.php', qoe_src)

    def test_persistence_self_contained(self):
        # ConvivaPersistence should not depend on QoE server (avoid circular)
        pers_src = read(os.path.join(LIB, 'conviva_persistence.php'))
        self.assertNotIn("require_once __DIR__ . '/conviva_qoe_server.php'", pers_src)


if __name__ == '__main__':
    unittest.main(verbosity=2)
