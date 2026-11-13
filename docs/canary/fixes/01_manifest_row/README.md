# Fix 0001 — fila del manifiesto para el script con el bucle Canary↔JIT (D-3)

> ## ⛔ NO APLICADO
> Este parche **no está aplicado** en el repo. El árbol sigue byte-idéntico
> (`_vps_stage/deploy/manifest.tsv` = 6.501 B, sha256 `5f5adcf10f66e742dcc68d06cbfc75f0e11c69cf7cc1de695f5372b946f018ed`).
> Aplicarlo es una decisión del operador. Aquí solo se entrega el artefacto y su prueba.

| | |
|---|---|
| Parche | [`0001-manifest-row.patch`](0001-manifest-row.patch) |
| Bytes / sha256 | 1.185 B · `32649bb00e0922275e951aa50d4094e462abc5e323a009fd8ba6c89e667cc73e` |
| Fichero que toca | `_vps_stage/deploy/manifest.tsv` (1 línea) |
| `git apply --stat` | `1 file changed, 1 insertion(+), 1 deletion(-)` |
| `git apply --check` | **exit 0** sobre el repo real (no escribe) |
| Decisión que desbloquea | **D-3** |

## 1. El defecto (medido, no heredado)

| Hecho | Dato |
|---|---|
| Filas del manifiesto que mapean `ape-visual-emulate` | **solo una**: L39 → `_vps_stage/canary/ape-visual-emulate.sh` (4.068 B, 0 hits de `jit`) |
| Filas del script que **sí** implementa el bucle | **0** para `vps/bin/ape-visual-emulate.sh` (6.714 B, 7 hits de `jit`) |
| Consecuencia | el deploy nunca lleva al VPS el script con el bucle: la integración Canary↔JIT no se despliega jamás |
| Dónde estaba documentado | `docs/audits/S16_DELIVERABLES_INVENTORY_20261111.md`, fila 08 (H-1) |

## 2. Decisión: **se reemplaza la fila de L39** (no se añade un destino nuevo)

El encargo ofrecía dos salidas. Elegida la **primera**, y la razón no es estética:

- **La unidad systemd invoca exactamente ese destino**: `_vps_stage/canary/ape-canary@.service:14` →
  `ExecStart=/usr/local/bin/ape-visual-emulate.sh %i`. Si se usara un destino distinto (p. ej.
  `/usr/local/bin/ape-visual-emulate-jit.sh`), el fichero se desplegaría **y nadie lo llamaría**: D-3 quedaría
  abierto en el fondo (desplegado pero inerte).
- No se puede mapear **dos orígenes al mismo destino** en este pipeline: `deploy.sh:80` instala por fila y el
  manifiesto es la fuente única; una segunda fila con el mismo destino sería una colisión silenciosa (la
  segunda pasada sobrescribiría a la primera sin decirlo).

**No se pierde nada al sustituir**, y esto se verificó leyendo el script grande:

| Gate / pieza | Copia de 4.068 B | Script de 6.714 B |
|---|---|---|
| Gate `ara-skill check --for-canary` | L37-38 | **L37-38** (idéntico) |
| Salida obligada `3840x2160` | L70 | **L122** (idéntico) |
| Bucle con el JIT (`/jit/signal`) | — | **sí** (`MODO=JIT-REGLA`), con caída declarada a `CANARY-LEGACY` (L102) |

Es un superconjunto del pequeño: mismos gates de entrada y salida, más el bucle y un fallback **que se declara**
en vez de fingir que validó.

### Riesgo declarado

1. **Coste de CPU en producción.** Activar el bucle no es gratis: el incidente del 2026-11-09 midió
   **57 s de CPU y 146 s de pared por un clip de 6 s** (`docs/manifestos/INCIDENTE_DEPLOY_MANUAL_2026-11-09.md:147`),
   y el bucle 4K del JIT se midió a **3,37 fps contra 25 fps de fuente** (`:66-67`). Con `CPUQuota=40%` en la
   unidad, esto compite con el reproductor. El 2026-11-09 el auto-reintento se comió la CPU y el operador se
   quedó sin TV (`:68`).
2. **Cambia lo que corre.** El destino es el mismo, así que **el contenido que se ejecuta cambia** en el próximo
   deploy. No hay cambio de unidad, ni de ruta, ni de permisos — pero sí de comportamiento.
