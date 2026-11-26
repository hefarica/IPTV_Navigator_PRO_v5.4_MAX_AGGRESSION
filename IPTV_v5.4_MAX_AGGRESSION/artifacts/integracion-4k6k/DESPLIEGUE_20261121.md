# Despliegue a produccion — 2026-11-21

## Que se publico

Commits empujados a `deploy/engine-restart-20261112`:

- `083f6630` integracion 4K/6K (10 ficheros: 6 modificados + 4 nuevos en el inventario del deploy)
- `a8669573` fix del .gz del workflow

Run de CI/CD: `ape-deploy-frontend.yml` modo `apply` con la confirmacion literal.
Job `desplegar`: **success**. Job `plano-control-dispositivos`: failure (ver abajo).

## Verificacion contra produccion (hash LF, no tamano)

| fichero | http | sha servido == repo |
|---|---|---|
| js/ape-lab-normalize.js | 200 | True |
| js/ape-4k6k-consumer.js | 200 | True |
| js/ape-v9/ape-4k6k-audit-adapter.js | 200 | True |
| js/ape-lab-import-helper.js | 200 | True |
| js/ape-v9/m3u8-typed-arrays-ultimate.js | 200 | True |
| js/ape-v9/generation-controller.js | 200 | True |
| index-v4.html | 200 | True (sha LF `5b6abe53cad36cb7…`) |

El index servido conserva `apeDeviceCard` y `ara-device.php` (4): el port no revirtio trabajo ajeno.
`_fase4_e2e_driver.js` (driver de test) **no** viaja a produccion.

## Bug de CI corregido

El paso del `.gz` usaba `\` tres veces dentro de comillas dobles, de modo que
se expandia **en el runner** y el `chown` remoto apuntaba a un fichero inexistente. El deploy moria tras
instalar el primer fichero y dejaba produccion a medias. Corregido con un unico temporal creado en el VPS.

## Bloqueo ajeno, con numeros

`coherent:false` en `/prisma/api/ara-device.php?action=version`:

- manifiesto: `size 25678434` / `sha256 8d3b1458…`
- APK servido: `size 24029140` / `sha256 9bded476…`, `Last-Modified 2026-11-16`
- `drift: ["size","sha256"]`

No lo toco: el APK y su manifiesto son otro plano y la decision (resubir el APK o regenerar el manifiesto)
es del operador. El deploy del frontend no depende de ello.