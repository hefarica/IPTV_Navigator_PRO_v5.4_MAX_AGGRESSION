# Entrada de despliegue del panel «Cablear» — cambio PREPARADO, NO aplicado

**Motivo:** el workflow `.github/workflows/ape-deploy-frontend.yml` despliega los ficheros
del frontend desde una **allowlist** llamada `FICHEROS` (línea ~51-60). Un fichero que no
esté en esa lista **no se sirve** desde `/var/www/html`, aunque exista en el repo.

**`.github/` está fuera del alcance de t61** → este cambio se deja preparado aquí, sin aplicarlo.

---

## Cambio exacto que hay que aplicar (1 línea)

En `.github/workflows/ape-deploy-frontend.yml`, dentro del bloque `FICHEROS:` añadir
`js/ape-v9/list-cablear-panel.js`. Propuesta (respetando el formato `>-` de líneas de ~78 col.):

```yaml
    FICHEROS: >-
      js/ape-v9/m3u8-typed-arrays-ultimate.js js/ape-v9/generation-output-panel.js
      js/ape-v9/ape-profiles-config.js js/ape-v9/profile-manager-v9.js
      js/ape-v9/ape-image-recipes-bundle.js js/ape-v9/generation-controller.js
      js/ape-v9/ape-server-profile.js js/ape-v9/ape-server-profiles-data.js
      js/ape-v9/rea-processing-policy.js js/ape-v9/rea-export-finalizer.js
      js/ape-v9/rea-catalog-export.js js/ape-v9/ape-quality-prober.js
      js/ape-v9/unified-generator-integration.js js/ape-v9/m3u8-api-wrapper-integrated.js
      js/ape-v9/list-cablear-panel.js
      js/ape-lab-import-helper.js js/ape-worker.js js/m3u8-world-class-generator.js
      js/m3u8-generator-v16-elite.js export-module.js app.js
```

> La única línea nueva es `      js/ape-v9/list-cablear-panel.js`.

## Por qué solo hace falta eso

| Mecanismo del workflow | Efecto sobre el fichero nuevo |
|---|---|
| `for f in $FICHEROS; do node -c "$SRC_DIR/$f"` (L87) | Validará el JS nuevo automáticamente (ya pasa: `node -c` exit 0) |
| Copia por fichero + `scp` (L113-188) | El workflow **soporta crear ficheros**, no solo actualizar (comentario en L167) |
| Verificación HTTP final | El panel viaja dentro de `index-v4.html` (que **sí** se despliega como página): no necesita una ruta nueva |
| `index-v4.html` | **Ya está** versionado y servido; el `<script>` añadido lo carga desde `js/ape-v9/` |

## Comprobación posterior al deploy (manual)

```bash
# 1) el fichero se sirve
curl -sSI https://iptv-ape.duckdns.org/js/ape-v9/list-cablear-panel.js | head -5
# 2) el HTML referencia el script
curl -s https://iptv-ape.duckdns.org/index-v4.html | grep -c list-cablear-panel.js   # -> 1
# 3) en la UI: aparece el desplegable "🔌 Integración de listas — cablear UNA lista concreta"
```

## Nota sobre los endpoints

El panel llama a `/prisma/api/cablear.php` y `/prisma/api/cablear-estado.php`. **Esa parte
es de t60** y no la toca esta tarea. Si t60 no está desplegado, el panel mostrará el error
HTTP/motivo literal que devuelva nginx (404) — comportamiento correcto y honesto, no un
"error genérico".
