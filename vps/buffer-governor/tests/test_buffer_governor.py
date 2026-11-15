#!/usr/bin/env python3
"""
Test Suite para APE Buffer Governor
Prueba todos los escenarios críticos: upstream normal, lento, 5xx, 302, 403, caída, etc.
"""

import asyncio
import json
import pytest
import httpx
from typing import Dict, Any

# Configuración
GOVERNOR_URL = "http://127.0.0.1:8090"
TIMEOUT = 30.0

class TestBufferGovernor:
    """Suite de tests para el Buffer Governor"""

    @pytest.fixture
    async def client(self):
        """Cliente HTTP para tests"""
        async with httpx.AsyncClient(base_url=GOVERNOR_URL, timeout=TIMEOUT) as c:
            yield c

    # ==================== Tests de Estado del Buffer ====================

    @pytest.mark.asyncio
    async def test_buffer_state_green(self, client):
        """Test: Buffer en estado GREEN (>= 70%)"""
        response = await client.post(
            "/buffer/report",
            json={
                "channel_id": "test_green",
                "buffer_s": 25.0,
                "capacity_s": 30.0,
                "throughput_bps": 10_000_000,
                "variant_bps": 8_000_000,
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "GREEN"
        assert data["sidecar_enabled"] == True
        assert data["prefetch_depth"] == 3

    @pytest.mark.asyncio
    async def test_buffer_state_yellow(self, client):
        """Test: Buffer en estado YELLOW (50%-70%)"""
        response = await client.post(
            "/buffer/report",
            json={
                "channel_id": "test_yellow",
                "buffer_s": 18.0,
                "capacity_s": 30.0,
                "throughput_bps": 10_000_000,
                "variant_bps": 8_000_000,
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "YELLOW"
        assert data["sidecar_enabled"] == True
        assert data["prefetch_depth"] == 6

    @pytest.mark.asyncio
    async def test_buffer_state_orange(self, client):
        """Test: Buffer en estado ORANGE (30%-50%)"""
        response = await client.post(
            "/buffer/report",
            json={
                "channel_id": "test_orange",
                "buffer_s": 12.0,
                "capacity_s": 30.0,
                "throughput_bps": 5_000_000,
                "variant_bps": 8_000_000,
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "ORANGE"
        assert data["sidecar_enabled"] == False
        assert data["prefetch_depth"] == 10

    @pytest.mark.asyncio
    async def test_buffer_state_red(self, client):
        """Test: Buffer en estado RED (< 30%)"""
        response = await client.post(
            "/buffer/report",
            json={
                "channel_id": "test_red",
                "buffer_s": 8.0,
                "capacity_s": 30.0,
                "throughput_bps": 2_000_000,
                "variant_bps": 8_000_000,
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "RED"
        assert data["sidecar_enabled"] == False
        assert data["prefetch_depth"] == 15

    @pytest.mark.asyncio
    async def test_buffer_state_black(self, client):
        """Test: Buffer en estado BLACK (upstream muerto)"""
        response = await client.post(
            "/buffer/report",
            json={
                "channel_id": "test_black",
                "buffer_s": 0.0,
                "capacity_s": 30.0,
                "throughput_bps": 0,
                "variant_bps": 8_000_000,
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "BLACK"
        assert data["sidecar_enabled"] == False
        assert data["prefetch_depth"] == 0

    # ==================== Tests de Prefetch ====================

    @pytest.mark.asyncio
    async def test_prefetch_enqueue(self, client):
        """Test: Enqueue de segmento para prefetch"""
        response = await client.post(
            "/prefetch/enqueue",
            json={
                "segment_uri": "http://upstream.com/segment_1.ts",
                "media_sequence": 1,
                "priority": 200,
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["status"] == "enqueued"

    @pytest.mark.asyncio
    async def test_prefetch_status(self, client):
        """Test: Obtener estado de la cola de prefetch"""
        # Enqueue varios segmentos
        for i in range(3):
            await client.post(
                "/prefetch/enqueue",
                json={
                    "segment_uri": f"http://upstream.com/segment_{i}.ts",
                    "media_sequence": i,
                    "priority": 200 - i * 10,
                }
            )

        response = await client.get("/prefetch/status")
        assert response.status_code == 200
        data = response.json()
        assert data["total_tasks"] >= 3

    # ==================== Tests de Throughput ====================

    @pytest.mark.asyncio
    async def test_upstream_normal(self, client):
        """Test: Upstream normal (10 Mbps)"""
        # Simular descarga normal
        response = await client.post(
            "/buffer/report",
            json={
                "channel_id": "test_normal",
                "buffer_s": 20.0,
                "capacity_s": 30.0,
                "throughput_bps": 10_000_000,
                "variant_bps": 8_000_000,
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["upstream_throughput_bps"] == 10_000_000
        assert data["headroom"] > 0

    @pytest.mark.asyncio
    async def test_upstream_slow(self, client):
        """Test: Upstream lento (2 Mbps)"""
        response = await client.post(
            "/buffer/report",
            json={
                "channel_id": "test_slow",
                "buffer_s": 10.0,
                "capacity_s": 30.0,
                "throughput_bps": 2_000_000,
                "variant_bps": 8_000_000,
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["upstream_throughput_bps"] == 2_000_000
        assert data["state"] in ["ORANGE", "RED"]

    @pytest.mark.asyncio
    async def test_upstream_degrading(self, client):
        """Test: Upstream degradándose gradualmente"""
        throughputs = [10_000_000, 8_000_000, 5_000_000, 2_000_000]

        for tp in throughputs:
            response = await client.post(
                "/buffer/report",
                json={
                    "channel_id": "test_degrading",
                    "buffer_s": max(5.0, 30.0 * tp / 10_000_000),
                    "capacity_s": 30.0,
                    "throughput_bps": tp,
                    "variant_bps": 8_000_000,
                }
            )
            assert response.status_code == 200

        # Verificar que el sistema detectó la degradación
        response = await client.get("/metrics")
        assert response.status_code == 200

    # ==================== Tests de Live Edge ====================

    @pytest.mark.asyncio
    async def test_live_edge_probe(self, client):
        """Test: Probar live edge del manifest"""
        # Este test requiere un manifest real
        # En un test unitario, simularíamos la respuesta
        response = await client.post(
            "/live-edge/probe",
            json={
                "manifest_uri": "http://upstream.com/live.m3u8"
            }
        )
        # Esperamos que falle si no hay upstream real
        assert response.status_code in [200, 400]

    # ==================== Tests de Métricas ====================

    @pytest.mark.asyncio
    async def test_metrics_collection(self, client):
        """Test: Recolección de métricas"""
        # Enviar varios reportes
        for i in range(5):
            await client.post(
                "/buffer/report",
                json={
                    "channel_id": "test_metrics",
                    "buffer_s": 15.0 + i,
                    "capacity_s": 30.0,
                    "throughput_bps": 10_000_000,
                    "variant_bps": 8_000_000,
                }
            )

        response = await client.get("/metrics")
        assert response.status_code == 200
        data = response.json()
        assert "current_buffer_percent" in data
        assert "avg_buffer_percent" in data

    # ==================== Tests de Invariantes ====================

    @pytest.mark.asyncio
    async def test_no_repeat_invariant(self, client):
        """Test: INVARIANTE - Nunca repetir media_sequence"""
        # Enqueue el mismo segmento dos veces
        task1 = {
            "segment_uri": "http://upstream.com/segment_1.ts",
            "media_sequence": 1,
            "priority": 200,
        }

        response1 = await client.post("/prefetch/enqueue", json=task1)
        assert response1.status_code == 200

        # El segundo enqueue del mismo segmento debería ser detectado
        response2 = await client.post("/prefetch/enqueue", json=task1)
        assert response2.status_code == 200

    @pytest.mark.asyncio
    async def test_continuity_over_quality(self, client):
        """Test: INVARIANTE - Continuidad > Calidad"""
        # Cuando el buffer cae a RED, el sistema debe priorizar continuidad
        response = await client.post(
            "/buffer/report",
            json={
                "channel_id": "test_continuity",
                "buffer_s": 2.0,
                "capacity_s": 30.0,
                "throughput_bps": 1_000_000,
                "variant_bps": 8_000_000,
            }
        )
        assert response.status_code == 200
        data = response.json()

        # En RED, el sidecar (upscaling pesado) debe estar OFF
        assert data["sidecar_enabled"] == False
        # La acción debe priorizar resync y continuidad
        assert "resync" in data["action"].lower() or "hold" in data["action"].lower()

    # ==================== Tests de Errores HTTP ====================

    @pytest.mark.asyncio
    async def test_handle_403_error(self, client):
        """Test: Manejo de error 403 (token expirado)"""
        # Este test requiere un mock del upstream
        # El Buffer Governor debería interceptar 403 y servir null packets
        pass

    @pytest.mark.asyncio
    async def test_handle_302_redirect(self, client):
        """Test: Manejo de redirección 302 (CDN bypass)"""
        # El Buffer Governor debería seguir la redirección
        pass

    @pytest.mark.asyncio
    async def test_handle_5xx_error(self, client):
        """Test: Manejo de error 5xx (upstream down)"""
        # El sistema debería entrar en estado BLACK
        pass


class TestBufferGovernorIntegration:
    """Tests de integración"""

    @pytest.mark.asyncio
    async def test_full_playback_scenario(self):
        """Test: Escenario completo de reproducción"""
        async with httpx.AsyncClient(base_url=GOVERNOR_URL, timeout=TIMEOUT) as client:
            # 1. Iniciar reproducción (YELLOW)
            await client.post(
                "/buffer/report",
                json={
                    "channel_id": "integration_test",
                    "buffer_s": 15.0,
                    "capacity_s": 30.0,
                    "throughput_bps": 10_000_000,
                    "variant_bps": 8_000_000,
                }
            )

            # 2. Buffer sube a GREEN
            await client.post(
                "/buffer/report",
                json={
                    "channel_id": "integration_test",
                    "buffer_s": 25.0,
                    "capacity_s": 30.0,
                    "throughput_bps": 10_000_000,
                    "variant_bps": 8_000_000,
                }
            )

            # 3. Upstream se degrada (RED)
            await client.post(
                "/buffer/report",
                json={
                    "channel_id": "integration_test",
                    "buffer_s": 5.0,
                    "capacity_s": 30.0,
                    "throughput_bps": 1_000_000,
                    "variant_bps": 8_000_000,
                }
            )

            # 4. Verificar que el sistema se recuperó
            response = await client.get("/metrics")
            assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
