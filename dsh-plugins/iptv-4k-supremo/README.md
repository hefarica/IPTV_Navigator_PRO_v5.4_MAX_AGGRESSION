# @local/iptv-4k-supremo

Entrada en la barra lateral izquierda de la Web UI de DeepSeek Harness que abre un
panel con el catálogo **medido** de los 11 repositorios supremos IPTV 4K.

## Qué resuelve

El catálogo original (pegado por el owner) traía 11 repos con estrellas, URLs de
playlist y un pipeline de 4 pasos. Al medirlo contra la realidad el 2026-11-15,
la mitad no se sostenía:

- **4 de las 4 URLs** de endpoint del catálogo devuelven **HTTP 404**
  (`categories/4k.m3u`, `categories/8k.m3u`, `api/channels.json`, `api/4k.json`).
- **4 de 11 repos** tienen estrellas insostenibles (41, 0, 2 y 0 frente a
  declaraciones de 1.5K+, 500+, 300+ y 600+).
- El "rey del 4K" (`iptv-org`, 144.053 estrellas medidas) sirve **20 streams
  2160p**, no una categoría 4K; `categories/4k.m3u` no existe.
- A la vez, **otros estaban infravalorados**: `Guovin/iptv-api` declaraba 3.5K+ y
  mide 26.130 estrellas (×7,5).

El panel conserva el 100 % del mapa (features, comandos de clonado, esquema JSON,
stack, pipeline) y añade la segunda columna: lo medido, con fecha y fuente. Donde
el catálogo declara un endpoint, el panel muestra su código real.

## Estructura

```
dsh-plugins/iptv-4k-supremo/
  package.json            # bundle + dsh.client (platform web, immediately)
  cordis.patch.yml        # inserta la fila `iptv-4k-supremo`
  index.js                # mitad Host: apply() vacío, sin capacidad que declarar
  client.js               # icono del sidebar + panel medido
  locale/en.json          # meta.title / meta.description (Plugin Manager)
  locale/es.json          # idem en español
  icon.svg                # arte original: marco 4K + tres barras medidas
  README.md               # este archivo
  MEASURED_2026-11-15.md  # evidencia cruda de la medición
```

## Registro de slots

| Slot | Clave | Qué dibuja |
|---|---|---|
| `sidebar.panellist` | `id: iptv-4k-supremo`, `order: 26` | Solo el icono. El sidebar es el dueño del botón y le pasa `{ size, active }`. |
| `main` | `key: iptv-4k-supremo` | La página completa que abre ese icono. |

El listado de un slot resuelve su etiqueta desde los metadatos de la lista, por eso
la fila declara `label: 'Repos IPTV 4K'`.

## Límites honestos

- **Panel, no motor.** Muestra datos medidos en tiempo de construcción. No consulta
  GitHub en vivo: las estrellas y los `pushed_at` cambian y este panel es una foto.
- **Host vacío a propósito.** No registra Tools, Services ni listeners de Session.
  El conocimiento para el agente vive en las skills, no en una Tool que devuelve
  una constante.
- **Sin acentos en los identificadores** de slot (`iptv-4k-supremo`); el texto
  visible sí lleva acentos (UTF-8 verificado).
- **Las cifras del catálogo del owner no se borraron**: aparecen tachadas junto a la
  medición. Perder información no es corregirla.
