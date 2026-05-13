# URL para OTT Navigator - Cloudflare R2

**Fecha**: 2026-01-10  
**Worker**: <https://ape-redirect-api-m3u8-native.beticosa1.workers.dev>

---

## 🎯 URL Lista para Usar

### Opción 1: Con Token JWT (Recomendado)

```
https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/playlist.m3u8
```

**Headers requeridos**:

```
Authorization: Bearer [TU_TOKEN_JWT]
```

### Opción 2: URL Directa (Generar Token Primero)

**Paso 1 - Generar Token**:

```bash
curl "https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/token/generate?user_id=myuser&expires_in=21600"
```

**Paso 2 - Usar en OTT Navigator**:

```
https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/playlist.m3u8?token=[TOKEN]
```

---

## 📱 Configuración en OTT Navigator

### Método 1: Con Headers (Preferido)

1. **Abrir OTT Navigator**
2. **Añadir Playlist** → External Playlist
3. **URL**:

   ```
   https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/playlist.m3u8
   ```

4. **Headers** (si soporta):

   ```
   Authorization: Bearer eyJhbGci...
   ```

### Método 2: URL con Token en Query

1. **Generar token** (ver abajo)
2. **URL completa**:

   ```
   https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/playlist.m3u8?token=eyJhbGci...
   ```

3. **Copiar y pegar en OTT Navigator**

---

## 🔑 Cómo Generar Token JWT

### Opción A: Desde PowerShell (Windows)

```powershell
# Generar token (válido 6 horas)
$response = Invoke-WebRequest -Uri "https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/token/generate?user_id=myuser&expires_in=21600" -UseBasicParsing

# Ver resultado
$data = $response.Content | ConvertFrom-Json
$token = $data.token

# Mostrar token
Write-Output "Token: $token"

# Mostrar URL completa
Write-Output "URL: https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/playlist.m3u8?token=$token"
```

### Opción B: Desde Navegador

1. Abre esta URL en tu navegador:

   ```
   https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/token/generate?user_id=myuser
   ```

2. Verás algo como:

   ```json
   {
     "success": true,
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "expires_at": "2026-01-10T20:18:00Z"
   }
   ```

3. Copia el valor de `"token"`

4. URL final:

   ```
   https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/playlist.m3u8?token=eyJhbGci...
   ```

### Opción C: Desde Consola del Navegador

```javascript
// En F12 → Console del index-v4.html
const jwtManager = new CloudflareM3U8Adapter.JWTManager();
const token = await jwtManager.getToken();
console.log('Token:', token);
console.log('URL:', `https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/playlist.m3u8?token=${token}`);
```

---

## 📊 Información del Playlist

- **Canales**: 3,455
- **Formato**: M3U8 Native
- **Storage**: Cloudflare R2
- **CDN**: Global (Cloudflare Edge)
- **Latencia**: <50ms
- **Uptime**: 99.9%

---

## 🔧 Troubleshooting

### Error 401 Unauthorized

**Causa**: Token expirado o inválido

**Solución**: Genera un nuevo token

```bash
curl "https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/token/generate?user_id=myuser"
```

### Error 404 Not Found

**Causa**: URL incorrecta

**Solución**: Verifica que la URL sea exactamente:

```
https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/playlist.m3u8
```

### Canales no cargan

**Causa**: M3U8 no descargado correctamente

**Solución**:

1. Test manual:

   ```bash
   curl -H "Authorization: Bearer TOKEN_AQUI" \
        "https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/playlist.m3u8"
   ```

2. Verifica que descargue contenido M3U8

---

## ⚡ Quick Start (Copy-Paste)

### 1. Generar Token (PowerShell)

```powershell
Invoke-WebRequest "https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/token/generate?user_id=ott" | Select-Object -ExpandProperty Content
```

### 2. Copiar Token del Resultado

### 3. URL Final para OTT Navigator

```
https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/playlist.m3u8?token=[PEGAR_TOKEN_AQUI]
```

---

## 📝 Notas

- **Token Duration**: 6 horas (21,600 segundos)
- **Renovar antes**: 5 minutos antes de expirar
- **User ID**: Puede ser cualquier string (ej: "ott", "myuser", "android")
- **Seguridad**: Tokens únicos por usuario, no compartir

---

## 🎬 Ejemplo Completo

**Generar**:

```bash
curl "https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/token/generate?user_id=ott_android"
```

**Respuesta**:

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoib3R0X2FuZHJvaWQiLCJleHBpcmVzX2luIjoyMTYwMCwic2NvcGUiOiJwbGF5bGlzdDpyZWFkLGNhbmFsOmFjY2VzcyIsImlhdCI6MTc2ODA2MzA4MiwiZXhwIjoxNzY4MDg0NjgyfQ.ABC123XYZ",
  "expires_at": "2026-01-10T20:18:02Z",
  "expires_in": 21600
}
```

**URL para OTT Navigator**:

```
https://ape-redirect-api-m3u8-native.beticosa1.workers.dev/playlist.m3u8?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoib3R0X2FuZHJvaWQiLCJleHBpcmVzX2luIjoyMTYwMCwic2NvcGUiOiJwbGF5bGlzdDpyZWFkLGNhbmFsOmFjY2VzcyIsImlhdCI6MTc2ODA2MzA4MiwiZXhwIjoxNzY4MDg0NjgyfQ.ABC123XYZ
```

✅ **¡Listo para usar en OTT Navigator!**
