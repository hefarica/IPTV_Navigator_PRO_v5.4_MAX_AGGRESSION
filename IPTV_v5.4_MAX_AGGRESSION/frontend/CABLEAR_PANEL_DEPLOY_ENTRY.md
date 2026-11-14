# Entrada de despliegue del panel «Cablear» — cambios PREPARADOS, NO aplicados

**Motivo:** `.github/workflows/ape-deploy-frontend.yml` despliega el frontend desde una **allowlist**
`FICHEROS` (líneas ~51-60). Un fichero que no esté ahí **no se sirve** desde `/var/www/html`.

**`.github/` está fuera del alcance de t61/t65** → el cambio queda preparado aquí, sin aplicarlo.
**Para que el capitán solo tenga que copiar.**

---

## 1. Línea que FALTA en el inventario `FICHEROS` (1 línea)

En `.github/workflows/ape-deploy-frontend.yml`, dentro de `FICHEROS:`:

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

> **La única línea nueva es** `      js/ape-v9/list-cablear-panel.js`.
> `index-v4.html` **no** necesita línea: ya estaba en el inventario y el include del panel vive dentro
> de él (commit `8263987d`, +6 líneas y **0 borradas**).

---

## 2. El endpoint de listado NO va en `FICHEROS` (y por qué)

El desplegable del panel consume **`/prisma/api/cablear-listas.php`**, cuyo fichero es:

```
IPTV_v5.4_MAX_AGGRESSION/vps/prisma/api/cablear-listas.php   (10.017 B, sha256 fa23cf1f…b356c)
```

**Ese fichero NO puede desplegarse con `ape-deploy-frontend.yml`**: el workflow fija
`SRC_DIR: IPTV_v5.4_MAX_AGGRESSION/frontend` (L61) y **solo** recorre ese árbol. Añadirlo a
`FICHEROS` no lo desplegaría y, además, el bucle `node -c` (L87) intentaría validar un `.php` con
Node → error seguro.

**Cómo tiene que viajar entonces** (fuera de mi alcance, decisión del capitán):
1. Copiarlo al VPS en `/var/www/html/prisma/api/cablear-listas.php` por el **mismo camino que los
   otros endpoints PHP de t60** (`cablear.php`, `cablear-estado.php`, `list-cablear.php`,
   `list-cablear-status.php`, `list_cablear_core.php`).
2. Asegurar que `/prisma/api/cablear-listas.php` se sirve por PHP-FPM (el patrón de los demás
   `/prisma/api/*`). Sin ruta PHP, el panel mostrará el motivo literal (`HTTP 404`), no un genérico.
3. `X-APE-Key`: si el VPS define `APE_CABLEAR_KEY`, el listado **también** la exige (mismo patrón que
   encolar/estado). El panel la envía si la página expone `window.APE_CABLEAR_KEY`.

---

## 3. Verificación después del deploy

```bash
# a) el panel se sirve
curl -sSI https://iptv-ape.duckdns.org/js/ape-v9/list-cablear-panel.js | head -5

# b) el HTML referencia el panel
curl -s https://iptv-ape.duckdns.org/index-v4.html | grep -c list-cablear-panel.js     # -> 1

# c) el endpoint de listado responde y trae listas
curl -s 'https://iptv-ape.duckdns.org/prisma/api/cablear-listas.php?limite=5' \
  | head -c 400        # -> {"ok":true,"count":N,"total":M,...,"listas":[{...}]}

# d) en la UI: al abrir "🔌 Integración de listas — cablear UNA lista concreta" el desplegable
#    debe mostrar N listas con fecha/tamaño, la primera marcada "← la más reciente",
#    y "Publicar" debe venir MARCADO.
```

---

## 4. Nota de estado (t65)

El panel ya está **reparado en el repo** (desplegable + `publicar` marcado). Lo que falta para que el
operador lo use es **desplegar**: (a) el JS (línea de §1) y (b) el endpoint PHP de §2. Sin (b), el
desplegable mostrará `no se pudo leer /lists/ (HTTP 404…)` y el campo manual seguirá funcionando como
respaldo — degradación honesta, no pantalla rota.
