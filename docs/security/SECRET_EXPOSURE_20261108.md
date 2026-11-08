# INCIDENTE DE EXPOSICIÓN DE CREDENCIALES — 2026-11-08

**Severidad: ALTA.** Credenciales de proveedor reales están versionadas en git y **publicadas en `origin`**.

## 1 · Qué se encontró

Al auditar el punto §6 del dictamen externo («las URLs contienen datos de acceso») se midió la lista
completa y después se buscó el mismo patrón en el repositorio. El resultado:

| Medición | Valor |
|---|---|
| Pares usuario/clave en la lista de producción (21.224 canales) | **3** |
| Ficheros trackeados que mencionan un host de proveedor | **312** |
| De esos, solo hostname (documentación/config, sin cuenta) | **293** |
| **Ficheros trackeados con un PAR DE CREDENCIALES real** | **19** |

`tools/lab/muestra.json` contiene por sí solo **600 URIs** con credenciales. El resto reparte entre 7 y 1.

### 1.1 · Los 19 ficheros

```
tools/lab/muestra.json                                        600 URIs
.claude/settings.json                                           7
IPTV_v5.4_MAX_AGGRESSION/frontend/tests/test-server-profile.js   4
audit/alignment/2026-10-25/50-listas/tools/_raw_lists_audit.json 3
tools/lab/probes_url.json                                       3
IPTV_v5.4_MAX_AGGRESSION/frontend/tests/url-guard-xtream.repro.js 2
audit/alignment/2026-10-25/40-vps/VPS_LISTS_INVENTORY.md         2
audit/alignment/2026-10-25/50-listas/tools/_raw_census_vigente.txt 2
tools/lab/out_regression_url.m3u8                               2
tools/lab/out_regression_url_actual.m3u8                        2
tools/lab/out_regression_url_head.m3u8                          2
IPTV_v5.4_MAX_AGGRESSION/backend/generate_test_m3u8.js           1
audit/alignment/2026-10-25/50-listas/LISTS_SAMPLING.md           1
docs/CDN_REWRAP_WIRING.md                                        1
stream_health_monitor.sh                                         1
tools/url2/test_ape_url_builder.js                               1
tools/url2/verify_cartridge_integration.js                       1
tools/url2/verify_pulse.js                                       1
tools/url2/verify_url2_cartridge.js                              1
```

### 1.2 · Por qué importa

Un par usuario/clave de Xtream da **acceso completo** a todos los canales de ese servidor, no a un canal.
La lista de producción asigna **un solo par por host** a miles de canales, así que un par expuesto = cuenta
expuesta.

### 1.3 · Qué NO es un problema

- Los **293** ficheros que solo nombran el host (`line.tivi-ott.net` en nginx/docs/config): no llevan cuenta.
- `.gitignore` **sí** cubre las listas generadas (`/*.m3u8`, `IPTV_v5.4_MAX_AGGRESSION/**/*.m3u8`). Las 38
  listas que hay en disco fuera de git están ignoradas correctamente.

## 2 · Mitigación inmediata (operador)

1. **ROTAR** los 3 pares usuario/clave con los proveedores. Es la única mitigación real: el material ya
   está en la historia de git y en `origin`, y borrar ficheros no lo retira de los clones existentes.
2. Comprobar si las ramas afectadas llegaron a publicarse fuera del círculo.

## 3 · Mitigación de repositorio (código, sin romper nada)

- Añadidas reglas a `.gitignore` para las salidas regenerables del banco de pruebas.
- **Pendiente de autorización del operador:** purga de historia (`git filter-repo`). Es destructiva,
  reescribe hashes y obliga a re-clonar; **no se ejecuta sin `CONFIRMED:` explícito**.

## 4 · Prevención

Cualquier fixture que necesite una URL de ejemplo debe usar un host **no resolvible** (`audit.invalid`),
que es lo que ya hacen los tests nuevos (`rea-v24-e2e-playlist.js`, `rea-6k-lab-provenance.test.js`).

## 5 · Lo que este informe NO afirma

- No afirma que las credenciales no se hayan usado por terceros: eso no es medible desde aquí.
- No afirma el número de personas con acceso al remoto: no es medible desde aquí.
- Las cifras de ficheros y URIs salen de `git ls-files` + parseo de URL por segmentos, y son reproducibles.

## 6 · Prevención: gate de trinquete (implementado)

`tools/security/provider_credential_scan.js` detecta la firma Xtream (`host/usuario/clave/<id>`) en los
ficheros **trackeados**, la compara con `tools/security/provider_credential_baseline.json` y **falla si
aparece un fichero nuevo**.

```
node tools/security/provider_credential_scan.js            # verifica  (exit 0 = sin fuga nueva)
node tools/security/provider_credential_scan.js --update   # regenera la linea base tras limpiar
```

Es un **trinquete**, no un censo: no exige que los históricos desaparezcan de golpe (eso depende de la
rotación), exige que **ninguno nuevo entre**. Probado en cuatro pasos: base 22 ficheros -> verde;
fuga ficticia -> `FUGA_NUEVA (1)` exit 1; limpieza -> verde.

### 6.1 · Dos números distintos, y por qué

| Método | Ficheros | URIs |
|---|---:|---:|
| Censo por parseo de URL (sección 1) | 19 | ~640 |
| Gate por regex Xtream | **22** | **71** |

No se contradicen: el censo parsea todas las URLs y cuenta ocurrencias; el gate aplica una firma más
estrecha (4 segmentos con id numérico) y compara por **fichero**, no por ocurrencia. El gate detecta
**más ficheros** (22 > 19) y cuenta **menos URIs** (71 < 640, porque `muestra.json` concentra la mayoría
y su estructura no encaja segmento a segmento). Para su función — detectar entradas nuevas — es
suficiente y conservador.

### 6.2 · Pendiente de decisión del operador

El gate **no está cableado** en `tools/audit/verify_rea_patch.ps1` porque eso cambiaría el recibo de
aceptación de 23 a 24 gates, y ese recibo es un contrato que la auditoría externa referencia. Cablearlo
requiere actualizar `tools/audit/rea_patch_acceptance.json` y su conteo esperado: **decisión del
operador**, no un cambio silencioso.
