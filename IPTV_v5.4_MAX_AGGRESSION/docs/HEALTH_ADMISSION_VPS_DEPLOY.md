# VPS Hetzner — Deploy de APE Health Admission

## Prerequisitos en VPS

```bash
python3.11 --version               # Python 3.11.x
pip3.11 list | grep -E 'Flask|requests'   # Flask + requests instalados
```

## 1 · Transferir archivos

```bash
# Desde tu máquina local
rsync -avz IPTV_v5.4_MAX_AGGRESSION/backend/health/ \
  user@iptv-ape.duckdns.org:/opt/iptv-ape/backend/health/
rsync -avz IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/ \
  user@iptv-ape.duckdns.org:/opt/iptv-ape/frontend/js/ape-v9/
rsync -avz IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html \
  user@iptv-ape.duckdns.org:/opt/iptv-ape/frontend/
```

## 2 · Crear config.json con credenciales reales

```bash
cd /opt/iptv-ape/backend/health
cp config.example.json config.json
nano config.json
# Completar: tivi.username, tivi.password, kytv.username, kytv.password
chmod 600 config.json
```

## 3 · Primera ejecución del pipeline

```bash
cd /opt/iptv-ape

# 3.1 Refrescar catálogos
python3.11 backend/health/catalog_refresh.py \
  --config backend/health/config.json \
  --out-dir backend/health/runtime

# 3.2 Health-check
python3.11 backend/health/health_checker.py \
  --config backend/health/config.json \
  --catalog-dir backend/health/runtime \
  --out-dir backend/health/runtime \
  --db backend/health/runtime/gold_index.db

# 3.3 Verificar admitted.json
jq '. | length' backend/health/runtime/admitted.json  # Esperado: ~4000
```

## 4 · Systemd service para el resolver (puerto 8765)

Crear `/etc/systemd/system/ape-resolver.service`:

```ini
[Unit]
Description=APE Health Admission Resolver
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/iptv-ape
Environment="APE_ADMITTED_JSON=/opt/iptv-ape/backend/health/runtime/admitted.json"
Environment="APE_RESOLVE_MODE=redirect"
Environment="PORT=8765"
ExecStart=/usr/bin/python3.11 backend/health/resolve_admitted.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Activar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ape-resolver
sudo systemctl status ape-resolver   # verificar active (running)
curl -i http://127.0.0.1:8765/resolve/175787.m3u8?profile=P1
```

## 5 · NGINX — 2 location blocks

Añadir a `backend/nginx-live-current.conf` (dentro del server block correspondiente):

```nginx
# APE Health Admission — JSON público (CORS + cache 60s)
location /backend/health/runtime/admitted.json {
    alias /opt/iptv-ape/backend/health/runtime/admitted.json;
    add_header Access-Control-Allow-Origin "*";
    add_header Cache-Control "public, max-age=60";
    default_type application/json;
}

# APE Health Admission — Resolver local (puerto 8765)
location /resolve/ {
    proxy_pass http://127.0.0.1:8765/resolve/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_read_timeout 30s;
}
```

Recargar:

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -i https://iptv-ape.duckdns.org/backend/health/runtime/admitted.json
curl -i https://iptv-ape.duckdns.org/resolve/175787.m3u8?profile=P1
```

## 6 · Cronjob cada 30 minutos

Crear `/etc/cron.d/ape-health`:

```
*/30 * * * * www-data /usr/bin/python3.11 /opt/iptv-ape/backend/health/catalog_refresh.py --config /opt/iptv-ape/backend/health/config.json --out-dir /opt/iptv-ape/backend/health/runtime >> /var/log/ape-health.log 2>&1
*/30 * * * * www-data sleep 60 && /usr/bin/python3.11 /opt/iptv-ape/backend/health/health_checker.py --config /opt/iptv-ape/backend/health/config.json --catalog-dir /opt/iptv-ape/backend/health/runtime --out-dir /opt/iptv-ape/backend/health/runtime --db /opt/iptv-ape/backend/health/runtime/gold_index.db >> /var/log/ape-health.log 2>&1
```

## 7 · Integrar publication_gate.py en finalize_upload.php

Modificar `finalize_upload.php` para invocar el gate antes de mover a `/lists/`:

```php
// Después de ensamblar el archivo final en /tmp/<upload_id>.m3u8
$gate_report = '/opt/iptv-ape/backend/health/runtime/gate_report.json';
$cmd = sprintf(
    'python3.11 /opt/iptv-ape/backend/health/publication_gate.py --input %s --sample-size 300 --timeout 15 --min-ok200 0.99 --max-405 0 --min-hls 0.90 --out %s 2>&1',
    escapeshellarg($final_path),
    escapeshellarg($gate_report)
);
exec($cmd, $out, $rc);

if ($rc !== 0) {
    // Gate bloqueó la publicación → mover a pending/
    $pending = '/var/www/html/lists/pending/' . basename($final_path);
    rename($final_path, $pending);
    error_log("[GATE] Lista bloqueada: $final_path → $pending");
    echo json_encode(['status' => 'blocked', 'report' => file_get_contents($gate_report)]);
    exit;
}
// Gate OK → proceder con el move a /lists/
```

Crear directorio pending:

```bash
sudo mkdir -p /var/www/html/lists/pending
sudo chown www-data:www-data /var/www/html/lists/pending
```

## 8 · Checklist end-to-end

```bash
# Grep verificación del patch fail-closed (3 checks)
cd /opt/iptv-ape
grep -c "requireAdmission || this.admittedMap.size === 0" \
  frontend/js/ape-v9/health-runtime.js   # Esperado: 0
grep -c "admittedMap empty with requireAdmission=true" \
  frontend/js/ape-v9/health-runtime.js   # Esperado: 1
grep -c "return \[\];" \
  frontend/js/ape-v9/health-runtime.js   # Esperado: >= 1

# Ejecutar gate sobre lista de prueba
python3.11 backend/health/publication_gate.py \
  --input /var/www/html/lists/APE_TYPED_ARRAYS_ULTIMATE_20260416.m3u8 \
  --sample-size 300 \
  --timeout 15 \
  --min-ok200 0.99 \
  --max-405 0 \
  --min-hls 0.90 \
  --out backend/health/runtime/gate_report.json

cat backend/health/runtime/gate_report.json | jq '.'
```

## 9 · Browser console — validación runtime en el frontend

Tras cargar la UI:

```javascript
// 1. Estadísticas
window.APEHealthRuntime.getStats()
// Esperado: { entries: ~4000, lastLoadedAt: <timestamp>, requireAdmission: true, ... }

// 2. Validar FAIL-CLOSED
window.APEHealthRuntime.admittedMap = new Map();
const filtered = window.APEHealthRuntime.filterAdmittedChannels([{name:'test'}]);
console.assert(filtered.length === 0, 'FAIL-CLOSED NO FUNCIONA');

// 3. Restaurar
await window.APEHealthRuntime.loadAdmittedMap();
```

## 10 · Rollback (< 5 minutos)

```bash
# Frontend
cp frontend/js/ape-v9/m3u8-typed-arrays-ultimate.pre-admission.js \
   frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js

# Remover 3 script tags añadidos en index-v4.html
# (health-runtime.js, generation-controller.js, bloque de config)

# Backend
sudo systemctl stop ape-resolver
rm -f backend/health/runtime/admitted.json

# NGINX
# Remover los 2 location blocks del nginx-live-current.conf
sudo nginx -t && sudo systemctl reload nginx
```
