# Upscale Lab — plugin de DSH

Entrada en la **barra lateral izquierda** de la Harness Web UI + panel de referencia
del stack de escalado extremo 4K/6K, y comando de compositor **`/upscale`** para abrirlo.

## Qué añade

| Pieza | Dónde | Efecto |
|---|---|---|
| Icono `Upscale Lab` | `sidebar.panellist` (barra lateral izquierda, orden 20) | Selecciona el panel `upscale-lab` |
| Panel | slot `main`, key `upscale-lab` | Upscale-A-Video, REAL-Video-Enhancer, tabla por caso de uso y stack híbrido |
| Comando `/upscale` | `ctx.commandUi` (acción de cliente) | Abre el panel; no envía mensaje ni toca el borrador |

## Uso

1. En el compositor escribe `/upscale` y pulsa Enter.
2. O haz clic en el icono **Upscale Lab** de la barra lateral izquierda.

El panel solo **documenta** las herramientas: no ejecuta nada y no modifica listas.
Los comandos se copian con el botón *Copiar* de cada bloque.

## Contenido del panel

- **Upscale-A-Video (CVPR 2024)** — difusión temporalmente consistente, entrenado con
  degradaciones reales, 4K/6K con coherencia entre frames; limitación: 24 GB+ de VRAM y
  minutos por frame (VOD offline, no live).
- **REAL-Video-Enhancer** — RIFE + ESRGAN/Anime4K + denoise, GUI nativa, cola batch,
  presets 4K/8K.
- **Recomendación por caso de uso** — live 4K (Anime4K), VOD 6K (Upscale-A-Video),
  batch rápido (Video2X), web/OTT (WebSR), todo-en-uno (REAL-Video-Enhancer).
- **Stack extremo híbrido** — pre-proceso con Video2X, streaming con shaders Anime4K,
  cliente web con WebSR.
- **Alcance honesto** — las herramientas producen píxeles reales offline o en el
  dispositivo; una lista solo puede declarar metadata de mejora, nunca afirmar que el
  servidor escaló el stream.

## Estructura

```
package.json        manifest del bundle (dsh.bundle.patch + dsh.client)
cordis.patch.yml    inserta la fila del Loader
index.js            mitad Host (sin comportamiento)
client.js           mitad Cliente: entrada lateral + panel + /upscale
locale/en.json      meta.title / meta.description (en)
locale/es.json      meta.title / meta.description (es)
icon.svg            icono original (currentColor)
```

Estilos: solo tokens del tema (`--dsw-alias-*`, `--dsw-radius-*`, `--ds-font-family-code`),
así el panel sigue claro/oscuro. Textos vía servicio de locale del cliente
(`upscaleLab`, diccionarios `en` y `es`).

## Desinstalar

Desde el Plugin Manager de la Harness (Settings → Plugins) o con
`plugin_manager` `remove_bundle` sobre `@local/upscale-lab`.
