# ESTADO — traspaso en una página

**Para quien retome esto sin haber visto la sesión.** Todo lo de abajo es reproducible con comandos del
repo. Nada está en la cabeza de nadie.

---

## 1 · LO QUE SE PEDÍA, CONSEGUIDO

**Todas las listas entregan 200, 206 y 302. El gate está en 20/20 y `CUMPLE`.**

Medido desde una máquina independiente con `node tools/ape-http-conformance/gate_matrix.js` (exit 0):

| Lista | 200 identity | 200 gzip | 206 identity | 206 gzip | http→https |
|---|---|---|---|---|---|
| APE_LISTA_1793589060441 | 200 | 200 | **206** | **206** | **302** |
| APE_LISTA_1793558303852_CDN | 200 | 200 | **206** | **206** | **302** |
| APE_PRUEBA_ORDER_OK | 200 | 200 | **206** | **206** | **302** |
| APE_PRUEBA_PERFILES | 200 | 200 | **206** | **206** | **302** |

Antes: **12/20**. Después: **20/20**. Run que lo aplicó: **`41536525879`**, tres jobs en verde.

### Los cuatro cambios, y por qué

| Cambio | Qué arregla |
|---|---|
| `gunzip on` → `gunzip off` | nginx descomprimía en vuelo y perdía el rango (listas grandes) |
| `gzip_static always` → `gzip_static on` | no forzar el `.gz` a un cliente que no lo pide |
| `gzip off` en el location de `.m3u8` | matar la compresión **dinámica** de las listas pequeñas, que no tienen `.gz` |
| `return 301` → `return 302` | la redirección http→https |

El mecanismo del 206 está corroborado por la lista de desarrollo de nginx: su filtro de gzip borra el
estado del filtro de rangos y responde 200 con el cuerpo comprimido entero. Ver
`docs/ops/TOP5_206_UPSTREAM_CORROBORATION.md`.

---

## 2 · Cómo está montado, para poder repetirlo o revertirlo

Workflow: `.github/workflows/ape-nginx-206-302.yml`, en `master`, disparo manual.

```bash
# Solo lectura: compara la config viva con el baseline y valida los anclajes
gh workflow run "ape-nginx-206-302.yml" --ref master -f mode=verify-only

# Aplicar (idempotente: se puede repetir sobre un host ya parcheado)
gh workflow run "ape-nginx-206-302.yml" --ref master \
  -f mode=apply -f confirm="CONFIRMO 206 y 302 en produccion"
```

Trabaja sobre `/etc/nginx/sites-enabled/default`, que es **el fichero que nginx carga de verdad** en este
host. Antes de escribir: copia de seguridad en `/root/ape-nginx-backup-<stamp>.conf`, luego `nginx -t`,
luego reload, luego comprueba que el `:443` sigue escuchando. Si `nginx -t` falla o el puerto no
escucha, **restaura y no recarga**. Para deshacer a mano:

```bash
sudo cp -a /root/ape-nginx-backup-<stamp>.conf /etc/nginx/sites-enabled/default
sudo nginx -t && sudo nginx -s reload
```

---

## 3 · Dos trampas que costaron una vuelta cada una

1. **`workflow_dispatch` exige el fichero en la rama por defecto.** Con el workflow sólo en una rama de
   trabajo, GitHub devuelve `HTTP 404` y no lo despacha nunca. Por eso el fichero está en `master`.
2. **`sites-enabled/default` NO es un symlink a `sites-available/default` en este host: son dos ficheros
   distintos.** El activo tiene 8.071 bytes y lleva el bloque `location ~* \.m3u8`; el de `available`
   tiene 344 líneas y no lleva ni `gzip_static` ni `gunzip`. Leer el equivocado hacía que la
   comprobación de anclajes encontrara cero ocurrencias y se negara a aplicar. **Eso fue una suerte.**

Y dos defectos propios, corregidos: el paso se llamaba «20/20 o rollback» y nunca revertía nada (la
función `rollback()` vive en el paso anterior), y el apply exigía las formas originales, así que un
segundo pase sobre un host ya parcheado fallaba el anclaje. Ahora es idempotente en las dos direcciones.
