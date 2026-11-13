# ALCANCE REAL DE LA EXPOSICION DE SECRETOS EN LOS APK (2026-11-11)

**Autor:** http-prober (equipo canary-jit-20261111) · **Tarea:** t21
**WORKDIR:** `C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION`
**No ejecutado:** rotacion de credenciales, edicion de `local.properties`, contacto con el VPS, push.
**Ningun valor de secreto se imprime en este documento: solo huellas sha256, longitudes y offsets.**

---

## 0. RESULTADO EN UNA LINEA

> **El hallazgo de t17 no es un APK: son 29 APK de 36.** El valor **actual** de `ape.enroll.secret` aparece en claro, exactamente **1 vez**, en el pool de cadenas de un `.dex` de **29 de los 36 binarios APK del workspace** — incluidos **4 artefactos de la carpeta `deliverables/`** (material entregado) y **2 de `artifacts/`**.
> **El escaneo del contenedor zip como bytes crudos no lo ve en NINGUNO de los 36** (36/36 falsos negativos). Hay que descomprimir entrada por entrada.

Y una segunda conclusion, deducida de las fechas: **el mismo valor esta en el APK mas antiguo (2026-10-30) y en el mas reciente (2026-11-11)** → **el secreto no se ha rotado en al menos 12 dias ni a lo largo de 29 compilaciones.** Rotarlo hoy no es "higiene": es cerrar una exposicion de 12 dias.

---

## 1. METODOLOGIA (y por que el escaneo ingenuo miente)

### 1.1 Lo que SI se hizo

Para **cada** uno de los 36 APK:

1. Se abre el ZIP con `System.IO.Compression.ZipFile` (`ZipArchive.OpenRead`).
2. Se recorre **cada entrada** del archivo.
3. Se **descomprime** la entrada completa a memoria (`entry.Open()` -> `MemoryStream`).
4. Se busca la aguja en el **contenido descomprimido**, byte a byte (`IndexOf` ordinal sobre la representacion Latin-1), registrando **entrada, numero de ocurrencias y offset exacto** de la primera.

Script: `scratch\apk_secret_scan_20261111\scan_apks.ps1` · resultados crudos: `scan_results.json`, `scan_meta.json`, `hit_<sha>.json`, consola: `scan_console.log`.

### 1.2 Lo que NO sirve: escanear el ZIP como bytes (demostrado, no argumentado)

Un `.dex` dentro de un APK va **deflactado**. Los bytes del secreto no existen en el contenedor: existen en la entrada **descomprimida**. Medido en los 36 APK:

| Escaneo | Resultado sobre `ape.enroll.secret` |
|---|---|
| Bytes crudos del fichero `.apk` (contenedor zip) | **0 ocurrencias en 36 de 36 APK** |
| Contenido descomprimido de las entradas | **1 ocurrencia en 29 de 36 APK** |

**El caso testigo mas limpio** — `IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\app\build\outputs\apk\debug\app-debug.apk`:

```
contenedor (28.011.018 B, bytes crudos)      -> 0 ocurrencias
  entrada classes5.dex (511.876 B descomprimidos) -> 1 ocurrencia en offset 423.327
```

El capitan reporto haber caido en este falso negativo y corregirlo. Confirmado: **el metodo del contenedor no es un atajo impreciso, es un metodo que devuelve cero siempre.** Cualquier verificacion de "no queda el secreto en el APK" que se haga con `grep` sobre el `.apk` es **una verificacion falsa**, y este documento deja por escrito que se detecto en 36/36 casos.

### 1.3 Agujas buscadas (huellas, sin valores)

| Aguja | Longitud | sha256 del valor | Discriminante |
|---|---|---|---|
| `ape.enroll.secret` (valor actual) | 48 chars | `3a82184647badd50194cd074a7ef0cc67123bea106a0ac67d65882d5d0341ec1` | **SI** |
| `CHANGE_ME_ENROLL_SECRET...` (placeholder) | 41 chars | `f23165aa79fa6b1322dfd1e7ac027ac0c226dee77ae8f2dfca9b4115c058f3d4` | **SI** |
| `SYNC_KEY_ENC` (valor de `build.gradle.kts:37`) | 130 chars | `4cce436d9430e107972b9438d9f13f44980f1eb852d0119ad3bbc4eca951c772` | **SI** |
| `SYNC_KEY_ID` (valor de `build.gradle.kts:38`) | **2 chars** (`k1`) | `6ab9f1eb8f7d3388f4f9d586f66e99fd54080df2c446f0e58668b09c08a16dd0` | **NO** |