3. **El manifiesto deja de mapear la copia de 4.068 B.** Si se quiere volver a desplegar la pequeña, hay que
   revertir este parche (abajo). El fichero pequeño sigue en el repo: no se borra nada.

## 3. Prueba de que aplica y de que cambia el conteo (0 → 1)

Sobre una **copia temporal** del manifiesto (el repo no se toca):

```text
=== ANTES de aplicar ===
filas con origen vps/bin/ape-visual-emulate.sh = 0
destinos derivados (dry-run.sh:6 -> cut -f2) contienen /usr/local/bin/ape-visual-emulate.sh : 1

=== aplicando el parche en la copia ===
apply_exit=0

=== DESPUES de aplicar ===
filas con origen vps/bin/ape-visual-emulate.sh = 1
destinos derivados contienen /usr/local/bin/ape-visual-emulate.sh : 1  (sin duplicar el destino)
ocorrencias de ape-visual-emulate en la lista de destinos = 1
--- fila resultante (tabs visibles) ---
  [vps/bin/ape-visual-emulate.sh <TAB> /usr/local/bin/ape-visual-emulate.sh <TAB> 755 <TAB> root:root <TAB> canary 4K (25M/32M/64M keyint 48) | origen cambiado a vps/bin/ape-visual-emulate.sh (6.714 B) porque es el unico que llama a /jit/signal (H-1/D-3); la copia de 4.068 B no tiene bucle JIT]
```

**Que `dry-run.sh` la ve como destino** se comprueba con su propia derivación: `dry-run.sh:6` hace
`manifest_rows | cut -f2` — el destino `/usr/local/bin/ape-visual-emulate.sh` aparece **una vez** antes y
**una vez** después, y el recuento de destinos `ape-visual-emulate` no se duplica. El `cut -f2` de arriba es
esa misma operación.

## 4. Cómo se generó (reproducible) y cómo se aplica

```bash
# 1) copia del fichero a un temporal, editar la COPIA (origen de L39), nunca el repo
# 2) diff con cabeceras normalizadas al path real:
#    diff --git a/_vps_stage/deploy/manifest.tsv b/_vps_stage/deploy/manifest.tsv
#    --- a/_vps_stage/deploy/manifest.tsv
#    +++ b/_vps_stage/deploy/manifest.tsv
# 3) verificar SIN escribir:
git apply --check docs/canary/fixes/01_manifest_row/0001-manifest-row.patch   # exit 0
git apply --stat  docs/canary/fixes/01_manifest_row/0001-manifest-row.patch   # 1 file changed, 1 insertion(+), 1 deletion(-)
```

**Ojo al reproducir:** si el diff se genera con rutas absolutas de Windows, git las **cita** (`"a/C:\\..."`) y
el parche deja de aplicar. Hay que generarlo con rutas relativas y reescribir las tres líneas de cabecera.

## 5. Cómo revertir

| Situación | Comando |
|---|---|
| Aplicado y **no** commiteado | `git apply -R docs/canary/fixes/01_manifest_row/0001-manifest-row.patch` |
| Aplicado y commiteado | `git revert <commit>` o restaurar la fila: `git checkout <rev-anterior> -- _vps_stage/deploy/manifest.tsv` |
| Comprobación de que quedó revertido | `grep -c '^vps/bin/ape-visual-emulate.sh' _vps_stage/deploy/manifest.tsv` → **0**, y el sha256 vuelve a `5f5adcf1…` |

Revertir este parche **no** revierte ningún despliegue: el VPS no se ha tocado.

## 6. Lo que este parche NO hace

- **No despliega**: es una línea de un fichero de texto. El repo queda igual (`git apply --check` no escribe).
- **No contacta el VPS**, no ejecuta `deploy.sh`, no reinicia nada.
- **No habilita el servicio**: sigue habiendo **0** ocurrencias de `systemctl enable` en el tooling de deploy.
- **No resuelve los otros bloqueos del recibo** (`12_CANARY_DEPLOYMENT_RECEIPT.json`): B2 exige `--yes`,
  B3 exige VPS para `validate.sh`, B4 es el `enable` que falta.
- **No decide sobre el coste**: el riesgo de CPU del punto 2.1 es del operador.
