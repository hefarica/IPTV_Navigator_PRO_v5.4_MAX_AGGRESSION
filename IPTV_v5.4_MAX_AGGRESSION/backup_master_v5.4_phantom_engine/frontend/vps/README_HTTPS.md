# 🔒 Configuración HTTPS - IPTV Navigator PRO

## 📦 Archivos Incluidos

| Archivo | Descripción |
|---------|-------------|
| `setup-https-hetzner.sh` | Script bash para configurar Certbot y SSL |
| `nginx-m3u8-site-https.conf` | Configuración Nginx con HTTPS |
| `DEPLOY_HTTPS_COMPLETE.ps1` | Script PowerShell para deploy completo |
| `UPDATE_FRONTEND_HTTPS.ps1` | Script para actualizar frontend a HTTPS |
| `GUIA_HTTPS_HETZNER.md` | Guía paso a paso detallada |

---

## 🚀 Inicio Rápido

### Opción 1: Automático (Recomendado)

```powershell
# 1. Configurar DNS (en tu registrador)
#    gateway.tudominio.com A 178.156.147.234

# 2. Ejecutar deploy completo
.\DEPLOY_HTTPS_COMPLETE.ps1 -Domain "gateway.tudominio.com" -Email "tu@email.com"

# 3. Actualizar frontend
.\UPDATE_FRONTEND_HTTPS.ps1 -Domain "gateway.tudominio.com"
```

### Opción 2: Manual

Sigue la guía completa en `GUIA_HTTPS_HETZNER.md`

---

## 📋 Checklist Pre-Deploy

- [ ] Dominio registrado (ej: `gateway.tudominio.com`)
- [ ] DNS configurado: `gateway.tudominio.com A 178.156.147.234`
- [ ] DNS propagado (verificar con `nslookup`)
- [ ] Acceso SSH al servidor
- [ ] Puertos 80 y 443 abiertos en firewall

---

## 🔧 Comandos Útiles

### Verificar DNS
```bash
nslookup gateway.tudominio.com
dig +short gateway.tudominio.com @8.8.8.8
```

### Verificar Certificado
```bash
ssh root@178.156.147.234 "ls -la /etc/letsencrypt/live/gateway.tudominio.com/"
```

### Test HTTPS
```bash
curl -I https://gateway.tudominio.com/health
```

### Ver Logs Nginx
```bash
ssh root@178.156.147.234 "tail -f /var/log/nginx/error.log"
```

### Renovar Certificado Manualmente
```bash
ssh root@178.156.147.234 "certbot renew --dry-run"
```

---

## 🚨 Troubleshooting

### Error: "DNS no apunta correctamente"
- Verifica en tu registrador que el registro A está correcto
- Espera 10-15 minutos para propagación
- Verifica con `nslookup`

### Error: "Failed to obtain certificate"
- Verifica que puerto 80 está abierto: `ufw allow 80/tcp`
- Detén Nginx: `systemctl stop nginx`
- Verifica que el dominio apunta correctamente

### Error: "SSL certificate problem"
- Verifica permisos: `chmod 644 /etc/letsencrypt/live/*/fullchain.pem`
- Verifica configuración: `nginx -t`
- Revisa logs: `tail -50 /var/log/nginx/error.log`

---

## 📞 Soporte

Si encuentras problemas:
1. Revisa `GUIA_HTTPS_HETZNER.md` sección Troubleshooting
2. Verifica logs: `tail -f /var/log/nginx/error.log`
3. Test manual: `curl -v https://gateway.tudominio.com/health`

---

## ✅ Post-Deploy

Después de configurar HTTPS:

1. ✅ Actualizar frontend con `UPDATE_FRONTEND_HTTPS.ps1`
2. ✅ Recargar página (Ctrl+Shift+R)
3. ✅ Verificar en consola: `window.gatewayManager?.config?.vps_url`
4. ✅ Probar upload de archivo M3U8
5. ✅ Verificar que no hay errores CORS

---

**¡Listo para usar HTTPS!** 🎉