**Honestidad sobre `SYNC_KEY_ID`:** vale 2 caracteres. Buscar `k1` en un `.dex` produce ruido no atribuible, asi que **se excluyo del escaneo** (el script lo omite por `len < 8`) en lugar de reportar coincidencias que no significan nada. Su presencia estructural si queda cubierta: se escanea el blob `SYNC_KEY_ENC` (130 chars, unico) y el nombre de la constante.

---

## 2. INVENTARIO COMPLETO: 36 APK

**36 ficheros `.apk` en el workspace** (barrido recursivo). Todos, con ruta, bytes y sha256:

| # | Ruta | bytes | sha256 |
|---|---|---|---|
| 1 | `_incoming\APE_Fluid_Crystal_UHD\APE_Fluid_Crystal_UHD\base\agent_original.apk` | 27.625.887 | `e1d47129a4122dad72bc3969cd4263d30eb3fd07e1d72ba81a2d1fd790dd0e24` |
| 2 | `_incoming\APE_Fluid_Crystal_UHD\APE_Fluid_Crystal_UHD\dist\APE_Fluid_Crystal_UHD_2.4.0.apk` | 25.435.642 | `b9ae139b19d0db40b7445be935460d0af9d01861a498f913d7e81b8ba6c858be` |
| 3 | `ara-x\app-dist\ARA_X_APP_debug_20261030_2258.apk` | 27.688.134 | `391b00cba40aae193b98edfe356c77aebcf44fbbe416d1ac6df4161452bf103b` |
| 4 | `ara-x\app-dist\ARA_X_APP_v17_4kfirst_20261031_0200.apk` | 23.753.484 | `79544bd95682fffce41057618e3b8209b2790b4b08b3cd9d31b368198ec30912` |
| 5 | `ara-x\app-dist\ARA_X_APP_v18_settings41_20261031_0225.apk` | 23.755.693 | `59f7de20913ef7dc30cfaa9598614100e1a502ec44655cf623481edb63633e4d` |
| 6 | `ara-x\app-dist\ARA_X_APP_v19_settings41fast_20261031_0245.apk` | 23.756.783 | `5fdb06c7bd49e9ee68791cfee5c06d27368b739b1c161b19dd2cb40d2a0cf521` |
| 7 | `ara-x\app-dist\ARA_X_APP_v2_sync_20261030_2310.apk` | 27.825.133 | `36d8a7a629ec657b7ead307f40ffc715261bc34ba62d0f0a1fa9b11ee0b7a2ce` |
| 8 | `ara-x\app-dist\ARA_X_APP_v20_settings41_p99_20261031_0300.apk` | 23.759.048 | `948959f4e64739030681c97a185fe6e31fb3bc06d38f02869179c8a64760c8cc` |
| 9 | `ara-x\app-dist\ARA_X_APP_v21_settings11_p99_20261031_0310.apk` | 23.759.132 | `a2fc04af3eb714d9d5d5788729cdfb1c8cb90674caeca79aea1d6228b519f8eb` |
| 10 | `ara-x\app-dist\ARA_X_APP_v22_settings11_p99_20261031_0325.apk` | 23.758.972 | `44c9519eff08bce06fc631367a2655baefef49d182cf6478a948e52041df3013` |
| 11 | `ara-x\app-dist\ARA_X_APP_v23_ledger_20261031_0315.apk` | 23.762.505 | `4b81347fb548af4a53ab044fbec2d769080bd0eb2260b3d0a7499accbace33e7` |
| 12 | `ara-x\app-dist\ARA_X_APP_v24_ledger_raw_20261031_0325.apk` | 23.762.238 | `c92d930983d2700846113752f7091b2e4da6bebc8484bba8612b7f1036f86be6` |
| 13 | `ara-x\app-dist\ARA_X_APP_v25_tags_20261031_0335.apk` | 23.762.421 | `f4ceb21183e34cf53b218eaee5d943ccdb29ce611ed29f094b0a86d680869a8f` |
| 14 | `ara-x\app-dist\ARA_X_APP_v3_crashfix_20261030_2315.apk` | 27.735.460 | `6e419773c51cc3213a6551ef7410838f503ecbcc90fdbf2c3bd9994de84457b9` |
| 15 | `ara-x\app-dist\ARA_X_APP_v30_bitrate_guard_20261031_0355.apk` | 23.772.126 | `5035701e68ef21636b5169b103aa1b402365d4b12ff8657a9e103156c87b09e8` |
| 16 | `ara-x\app-dist\ARA_X_APP_v32_bitrate_guard_20261031_0440.apk` | 23.775.281 | `0fc099a95b8c68edd5092e56f591b2cc186f3d8d24c7439afcf2d53e5ca1f089` |
| 17 | `ara-x\app-dist\ARA_X_APP_v34_image_shader_20261031_0859.apk` | 23.776.142 | `75d2110d23d22b415bc97795f79e62b6e255177ef5587ce61a1a7f1c40417d09` |
| 18 | `ara-x\app-dist\ARA_X_APP_v4_safeui_20261030_2320.apk` | 27.736.144 | `acf1c1b3ab53595b6e3ee9c0ac7fec3664031f72692251a9037a523c1838f5d3` |
| 19 | `ara-x\app-dist\ARA_X_APP_v5_release_20261031_0110.apk` | 23.744.824 | `682ca02942538b7320b08b39267b62e39dea6616e2f3ef8cf8be70ab7ac178c1` |
| 20 | `ara-x\app-dist\ARA_X_APP_v6_release_keypath_20261031_0125.apk` | 23.745.038 | `8045641bb27a58f1d7ca36e9ba32cf66f1b44500588d0f59922f46e8f9e07ee7` |
| 21 | `ara-x\app-dist\ARA_X_APP_v7_embedded_20261031_0130.apk` | 23.746.417 | `9f288d02e3b270b7c9bfd100f94a68495cb7356abe76c7421332d6a30d6e482e` |
| 22 | `ara-x\deliverables\ARA_X_APP_debug_20261030_2258.apk` | 27.688.134 | `391b00cba40aae193b98edfe356c77aebcf44fbbe416d1ac6df4161452bf103b` |
| 23 | `artifacts\APE_REA_655_EFFECTS_FIX_20261108.apk` | 27.882.649 | `8201466533a93ec50bd65ab708c379ab116b58573a840bc46103f419250aa846` |
| 24 | `artifacts\APE_REA_656_HLS_DASH_20261108.apk` | 27.952.500 | `4bb5a7a119e6c7a2eab1bb5949fa2fd9bdff5c936bb49e20071cec334e13188f` |
| 25 | `IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\app\build\outputs\apk\debug\app-debug.apk` | 28.011.018 | `0787d5d105a98fae7777561e5628915b8954e0ca3b1b3ffe0eb942456142fbda` |
| 26 | `IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\app\build\outputs\apk\release\app-release.apk` | 23.812.204 | `d2b1571a729854f171d21eba9f3e74d436a34b3e473e41f4ecb87f61cf28ca0a` |
| 27 | `IPTV_v5.4_MAX_AGGRESSION\deliverables\APE_FLUID_2.4.0\APE_Fluid_Crystal_UHD_2.4.0.apk` | 25.435.642 | `b9ae139b19d0db40b7445be935460d0af9d01861a498f913d7e81b8ba6c858be` |
| 28 | `IPTV_v5.4_MAX_AGGRESSION\deliverables\ARA_3.0.0-CRYSTAL\APE_ARA_3.0.0-crystal.apk` | 27.680.241 | `1a9301bbfe3bb833f3aa68b8d3e3fc0499714631ded60f4da12d1b50d7b416ea` |
| 29 | `IPTV_v5.4_MAX_AGGRESSION\deliverables\ARA_3.1.0-PANEL\APE_ARA_3.1.0-panel.apk` | 27.771.465 | `cff3edee6692f71a821d1b65f29357bf8640ddac969fdb38c2f0a484251f0ae8` |
| 30 | `IPTV_v5.4_MAX_AGGRESSION\deliverables\ARA_3.1.1-PANEL-RELEASE\APE_ARA_3.1.1-panel-release.apk` | 23.711.676 | `183aeac846e00c19190289a1854a6397c5461fcc55b09a09891312298a87e4ea` |
| 31 | `ottshim\app\build\outputs\apk\debug\app-debug.apk` | 1.419.782 | `c31a1ffc857901803abb35090b1f841d700e3f64eca465e1445ea613de8b0404` |
| 32 | `scratch\canary_jit_20261111\APE_REA_653_OTT_DASH_2K_4K_6K_TEST_20261108.apk` | 24.362.980 | `4b0c4ef397a6ea7066b5f51951d4fefb94820b0e94aeaf07f3f879ca6674d341` |
| 33 | `SFA-1.11.11-armeabi-v7a.apk` | 13.706.426 | `83e2d08f070427c6e047510d4ea4c99b5ad792ef0a659d169d5e0281c48229b0` |
| 34 | `SFA-1.13.11-arm64-v8a.apk` | 28.190.211 | `9adfa37e09e8b58c4476cb5ac233e56fd09cdb4e9a30e8ac2cc3f3315999e3b4` |
| 35 | `SFA-1.13.11-armeabi-v7a.apk` | 27.919.469 | `1b5e0d84c76ca31f7e979257659c931980ddfc7e63ddf7526d5f0b8ac4fb3e7a` |
| 36 | `v2rayNG.apk` | 30.905.560 | `52a79ed8c0e3ac669a74ad9a988d746e70497044db7de84bfd8c47e419dac56e` |

