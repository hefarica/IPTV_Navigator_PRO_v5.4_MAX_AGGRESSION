# Comandos — IPTV PREMIUM

## Comando principal

```text
/suprema-2026
```

Carga `profiles/IPTV_PREMIUM.json` y esta skill; muestra el perfil y su matriz de madurez.

## Modos

```text
/suprema-2026 audit <list-or-url>
/suprema-2026 channel <index|name> <list>
/suprema-2026 recipe <P0..P5>
/suprema-2026 profile IPTV_PREMIUM
/suprema-2026 verify <evidence-path>
```

## Contrato de salida

- Markdown: `.agents/reports/suprema-2026_<timestamp>.md`
- Estados: `declared / observed / resolved / applied / verified`
- No se rellenan valores ausentes.
- No se exponen credenciales.
- No se emite juicio de calidad si no se pide.

## Ejemplos

```text
/suprema-2026 profile IPTV_PREMIUM
/suprema-2026 channel 159 artifacts/audit/2026-11-02_APE_LISTA_1793589060441/playlist.m3u8
/suprema-2026 recipe P4
/suprema-2026 audit https://iptv-ape.duckdns.org/lists/APE_LISTA_1793589060441.m3u8
```


