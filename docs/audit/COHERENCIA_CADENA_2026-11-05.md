# Verificación de coherencia — cadena completa

**Excel → Lab Calibrated Bulletproof → app IPTV → Listas .M3U8 → VPS → ARA**
Verificado 2026-11-05. Modo lectura: no se modificó ningún eslabón.

---

## Veredicto

**La cadena NO está implementada de la misma manera en los seis eslabones.**

**Trazabilidad de origen: PERFECTA.** Los **tres** hashes de `sources` (más el `certified` que da nombre al fichero) coinciden con ficheros reales en disco.

**Coherencia de valores: ROTA en 3 de los 6 campos críticos.**

| Campo | Excel | LAB | App | Lista | VPS | ARA | Estado |
|---|---|---|---|---|---|---|---|
| **fps por perfil** | `30,60,30,60,30,30` ¹ | `30,60,30,60,30,30` | dinámico | `60` en P1 y P3 | deriva del device | — | ✅ alineado |
| **codec por perfil** | corregido ¹ | `P1 L153 / P3 L123` | SSOT codec | `L153 / L123` | catálogo P0–P5 | — | ✅ alineado |
| **bit_depth** | — | `10` (P0-P3), `8` (P4-P5) | — | `#EXT-X-APE-BIT-DEPTH:10` | — | — | ✅ alineado |
| **network-caching** | — | **5000 ms** | — | **55000/72000** | — | — | ❌ **LAB ≠ Lista** |
| **transfer (SDR)** | — | **1 = BT.709** | `BT1886` | `BT1886` **+ `smpte2084`** | `BT1886` | — | ❌ **Lista se contradice** |
| **atadenoise** | — | **presente** | **ausente** | **ausente** | **ausente** | — | ❌ **sólo en el LAB** |

¹ `certification_2026_10_26.excel_cells_corrected.row32 settings.fps = [30,60,30,60,30,30]`
   y `row640 codec_chain_video` "cadena por perfil desde su nivel".

---

## 1 · Eslabón 1 → 2 · Excel → LAB · TRAZABILIDAD PERFECTA

Los **tres** hashes de `certification_2026_10_26.sources` corresponden a ficheros reales,
verificados con `Get-FileHash`. El cuarto, `certified`, no está en `sources`: es el sha256 del
propio fichero certificado, que coincide con `LAB_CALIBRATED_BULLETPROOF_20261026_015604.json`:

```
excel_sha256              813a05aa3aa6070c33c6172933bbfd2714791340af48fb70686de33c742a2399
  → deliverables/LAB_2026-10-26/APE_M3U8_LAB_v8_FIXED_CERTIFIED.xlsm        MATCH

base_export_sha256        314f3ba20293300bc6af1eb19d310d46bf76217aeaf0d77c6ff24f82bcfdac59
  → deliverables/LAB_2026-10-26/LAB_CALIBRATED_CERTIFIED.json               MATCH

enrichment_template_sha256 099a1707a2f1ae692ffcfede01165f21cd66656b786742ce8db518581a371fd4
  → LAB_CALIBRATED_BULLETPROOF_22.6.0-CRYSTAL-4K-UHD.json                   MATCH

certified                 345783e33142791b23b4662d396c0c83c8051d77cd7c166dc21ef4990c093094
  → LAB_CALIBRATED_BULLETPROOF_20261026_015604.json  (y su copia en deliverables)  MATCH
```

**El eslabón Excel → LAB es el único que se puede auditar sin ambigüedad, y pasa al 100 %.**
El LAB final (`artifacts/LAB_CALIBRATED_FINAL_v23.0.0-FUSED.json`, sha `59db06c8…`) desciende de
esa cadena y añade `provenance_lab_final` con los tres sha256 de origen.

**Problema menor:** hay **6 copias del LAB** en el repo (`artifacts/`, `deliverables/LAB_2026-10-26/`
×4, `deliverables/VALIDACION_ENTREGA_2026-10-28/`). Solo la de `artifacts/` es la fusionada. Las
demás son históricas. **No hay un puntero único que diga cuál rige.**

