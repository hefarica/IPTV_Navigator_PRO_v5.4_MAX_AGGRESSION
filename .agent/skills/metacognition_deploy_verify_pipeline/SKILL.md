---
name: "Metacognition: Deploy-Verify Pipeline — El Código Solo Existe Si Está En Producción"
description: "Escribir código frontend que llama a un endpoint backend que no existe en el VPS es un error catastrófico. SIEMPRE verificar el pipeline completo antes de declarar 'listo'."
---

# Deploy-Verify Pipeline

## La regla

**Si escribes frontend que llama a un backend, verifica que el backend EXISTE en producción antes de decirle al usuario que pruebe.**

```
ANTES de decir "ya está, prueba":
  1. ssh root@VPS "ls -la /path/to/endpoint.php"     → ¿existe?
  2. curl -sI "https://domain/endpoint.php"            → ¿responde?
  3. curl -X OPTIONS (con Origin header)               → ¿CORS OK?
  4. curl -X POST (con datos de test)                  → ¿procesa?
  5. Verificar permisos: www-data, 644                 → ¿PHP puede ejecutar?
  6. Verificar directorio de trabajo: mkdir si falta    → ¿puede escribir?
```

## Caso de estudio: Turbo Upload (2026-04-10)

### Lo que hice mal:
1. Escribí `gateway-turbo-upload.js` que llama a `upload_chunk.php`
2. `upload_chunk.php` existía en el repo local
3. Le dije al usuario "Ctrl+Shift+R y prueba"
4. **ERROR: `upload_chunk.php` NO ESTABA EN EL VPS**
5. El usuario vio: "Chunk 3 falló tras 3 retries: Failed to fetch"

### Lo que debí hacer:
```bash
# ANTES de decir "prueba":
ssh root@178.156.147.234 "ls /var/www/iptv-ape/upload_chunk.php"
# → "No such file or directory"
# → DEPLOY PRIMERO, luego decir "prueba"
```

## Checklist pre-declarar-listo

### Para cambios FRONTEND-only:
- [ ] `node --check` pasa en todos los JS modificados
- [ ] Script tag añadido al HTML
- [ ] Cache bust: `?v=X.Y.Z` en el script tag

### Para cambios FRONTEND + BACKEND:
- [ ] Todo lo anterior, MÁS:
- [ ] `php -l` pasa en todos los PHP modificados
- [ ] Archivos PHP deployados al VPS via `scp`
- [ ] Permisos: `chown www-data:www-data`, `chmod 644`
- [ ] Directorios de trabajo creados: `mkdir -p`, `chown www-data`
- [ ] CORS verificado: `curl -X OPTIONS` devuelve `Access-Control-Allow-Origin: *`
- [ ] Test funcional: `curl -X POST` con datos reales devuelve JSON válido
- [ ] `nginx -t && systemctl reload nginx` si se cambió config NGINX

### Para cambios VPS-only:
- [ ] Backup del archivo original: `cp file.php file.php.bak_$(date +%s)`
- [ ] `php -l` en el VPS
- [ ] `nginx -t` si se tocó config
- [ ] Curl de verificación post-deploy

## Mandamiento

> **El código en tu repo local es una promesa. El código en producción es la realidad.**
> No confundir "lo escribí" con "funciona". El gap entre repo y VPS es donde mueren las features.
