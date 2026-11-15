# references — iptv-profile-fallback-doctrine

Fecha: **2026-11-15**. Todo salió de archivos locales, en modo lectura. No se clonó
ni se instaló nada, y **no se modificó ningún archivo del generador ni del config**.

## 1. Fuentes internas leídas

| Archivo | Líneas | Qué se tomó |
|---|---|---|
| `docs/policies/ANTI_DEGRADATION_LAW.md` | 1–145 (completo) | Art. 1 (7 degradaciones prohibidas), Art. 2 (4K permanece 4K), Art. 3, Art. 4 (audio honesto), Art. 5 (rebuffering), Art. 6 (metadatos), Art. 7 (gate), Art. 8 (prohibición de mentir), Art. 9 (los 5 datos), Art. 10 (prioridad) |
| `contracts/anti_degradation_contract.json` | referenciado | `status: mandatory`, `forbidden_automatic_actions` incluye `replace_4k_source_with_fhd`, `allowed_without_exception` incluye `jit_native_copy_4k` (leído a través del gate, líneas 22–27) |
| `tools/check_anti_degradation_policy.js` | 1–45 | qué verifica el gate; escaneo JIT con línea base desde 2026-11-08 |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ape-profiles-config.js` | 559–575, 1194–1210, 1828–1844, 2322–2338, 2956–2972, 3590–3606 | los 6 canónicos: `level`, `resolution`, `bitrate`, `fps` |
| `docs/audits/LAB_PROFILES_20261111.md` | 62–69, 78, 88, 100–104, 244 | escalera canónica = P0..P5; `P0.5` es derivado 6K, no perfil canónico; `base_profile`; 12 filas |
| `docs/policies/CRYSTAL_6K_MAX_ENHANCEMENT_LAW.md` | 139–144, 164–177 | tabla P → P.5 con técnica y salida 5760×3240; "6 base + 6 emulados" |
| `docs/audit/ENTREGA_CADENA_COMPLETA_2026-11-05.md` | 14, 54, 76, 118 | 12 perfiles = P0–P5 (UHD) + P0.5–P5.5 (6K) |
| `IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/vps-image-panel.js` | 716 | "12 perfiles del Gestor (6.750 campos: 6 reales + 6 emulados .5)" |
| `docs/cartography/APE_LISTA_523d52a6/01_STRUCTURE.md` | 411–430 | censo real: `X-APE-Profile` P4/P3/P1 (7457/2308/808), `X-APE-Tier` T5/T6/T8/T7/T9 (7441/2011/704/297/120) sobre 10.573 canales |
| `docs/actions/ACCIONES_20261108.md` | 10 | "20.222 de 21.224 canales (95,3 %) corrían P3 (1080p)" — cruza con el corte del capitán |
| `docs/audits/AUDIT_APE_LISTA_1794100720046_20261108.md` | 369 | hallazgo H12: nunca se usa P0 ni P2 — "4 de 12 perfiles cubiertos" |
| `docs/audits/PRUEBA_FISICA_REA_654_20261108.md` | 5034 | "profile resuelve un perfil P0..P5.5 con suelo anti-degradacion" |
| `docs/rea/02_EDGE_DECLARE_AUTO_API.md` | 87 | el fusible de suelo `min_bandwidth`/`adaptive-minbitrate` **sólo puede relajar**; invariante `fuse_bps ≤ design_bps` |
| `CLAUDE.md` | §6 Tiers de Fallback, §Codec Ladder, §Premium Channel Detection, §VIDEO-RANGE=PQ Incondicional | los 6 niveles F0–F5 y su prioridad |

## 2. Fuentes externas

**Ninguna.** Esta skill es doctrina interna; no se apoyó en repos de terceros. Los
conceptos externos viven en `iptv-supreme-repos-atlas`.

## 3. Qué NO se copió

Nada. No se transcribió código de `ape-profiles-config.js`,
`ape-fallback-resolver.js` ni de ningún módulo; sólo se citan valores y números de
línea como evidencia. **No se editó ninguno de esos archivos** (el operador prohibió
tocar el generador y el config).

## 4. Lo que NO se pudo verificar

| Afirmación | Estado | Razón |
|---|---|---|
| Composición exacta Profile×Tier de los 21.224 canales | **NO COMPUTADO** | La lista servida no está en este entorno. Se usan el corte del capitán y el cruce con `ACCIONES_20261108.md:10` (P3 = 20.222 coincide), pero el par de los **44 canales restantes** no está atribuido |
| Que los 6 derivados `.5` no aparezcan en la lista servida | **NO COMPUTADO con la lista real** | Se apoya en `AUDIT…:369` (4 de 12 cubiertos) y en que el corte de 9 pares sólo contiene P1/P3/P4/P5 |
| Que `node tools/check_anti_degradation_policy.js` pase hoy | **NO EJECUTADO** | El gate escanea implementaciones JIT con línea base; ejecutarlo es seguro pero su resultado no se midió en esta tarea. No se declara PASS |
| Que el suelo anti-degradación esté activo en la build desplegada | **NO VERIFICADO** | Sólo se leyó el artefacto que lo documenta |
| Que los 5 datos del Art. 9 se hayan pedido alguna vez | **NO COMPUTADO** | No hay registro de autorizaciones en el material leído |
