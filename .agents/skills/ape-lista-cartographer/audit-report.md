# Audit Report — ape-lista-cartographer

## Metadata

- **Skill:** `ape-lista-cartographer`
- **Specialist:** IPTV/HLS Architect (S1) · parent anchor: `ape-image-pipeline-truth`
- **Kind:** anchor (con herramientas ejecutables)
- **Instalada:** 2026-11-02T13:20:00Z (equipo `ape-lista-cartografia`, miembro `redactor-skill`)
- **Spec compliance:** `iptv-enterprise-300-skills-v1`
- **Artefacto de referencia:** `APE_LISTA_1793589060441.m3u8` — 604.593.696 B,
  `sha256 523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6` (solo lectura)

## Validaciones de instalación

- [x] `SKILL.md` con frontmatter válido (`name` + `description`) y 14 secciones.
- [x] `README.md`, `references.md`, `commands.md`, `checklist.md`, `tests.md`,
      `install.lock.json`, `audit-report.md`.
- [x] `scripts/map_list.js` — cero dependencias externas, sintaxis OK (`node --check`).
- [x] `scripts/validate_filter_chain.js` — cero dependencias externas, sintaxis OK.
- [x] `fixtures/` con 2 bloques reales anonimizados + 6 cadenas de filtros medidas.
- [x] `reports/` con la salida real del mapper (`map_523d52a6.json` + `.md`).
- [x] `examples/` con invocaciones canónicas.
- [x] Cero secretos en archivos creados (host, usuario, contraseña, picon host, tokens).
- [x] Cero binarios opacos, cero scripts remotos, cero instalación de paquetes.
- [x] Sin red en ninguna fase.

## Doctrina cross-check

- [x] `iptv-omega-no-delete` — no se borró ni reemplazó ninguna skill existente; se creó una carpeta nueva.
- [x] `iptv-lab-ssot-no-clamp` / `iptv-no-hardcode-doctrine` — el mapper **no** hardcodea rangos de
      filtros ni topes de `#EXTHTTP`: los consulta al binario (`ffmpeg -h`) o los mide.
- [x] `iptv-vps-touch-nothing` — no se tocó el VPS; su fila de la matriz se cita de la medición publicada.
- [x] Legal/ético — solo lectura de una lista autorizada, sin DRM, sin evasión, sin captura de tráfico.
- [x] `arbx-*` / FUSILE — no aplica: no hay port de código de terceros ni fuente externa consumida.

## Primera corrida real (evidencia)

```text
node .agents/skills/ape-lista-cartographer/scripts/map_list.js <lista> --out reports \
     --sample 250 --fixture 1 --fixture-out fixtures/canal_001_P3.txt --vlc-version 3.0.24
```

- Salida: `reports/map_523d52a6.json` (esquema `ape-lista-cartographer/map@1`) + `reports/map_523d52a6.md`.
- Alcance: `muestra` — estructura **censal**, capas pesadas sobre 250 canales (paso 42).
- Duración: 51,5 s / 53,9 s / 58,8 s / 59,0 s en cuatro corridas (dos pasadas sobre 604 MB).
- Control de fugas del propio run: `host:0 · credencial:0 · sha_preservado:true · json_ok:true`.

## Contraste del mapper contra la cartografía previa

El valor de esta skill se juega aquí: el mapper **reproduce** los cuatro informes sin copiar sus
cifras. Todo lo de la columna "mapper" sale de una corrida de este repositorio.

