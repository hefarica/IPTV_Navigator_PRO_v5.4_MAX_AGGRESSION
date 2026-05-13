# 🔒 Guía Completa: Configurar HTTPS en Hetzner VPS

## 📋 Requisitos Previos

1. ✅ Servidor Hetzner activo (IP: `178.156.147.234`)
2. ✅ Dominio registrado (ej: `gateway.tudominio.com`)
3. ✅ DNS configurado apuntando a `178.156.147.234`
4. ✅ Acceso SSH al servidor

---

## 🎯 OPCIÓN A: Setup Automático (Recomendado)

### Paso 1: Configurar DNS

**En tu registrador de dominio (Godaddy, Namecheap, etc.):**

```
Tipo: A
Nombre: gateway (o @ para raíz)
Valor: 178.156.147.234
TTL: 3600 (o automático)
```

**Espera 5-10 minutos** para que DNS se propague.

**Verificar DNS:**
```bash
# En tu PC
nslookup gateway.tudominio.com
# Debe mostrar: 178.156.147.234
```

---

### Paso 2: Ejecutar Script Automático

**En PowerShell (desde la carpeta `vps`):**

```powershell
# Editar dominio y email en el script
.\DEPLOY_HTTPS_COMPLETE.ps1 -Domain "gateway.tudominio.com" -Email "tu@email.com"
```

**El script hará:**
1. ✅ Instalar Certbot
2. ✅ Generar certificado SSL
3. ✅ Configurar Nginx con HTTPS
4. ✅ Activar renovación automática
5. ✅ Verificar que funciona

---

## 🛠️ OPCIÓN B: Setup Manual

### Paso 1: SSH al Servidor

```bash
ssh root@178.156.147.234
```

### Paso 2: Instalar Certbot

```bash
apt update
apt install -y certbot python3-certbot-nginx
```

### Paso 3: Verificar DNS

```bash
# Debe mostrar tu IP
dig +short gateway.tudominio.com @8.8.8.8
```

### Paso 4: Generar Certificado

```bash
# Detener Nginx temporalmente
systemctl stop nginx

# Generar certificado
certbot certonly --standalone \
    --non-interactive \
    --agree-tos \
    --email tu@email.com \
    -d gateway.tudominio.com

# Reiniciar Nginx
systemctl start nginx
```

### Paso 5: Subir Configuración Nginx

**Desde tu PC:**

```powershell
# Editar nginx-m3u8-site-https.conf
# Cambiar: gateway.iptv-navigator.com → gateway.tudominio.com

# Subir al servidor
scp .\nginx-m3u8-site-https.conf root@178.156.147.234:/tmp/nginx-https.conf
```

**En el servidor:**

```bash
# Backup
cp /etc/nginx/sites-enabled/m3u8 /etc/nginx/sites-enabled/m3u8.backup

# Reemplazar
cp /tmp/nginx-https.conf /etc/nginx/sites-enabled/m3u8

# Editar dominio en el archivo
nano /etc/nginx/sites-enabled/m3u8
# Cambiar: gateway.iptv-navigator.com → gateway.tudominio.com
# Cambiar: server_name _; → server_name gateway.tudominio.com;

# Verificar sintaxis
nginx -t

# Si OK, recargar
systemctl reload nginx
```

### Paso 6: Configurar Renovación Automática

```bash
systemctl enable certbot.timer
systemctl start certbot.timer
```

---

## 🧪 Verificación

### Test 1: HTTPS Funciona

```bash
curl -I https://gateway.tudominio.com/health
```

**Debe mostrar:**
```
HTTP/2 200
```

### Test 2: Certificado Válido

```bash
curl -v https://gateway.tudominio.com/health 2>&1 | grep -E "SSL|certificate"
```

**Debe mostrar:**
```
SSL connection using TLSv1.3
```

### Test 3: Redirect HTTP → HTTPS

```bash
curl -I http://gateway.tudominio.com/health
```

**Debe mostrar:**
```
HTTP/1.1 301 Moved Permanently
Location: https://gateway.tudominio.com/health
```

---

## 🔄 Actualizar Frontend

### Paso 1: Actualizar gateway-manager.js

**Buscar:**
```javascript
vps_url: 'http://178.156.147.234',
```

**Cambiar a:**
```javascript
vps_url: 'https://gateway.tudominio.com',
```

### Paso 2: Actualizar otros archivos JS

**Buscar en todos los archivos:**
- `upload-manager-v1.js`
- `vps-monitor-v1.js`
- `vps-adapter.js`

**Cambiar:**
```javascript
// De:
'http://178.156.147.234'

// A:
'https://gateway.tudominio.com'
```

### Paso 3: Recargar Página

```
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)
```

---

## 🚨 Troubleshooting

### Error: "DNS no apunta correctamente"

**Solución:**
1. Verifica en tu registrador que el registro A está correcto
2. Espera 10-15 minutos más
3. Verifica con: `nslookup gateway.tudominio.com`

### Error: "Failed to obtain certificate"

**Solución:**
1. Verifica que el puerto 80 está abierto: `ufw allow 80/tcp`
2. Verifica que Nginx está detenido: `systemctl stop nginx`
3. Verifica que el dominio apunta correctamente

### Error: "SSL certificate problem"

**Solución:**
1. Verifica que el certificado existe: `ls -la /etc/letsencrypt/live/gateway.tudominio.com/`
2. Verifica que Nginx tiene permisos: `chmod 644 /etc/letsencrypt/live/gateway.tudominio.com/*.pem`
3. Verifica la configuración: `nginx -t`

### Error: "Mixed Content" en el navegador

**Solución:**
1. Asegúrate de que TODAS las URLs en el frontend usan `https://`
2. Verifica que no hay recursos cargados desde `http://`
3. Limpia caché del navegador: `Ctrl+Shift+Delete`

---

## 📊 Checklist Final

- [ ] DNS configurado y propagado
- [ ] Certbot instalado
- [ ] Certificado SSL generado
- [ ] Nginx configurado con HTTPS
- [ ] HTTP → HTTPS redirect funcionando
- [ ] Frontend actualizado con URL HTTPS
- [ ] Test de upload funcionando
- [ ] Renovación automática activada

---

## 🎉 ¡Listo!

Tu servidor ahora tiene HTTPS configurado y funcionando.

**URLs:**
- ✅ HTTPS: `https://gateway.tudominio.com`
- ✅ HTTP: `http://gateway.tudominio.com` (redirige a HTTPS)

**Próximos pasos:**
1. Probar upload de archivo M3U8
2. Verificar que no hay errores CORS
3. Monitorear logs: `tail -f /var/log/nginx/error.log`