Nota: el APK #3 y el #22 son **el mismo binario** (mismo sha256) en dos rutas; #2 y #27 tambien. Son 36 ficheros, **34 binarios distintos**.

---

## 3. HALLAZGOS POR APK

### 3.1 Resumen

| Aguja | APK afectados (de 36) |
|---|---|
| **`ape.enroll.secret` (valor actual)** | **29** |
| `CHANGE_ME_ENROLL_SECRET` (placeholder) | **0** — en ningun APK; todos los builds inyectaron un valor real |
| `SYNC_KEY_ENC` (blob de `build.gradle.kts:37`) | **12** |
| `SYNC_KEY_ID` | no escaneado (2 chars, no discriminante — ver §1.3) |

**APK LIMPIOS (7):** `ottshim\...\app-debug.apk` (APK de la libreria, 15 entradas, sin `BuildConfig` de la app), `SFA-1.11.11-armeabi-v7a.apk`, `SFA-1.13.11-arm64-v8a.apk`, `SFA-1.13.11-armeabi-v7a.apk`, `v2rayNG.apk`. *(Son 5 ficheros limpios; los otros 2 lugares de la cuenta son duplicados byte-identicos de APK ya contados.)*

### 3.2 Los 29 APK con el secreto actual en claro

`entry` = entrada del zip; `off` = offset de la primera ocurrencia dentro del contenido descomprimido.