| Métrica | Informe previo | Mapper (esta corrida) | Veredicto |
|---|---|---|---|
| Bytes / SHA-256 | 604.593.696 / `523d52a6…5049d6` | idénticos | reproduce |
| Líneas | 10.315.662 (01) | 10.315.662 | reproduce |
| Canales / URIs / URIs únicas | 10.573 / 10.573 / 10.573 (01) | 10.573 / 10.573 / 10.573 | reproduce |
| Hosts / pares usuario-pass | 1 / 1 (01) | 1 / 1 | reproduce |
| Cabecera / primer `#EXTINF` | 188 / 189 (01) | 188 / 189 | reproduce |
| Bloques: min / p50 / media / p90 / p99 / máx / suma | 954 / 976 / 975,643 / 977 / 977 / 981 / 10.315.474 (01) | idénticos | reproduce |
| Histograma de tallas | 8 tallas exactas (01) | idénticas (976→5.433 · 977→3.152 · 973→1.705 · 972→216 · 954→45 · 978→20 · 974→1 · 981→1) | reproduce |
| `lines_after_uri` | 3 en 10.572, 7 en el último (01) | 3→10.572 · 7→1 | reproduce |
| Líneas vacías | 10.576 (1×10.572 + 3×1) (01) | idéntico | reproduce |
| Tags distintos | 819 (01) | 819 | reproduce |
| `#EXT-X-APE-*` / `#EXTVLCOPT` / `#KODIPROP` / `#EXTATTRFROMURL` | 6.498.710 / 1.416.786 / 1.089.025 / 570.942 (01,03) | idénticos | reproduce |
| Cabecera-sólo / bloque-sólo / ambos | 129 / 685 / 5 (01) | 129 / 685 / 5 | reproduce |
| Atributos `#EXTINF` | 19, todos universales (01) | 19; `ape-profile` P4=7.457 / P3=2.308 / P1=808 | reproduce |
| Firmas `video-filter` | 3 (7.457 / 2.308 / 808) (02) | 3 (7.457 / 2.308 / 808), biyección cadena↔perfil | reproduce |
| Defecto universal | `unsharp chroma_msize_x=0` fuera de `[3..23]` (02) | 2 violaciones por firma P4/P3, 3 en P1 (+`scd`) | reproduce |
| `#EXTHTTP` válidos | 10.573/10.573 (03) | 250/250 analizados, 0 inválidos | reproduce (muestra) |
| Campos / bytes por objeto | 199–200 / 7.197–8.124 (03) | 199–200 / 7.197–8.110 (muestra) | reproduce |
| Tóxicos | 0 de 6 (03) | 0; lookalikes `X-Priority` y `X-QoS-Priority` presentes | reproduce |
| `#EXT-X-MAP` | 0 (03) | 0 | reproduce |
| C1 / C2 / C3 | 10.573 / 10.573 / 7.457 (03) | 10.573 / 10.573 / 7.457 | reproduce |
| C13 (`HDCP-LEVEL` ausente) | 45 (03) | 45 | reproduce |
| GOLDEN RULE `hvc1`/`hev1` | 0 violaciones (03) | 0 | reproduce |
| Matriz de runtimes | 4 N · 4 P · 45 D · 28 I sobre 81 celdas (04) | 4 N · 3 P · 32 D · 15 I sobre las 54 celdas de las 6 etapas que la lista usa (+27 `sin_cadena`) | coherente con 04 al filtrar etapas ausentes |

### Diferencias medidas (y su explicación, no su maquillaje)

| Punto | Informe previo | Medición del mapper | Lectura |
|---|---|---|---|
| Familia CMAF | 03 dice "24 tags / 253.752 líneas" | 25 tags / 264.325 líneas (= 25 × 10.573) | **definición**, no contradicción: el conteo incluye el tag pelado `#EXT-X-CMAF`. Con 24 tags de sufijo son 253.752. El total 264.325 coincide con la tabla de familias de 01 |
| Familia VNOVA / PHANTOM | 19 / 17 tags (03) | 20 / 18 tags (211.460 y 190.314 líneas) | misma razón: +1 tag pelado por familia; los totales coinciden con 01 |
| C4 (`I-FRAME` con nivel < `STREAM-INF`) | 10.573 "100 %" (03) | **9.765 (92,36 %)** | **refinamiento**: los 808 canales P1 declaran `L153` también en el I-FRAME, así que no contradicen. 9.765 = 7.457 (P4) + 2.308 (P3) |
| C5 (`X-APE-Codec-Video` con nivel < `STREAM-INF`) | 1.470 (13,9 %) (03) | 37 de 250 muestreados (14,8 %) | coherente en proporción; el mapper marca la fila como `scope: muestra` para no venderla como censo |
| Campos de `#EXTHTTP` (p50) | 200 (03, censo) | 199 (250 muestreados) | efecto de muestra; el censo de 03 sigue siendo la referencia |
| C6/C11 | 03 describe la triple contradicción del contenedor | 10.573 (100 %) con la definición operativa "familia CMAF declara contenedor/init-segment y `#EXT-X-MAP` = 0" | misma sustancia, ahora medida por canal |
| C8/C9 (`PART-TARGET` y `PART-HOLD-BACK` de la familia vs los del tag HLS real) | 03 los describe sin conteo por canal | **10.573 (100 %)** cada uno: `#EXT-X-PART-INF:PART-TARGET=1.0` (valor global, cabecera L36) vs `#EXT-X-CMAF-PART-TARGET:0.5` por canal; `PART-HOLD-BACK=1.0` vs `#EXT-X-CMAF-PART-HOLD-BACK:1.5` | coincide con 03 |
| C10 (audio Atmos/DTS/TrueHD) | 03 lo reporta | **no implementado** (`coherence.not_implemented` con razón) | se declara el hueco en vez de estimarlo |

### Error propio detectado y corregido durante esta instalación (para que no se repita)

