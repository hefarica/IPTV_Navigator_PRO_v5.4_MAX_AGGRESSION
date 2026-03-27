# SOP — Standard Operating Procedures
## APE Resilience Toolkit v6.3

---

## 1. Despliegue Inicial

### Pre-requisitos
- Ubuntu 22.04+ / Debian 12+
- PHP 8.1+ FPM instalado
- Nginx configurado con el site IPTV
- Acceso root al VPS

### Procedimiento
```bash
# 1. Subir el toolkit al VPS
scp APE_Resilience_Toolkit_v6.3.zip root@TU_VPS:/tmp/

# 2. Descomprimir
ssh root@TU_VPS
cd /tmp && unzip APE_Resilience_Toolkit_v6.3.zip

# 3. Ejecutar instalador
cd APE_Resilience_Toolkit_v6.3
chmod +x install.sh
sudo ./install.sh

# 4. Verificar
tail -f /var/log/iptv-ape/shim_operations.log
```

### Resultado esperado
- 5 archivos PHP desplegados en `/var/www/html/`
- 5 archivos de log creados en `/var/log/iptv-ape/`
- PHP-FPM y Nginx recargados
- Backup automático en `/tmp/ape_backup_FECHA/`

---

## 2. Monitoreo Diario

### Logs a revisar
| Log | Ruta | Qué buscar |
|:---|:---|:---|
| Pipeline | `/var/log/iptv-ape/shim_operations.log` | `ms` < 10, `ai` = device detectado |
| Buffer | `/var/log/iptv-ape/neuro_telemetry.log` | `FINAL%` y estado NORMAL/BURST/NUCLEAR |
| BW Floor | `/var/log/iptv-ape/bw_floor.log` | Floor Mbps aplicado vs perfil |
| Fallbacks | `/var/log/iptv-ape/fallback.log` | Servidores caídos |

### Comandos de monitoreo rápido
```bash
# Estado en vivo (últimos 5 requests)
tail -5 /var/log/iptv-ape/shim_operations.log

# Dispositivos detectados para combo
cat /tmp/ape_device_memory.json

# Estado de telemetría (canales con problemas)
cat /tmp/neuro_telemetry_state.json | python3 -m json.tool

# Tamaño de logs (rotar si > 100MB)
du -sh /var/log/iptv-ape/*
```

---

## 3. Rotación de Logs

### Procedimiento semanal
```bash
# Rotar logs (mantener último respaldo)
cd /var/log/iptv-ape
for log in *.log; do
    cp "$log" "${log}.bak"
    > "$log"
done
```

---

## 4. Rollback de Emergencia

Si después de un despliegue hay problemas:

```bash
# El instalador crea backup automático
ls /tmp/ape_backup_*/

# Restaurar el backup más reciente
BACKUP=$(ls -td /tmp/ape_backup_* | head -1)
cp -r $BACKUP/* /var/www/html/
systemctl reload php8.3-fpm nginx
```

---

## 5. Escalamiento de Problemas

| Síntoma | Causa probable | Acción |
|:---|:---|:---|
| `ms > 50` en shim_operations | PHP-FPM saturado | Aumentar `pm.max_children` |
| Buffer siempre NUCLEAR | Red inestable o umbrales muy bajos | Ajustar `GAP_FLOOR_BASE` en shim |
| AI siempre `generic` | User-Agent no reconocido | Agregar patrón en ai_super_resolution_engine.php |
| Canal se congela | Freeze Detector debe escalar | Revisar `total_hits` en telemetry state |
| BW Floor 0 | Perfil no reconocido | Verificar P0-P5 en resolve_quality.php |

---

## 6. Actualización del Motor

```bash
# 1. Hacer backup
cp /var/www/html/cmaf_engine/modules/ai_super_resolution_engine.php /tmp/ai_engine_bak.php

# 2. Subir nueva versión
scp new_ai_super_resolution_engine.php root@VPS:/var/www/html/cmaf_engine/modules/

# 3. Verificar sintaxis
php -l /var/www/html/cmaf_engine/modules/ai_super_resolution_engine.php

# 4. Recargar
systemctl reload php8.3-fpm

# 5. Verificar
tail -5 /var/log/iptv-ape/shim_operations.log
```
