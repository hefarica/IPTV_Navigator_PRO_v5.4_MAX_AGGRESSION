# ESTADO — traspaso en una página

**Para quien retome esto sin haber visto la sesión.** Todo lo de abajo es reproducible con comandos del
repo. Nada está en la cabeza de nadie.

---

## 1 · Lo que falta, y es una sola cosa

**Aplicar dos cambios de nginx al VPS.** Eso es lo único que separa el trabajo de estar terminado según
el requisito del operador: *«todas las listas en sus configuraciones posibles entreguen 200, 206 y 302»*.

```bash
# Paso 1 — verificar (SOLO LECTURA, no cambia nada)
gh workflow run "APE · nginx 206/302 · verificar y aplicar" -f mode=verify-only

# Paso 2 — aplicar (exige la frase literal y pasa por el Environment production)
gh workflow run "APE · nginx 206/302 · verificar y aplicar" \
  -f mode=apply -f confirm="CONFIRMO 206 y 302 en produccion"
```

**El paso 1 no es opcional.** Compara la config viva del host contra el baseline del repo. Si no son el
mismo fichero, **se para** y dice que hay que regenerar el parche. No se aplica un parche construido
sobre un snapshot viejo.

Por qué no se ha ejecutado: **falta la autorización explícita del operador para el cambio en producción.**
No por falta de trabajo ni por duda técnica.

---

## 2 · El gate, medido

| Pata | Hoy | Con los parches |
|---|---|---|
| 200 | 8/8 | 8/8 (intacta) |
| 206 | **4/8** | **8/8** |
| 302 | **0/8** | **8/8** |
| **Total** | **12/20** | **20/20** |

Medido contra `iptv-ape.duckdns.org` con `node tools/ape-http-conformance/gate_matrix.js`.
Los dos parches están probados en nginx real: runs **`41485054319`** (206) y **`41489992875`** (302).

Los tres cambios exactos: `gunzip off` · `gzip_static on` · `return 301` → `return 302`.

**Por qué eso arregla el 206:** nginx no puede servir `206 Partial Content` mientras comprime en vuelo; su
filtro de gzip borra el estado del filtro de rangos y responde 200 con el cuerpo comprimido entero. Lo dice
la propia lista de desarrollo de nginx — ver `docs/ops/TOP5_206_UPSTREAM_CORROBORATION.md`.

---

## 3 · Qué se midió de la lista de referencia (604 MB)

| Capa | Hallazgo | Artefacto |
|---|---|---|
| Estructura | 10.573 canales · `#EXT-X-MEDIA` = **0** · `#EXT-X-MAP` = **0** → audio throughpass **imposible** | `docs/cartography/APE_LISTA_523d52a6/` |
| Vídeo | las **3** cadenas reales **no ejecutan** en ffmpeg (4 defectos con error literal) y **ninguna escala** | `20_REF_CHAINS_MEASURED.md` |
| VLC | de los 8 módulos que usan las cadenas, VLC tiene **2**. El único escalador de VLC **no expone calidad** | `21_VLC_FILTER_INVENTORY.md` |
| Audio | **74.011** contradicciones · **15/15** claves `inputstream.adaptive.audio_*` inventadas | `tools/ape-parse-defects/audio_contradictions.js` |
| Metadata | **27** contradicciones dentro del JSON chunked, **22** son el mismo parámetro con dos valores | `22_LAB_METADATA_REAL.md` |
| HDR | 9.765 con `MaxFALL > MaxCLL`, físicamente imposible | `13_HDR_PLANE_AUDIT.md` |

**La respuesta a «cómo se ve tan bien»**: no por el `video-filter` — ese carril no ejecuta en ningún
motor. Por **15 s de caché de player, 99 reintentos, reconexión continua y una escalera de 7 niveles**.

---

## 4 · CI verde, y qué vigila cada gate

```
ape-parse-gates.yml        17 pasos · 5 reglas de metadata + inventario VLC
ape-video-chains-gate.yml   8 pasos · las 3 cadenas deben FALLAR y las corregidas EJECUTAR
ape-206-local-proof.yml              · nginx real, 8 celdas
ape-302-proof.yml                    · 301 vs 302, 200/206 intactas
ape-demuxed-gates.yml · tools-exit-contract.yml
```

Cada gate prueba **las dos direcciones**. Uno que sólo prueba el éxito no detecta que su objeto
desapareció.

---

## 5 · Lo que este trabajo NO dice

- **No dice que el VPP del SoC no funcione.** No se ha medido. Es la explicación que queda en pie.
- **No dice que el parche produzca 206 en producción.** Está medido en el nginx del runner, no en el host.
- **No ha medido calidad de imagen.** Ni un fotograma.
- **No ha medido el coste de CPU** de `gunzip off` frente a `gzip off`. Sigue siendo predicción.
- **Cero escrituras al VPS** en toda la sesión.

---

## 6 · Las herramientas, por si hay que repetir algo

```bash
# Estado del gate contra el sitio vivo
node tools/ape-http-conformance/gate_matrix.js

# Las 3 cadenas reales de la lista (deben fallar) y corregidas (deben ejecutar)
node tools/ape-image-recipes/v2_chains_local.js --chains tools/ape-image-recipes/ref_chains.txt
node tools/ape-image-recipes/v2_chains_local.js --chains tools/ape-image-recipes/ref_chains_fixed.txt

# Módulos de VLC contra el inventario real
node tools/ape-image-recipes/vlc_filter_modules.js --listar

# Metadata chunked de la lista (0 coherente · 4 contradicho · 5 sin metadata)
node tools/ape-parse-defects/lab_metadata_decode.js <lista.m3u8> --volcar

# Contradicciones de audio
node tools/ape-parse-defects/audio_contradictions.js <lista.m3u8>
```
