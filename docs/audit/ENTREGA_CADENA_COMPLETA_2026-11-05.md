# ENTREGA — cadena completa, 2026-11-05

**Excel → Lab Calibrated Bulletproof → IPTV NAVIGATOR → Listas .M3U8 → VPS → ARA**

---

## Pregunta directa: ¿está agregado CRYSTAL UHD?

**Sí, en las cinco capas donde puede estarlo, y con evidencia medida.**

| Eslabón | CRYSTAL UHD | Evidencia |
|---|---|---|
| **Excel** | base de la calibración | `excel_sha256 = 813a05aa…` verificada contra el `.xlsm` real |
| **LAB** | v24 con 12 perfiles | `P0–P5` (UHD) + `P0.5–P5.5` (6K) |
| **IPTV NAVIGATOR** | emite los tags | 222.033 tags de mejora en la lista |
| **Listas .M3U8** | presente por canal | `CRYSTAL-UHD` ×10.573, `CRYSTAL-6K` ×10.573 |
| **VPS** | declara y aplica nivel | `CRYSTAL-ENHANCEMENT` + `REALCE-SOURCE` + `LCEVC` |
| **ARA** | recibe la cadena | `_vps_stage/canary/` con `ara-skill` + `env.template` |

**El gate `check_crystal_4k_law.js` pasa 5/5.** La ley está vigente desde 2026-11-01.

### Qué incluye el bloque CRYSTAL en cada canal

Medido en la lista entregada, ×10.573 cada uno:

```
LCEVC (7)         PHASE · ENABLED · BITRATE-SAVING · QUALITY-BOOST
                  RESOLUTION-BOOST · LATENCY · FALLBACK
AI-SR (5)         AI-SR · QUALITY · DENOISE · SHARPEN · ARTIFACT-REMOVAL
AI-FI (5)         AI-FI · QUALITY · GHOSTING · BLUR · JUDDER
CRYSTAL (4)       CRYSTAL-UHD · CRYSTAL-6K · CRYSTAL-6K-MODE · CRYSTAL-6K-TRUTH
```

**Total: 222.033 tags de mejora declarada.** Cada uno marcado como `DECLARED`, no como ejecutado por el VPS.

---

## Los seis eslabones, verificados

### 1 · Excel → LAB · trazabilidad perfecta

```
excel_sha256 declarado  813a05aa3aa6070c33c6172933bbfd27
excel real en disco     813a05aa3aa6070c33c6172933bbfd27   MATCH
```

`deliverables/LAB_2026-10-26/APE_M3U8_LAB_v8_FIXED_CERTIFIED.xlsm`

### 2 · LAB · v23 y v24

| Fichero | Perfiles | sha256 | Uso |
|---|---|---|---|
| `LAB_CALIBRATED_FINAL_v23.0.0-FUSED.json` | 6 (P0–P5) | `59db06c8…` | UHD puro |
| **`LAB_CALIBRATED_FINAL_v24.0.0-6K.json`** | **12 (P0–P5 + P0.5–P5.5)** | **`14ee67b5…`** | **UHD + 6K** |

```
P0-P5 byte a byte v23 vs v24 : 6/6 IDENTICOS   PASS
v24 lab_version (schema)     : omega_v1_bulletproof_20261026
gate de la app               : PASA
v24 version                   : 23.1.0-6K-EMULATED
```

**Nota técnica:** `lab_version` es el **schema**, no la versión. Cambiarlo rompe el import del panel. La versión vive en `version` y `six_k_version`.

### 3 · IPTV NAVIGATOR · adaptado a los 12 perfiles

```
ape-profiles-config.js       recorre APE_6K_PROFILE_IDS
profile-manager-v9.js        diff del import con 12 ids
ape-xtream-atomic-probe.js   rank() tolera el sufijo .5
m3u8-typed-arrays-ultimate.js sin cambios
```

Los cuatro con `node -c` exit 0. Los `?v=` en `20261105-6k-schema`.

**Sin la adaptación**, `P0.5–P5.5` se importaban como humo: presentes en el fichero y leídos por nadie. Y `rank('P1.5')` devolvía `-1` → `delta` NaN → **un canal correcto se calificaba `FAKE`**.

