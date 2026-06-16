# Informe final: [SCOPE]

Autor: **Manus AI**  
Fecha: **[DATE]**

## Resumen ejecutivo

Se integró y validó el alcance **[SCOPE]** sobre el paquete APE VPS HEVC-UHD Crystal-first. El resultado conserva la prioridad **HEVC/HVC1/HEV1 UHD Crystal viable**, con fallback QoE explícito, contrato bidireccional player ⇄ daemon y límites técnicos documentados.

## Cambios implementados

| Área | Artefacto | Estado | Propósito |
|---|---|---:|---|
| Deploy | `[deploy_script]` | [Estado] | [Propósito] |
| Contrato | `[contract_path]` | [Estado] | [Propósito] |
| Prompt | `[prompt_path]` | [Estado] | [Propósito] |
| Nginx/Lua/API | `[paths]` | [Estado] | [Propósito] |
| Worker/ADB | `[paths]` | [Estado] | [Propósito] |
| Frontend/M3U8 | `[paths]` | [Estado] | [Propósito] |

## Contrato operativo

Describir aquí el flujo real de instalación, reproducción, wake y fallback. Mantener una distinción clara entre metadata HLS, ejecución en host autorizado y comportamiento del daemon/player.

| Punto crítico | Decisión final |
|---|---|
| ¿El M3U8 ejecuta código? | **No**. Solo transporta metadata/punteros. |
| ¿ADB se habilita remoto? | **No**. Debe estar habilitado y autorizado por el operador. |
| ¿El VPS mejora píxeles directamente? | **No**. Selecciona políticas, metadata, variantes y fallback QoE. |
| ¿El wake bloquea Nginx? | **No**. Se encola y procesa fuera del request crítico. |

## Validaciones ejecutadas

```bash
[commands]
```

| Validación | Resultado |
|---|---:|
| Presencia de módulos requeridos | [OK/FAIL] |
| Bash syntax | [OK/FAIL/N/A] |
| PHP lint | [OK/FAIL/N/A] |
| JavaScript syntax | [OK/FAIL/N/A] |
| JSON validity | [OK/FAIL/N/A] |
| ZIP integrity | [OK/FAIL] |
| Critical files in ZIP | [OK/FAIL] |

## Validaciones condicionadas al VPS real

Enumerar `nginx -t`, `systemctl`, socket PHP-FPM, permisos reales, Lua runtime, exposición HTTPS pública, ADB autorizado y prueba de reproducción real en device.

## Uso recomendado

```bash
bash [deploy_script] --source /ruta/paquete --target /var/www/ape --dry-run
sudo bash [deploy_script] --source /ruta/paquete --target /var/www/ape --apply --restart-services
sudo systemctl enable --now ape-wake-worker.service
curl -fsSL https://[domain]/prisma/install/ape-daemon.sh | sh
```

## Caveat obligatorio

> Playlist anchors are metadata. Real installation and wake require a deployed VPS path plus an authorized ADB host/device or a compatible player/device runtime.

## Conclusión

El paquete queda listo para revisión o despliegue controlado, con artefactos verificables, checksums y límites técnicos explícitos.