---

## 2 · Eslabón 2 → 3 · LAB → App · `atadenoise` SE PERDIÓ

| | LAB | App |
|---|---|---|
| `atadenoise` en el filtro | **presente** (6/6 perfiles) | **ausente** |

El LAB lo rescató explícitamente del CRYSTAL. **El generador no lo conoce.** El `video-filter`
que la app emite para P3 es:

```
nlmeans=s=2.5:p=5:r=11,bwdif=...,gradfun=...,unsharp=...,zscale=transfer=bt709...,minterpolate=fps=120...
```

Sin `atadenoise`. **El ruido temporal que el LAB considera corregible sigue ahí.**

**Qué es:** `atadenoise` quita parpadeo entre cuadros (ruido temporal) sin tocar la textura.
`nlmeans` quita ruido espacial (manchas). Son complementarios, no sustitutos.

---

## 3 · Eslabón 3 → 4 · App → Lista · EL COLOR SE CONTRADICE

**En los 10.573 canales, simultáneamente:**

```
#KODIPROP:inputstream.adaptive.color_transfer=smpte2084      x10.573   ← PQ / HDR
#KODIPROP:inputstream.adaptive.color_primaries=bt2020        x10.573   ← wide gamut
#EXT-X-APE-HDR-TRANSFER:BT1886                               x10.573   ← SDR gamma
#EXT-X-APE-QUALITY-OVERRIDE-TRANSFER:ST2084                  x10.573   ← PQ otra vez
```

**Cuatro declaraciones, dos pares contradictorios.** El `KODIPROP` dice HDR; el `APE-HDR-TRANSFER`
dice SDR. Y el `QUALITY-OVERRIDE` vuelve a decir HDR.

**De dónde sale, localizado en `m3u8-typed-arrays-ultimate.js`:**

```js
// ── PERCEPTUAL 4K MODE: KODIPROP HDR force ──
// Fuerza pipeline HDR10/BT.2020/PQ en Kodi ISA. Kodi toma el ÚLTIMO valor.
if (options && options.perceptual4kMode) {
    lines.push('#KODIPROP:inputstream.adaptive.hdr_handling=force_hdr');
    lines.push('#KODIPROP:inputstream.adaptive.color_primaries=bt2020');
    lines.push('#KODIPROP:inputstream.adaptive.color_transfer=smpte2084');
}
```

**El `perceptual4kMode` está activo, así que fuerza PQ en TODOS los perfiles**, incluidos los
SDR. Mientras tanto el otro bloque calcula el transfer correcto por perfil:

```js
const _hdrTransfer = _isPqHdr ? 'ST2084' : (_isHlgHdr ? 'arib-std-b67' : 'BT1886');
```

**Consecuencia medida, por perfil:**

| Perfil | Canales | LAB dice | La lista declara |
|---|---|---|---|
| P1 (HDR10+) | 802 | transfer **16 = PQ** | PQ ✅ correcto |
| **P3 (SDR)** | **9.709** | transfer **1 = BT.709** | **PQ ❌** |
| **P4 (SDR)** | 57 | transfer **1** | **PQ ❌** |
| **P5 (SDR)** | 5 | transfer **1** | **PQ ❌** |

**9.771 canales = 92,4 % del catálogo declaran PQ sobre fuente SDR.** Eso no es un freeze:
es **color lavado** — el display entra en modo HDR esperando brillo que no llega.

**Contexto doctrinal:** CLAUDE.md autoriza `VIDEO-RANGE=PQ` incondicional como enhancement de
display, y el operador aceptó ese modelo. **Pero la doctrina también exige coherencia interna:
el mismo canal no puede decir PQ y BT1886 a la vez.** El `perceptual4kMode` fuerza una y el
cálculo por perfil escribe la otra.

---