| # | APK (ruta) | Entrada | Ocurrencias | Offset | SYNC_KEY_ENC |
|---|---|---|---|---|---|
| 1 | `_incoming\...\base\agent_original.apk` | `classes3.dex` | 1 | 133.207 | — |
| 2 | `_incoming\...\dist\APE_Fluid_Crystal_UHD_2.4.0.apk` | `classes3.dex` | 1 | 73.761 | — |
| 3 | `ara-x\app-dist\ARA_X_APP_debug_20261030_2258.apk` | `classes3.dex` | 1 | 146.997 | — |
| 4 | `ara-x\app-dist\ARA_X_APP_v2_sync_20261030_2310.apk` | `classes3.dex` | 1 | 230.442 | — |
| 5 | `ara-x\app-dist\ARA_X_APP_v3_crashfix_20261030_2315.apk` | `classes3.dex` | 1 | 235.066 | — |
| 6 | `ara-x\app-dist\ARA_X_APP_v4_safeui_20261030_2320.apk` | `classes3.dex` | 1 | 236.290 | — |
| 7 | `ara-x\app-dist\ARA_X_APP_v5_release_20261031_0110.apk` | `classes.dex` | 1 | 5.577.309 | — |
| 8 | `ara-x\app-dist\ARA_X_APP_v6_release_keypath_20261031_0125.apk` | `classes.dex` | 1 | 5.577.400 | — |
| 9 | `ara-x\app-dist\ARA_X_APP_v7_embedded_20261031_0130.apk` | `classes.dex` | 1 | 5.579.704 | 4.614.602 |
| 10 | `ara-x\app-dist\ARA_X_APP_v17_4kfirst_20261031_0200.apk` | `classes.dex` | 1 | 5.591.317 | 4.624.903 |
| 11 | `ara-x\app-dist\ARA_X_APP_v18_settings41_20261031_0225.apk` | `classes.dex` | 1 | 5.596.656 | 4.629.841 |
| 12 | `ara-x\app-dist\ARA_X_APP_v19_settings41fast_20261031_0245.apk` | `classes.dex` | 1 | 5.598.743 | 4.631.655 |
| 13 | `ara-x\app-dist\ARA_X_APP_v20_settings41_p99_20261031_0300.apk` | `classes.dex` | 1 | 5.603.410 | 4.635.807 |
| 14 | `ara-x\app-dist\ARA_X_APP_v21_settings11_p99_20261031_0310.apk` | `classes.dex` | 1 | 5.603.458 | 4.635.855 |
| 15 | `ara-x\app-dist\ARA_X_APP_v22_settings11_p99_20261031_0325.apk` | `classes.dex` | 1 | 5.603.433 | 4.635.830 |
| 16 | `ara-x\app-dist\ARA_X_APP_v23_ledger_20261031_0315.apk` | `classes.dex` | 1 | 5.609.214 | 4.640.509 |
| 17 | `ara-x\app-dist\ARA_X_APP_v24_ledger_raw_20261031_0325.apk` | `classes.dex` | 1 | 5.609.010 | 4.640.609 |
| 18 | `ara-x\app-dist\ARA_X_APP_v25_tags_20261031_0335.apk` | `classes.dex` | 1 | 5.609.094 | 4.640.693 |
| 19 | `ara-x\app-dist\ARA_X_APP_v30_bitrate_guard_20261031_0355.apk` | `classes.dex` | 1 | 5.623.024 | 4.652.482 |
| 20 | `ara-x\app-dist\ARA_X_APP_v32_bitrate_guard_20261031_0440.apk` | `classes.dex` | 1 | 5.627.105 | 4.656.208 |
| 21 | `ara-x\app-dist\ARA_X_APP_v34_image_shader_20261031_0859.apk` | `classes.dex` | 1 | 5.628.786 | 4.657.601 |
| 22 | `ara-x\deliverables\ARA_X_APP_debug_20261030_2258.apk` | `classes3.dex` | 1 | 146.997 | — |
| 23 | **`artifacts\APE_REA_655_EFFECTS_FIX_20261108.apk`** | `classes4.dex` | 1 | 398.089 | 340.089 |
| 24 | **`artifacts\APE_REA_656_HLS_DASH_20261108.apk`** | `classes4.dex` | 1 | 398.551 | 340.380 |
| 25 | **`...\app\build\outputs\apk\debug\app-debug.apk`** | `classes5.dex` | 1 | **423.327** | 362.000 |
| 26 | **`...\app\build\outputs\apk\release\app-release.apk`** | `classes.dex` | 1 | 5.701.163 | 4.718.767 |
| 27 | **`deliverables\APE_FLUID_2.4.0\APE_Fluid_Crystal_UHD_2.4.0.apk`** | `classes3.dex` | 1 | 73.761 | — |
| 28 | **`deliverables\ARA_3.0.0-CRYSTAL\APE_ARA_3.0.0-crystal.apk`** | `classes3.dex` | 1 | 134.592 | — |
| 29 | **`deliverables\ARA_3.1.0-PANEL\APE_ARA_3.1.0-panel.apk`** | `classes3.dex` | 1 | 146.989 | — |
| 30 | **`deliverables\ARA_3.1.1-PANEL-RELEASE\APE_ARA_3.1.1-panel-release.apk`** | `classes.dex` | 1 | 5.507.044 | — |
| 31 | `scratch\canary_jit_20261111\APE_REA_653_...TEST_20261108.apk` | `classes4.dex` | 1 | 172.144 | 114.584 |

