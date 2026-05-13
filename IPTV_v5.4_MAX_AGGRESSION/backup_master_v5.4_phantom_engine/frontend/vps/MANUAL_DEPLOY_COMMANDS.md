# 🚀 DEPLOY MANUAL - upload.php a VPS Hetzner

## Prerrequisito: Tienes que tener la contraseña del VPS

---

## PASO 1: Copiar archivos al VPS (desde PowerShell en tu PC)

```powershell
# Abrir PowerShell y ejecutar:
cd "c:\Users\HFRC\Desktop\IPTV_Navigator_PRO\iptv_nav\files\vps"

# Copiar upload.php
scp upload.php root@178.156.147.234:/var/www/m3u8/

# Copiar nginx config
scp nginx-m3u8-site.conf root@178.156.147.234:/etc/nginx/sites-available/m3u8
```

Te pedirá la contraseña del VPS cada vez.

---

## PASO 2: Conectar al VPS

```powershell
ssh root@178.156.147.234
```

(Ingresar contraseña)

---

## PASO 3: Instalar PHP-FPM (dentro del VPS)

```bash
apt update
apt install php-fpm php-cli -y
```

---

## PASO 4: Verificar versión de PHP instalada

```bash
ls /var/run/php/
```

Debería mostrar algo como: `php8.1-fpm.sock` o `php8.2-fpm.sock` o `php8.3-fpm.sock`

**Anota el nombre exacto del socket.**

---

## PASO 5: Actualizar nginx config con la versión correcta

```bash
# Si es PHP 8.1:
sed -i 's|unix:/var/run/php/php-fpm.sock|unix:/var/run/php/php8.1-fpm.sock|g' /etc/nginx/sites-available/m3u8

# Si es PHP 8.2:
sed -i 's|unix:/var/run/php/php-fpm.sock|unix:/var/run/php/php8.2-fpm.sock|g' /etc/nginx/sites-available/m3u8

# Si es PHP 8.3:
sed -i 's|unix:/var/run/php/php-fpm.sock|unix:/var/run/php/php8.3-fpm.sock|g' /etc/nginx/sites-available/m3u8
```

---

## PASO 6: Configurar permisos

```bash
mkdir -p /var/www/m3u8/versions
chown -R www-data:www-data /var/www/m3u8
chmod 755 /var/www/m3u8
chmod 644 /var/www/m3u8/upload.php
chmod 775 /var/www/m3u8/versions
```

---

## PASO 7: Activar nginx config

```bash
# Eliminar default
rm -f /etc/nginx/sites-enabled/default

# Activar m3u8
ln -sf /etc/nginx/sites-available/m3u8 /etc/nginx/sites-enabled/m3u8

# Verificar config
nginx -t
```

Si dice `syntax is ok` y `test is successful`, continuar:

```bash
systemctl reload nginx
systemctl restart php*-fpm
```

---

## PASO 8: Verificar que funciona

```bash
# Desde dentro del VPS:
curl -I http://localhost/upload.php
```

**Esperado:** `405 Method Not Allowed` (porque es GET, no POST)

```bash
# Probar health check:
curl http://localhost/health
```

**Esperado:** `{"status":"ok","server":"hetzner-vps","php":"enabled","upload":"ready"}`

---

## PASO 9: Salir del VPS

```bash
exit
```

---

## PASO 10: Verificar desde tu PC

```powershell
# En PowerShell de tu PC:
Invoke-WebRequest -Uri "http://178.156.147.234/upload.php" -Method OPTIONS
```

**Esperado:** Status 204 (preflight CORS OK)

---

## ✅ LISTO

Ahora puedes subir archivos M3U8 desde el frontend usando el Gateway Manager.

URL del endpoint: `http://178.156.147.234/upload.php`
