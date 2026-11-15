---
name: iptv-profile-fallback-doctrine
description: Use when choosing, auditing or defending the profile of a channel and its degradation chain — separates the three P/T/F axes, resolves the twelve profiles (six canonical plus six emulated 6K), states the only permitted degradation (decoder incapacity, one step, logged) and the prohibited one (real 4K to FHD for stability), and cites the anti-degradation law with its gate.
specialist: S9
kind: anchor
---

# iptv-profile-fallback-doctrine

## 1. Cuándo usarla

- Hay que asignar perfil a un canal y justificarlo.
- Alguien propone "bajar a FHD para que no corte".
- Hay que explicar por qué el operador habla de **12 perfiles** y la lista usa 4.
- Hay que auditar una cadena de fallback o un `PROFILE=` en la lista.

## 2. Cuándo NO usarla

- Para decidir si un "4K" es real → `iptv-real-resolution-verifier`.
- Para la ley de mejora (Crystal) → `docs/policies/CRYSTAL_4K_ENHANCEMENT_LAW.md`.
- Para el resolver F0–F5 del generador (es otro eje, ver §8).

## 3. Los TRES ejes que NO se confunden

Este repo tiene tres escaleras distintas y confundirlas produce decisiones falsas.

| Eje | Símbolo | Qué clasifica | Dónde vive | Cardinalidad medida |
|---|---|---|---|---|
| **Perfil** | `P0`…`P5` (+ `.5`) | resolución/bitrate/fps objetivo del canal | `ape-profiles-config.js` → `DEFAULT_PROFILES` | **6 canónicos + 6 derivados = 12** |
| **Tier** | `T5`…`T9` | etiqueta de nivel dentro del `#EXTHTTP` del canal (`X-APE-Tier`) | cabecera por canal | **5 valores usados** (T5, T6, T7, T8, T9) |
| **Fallback** | `F0`…`F5` | cuánta evidencia tiene el probe y qué codec se declara | `ape-fallback-resolver.js` | 6 niveles de evidencia |

`P` no es `T`, y ninguno de los dos es `F`. La unidad atómica de clasificación es el
**par (Profile, Tier)**; el eje `F` describe la confianza del probe, no la calidad.

## 4. Los 12 perfiles — la respuesta medida

El operador dice "12 perfiles" y tiene razón. Lo que ocurre es que **son 12 filas,
no 12 calidades independientes**:

```
6 canónicos (P0..P5)  +  6 derivados 6K emulados (P0.5..P5.5)  =  12
```

