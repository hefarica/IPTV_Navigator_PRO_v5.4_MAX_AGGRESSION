#!/usr/bin/env python3
"""Pruebas acotadas de preservación para auditar_y_ampliar.py.

No usa red, no invoca motores de reproducción/transcodificación y no modifica
el script bajo prueba ni el catálogo original.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock


SCRIPT = Path(__file__).with_name("auditar_y_ampliar.py")
_SPEC = importlib.util.spec_from_file_location("auditar_y_ampliar_under_test", SCRIPT)
if _SPEC is None or _SPEC.loader is None:  # pragma: no cover - error de entorno
    raise ImportError(f"No se pudo cargar {SCRIPT}")
ape = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(ape)


class PreservacionTests(unittest.TestCase):
    """Regresiones de bajo volumen para el flujo metadata-only."""

    URL = (
        "https://cdn.example.test/live/master.m3u8?token=a%2Bb%26c"
        "&metadata=opaque%7Bexact%7D|User-Agent=APE%2Ftest"
    )
    STREAM_INF = "#EXT-X-STREAM-INF:BANDWIDTH=987654,RESOLUTION=1920x1080,CODECS=\"avc1.640028\"\n"
    FFMPEG_CHAIN = "scale=w=3840:h=2160:flags=lanczos,format=p010le"

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="ape-preservacion-")
        self.root = Path(self.tmp.name)
        self.source = self.root / "entrada.m3u8"
        self.target = self.root / "salida.m3u8"
        self.source_text = self._manifest()
        self.source.write_text(self.source_text, encoding="utf-8", newline="")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _manifest(self) -> str:
        rea = {
            "targetResolution": None,
            "profile": "P0.5",
            "legacyUnknown": "must-survive",
            "nestedUnknown": {"keep": [1, 2, 3]},
        }
        return "".join(
            [
                '#EXTM3U x-tvg-url="" x-tvg-logo=""\n',
                "#EXT-X-VERSION:9\n",
                "#EXT-X-INDEPENDENT-SEGMENTS\n",
                "#EXT-X-APE-LAB-EXTRAS:1\n",
                "#EXTINF:-1 tvg-id=\"small-001\" ape-profile=\"P0.5\",Canal pequeño\n",
                "#EXT-X-APE-REA:" + json.dumps(rea, ensure_ascii=False, separators=(",", ":")) + "\n",
                "#EXT-X-APE-UPSCALE:REQUESTED;TARGET=1920x1080;EXECUTED=0\n",
                self.STREAM_INF,
                "#EXTVLCOPT:video-filter=" + self.FFMPEG_CHAIN + "\n",
                self.URL + "\n",
            ]
        )

    @staticmethod
    def _uri_lines(text: str) -> list[str]:
        return [line for line in text.splitlines() if line and not line.startswith("#")]

    @staticmethod
    def _channel_block(path: Path) -> list[str]:
        return next(block for block in ape.blocks(path) if block and block[0].startswith("#EXTINF:"))

    def test_patch_block_es_idempotente_incluida_cabecera_y_canal(self) -> None:
        """Aplicar dos veces no duplica tags ni cambia bytes del resultado."""
        first_pass = [ape.patch_block(block) for block in ape.blocks(self.source)]
        second_pass = [ape.patch_block(block) for block in first_pass]
        self.assertEqual(first_pass, second_pass)

        rendered = "".join(line for block in first_pass for line in block)
        self.assertEqual(rendered.count(ape.OUTPUT_TAG), 1)
        self.assertEqual(rendered.count(ape.PREMIUM_TAG), 1)

    def test_patch_exige_destino_distinto_y_preserva_atomicidad_ante_fallo(self) -> None:
        """No sobrescribe la entrada y conserva un destino previo si falla a mitad."""
        original_bytes = self.source.read_bytes()
        with self.assertRaises(ValueError):
            ape.patch(self.source, self.source)
        self.assertEqual(self.source.read_bytes(), original_bytes)

        sentinel = "DESTINO PREVIO INTACTO\n"
        self.target.write_text(sentinel, encoding="utf-8", newline="")
        existing_temp_files = set(self.root.glob(".ape-*.tmp"))
        real_blocks = list(ape.blocks(self.source))

        def fail_after_one_block(_path):
            yield real_blocks[0]
            raise OSError("fallo simulado antes de os.replace")

        with mock.patch.object(ape, "blocks", side_effect=fail_after_one_block):
            with self.assertRaises(OSError):
                ape.patch(self.source, self.target)

        self.assertEqual(self.target.read_text(encoding="utf-8"), sentinel)
        self.assertEqual(set(self.root.glob(".ape-*.tmp")), existing_temp_files)

    def test_patch_a_destino_diferente_conserva_urls_exactas(self) -> None:
        """La salida existe, la entrada no cambia y la secuencia URL es byte-exacta."""
        original_bytes = self.source.read_bytes()
        original_urls = self._uri_lines(self.source_text)

        ape.patch(self.source, self.target)

        self.assertTrue(self.target.is_file())
        self.assertEqual(self.source.read_bytes(), original_bytes)
        output_text = self.target.read_text(encoding="utf-8")
        self.assertEqual(self._uri_lines(output_text), original_urls)
        self.assertEqual(ape.audit(self.source)["uri_sequence_sha256"], ape.audit(self.target)["uri_sequence_sha256"])
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)

    def test_policy_contiene_los_doce_perfiles_y_las_dos_variantes_no_ejecutadas(self) -> None:
        document = ape.policy()
        self.assertEqual(len(ape.PROFILES), 12)
        self.assertEqual(set(document["profiles"]), set(ape.PROFILES))

        for profile in ape.PROFILES:
            profile_data = document["profiles"][profile]
            self.assertEqual(profile_data["inherit_existing_profile"], profile)
            self.assertEqual(
                set(profile_data["variants"]),
                {"standard_4k", "premium_6k_simulated"},
            )
            self.assertFalse(profile_data["variants"]["standard_4k"]["executed"])
            self.assertFalse(profile_data["variants"]["premium_6k_simulated"]["executed"])
            self.assertFalse(profile_data["variants"]["standard_4k"]["native_quality_claim"])
            self.assertFalse(profile_data["variants"]["premium_6k_simulated"]["native_quality_claim"])

        self.assertEqual(document["common"]["floor_lock"]["state"], "not_executed")
        self.assertFalse(document["common"]["hdr_intent"]["dolby_vision_synthesis"])
        self.assertEqual(document["common"]["hdr_intent"]["sdr_to_hdr"], "disabled_by_default")

    def test_salida_no_forja_execution_source_verified_ni_hdr(self) -> None:
        ape.patch(self.source, self.target)
        output_text = self.target.read_text(encoding="utf-8")
        stats = ape.audit(self.target)

        self.assertEqual(stats["source_resolution_verified"], 0)
        self.assertEqual(stats["source_codec_verified"], 0)
        self.assertEqual(stats["source_hdr_verified"], 0)
        self.assertNotIn("SOURCE_VERIFIED=1", output_text)
        self.assertNotIn("EXECUTED=1", output_text)
        self.assertNotIn("#EXT-X-APE-RESOLUTION-VERIFIED:true", output_text)
        self.assertNotIn("#EXT-X-APE-CODEC-VERIFIED:true", output_text)
        self.assertNotIn("#EXT-X-APE-HDR-VERIFIED:true", output_text)
        self.assertIn("SOURCE_VERIFIED=0;EXECUTED=0", output_text)
        self.assertIn("NATIVE_CLAIM=0;EXECUTED=0", output_text)

    def test_rea_preserva_campos_desconocidos(self) -> None:
        result = ape.patch_block(self._channel_block(self.source))
        rea_line = next(line for line in result if line.startswith("#EXT-X-APE-REA:"))
        rea = json.loads(rea_line.split(":", 1)[1])

        self.assertEqual(rea["legacyUnknown"], "must-survive")
        self.assertEqual(rea["nestedUnknown"], {"keep": [1, 2, 3]})
        self.assertEqual(rea["profile"], "P0.5")
        self.assertEqual(rea["status"], "requested_only")
        self.assertEqual(rea["execution"], "not_verified")
        self.assertFalse(rea["outputPolicy"]["executed"])
        self.assertFalse(rea["outputPolicy"]["nativeResolutionClaim"])

    def test_stream_inf_es_reversible_y_cadena_ffmpeg_va_a_metadata(self) -> None:
        result = ape.patch_block(self._channel_block(self.source))
        rendered = "".join(result)

        unverified_prefix = "#EXT-X-APE-AUDIT-UNVERIFIED-STREAM-INF:"
        moved_stream = next(line for line in result if line.startswith(unverified_prefix))
        restored_stream = moved_stream.replace(unverified_prefix, "#EXT-X-STREAM-INF:", 1)
        self.assertEqual(restored_stream, self.STREAM_INF)
        self.assertNotIn(self.STREAM_INF, rendered)

        ffmpeg_metadata = "#EXT-X-APE-FFMPEG-FILTER-REQUEST:" + self.FFMPEG_CHAIN + "\n"
        self.assertIn(ffmpeg_metadata, rendered)
        self.assertNotIn("#EXTVLCOPT:video-filter=" + self.FFMPEG_CHAIN, rendered)

    def test_audit_lee_m3u_generico_sin_perfiles(self) -> None:
        generic = self.root / "generico.m3u"
        generic_text = "#EXTM3U\n#EXTINF:-1,Genérico\nhttps://example.test/live.m3u8\n"
        generic.write_text(generic_text, encoding="utf-8", newline="")

        stats = ape.audit(generic)

        self.assertEqual(stats["channels"], 1)
        self.assertEqual(stats["uris"], 1)
        self.assertEqual(stats["profiles"], {"unknown": 1})
        self.assertEqual(stats["source_resolution_verified"], 0)
        self.assertEqual(stats["source_hdr_verified"], 0)


if __name__ == "__main__":
    unittest.main()