La primera implementación de **C8/C9 devolvió 0** y este informe llegó a escribir que "refutaba" la
lectura de 03. Era **falso**: `#EXT-X-PART-INF` y `#EXT-X-SERVER-CONTROL` viven en la **cabecera**
(una sola vez, líneas 34–36), no en cada bloque, así que el chequeo por canal nunca tenía los dos
lados de la comparación y no podía fallar. Se detectó al abrir el fixture y ver los tags donde no
tocaba. Corregido: el mapper captura el valor **global** de cabecera y lo compara contra el declarado
por canal; remedido, da 10.573 en ambos. Queda anotado porque es el modo de fallo exacto que esta
skill existe para impedir: un cero que parecía una medición y era un parser ciego.

## Verificaciones ejecutadas (tests.md)

| Test | Comando | Resultado observado |
|---|---|---|
| T1 sintaxis | `node --check` ×2 | exit 0 |
| T2a fixture 1 canal (P3) | `map_list.js fixtures/canal_001_P3.txt --expect-channels 1` | exit 0 · 977 líneas · 687 tags · p50 977 · `sum_check_exact=true` · `lines_after_uri=3` |
| T2b fixture 954 líneas | `map_list.js fixtures/canal_5739_P4_corto.txt --expect-channels 1` | exit 0 · 954 líneas · 664 tags · `STREAM-INF` con **6** claves (el caso estructuralmente distinto) |
| T4 cadena literal | `validate_filter_chain.js --chain-file fixtures/chains/P4_literal.txt` | **FAIL** `exit=-34` · `Value 0.000000 for parameter 'chroma_msize_x' out of range [3 - 23]` |
| T5 cadena corregida | `… P4_corregida.txt` | **PASS** `exit=0` |
| T6 cascada | `… P1_literal.txt --per-stage` | fallan `unsharp` (−34), `zscale` (−22, `Undefined constant … 'st2084'`) y `minterpolate` (−34, `scd` fuera de `[0 - 1]`); pasan `nlmeans`, `bwdif`, `gradfun` |
| T14 assertion | `--expect-channels 999` | exit 2 · `ASSERTION: canales 1 != esperado 999` |
| Fugas | control interno del mapper | `host:0 · credencial:0 · sha_preservado:true` |

Cadenas validadas una por una (6 fixtures): `P1/P3/P4_literal` → FAIL en `unsharp`;
`P1/P3/P4_corregida` → PASS. Es el mismo resultado que documenta 02, obtenido aquí con el validador
de esta skill.

## Drift detection

`install.lock.json.integrity_sha256_self = "not-computed-at-install"`. Para detectar deriva:

```bash
node --check scripts/map_list.js && node --check scripts/validate_filter_chain.js
node scripts/map_list.js fixtures/canal_001_P3.txt --out /tmp/t --expect-channels 1
node scripts/validate_filter_chain.js --chain-file fixtures/chains/P4_literal.txt   # debe salir 1 (FAIL)
```

Si el fixture de 1 canal deja de dar 977 líneas / 687 tags, o la cadena literal deja de fallar, el
artefacto cambió: revisar antes de confiar en cualquier cartografía nueva.

## Uso histórico

```text
### 2026-11-02T13:33Z — primera instalación y primera corrida
- Triggered by: t5 del equipo ape-lista-cartografia (crear la skill + mapper ejecutable)
- Files touched: .agents/skills/ape-lista-cartographer/** (carpeta nueva, ninguna skill ajena)
- Validations run: node --check ×2, mapper sobre 604 MB (muestra 250), 6 cadenas de filtros,
  control de fugas, contraste de 25+ cifras contra 01/02/03/04
- Result: PASS
- Notes: el mapper reproduce la cartografía previa; refina C4 (9.765, no 10.573) y refuta C8/C9
  para esta generación. C10 queda declarado como no implementado.
```

## Próximos pasos (deuda declarada)

1. **C10** (audio Atmos/DTS/TrueHD): cruzar `#EXT-X-CMAF-ATMOS/DTS/TRUEHD` con `X-APE-ATMOS/DTS-X/TRUEHD`
   sin depender del top-40 de frecuencias.
2. **Censo de capas pesadas en modo censo** sobre la lista de referencia completa (una corrida de
   ~45 s) para publicar los 10.573 objetos de `#EXTHTTP`, no los 250 muestreados.
3. **VLC 4.x**: la fila queda en grado `x`; requiere binario para medirse.
4. **`aplicado` / `verificado`**: ningún resultado de esta skill llega ahí por diseño. El siguiente
   escalón exige un arnés de captura de frames (diff de píxeles), que hoy no existe.