## 4 · Eslabón 4 → 5 · Lista → VPS · DIVERGENCIAS

| | Lista | VPS (`url2-cartridge.php`) |
|---|---|---|
| `atadenoise` | ausente | **ausente** |
| `EXT-X-APE-HDR-TRANSFER` | `BT1886` | `BT1886` ✅ alineado |
| `color_primaries` | `bt2020` (KODIPROP) | **no lo emite** |
| `network-caching` | 55.000 / 72.000 ms | **no lo emite** (el perfil manda) |
| Directivas CMAF | 26 por canal | **24** |
| Perfiles | P1/P3/P4/P5 | P0–P5 (6) |
| Perfil por device | — | **sí, derivado del `d=`** |

**El VPS y la lista coinciden en el transfer (`BT1886`) y difieren en `atadenoise` (ninguno lo
tiene) y en `color_primaries` (la lista lo fuerza, el VPS no).**

**El VPS añade algo que la lista no tiene:** perfil derivado del device (`url2_pick_profile`).
**Eso no es incoherencia, es una capa extra.**

---

## 5 · Eslabón 5 → 6 · VPS → ARA

| | VPS | ARA (`_vps_stage/canary/`) |
|---|---|---|
| `network-caching` | — | no aplica (el canary no reproduce) |
| Perfil | P0–P5 | **no lo recibe** |
| `video-filter` | — | **no lo recibe** |

**ARA no consume la calibración del LAB.** El canary (`ape-visual-emulate.sh`) muestra la fuente
con ffmpeg y su propio recetario; **no lee `LAB_CALIBRATED_FINAL` ni lo aplica.**

**Y el canary nunca ha corrido:** `/etc/ara/canary/` y `/var/lib/ara/canary/` están vacíos
(medido en la sesión). `env.template` existe pero no se instanció.

**⇒ El eslabón ARA no está conectado a la cadena.** No recibe valores del LAB, no aplica el
`video-filter`, y no ha ejecutado nunca.

---

## Qué falta para que los seis sean el mismo sistema

| # | Eslabón | Acción | Impacto |
|---|---|---|---|
| 1 | **App** | Añadir `atadenoise` al `video-filter`, en la misma posición que el LAB | calidad temporal en los 10.573 |
| 2 | **App** | Resolver la contradicción de color: o `perceptual4kMode` respeta el perfil, o el cálculo por perfil cede. **Las dos a la vez no** | color correcto en 9.771 |
| 3 | **LAB** | `network-caching` del LAB (5000) no debe propagarse: la lista ya tiene el valor correcto (52/55/72 s) | no romper lo que funciona |
| 4 | **VPS** | Emitir `atadenoise` y `color_primaries` como la lista | paridad lista↔cartucho |
| 5 | **ARA** | Que el canary lea el perfil del LAB y aplique su `video-filter` | el eslabón cobra sentido |
| 6 | **Repo** | Un puntero único: `artifacts/LAB_CALIBRATED_FINAL` es el que rige, los 5 demás son históricos | trazabilidad operativa |

**Los puntos 1, 2 y 5 son los que cambian lo que se ve. Los 3, 4 y 6 son higiene.**

---

## Lo que esta verificación NO afirma

- **No auditó el Excel por dentro.** Solo verificó su sha256 contra lo que la certificación declara.
  Leer 3,3 MB de `.xlsm` con macros no estaba en el alcance y no se hizo.
- **No reprodujo ningún canal.** Los valores son de los ficheros, no de una sesión medida.
- **No confirma que `atadenoise` mejore la imagen.** Confirma que el LAB lo declara, la app no lo
  emite, y la lista no lo tiene. El efecto visual no se midió.
- **No afirma que `perceptual4kMode` sea un error.** Puede ser la decisión del propietario
  (CLAUDE.md autoriza PQ incondicional). **Lo que afirma es que el mismo canal se contradice.**
- **No tocó ningún eslabón.** Verificación en modo lectura.
