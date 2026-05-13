# 🚀 Configuración VPS Hetzner CPX22 para IPTV Navigator PRO

## 📋 Especificaciones
- **Servidor**: Hetzner Cloud CPX22 (3 vCPU AMD, 4GB RAM, 80GB NVMe)
- **Región**: Ashburn (us-east) - Óptimo para Colombia/LATAM
- **OS**: Ubuntu 22.04 LTS
- **Propósito**: Servir listas M3U8 estáticas con alta disponibilidad

---

## 📦 Paso 1: Instalación Inicial

```bash
# Conectar al VPS
ssh root@TU_IP_VPS

# Actualizar sistema
apt update && apt upgrade -y

# Instalar Nginx
apt install nginx -y

# Verificar versión (debe ser 1.18+)
nginx -v
```

---

## 📁 Paso 2: Estructura de Directorios

```bash
# Crear estructura para M3U8
mkdir -p /var/www/m3u8
chown -R www-data:www-data /var/www/m3u8
chmod 755 /var/www/m3u8

# Estructura final:
# /var/www/m3u8/
# ├── master.m3u8
# ├── deportes.m3u8
# ├── peliculas.m3u8
# ├── series.m3u8
# └── favoritos.m3u8
```

---

## 🌐 Paso 3: Configuración Nginx Optimizada

```bash
# Backup config original
cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup

# Crear nueva configuración
nano /etc/nginx/nginx.conf
```

**Contenido de `/etc/nginx/nginx.conf`:**

```nginx
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

# Optimización para CPX22 (3 vCPU)
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # ============================================
    # BÁSICOS
    # ============================================
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    types_hash_max_size 2048;
    server_tokens off;  # Ocultar versión Nginx

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # ============================================
    # LOGGING (mínimo para mejor rendimiento)
    # ============================================
    access_log /var/log/nginx/access.log combined buffer=512k flush=1m;
    error_log /var/log/nginx/error.log warn;

    # ============================================
    # KEEPALIVE MODERADO
    # ============================================
    keepalive_timeout 30s;
    keepalive_requests 100;

    # ============================================
    # LÍMITES POR IP (Anti-abuse)
    # ============================================
    # Zona para límite de conexiones simultáneas
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
    
    # Zona para límite de requests por segundo
    limit_req_zone $binary_remote_addr zone=req_limit:10m rate=10r/s;
    
    # Zona específica para M3U8 (más permisiva)
    limit_req_zone $binary_remote_addr zone=m3u8_limit:10m rate=30r/s;

    # ============================================
    # GZIP (Compresión para M3U8)
    # ============================================
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 4;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        application/json
        application/javascript
        application/xml
        application/vnd.apple.mpegurl
        application/x-mpegurl
        audio/mpegurl;

    # ============================================
    # INCLUIR SITES
    # ============================================
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

---

## 🎯 Paso 4: Configuración del Site M3U8

```bash
# Crear configuración del site
nano /etc/nginx/sites-available/m3u8
```

**Contenido de `/etc/nginx/sites-available/m3u8`:**

```nginx
server {
    listen 80;
    listen [::]:80;
    
    # HTTP/2 con SSL (si tienes certificado)
    # listen 443 ssl http2;
    # listen [::]:443 ssl http2;
    # ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;

    server_name _;  # Responder a cualquier dominio/IP
    root /var/www/m3u8;

    # ============================================
    # LÍMITES APLICADOS
    # ============================================
    # Máximo 20 conexiones simultáneas por IP
    limit_conn conn_limit 20;
    
    # Máximo 30 requests/segundo para M3U8 (burst 50)
    limit_req zone=m3u8_limit burst=50 nodelay;

    # ============================================
    # CORS HEADERS (para acceso desde navegadores)
    # ============================================
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, HEAD, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Range,DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type' always;
    add_header 'Access-Control-Expose-Headers' 'Content-Length,Content-Range' always;

    # ============================================
    # UBICACIÓN PRINCIPAL: LISTAS M3U8
    # ============================================
    location / {
        # Content-Type correcto para M3U8
        types {
            application/vnd.apple.mpegurl m3u8 m3u;
            text/plain txt;
        }
        default_type application/vnd.apple.mpegurl;

        # Cache headers para players
        add_header Cache-Control "public, max-age=300";  # 5 minutos
        add_header X-Content-Type-Options "nosniff";

        # Servir archivos directamente
        try_files $uri $uri/ =404;
    }

    # ============================================
    # HEALTH CHECK
    # ============================================
    location /health {
        access_log off;
        return 200 '{"status":"ok","server":"hetzner-cpx22-ashburn","region":"us-east"}';
        add_header Content-Type application/json;
    }

    # ============================================
    # STATS (opcional, proteger en producción)
    # ============================================
    location /nginx_status {
        stub_status on;
        access_log off;
        # Descomentar para restringir acceso:
        # allow 127.0.0.1;
        # allow TU_IP_LOCAL;
        # deny all;
    }

    # ============================================
    # BLOQUEAR ACCESO A ARCHIVOS OCULTOS
    # ============================================
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # ============================================
    # FAVICON (evitar logs de error)
    # ============================================
    location = /favicon.ico {
        log_not_found off;
        access_log off;
        return 204;
    }
}
```

---

## 🔧 Paso 5: Activar Configuración

```bash
# Eliminar default
rm -f /etc/nginx/sites-enabled/default