Cada derivado declara su `base_profile` y su modo `emulado`. Evidencia:
`docs/audits/LAB_PROFILES_20261111.md:62-69` (*"P0.5 no es un perfil canónico: es un
derivado 6K"*), `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/vps-image-panel.js:716`
(*"12 perfiles del Gestor (6.750 campos: 6 reales + 6 emulados .5)"*),
`docs/audit/ENTREGA_CADENA_COMPLETA_2026-11-05.md:14`.

### 4.0 Medición directa del artefacto canónico

No hace falta creerle a la documentación: el fichero del LAB lo dice.

```bash
node -e "const j=require('./artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json');
const k=Object.keys(j).find(x=>/profile/i.test(x));
console.log(k, Object.keys(j[k]).length, Object.keys(j[k]).sort().join(','))"
```

Salida medida el 2026-11-15:

```
profiles_calibrated 12 P0,P0.5,P1,P1.5,P2,P2.5,P3,P3.5,P4,P4.5,P5,P5.5
```

**12, medido en el artefacto.** Ahí termina la discusión sobre si son 6 o 12.


### 4.1 Los 6 canónicos (valores leídos del SSOT)

`IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js`

| Perfil | Nombre | `level` | `resolution` | `bitrate` (Mbps) | `fps` | Línea |
|---|---|---|---|---|---|---|
| **P0** | `GOD_TIER_8K_OMEGA` | 6 | 7680×4320 | 80.0 | 60 | 559–575 |
| **P1** | `SUPREME_4K_HDR` | 5 | 3840×2160 | 40.0 | 60 | 1194–1210 |
| **P2** | `ELITE_4K_BALANCED` | 4 | 3840×2160 | 20.0 | 60 | 1828–1844 |
| **P3** | `ULTRA_FHD_STABLE` | 3 | 1920×1080 | 10.0 | 60 | 2322–2338 |
| **P4** | `HIGH_HD_COMPATIBLE` | 2 | 1280×720 | 5.0 | 30 | 2956–2972 |
| **P5** | `SD_FAILSAFE_UNIVERSAL` | 1 | 854×480 | 2.0 | 30 | 3590–3606 |

### 4.2 Los 6 derivados 6K

`P0.5, P1.5, P2.5, P3.5, P4.5, P5.5` — salida declarada **5760×3240**, `base_profile`
= su canónico, `mode: emulado`, técnica de realce declarada (p. ej.
`8k_downsample_lanczos_0.75`). Ley y tabla: `docs/policies/CRYSTAL_6K_MAX_ENHANCEMENT_LAW.md:139-177`.
Son **enhancement de display**, nunca fuente real (misma ley, y `LAB_PROFILES:244`).

### 4.3 Qué usa de verdad la lista servida

| Artefacto | Perfiles usados | Tiers usados | Canales |
|---|---|---|---|
| `docs/cartography/APE_LISTA_523d52a6/01_STRUCTURE.md:427-428` | **3**: P4 7457, P3 2308, P1 808 | **5**: T5 7441, T6 2011, T8 704, T7 297, T9 120 | 10.573 |
| Lista de 21.224 (corte del capitán + `docs/actions/ACCIONES_20261108.md:10`) | **4**: P3 20.222, P1 933, P4 20, P5 5 | 5 | 21.180 de 21.224 |

**Nunca se usa P0 (8K/DV) ni P2** — `docs/audits/AUDIT_APE_LISTA_1794100720046_20261108.md:369`
lo lista como hallazgo H12: "4 de 12 perfiles cubiertos". Los 6 derivados `.5` no se
usan en la lista servida.

**Hueco declarado:** el reparto de 9 pares del corte del capitán suma **21.180**, no
21.224. Quedan **44 canales sin par atribuido**. El artefacto que cierra ese hueco no
está en este entorno → **NO COMPUTADO**, no "cero". No se rellena.

## 5. Cadena de degradación PERMITIDA

Descender de perfil está permitido **en un solo supuesto**: el device **no decodifica**.

```
P0 → P1 → P2 → P3 → P4 → P5      (de a UN escalón por vez)
```

Condiciones acumulativas, todas obligatorias:

1. **Causa = incapacidad del decoder**, medida. No vale "va lento".
   Señales válidas: rechazo de `MediaCodec`, `DECODER_INIT_FAILED`, fallback
   HW→SW de ExoPlayer, `isTypeSupported === false` para el `CODECS=` declarado.
2. **Un escalón**, no un salto. Saltar de P1 a P4 oculta dos fallos.
3. **Se registra** canal, device, perfil origen, perfil destino y la señal medida.
4. **Se preserva el codec** si el device lo decodifica: bajar resolución no autoriza
   bajar HEVC→H.264 (Art. 1).
5. El perfil destino **no puede quedar por debajo de lo que el device reproduce**: si
   el device decodifica 4K, el destino mínimo es P1.

Nada de esto es discrecional: la excepción real es del propietario (§7).

## 6. Lo PROHIBIDO

`docs/policies/ANTI_DEGRADATION_LAW.md:9-19` (Art. 1) prohíbe, a cualquier agente,
script, workflow, fallback, solver o "fix":

```text
bajar resolución (4K → FHD/HD/SD)
bajar codec (HEVC → H.264) para ocultar un fallo
bajar HDR (PQ/HLG → SDR) para ocultar un fallo
bajar fps (50/60 → 25/30)
bajar bitrate de vídeo
reducir canales de audio
sustituir la fuente 4K por una variante FHD
```

**"Por estabilidad" no es una causa válida.** El Art. 5 es explícito: el rebuffering se
corrige con JIT nativo copy, mejor ruta/proxy, buffer/prefetch, CDN autorizado o
corrección de `BANDWIDTH`; **no** con FHD, H.264, SDR ni bitrate recortado.

Y el Art. 8 prohíbe además **declararlo**: no se puede decir "4K arreglado" si se
cambió a FHD.

### 6.1 El mismo límite, del lado del edge

El "fusible" de suelo del gateway (`min_bandwidth` / `adaptive-minbitrate`) **sólo
puede relajar, jamás subir**, y el invariante `fuse_bps ≤ design_bps` es intocable:
`docs/rea/02_EDGE_DECLARE_AUTO_API.md:87`. Subir un suelo garantiza rebuffer y es la
degradación disfrazada de protección.

## 7. La única excepción válida

Art. 9: autorización **explícita, escrita y separada del propietario**, con estos
cinco datos y ninguno menos:

```
canal_id · device_id · degradación · motivo · fecha
```

Sin los cinco, la degradación está prohibida. No es automática nunca.

## 8. El eje `F` (evidencia del probe) — ortogonal, no una degradación

`CLAUDE.md` define 6 niveles de **evidencia**, no de calidad:

| Tier | Nombre | Cuándo | Codec |
|---|---|---|---|
| F0 | `REAL_VERIFIED_MAX` | probe confirma todo (confidence ≥85, 0 contradicciones) | del probe |
| F1 | `REAL_PARTIAL_MAX` | probe parcial (confidence ≥60, ≤1 contradicción) | del probe |
| F2 | `HEVC_PREMIUM_HINT` | probe falla + canal premium/4K/deporte | `hvc1.2.4.L153.B0` PREFERRED |
| F3 | `HEVC_SAFE_1080P` | FHD/HD probable sin info clara | `hvc1.2.4.L120.B0` PREFERRED |
| F4 | `AVC_HIGH_SAFE` | sin evidencia HEVC ni premium | `avc1.640028` |
| F5 | `ORIGINAL_DIRECT_SAFE` | última defensa | ninguno |

Prioridad visual: `F0 > F1 > F2 > F3 > F4 > F5`, y **nunca F4/F5 si el canal tiene
señales premium** (lista en `CLAUDE.md` §Premium Channel Detection). Bajar a F5 no es
degradar la señal (se entrega la URL original sin tocar el bitstream), pero **sí** es
renunciar a declarar la mejor variante real: se documenta como pérdida de información,
no como éxito.

**Regla de convivencia:** `F` decide qué se **declara**; `P`/`T` deciden **qué es** el
canal. Un `F5` sobre un canal `P1` sigue siendo un canal `P1` sin metadata, no un
canal SD.

## 9. Suelo anti-degradación

El resolvedor de perfil aplica un **suelo**: resuelve un perfil `P0..P5.5` y no deja
caer por debajo del que corresponde
(`docs/audits/PRUEBA_FISICA_REA_654_20261108.md:5034`). Cualquier cambio que elimine
ese suelo es una regresión doctrinal, no una optimización.

## 10. Distinción crítica — corregir un fake NO es degradar

Es el error que más veces se comete y el que esta skill existe para impedir.

| Caso | ¿Degrada? | Base |
|---|---|---|
| Un `fake-4k` (fuente 1080p) se reclasifica a P3 | **No** | Art. 6: "RESOLUTION declarada → resolución real". Corregir un metadato **no autoriza** cambiar la calidad del vídeo, pero **sí** autoriza dejar de mentir |
| Un 4K real se emite como P3 "para que no corte" | **Sí, prohibido** | Art. 1, 2, 5 |
| Un 4K real pierde `VIDEO-RANGE=PQ` "para evitar color shift" | **Sí, prohibido** (decisión LOCKED 2026-06-16) | `CLAUDE.md` §VIDEO-RANGE=PQ Incondicional |
| Un canal sin audio 4K se sustituye por FHD con audio | **Sí, prohibido** | Art. 4: "SIN AUDIO HONESTO > audio inventado" |
| Se corrige `BANDWIDTH` declarado al bitrate real medido | **No** | Art. 6 |

La prueba para distinguirlos: **¿cambia el bitstream que se entrega?** Si no cambia,
es metadata. Si cambia, es degradación y necesita los cinco datos del Art. 9.

## 11. Gate obligatorio

```bash
node tools/check_anti_degradation_policy.js
```

Qué hace (leído en `tools/check_anti_degradation_policy.js:19-45`): verifica que la
ley, `contracts/anti_degradation_contract.json` y `AGENTS.md` existen y dicen lo
correcto, y desde 2026-11-08 **escanea las implementaciones JIT con línea base**
(`contracts/anti_degradation_jit_baseline.json`): ninguna violación nueva puede entrar.
Un gate en verde no prueba que no haya degradación histórica; prueba que **no hay una
nueva**. Ese matiz se declara, no se oculta.

## 12. Checklist de auditoría de una cadena de fallback

```
[ ] ¿La causa registrada es incapacidad de decoder MEDIDA?  (no "estabilidad")
[ ] ¿Baja UN solo escalón?
[ ] ¿Se preserva el codec si el device lo soporta?
[ ] ¿Hay los 5 datos del Art. 9 si se tocó la calidad?
[ ] ¿El cambio altera el bitstream entregado?  (si sí → degradación)
[ ] ¿Se está corrigiendo un metadato falso y NO la señal?
[ ] ¿El suelo anti-degradación sigue en pie?
[ ] ¿Pasó `node tools/check_anti_degradation_policy.js`?
```

## 13. Riesgos

- Llamar "estabilidad" a una degradación. El Art. 5 lo cierra.
- Confundir `P`, `T` y `F` y "bajar el tier" creyendo que se baja la calidad.
- Invocar los 6 perfiles del config y olvidar los 6 derivados: son 12.
- Presentar el corte de 9 pares como censo completo: suma 21.180, faltan 44.
