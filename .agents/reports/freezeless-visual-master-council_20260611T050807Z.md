# Freezeless + Visual Master Council — Veredicto (Piso Main10 + embed council)

- **Timestamp:** 2026-06-11T05:08:07Z
- **Foco:** mandato del usuario — (1) P3 codec `hvc1.1.6`→Main10; (2) piso `hvc1.2.*` (Main10) o superior para TODA resolución, nunca Main 8-bit ni AVC como tier preferido; (3) embeber `/iptv-freezeless-visual-master-council` al 100% en ambas rich-idata skills.
- **Método:** workflow `main10-floor-ladder-council` (11 agentes, 122 tool-uses): Discover (skill+manifiesto+repo) → VerifyLadder (4 tiers adversarial + reconciliación FREEZELESS) → Council (S3, S5, S9, S1 dual-pillar).

## Resultado: ladder Main10 APLICADO con guarda FREEZELESS · 1 decisión pendiente del usuario

### Codec strings — los 4 CONFIRMED contra HEVC Annex A Table A.1

| Tier | Resolución | String | Veredicto | Nivel mínimo que carga tamaño+rate@30 |
|---|---|---|---|---|
| P2 | 4K@30 | `hvc1.2.4.L150.B0` | CONFIRMED | L150 (5.0): 8,294,400 px ≤ 8,912,896; L120 freeze-aría |
| P3 | 1080p@30 | `hvc1.2.4.L120.B0` | CONFIRMED | L120 (4.0): 2,073,600 px ≤ 2,228,224; L93 no cabe |
| P4 | 720p@30 | `hvc1.2.4.L93.B0` | CONFIRMED | L93 (3.1): 921,600 px ≤ 983,040; L90 no cabe |
| P5 | 480p@30 | `hvc1.2.4.L90.B0` | CONFIRMED | L90 (3.0): 409,920 px ≤ 552,960; L63 no cabe |

P0 `dvh1.08.06` (Dolby Vision) y P1 `av01.0.15M.10` (AV1 10-bit) se preservan como **más avanzados** que Main10. Ningún tier declara nivel por debajo de su resolución+fps → **no se repite la clase de freeze 2026-06-08**.

### Veredictos dual-pillar

| PhD | FREEZELESS | VISUAL | Núcleo |
|---|---|---|---|
| S3 Video Codec | WARN | PASS | Strings codec-correctos + GOLDEN RULE limpia; WARN solo por quitar el piso AVC en tiers bajos |
| S5 QoE/Freeze | **BLOCK** | WARN | Piso Main10 10-bit sin fallback AVC = pantalla negra en devices 8-bit-only → channel loss |
| S9 Player Compat | **BLOCK** | WARN | Amlogic S905 viejo, MTK entry, FireStick gen1-2, Tizen ≤2016 = HEVC Main(8-bit)-only → decoder-init reject en 480p/720p |
| S1 IPTV/HLS | WARN | WARN | Embed 100% verbatim OK + single-URL/RFC8216 intacto; pidió wire del gate en SKILL.md (resuelto) |

### Reconciliación aplicada (BLOCK→PASS)

El BLOCK no era contra Main10 — era contra **Main10 SIN red de seguridad**. La discovery confirmó que **producción ya resuelve esto**: ladder Main10 (`HEVC_CASCADE_HVC1 = hvc1.2.4.L186…L90`) + rung terminal `avc1.640028` solo como decoder-incompat fallback (~75% compliant, "Main10 floor enforced at emission"). Apliqué la misma reconciliación a la doctrina de la skill:

1. **Ladder = Main10** (`hvc1.2.4.L*`) como tier PREFERIDO en toda resolución; nunca `hvc1.1.*` ni AVC como preferido.
2. **Rung terminal AVC** de decoder-incompatibilidad conservado como red NO-ladder (invisible salvo que el device no pueda Main10) — honra NO CHANNEL LOSS.
3. **PREFERRED-not-verified:** Main10 sin probe → `#EXT-X-APE-CODEC-PREFERRED`, nunca `-REAL` (anti player-breaking lie).
4. **Coherencia triple:** el cambio fluye LAB→JSON→lista, no hardcode.

## Cambios aplicados

- `references/omega_working_flow_doctrine.md` — ladder reescrito a piso Main10 (P2-P5) + sección "Guarda FREEZELESS obligatoria"; P0/P1 intactos; post-mortem sin duplicar.
- `references/classification_matrix.md` — fila HEVC: piso Main10 + rung AVC de seguridad + PREFERRED-not-verified.
- `references/iptv-freezeless-visual-master-council.md` (NUEVO, ambas skills) — comando council **100% verbatim** + cola adaptada por skill.
- `SKILL.md` (ambas) — sección "Council enforcement (OBLIGATORIO — embebido al 100%)" que nombra el archivo embebido y manda auto-auditar dual-pillar antes de entregar (resuelve el BLOCK de S1 sobre doctrina dormida).

## Decisión abierta para el usuario (council protocol → AskUserQuestion)

El usuario dijo "never AVC". El council mantiene un rung AVC **solo como red de seguridad de decoder-incompatibilidad** (no como tier de calidad). Se pregunta al usuario si conservar esa red (recomendado, cero channel loss) o ir a piso Main10 desnudo (máxima pureza, freeze en devices 8-bit-only legacy).

**Exit code: 1 (PASS con guarda aplicada; 1 fork de política pendiente de confirmación).**