# Habilitar site M3U8
ln -sf /etc/nginx/sites-available/m3u8 /etc/nginx/sites-enabled/

# Verificar sintaxis
nginx -t

# Si OK, reiniciar
systemctl restart nginx
systemctl enable nginx

# Verificar estado
systemctl status nginx
```

---

## 🔒 Paso 6: SSL/HTTP2 con Let's Encrypt (Opcional pero Recomendado)

```bash
# Instalar certbot
apt install certbot python3-certbot-nginx -y

# Obtener certificado (necesitas dominio apuntando al VPS)
certbot --nginx -d tu-dominio.com

# Renovación automática (ya configurada por defecto)
systemctl status certbot.timer
```

Después de obtener SSL, edita `/etc/nginx/sites-available/m3u8`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name tu-dominio.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    
    server_name tu-dominio.com;
    
    ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    
    # Protocolos modernos
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    
    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;
    
    # ... resto de la configuración igual ...
    root /var/www/m3u8;
    # etc.
}
```

---

## 🔥 Paso 7: Firewall

```bash
# Configurar UFW
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw enable

# Verificar
ufw status verbose
```

---

## 📤 Paso 8: Subir Listas M3U8

### Desde Windows (PowerShell):

```powershell
# Subir una lista
scp C:\ruta\master.m3u8 root@TU_IP_VPS:/var/www/m3u8/

# Subir todas las listas de una carpeta
scp C:\ruta\listas\*.m3u8 root@TU_IP_VPS:/var/www/m3u8/
```

### Desde Linux/Mac:

```bash
scp /ruta/master.m3u8 root@TU_IP_VPS:/var/www/m3u8/
```

### Con rsync (sincronización incremental):

```bash
rsync -avz --progress /ruta/listas/ root@TU_IP_VPS:/var/www/m3u8/
```

---

## ✅ Paso 9: Verificación

```bash
# Desde el VPS
curl -I http://localhost/health
curl -I http://localhost/master.m3u8

# Desde tu PC
curl -I http://TU_IP_VPS/health
curl http://TU_IP_VPS/master.m3u8 | head -20
```

**Respuesta esperada:**
```
HTTP/1.1 200 OK
Content-Type: application/vnd.apple.mpegurl
Cache-Control: public, max-age=300
Access-Control-Allow-Origin: *
```

---

## 🎯 URLs Finales

| Recurso | URL |
|---------|-----|
| Health Check | `http://TU_IP_VPS/health` |
| Lista Master | `http://TU_IP_VPS/master.m3u8` |
| Lista Deportes | `http://TU_IP_VPS/deportes.m3u8` |
| Stats Nginx | `http://TU_IP_VPS/nginx_status` |

---

## 📊 Capacidad Estimada CPX22

Con la configuración optimizada:

| Métrica | Capacidad |
|---------|-----------|
| Conexiones simultáneas | ~4,000 |
| Requests/segundo | ~5,000+ |
| Descargas de listas/día | 100,000+ |
| Ancho de banda | 100 Mbps (límite Hetzner) |

---

## 🛠️ Comandos Útiles

```bash
# Ver conexiones activas
ss -s

# Ver requests en tiempo real
tail -f /var/log/nginx/access.log

# Estadísticas Nginx
curl http://localhost/nginx_status

# Reload sin downtime
nginx -s reload

# Ver uso de recursos
htop
```

---

## 🚨 Troubleshooting

### Error 403 Forbidden
```bash
chown -R www-data:www-data /var/www/m3u8
chmod 644 /var/www/m3u8/*.m3u8
```

### Lista no carga en player
Verificar Content-Type:
```bash
curl -I http://TU_IP_VPS/lista.m3u8 | grep Content-Type
# Debe ser: Content-Type: application/vnd.apple.mpegurl
```

### Rate limiting muy agresivo
Editar `/etc/nginx/sites-available/m3u8`:
```nginx
limit_req zone=m3u8_limit burst=100 nodelay;  # Aumentar burst
```

---

## ✨ Listo!

Tu VPS Hetzner CPX22 en Ashburn está configurado para servir listas M3U8 de forma óptima para Colombia/LATAM, sin Cloudflare, sin errores 407, con:

- ✅ HTTP/2 (con SSL)
- ✅ Keepalive moderado (30s)
- ✅ Rate limiting por IP
- ✅ Compresión gzip
- ✅ CORS habilitado
- ✅ Cache headers optimizados