### 4 · Listas .M3U8 · el output entregado

**`APE_LISTA_1793926685925_FIXED.m3u8`** · 621.845.588 B · sha256 `c0c66177…`

Partió de `APE_LISTA_1793926685925.m3u8` (`4690ef32…`), que tenía una mejora y cinco regresiones:

| Campo | Antes | **Entregado** |
|---|---|---|
| `network-caching` | 500 ms | **55.000 / 72.000 / 52.000** |
| Prefetch SEG/PAR | 8 / 4 | **90 / 40** |
| `X-APE-STRATEGY` | ADAPTIVE / BALANCED | **ULTRA-AGGRESSIVE** |
| `buffer_segments` | 8 | **90** |
| ADAPTIVE / AI | disabled | **enabled** |
| **`atadenoise`** | presente | **PRESENTE — conservado** |
| STREAM-INF 5760×3240 | 0 | **10.573** |
| Codec `L183` | 0 | **10.573** |
| Tags 6K | 0 | **10.573** |

```
canales   10.573  =  10.573    IDENTICO
URLs      10.573  =  10.573    IDENTICO
perfiles  P3:9709 P1:802 P4:57 P5:5   IDENTICO
tiempo    15,8 s
```

**`atadenoise` se conservó a propósito:** es la única mejora real de esa lista y no se cambió por recuperar la continuidad.

### 5 · VPS · en producción, verificado por HTTP

```
url2-cartridge.php?p=P3&id=3
  bytes            : 56.318
  RESOLUTION       : 5760x3240
  CODECS           : hvc1.2.4.L183.B0
  CRYSTAL-6K       : SI
  CRYSTAL-ENHANCE  : SI
  REALCE-SOURCE    : SI
  LCEVC            : SI
```

Los seis perfiles sirven su variante 6K (`P0→P0.5` … `P5→P5.5`), y con `?ape6k=0` vuelven a `3840x2160 / L153` exactamente como antes.

### 6 · ARA

```
_vps_stage/canary/
  ape-canary@.service   783 B
  ape-canaryctl        4.787 B
  ara-skill            4.978 B
  env.template         3.001 B
  install.sh           2.547 B
  ape-visual-emulate.sh 4.068 B
```

**Lo que hay que decir sin adornos:** el canary **no ha corrido nunca** en el VPS. El directorio de trabajo está vacío y `/var/cache/ara/qoe-last-flush.json` no existe. **El eslabón está instalado, no operando.**

---

## Gates

```
check_crystal_4k_law.js          5/5
check_crystal_6k_law.js          6/6
check_anti_degradation_policy.js 6/6
check_single_assignment.js       PASS
node -c × 4 JS                   exit 0
```

---

## Commits de esta entrega

| Commit | Qué |
|---|---|
| `754b3f80` | network-caching = live-caching por canal |
| `02cc5625` | auditoría de coherencia de la cadena |
| `264d4047` | 6K en el VPS |
| `0c5948ec` | 6K para todos + assert del deploy arreglado |
| `9e0049c3` | ley 6K con la implementación |
| `105efe80` | LAB v24 con los 6 perfiles 6K |
| `375c53a5` | schema + soporte de P*.5 en la app |
| `0e30c80b` | repair_list.js |

---

## Lo que esta entrega NO afirma

- **No se reprodujo un solo canal.** Los valores son de los ficheros y del endpoint, no de una sesión medida.
- **CRYSTAL UHD está declarado, no medido.** Los tags dicen `DECLARED`. El escalado y el realce real los hace el VPP del SoC, y eso no se verificó en un device.
- **El 6K es emulación declarada.** `NOT_SOURCE` impide leerlo como fuente real.
- **ARA no opera.** Instalado, nunca ejecutado.
- **La desincronización de color sigue abierta:** 9.771 canales SDR declaran `KODIPROP color_transfer=smpte2084` (PQ) y a la vez `APE-HDR-TRANSFER:BT1886` (SDR). Detectado, **no corregido** — requiere decisión del propietario porque CLAUDE.md autoriza PQ incondicional.
- **`BANDWIDTH=25.000.000`** en canales que declaran `3840x2160`, frente a 9 Mbps de la lista de referencia. Revisado, no cambiado.
