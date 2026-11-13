# CANARY_ROLLBACK_PROCEDURE — procedimiento de reversión

**Estado: VERIFICADO en lo que puede verificarse sin desplegar. NO ejecutado en el VPS.**

Todo lo que sigue son comandos concretos sobre artefactos que existen en el repo. **Ningún componente de este documento está desplegado.** Por eso el rollback se divide en dos partes: lo que ya se puede revertir hoy (el repo) y lo que habrá que revertir cuando se despliegue.

---

## 0 · Principio

> **Ninguna acción de este proyecto deja el sistema en un estado del que no se pueda volver.**

Cada componente que escribe algo deja su propio rollback:

| Componente | Qué escribe | Su rollback |
|---|---|---|
| `vps/ape-quality-watch/install.sh` | unidades systemd, `/opt`, `/var/lib` | deja `/var/backups/ape-quality-watch/<stamp>/rollback.sh` |
| `vps/ape-list-probe/v3/` | **nada** en el VPS todavía (sin unidad) | no aplica |
| `tools/quality/apply_harness.js` | **un fichero nuevo**, nunca el original | borrar el fichero nuevo |
| `tools/quality/regenerate_playlist_urls.js` | **un fichero nuevo**, nunca el original | borrar el fichero nuevo |
| `tools/quality/check_display_state.ps1` | **nada** salvo con `-Fix` | el propio `-Fix` es la reversión |
| El llavero ADB / el aparato | **nada** desde esta sesión | no aplica |

**Ninguno sobrescribe. Ninguno borra. Ninguno toca producción.**

---

## 1 · Revertir el repo (esto sí se puede hoy)

```bash
# Ver qué ha cambiado desde el último estado sano
git log --oneline 472f7cc3..HEAD | head -40
git status --short

# Volver al commit anterior conservando los cambios locales
git stash push -m "rollback-<motivo>"

# O volver a master (que NUNCA se tocó en esta sesión)
git checkout master
git log --oneline -1        # debe ser d2c27293b36ee331480d56dc91d08c0981cd3c50
```

**Master está intacto: `d2c27293b36ee331480d56dc91d08c0981cd3c50`.** Todo el trabajo vive en la rama `deploy/engine-restart-20261112`. Revertir el repo es `git checkout master` y nada más.

### Revertir un commit concreto

```bash
git revert <sha> --no-edit
git push origin deploy/engine-restart-20261112
```

### Revertir un fichero puntual

```bash
git checkout <sha>~1 -- <ruta>
```

## 2 · Revertir el aparato (ONN 4K)

### Si alguien dejó la pantalla sucia otra vez

```powershell
# Verificar primero (solo lee)
powershell -File tools/probe/check_display_state.ps1

# Revertir lo desviado. SOLO toca las dos claves de geometría y los overrides de wm.
powershell -File tools/probe/check_display_state.ps1 -Fix
```

**Valores de fábrica que se restauran:**
```bash
adb shell 'settings delete global display_size_forced'     # de fábrica: null
adb shell 'settings delete secure display_density_forced'  # de fábrica: null
adb shell 'wm density reset'                               # de fábrica: 320
adb shell 'wm size reset'
```

### Si se forzó un modo de display

```bash
adb shell 'cmd display clear-user-preferred-display-mode'
```
**Nota medida:** ese comando devuelve `SecurityException` **pero el modo se limpia igualmente.** El error no es un fallo del efecto.

## 3 · Revertir la lista publicada

**Nada que revertir hoy: no se ha publicado ninguna lista.**

Cuando se publique una lista con harness, el rollback es:

```bash
# La lista original sigue intacta en el VPS: el aplicador escribe un fichero NUEVO.
# Volver a apuntar a la lista anterior:
cp -a /var/www/html/lists/<anterior>.m3u8 /var/www/html/lists/<actual>.m3u8
```

**Regla de oro: el aplicador NUNCA sobrescribe.** Si se necesita la lista de antes, sigue estando donde estaba.

### Revertir la aplicación del harness a una copia local

```bash
rm regenerated_list_4K_RESOLVER.m3u8
rm scratch/APE_LISTA_HARNESS.m3u8
```
Son ficheros nuevos. Borrarlos no afecta a nada.

## 4 · Revertir `ape-quality-watch` (cuando se despliegue)

```bash
# Cada instalación deja su propio rollback
/var/backups/ape-quality-watch/<stamp>/rollback.sh

# O a mano:
systemctl stop ape-quality-watch.timer 2>/dev/null
systemctl disable ape-quality-watch.timer 2>/dev/null
rm -f /etc/systemd/system/ape-quality-watch.service
rm -f /etc/systemd/system/ape-quality-watch.timer
systemctl daemon-reload

# El ledger NO se borra: es historia, no estado.
```

## 5 · Qué NO revertir nunca

| Cosas | Por qué |
|---|---|
| El ledger `/var/lib/ape-quality-watch/ledger.jsonl` | es evidencia con fecha, no estado |
| `docs/audits/*.json` | son la evidencia de lo medido |
| Los tests y gates | son el candado que impide la regresión |
| `master` | es el estado sano de referencia |

## 6 · Verificación post-rollback

```bash
# El repo está en el estado esperado
git rev-parse --short HEAD
git status --short          # debe estar vacío

# Los gates siguen verdes (no se revierte rompiendo el candado)
LABV24=artifacts/LAB_CALIBRATED_FINAL_v24.0.0-6K.json \
  node tools/quality/list_gate.js tests/fixtures/lista_sana_con_harness.m3u8 --sin-red

# El aparato está en baseline
powershell -File tools/probe/check_display_state.ps1
```

## 7 · Límite honesto

**Ningún rollback de este documento se ha ejecutado.** Los comandos están verificados como sintaxis y salen de artefactos reales (`install.sh` deja su `rollback.sh`, el aplicador nunca sobrescribe, el repo tiene `master` intacto), pero **no se ha probado un ciclo desplegar→revertir** porque nada se ha desplegado.

Cuando se despliegue algo, **la primera acción después del despliegue debe ser probar este rollback.**
