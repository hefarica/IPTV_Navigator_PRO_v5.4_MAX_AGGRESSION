# 🔒 HTTPS Configurado (Certificado Auto-firmado)

## ✅ Estado Actual

**HTTPS está funcionando** en tu servidor:
- ✅ Puerto 443 activo
- ✅ Certificado SSL generado
- ✅ Nginx configurado
- ✅ Frontend actualizado a HTTPS

**URLs disponibles:**
- 🔒 HTTPS: `https://178.156.147.234`
- 🔓 HTTP: `http://178.156.147.234` (sigue funcionando)

---

## ⚠️ Advertencia del Navegador

Como usamos un **certificado auto-firmado** (sin dominio), el navegador mostrará una advertencia de seguridad la primera vez.

### Chrome/Edge:
```
NET::ERR_CERT_AUTHORITY_INVALID
```

### Firefox:
```
Error de seguridad: el certificado no es de confianza
```

---

## 🛠️ Solución: Aceptar el Certificado

### Opción 1: Aceptar en el Navegador (Recomendado)

**Chrome/Edge:**
1. Al ver la advertencia, haz clic en **"Avanzado"** o **"Advanced"**
2. Haz clic en **"Continuar a 178.156.147.234 (no seguro)"** o **"Proceed to 178.156.147.234 (unsafe)"**
3. El navegador recordará tu elección para esta IP

**Firefox:**
1. Haz clic en **"Avanzado"** o **"Advanced"**
2. Haz clic en **"Aceptar el riesgo y continuar"** o **"Accept the Risk and Continue"**

---

### Opción 2: Importar Certificado (Más Seguro)

**Windows (Chrome/Edge):**
```powershell
# Descargar certificado
curl -k https://178.156.147.234/health -o cert.crt

# Importar al almacén de certificados
certutil -addstore -f "ROOT" cert.crt
```

**Windows (Firefox):**
1. Abre Firefox → Configuración → Privacidad y Seguridad
2. Certificados → Ver certificados → Autoridades
3. Importar → Selecciona `/etc/nginx/ssl/server.crt` (copiado desde el servidor)

**Mac:**
```bash
# Descargar certificado
curl -k https://178.156.147.234/health -o cert.crt

# Importar a Keychain
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain cert.crt
```

---

## 🧪 Verificación

### Test 1: HTTPS Funciona
```bash
curl -k -I https://178.156.147.234/health
# Debe mostrar: HTTP/2 200
```

### Test 2: Desde el Navegador
1. Abre: `https://178.156.147.234/health`
2. Acepta la advertencia
3. Debe mostrar JSON con status del servidor

### Test 3: Upload Funciona
1. Recarga tu aplicación (Ctrl+Shift+R)
2. Abre consola (F12)
3. Verifica: `window.gatewayManager?.config?.vps_url`
   - Debe mostrar: `https://178.156.147.234`
4. Intenta subir un archivo M3U8

---

## 📋 Checklist

- [x] Certificado SSL generado
- [x] Nginx configurado con HTTPS
- [x] Puerto 443 abierto
- [x] Frontend actualizado a HTTPS
- [ ] Aceptar certificado en navegador (tú)
- [ ] Probar upload de archivo M3U8

---

## 🔄 Si Quieres Usar Dominio Más Adelante

Cuando tengas un dominio:

1. **Configurar DNS:**
   ```
   gateway.tudominio.com A 178.156.147.234
   ```

2. **Generar certificado Let's Encrypt:**
   ```bash
   ssh root@178.156.147.234
   certbot certonly --standalone -d gateway.tudominio.com
   ```

3. **Actualizar Nginx:**
   - Cambiar rutas de certificado en `/etc/nginx/sites-available/m3u8`
   - De: `/etc/nginx/ssl/server.crt`
   - A: `/etc/letsencrypt/live/gateway.tudominio.com/fullchain.pem`

4. **Recargar Nginx:**
   ```bash
   nginx -t && systemctl reload nginx
   ```

---

## 🚨 Troubleshooting

### Error: "NET::ERR_CERT_AUTHORITY_INVALID"

**Solución:** Acepta el certificado manualmente (ver Opción 1 arriba)

### Error: "Failed to fetch" después de aceptar certificado

**Solución:**
1. Limpia caché del navegador (Ctrl+Shift+Delete)
2. Recarga la página (Ctrl+Shift+R)
3. Verifica que la URL es `https://` (no `http://`)

### Error: "Mixed Content"

**Solución:**
- Asegúrate de que TODAS las URLs en el frontend usan `https://`
- No mezcles `http://` y `https://` en la misma página

---

## ✅ ¡Listo!

Tu servidor ahora tiene HTTPS funcionando. Solo necesitas aceptar el certificado la primera vez en tu navegador.

**Próximo paso:** Prueba subir un archivo M3U8 y verifica que funciona sin errores CORS.