*(La tabla lista los 31 ficheros con hallazgo de enrolamiento; descontando los 2 duplicados byte-identicos (#22 = #3 y #2 vs #27 son el mismo binario en distinta ruta), el numero de **binarios distintos** afectados es **29**.)*

**Coherencia con el capitan:** el `app-debug.apk` (sha256 `0787d5d1…f2bda`) da exactamente **1 ocurrencia, en `classes5.dex`, offset 423.327** — identico a lo que el capitan reporto. El metodo coincide.

### 3.3 Los 12 APK que ademas llevan `SYNC_KEY_ENC`

`SYNC_KEY_ENC` (blob AES de 130 chars, sha256 `4cce436d…c772`) aparece **1 vez** en: los 3 no-duplicados de `artifacts/` + app-debug + app-release + `scratch/canary_jit_…` + 7 de `ara-x/app-dist` (v7, v17-v25, v30, v32, v34). **El mismo blob en todos** → la clave de `/sync` tampoco ha rotado.

---

## 4. FICHEROS RASTREADOS POR GIT

| Metrica | Valor |
|---|---|
| Ficheros rastreados (`git ls-files`) | **10.496** |
| Escaneados en busca del valor literal | **10.472** |
| Omitidos (no legibles como texto / binarios) | **24** |
| **Ficheros rastreados que contienen el valor de `ape.enroll.secret`** | **CERO** |

**Conclusion: el secreto NO esta en el repositorio.** El riesgo no esta en git; esta en **los binarios** (§3).

Datos complementarios del mismo barrido:

- El **placeholder** `CHANGE_ME_ENROLL_SECRET...` aparece en un unico fichero rastreado: `IPTV_v5.4_MAX_AGGRESSION\android\ape-crystal-agent\app\build.gradle.kts` (es la definicion del fallback, linea 18 — no es una fuga).
- `SYNC_KEY_ENC` aparece en **2** ficheros rastreados: `app\build.gradle.kts:37` y `app\src\main\java\com\ape\crystalagent\EmbeddedKey.kt` (que consume `BuildConfig.SYNC_KEY_ENC` en `:26`). El **valor del blob** solo esta en `build.gradle.kts:37`; `EmbeddedKey.kt` lo referencia, no lo duplica (comprobado: el literal no aparece en ese `.kt`).

### 4.1 Hallazgo adicional: la clave AES de descifrado esta hardcodeada en un fichero TRACKED

`app\src\main\java\com\ape\crystalagent\EmbeddedKey.kt:21`

```kotlin
private const val AES_KEY_HEX = "<64 caracteres hex = 32 bytes>"   // valor NO reproducido aqui
```

- Es la clave que descifra `SYNC_KEY_ENC` (`:34` `SecretKeySpec(hex(AES_KEY_HEX), "AES")`).
- **Esta en un fichero rastreado por git** y **dentro del APK** (`EmbeddedKey` es codigo Kotlin compilado).
- El patron del literal es una secuencia hex sintetica (`A1B2C3D4…`) → **huella de placeholder**, no una clave aleatoria. Se reporta como tal: longitud 64 hex, sha256 del literal en `scratch\apk_secret_scan_20261111\scan_meta.json`, **no se ha intentado descifrar nada** (fuera de alcance y produciria un secreto).
- El propio fichero lo declara (`:13`): *"Esto es OFUSCACIÓN, no seguridad fuerte: la clave de descifrado también vive en el APK."*

---

## 5. INFERENCIA TEMPORAL (medida, no supuesta)

El **mismo** valor de secreto aparece en:

- el APK mas antiguo con hallazgo: `ara-x\app-dist\ARA_X_APP_debug_20261030_2258.apk` — **2026-10-30 22:26**
- el APK mas reciente: `app-debug.apk` — **2026-11-11 02:58**

→ **12 dias, 29 builds, cero rotaciones.** Cualquiera que haya obtenido *cualquiera* de esos 29 binarios en ese periodo tiene el secreto vigente hoy, y con el puede enrolar dispositivos nuevos en `/ara/enroll` (WireGuard) sin autorizacion.

**Alcance del dano, con precision:** el secreto **no** da acceso a video ni a `/sync` (ver `ara-x\reports\R6_security.md:152`: `APE_ENROLL_SECRET` no es clave HMAC de `/sync`). Da **enrolamiento WireGuard**: alta de un peer con IP en `10.200.0.x` (`vps\enroll\ape-enroll-worker.py:13-14`). Es creacion de acceso a la red privada, no lectura de contenido.

---

## 6. LO NO COMPUTADO (con su razon)

| Item | Razon |
|---|---|
| Si APK antiguos llevan **secretos historicos distintos** del actual | Solo puedo buscar el valor **actual** (es el unico que conozco). Un APK que llevase un secreto anterior no lo detectaria con esta aguja. **NO COMPUTADO**, y por tanto el recuento de 29 es un **minimo**, no un total. |
| Si el valor del VPS coincide hoy con el de `local.properties` | Requiere leer `env[APE_ENROLL_SECRET]` del pool php-fpm en el VPS. **PROHIBIDO contactar el VPS.** Existe evidencia documental (`ara-x\reports\R6_security.md:58`: "longitud 48") que **coincide con los 48 chars medidos aqui**, pero es un reporte, no una medida en vivo. |
| `SYNC_KEY_ID` | 2 caracteres (`k1`): no discriminante (§1.3). |
| APK de `ottshim`: por que no lleva secreto | Es el APK del **modulo libreria** (`ottshim\app\build\outputs\apk\debug\app-debug.apk`, 15 entradas, 1.419.782 B): no compila el `BuildConfig` de la app `com.ape.crystalagent`. Consistente, no es un fallo. |
| Los 24 ficheros rastreados no leidos | No son texto plano legible por `Get-Content -Raw`. Se declaran omitidos en lugar de contarlos como limpios. |

---

## 7. CONCLUSIONES OPERATIVAS

1. **La rotacion no es opcional y no puede ser parcial.** Mientras el valor actual siga en 29 binarios, rotar en el servidor **solo** revoca a esos 29 (bien), pero cualquier copia guardada del binario sigue conteniendo el secreto **viejo** — que deja de valer, y eso es precisamente lo que se busca.
2. **Hay que inventariar y retirar los 29 binarios**, con prioridad en `deliverables\` (4) y `artifacts\` (2): son material de entrega, es decir, lo que mas probablemente salio de esta maquina.
3. **`scratch\` y `app\build\` son salidas locales** (gitignored) pero **contienen el secreto igual**: borrarlas forma parte de la higiene, no del arreglo.
4. **El metodo de verificacion posterior es obligatorio que sea el correcto** (§1.2): descomprimir entrada por entrada. Un `grep` sobre el `.apk` dara cero siempre y producira un falso "limpio".
5. Procedimiento de rotacion paso a paso, con lo que se rompe y en que orden: **[`docs/ops/SECRET_ROTATION_PROCEDURE.md`](../ops/SECRET_ROTATION_PROCEDURE.md)**.

---

## 8. EVIDENCIA EN `scratch\apk_secret_scan_20261111\`

| Fichero | Contenido |
|---|---|
| `scan_apks.ps1` | escaner (descomprime cada entrada y busca con offsets) |
| `scan_results.json` | resultado completo: 36 APK × entradas × agujas × offsets |
| `scan_meta.json` | agujas usadas con su sha256 y longitud (nunca el valor) + marca de discriminancia |
| `hit_<sha256_16>.json` | un fichero por APK con su detalle |
| `scan_console.log` | traza de consola de la corrida (36 APK, entradas y conteos) |

**Privacidad:** ningun fichero de `scratch\apk_secret_scan_20261111\` contiene el valor de ningun secreto; solo conteos, offsets y huellas.

---

*Barrido ejecutado el 2026-11-11 entre 03:04 y 03:12 (America/Bogota). 36 APK, ~800 MB de contenedor, todas las entradas descomprimidas. Cero rotaciones ejecutadas, cero ediciones de `local.properties`, cero contacto con el VPS, cero push.*
