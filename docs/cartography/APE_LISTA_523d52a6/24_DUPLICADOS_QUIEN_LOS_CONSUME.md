# ¿Se pueden borrar los 11 duplicados? No. Dónde están y quién los consume

**Pregunta del operador:** *«¿en qué parte se encuentran los duplicados? No sea que tengan esos valores y
sean dependientes de otros que consuman estos datos.»*

**Respuesta corta: la sospecha era correcta. Ninguno de los 11 es borrable a ciegas.** Los que parecían
«muertos» son leídos por dos consumidores vivos que no había mirado.

---

## 1 · Dónde está cada uno, exactamente

| Clave | Ruta | Valor | Raíz |
|---|---|---:|---|
| `network-caching` | `vlcopt.network-caching` | 15000 | vlcopt |
| | `player_enslavement.level_3_per_channel.EXTVLCOPT.network-caching` | 105000 | player_enslavement |
| `abrBandWidthFactor` | `hlsjs.abrBandWidthFactor` | **95** | hlsjs |
| | `optimized_knobs.abrBandWidthFactor` | 0.85 | optimized_knobs |
| | `actor_injections.player.exoplayer.abrBandWidthFactor` | 0.85 | actor_injections |
| `maxLiveSyncPlaybackRate` | `settings.*` · `hlsjs.*` | **15** | settings / hlsjs |
| | `optimized_knobs.*` · `actor.hlsjs.*` · `actor.exoplayer.*` | 1.25 | vivos |
| `maxBufferLength` | `hlsjs.*` | 50 | hlsjs |
| | `actor_injections.player.hlsjs.*` | 105 | actor_injections |
| `maxMaxBufferLength` | `hlsjs.*` | 50 | hlsjs |
| | `actor_injections.player.hlsjs.*` | 210 | actor_injections |
| `nudgeOffset` | `hlsjs.*` | 1 | hlsjs |
| | `actor_injections.player.hlsjs.*` | 0.1 | actor_injections |
| `nudgeMaxRetry` | `hlsjs.*` · `optimized_knobs.*` · 2 actores | 10/13/13/13 | varias |
| `highBufferWatchdogPeriod` | `hlsjs.*` | 1 | hlsjs |
| | `actor_injections.player.hlsjs.*` | 3 | actor_injections |
| `maxFragLookUpTolerance` | `hlsjs.*` | 25 | hlsjs |
| | `actor_injections.player.hlsjs.*` | 0.25 | actor_injections |
| `peak_luminance_nits` | `settings.*` ×2 | 10000 | settings |
| | `actor_injections.panel.peak_luminance_nits` | 4000 | actor_injections |
| `DNT` | `headerOverrides.DNT` (por perfil `1,0,0,0`) · `headers.DNT` | 0 | headers |
| | `player_enslavement.level_3_per_channel.EXTHTTP.DNT` | 1 | player_enslavement |

---

## 2 · Quién consume de verdad (código vivo, sin backups ni auditorías)

`labProfile` en el generador es `options.bulletproof_profiles[profile]` (L3007 y L10632). Contra eso:

```
labProfile.settings   -> 0 ocurrencias
labProfile.hlsjs      -> 0 ocurrencias
```

**El generador NO lee `settings` ni `hlsjs` para emitir.** Pero hay otros dos consumidores vivos:

### `ape-profiles-config.js` L4856 — copia en bloque

```js
this.profiles[pid] = Object.assign({}, this.profiles[pid], JSON.parse(JSON.stringify(lpFixed)));
```

El comentario del propio código lo enumera: el LAB sobreescribe en bloque
`settings / vlcopt / kodiprop / headerOverrides / hlsjs / prefetch_config / ...`.
Antes de eso, L4827 coerciona `lpFixed.hlsjs` y `lpFixed.settings` de string a número.

**→ `settings` y `hlsjs` no son inertes: viajan al perfil del Profile Manager.**

### `lab-fidelity-verifier.js` L125 — los usa como disparador

```js
if (profileData.hlsjs && Object.keys(profileData.hlsjs).length > 0) {
    checks.push({ key: `${profileId}.hlsjs.blob`, expected: '#EXT-X-APE-HLSJS:', ... });
}
```

**Si borras `hlsjs`, esta comprobación deja de ejecutarse.** No rompe la salida, pero pierdes un chequeo.

---

## 3 · El defecto que esto destapa

Ese verificador comprueba que `#EXT-X-APE-HLSJS:` **exista** en el manifiesto y que aparezca el nombre de
una clave. **No compara el número.**

Y el tag lo emite `pOpts.hlsjs`, que viene de `APE_PROFILE_MATRIX` (L10605-10606) — **no del LAB**.

**Consecuencia:** el LAB puede decir `abrBandWidthFactor=95` y el manifiesto llevar `0.95`, y el
verificador de fidelidad dice PASS. **Verifica forma, no contenido.** Ese es el agujero real, más grave
que los duplicados.

---

## 4 · Veredicto

| Objeto | ¿Fuente de emisión? | ¿Alguien lo consume? | Acción |
|---|---|---|---|
| `vlcopt` | **sí** (L10720 pisa) | sí | **sincronizar** |
| `player_enslavement.L3` | **sí** (gana) | sí | **sincronizar** |
| `optimized_knobs` | **sí** (escribe primero) | sí | **sincronizar** |
| `actor_injections` | **sí** (escribe último) | sí | **sincronizar** |
| `headerOverrides` / `headers` | `headers` no; `headerOverrides` sí se mergea | sí | **sincronizar** |
| `settings` | **no emite** | copia al PM + verificador | **sincronizar, NO borrar** |
| `hlsjs` | **no emite** | copia al PM + **dispara un chequeo** | **sincronizar, NO borrar** |

**No hay ningún caso puramente muerto.** Por eso la acción correcta es **sincronizar al SSOT**, que es
justo lo que hace `sincronizar()`: 24 valores puestos al canónico y **cero borrados**.

---

## 5 · Lo que esto NO prueba

- **No verifiqué el VPS Lua** en esta pasada. El recorrido cubrió el repo con extensiones `.js/.lua/.php/.ts`
  pero el filtrado de ruido (backups, auditorías) puede haber dejado fuera algún consumidor del servidor.
- **No ejecuté el generador** con la metadata sincronizada para comparar el manifiesto byte a byte.
  Sé qué campos se leen por lectura de código, no por instrumentación.
- **El número de consumidores** que doy es de código vivo tras excluir `_backups`, `audit/`, `_audit_snapshot`,
  `deliverables` y ficheros `*.CORRUPT` / `before-t*`. Si alguno de esos se carga en producción, el recuento
  cambia.
