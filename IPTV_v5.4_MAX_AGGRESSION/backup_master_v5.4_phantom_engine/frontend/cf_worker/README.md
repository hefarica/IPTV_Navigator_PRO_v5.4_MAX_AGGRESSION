# 🌐 IPTV Gateway - Setup Cloudflare Worker

## 📁 Archivos Creados

```
cloudflare-worker/
├── package.json          # Dependencias
├── wrangler.toml         # Configuración (editar)
└── src/
    └── index.js          # Código del Worker
```

---

## 🚀 PASOS DE CONFIGURACIÓN

### PASO 1: Credenciales de Cloudflare

Abre el navegador en [dash.cloudflare.com](https://dash.cloudflare.com) y obtén:

1. **Account ID** → Workers → Overview (columna derecha)
2. Crear **3 KV Namespaces**:
   - `URL_MAPPINGS`
   - `PLAYLISTS_KV`
   - `VERSIONS_KV`
3. Crear **R2 Bucket**: `apelistv2`

### PASO 2: Editar wrangler.toml

Abre el archivo `wrangler.toml` y reemplaza:

```toml
account_id = "TU_ACCOUNT_ID_AQUI"

[vars]
GATEWAY_SECRET = "genera_una_clave_secreta_32_hex"

[[kv_namespaces]]
binding = "URL_MAPPINGS"
id = "ID_REAL_DEL_KV"
```

### PASO 3: Desplegar

```bash
cd cloudflare-worker
npm install -g wrangler   # Si no está instalado
wrangler login            # Login con navegador
wrangler deploy           # Desplegar
```

### PASO 4: Configurar en Gateway Panel

En IPTV Navigator:

1. Click **⚙️ Configurar**
2. URL: `https://iptv-gateway.TU-USUARIO.workers.dev`
3. Token: el mismo `GATEWAY_SECRET`

---

## ✅ Verificación

```bash
curl https://iptv-gateway.TU-USUARIO.workers.dev/api/health
```

Debe responder: `{"status":"ok",...}`

---

## 💰 Costo Mensual

| Servicio | Costo |
|----------|-------|
| R2 Storage | $0.37 |
| KV | $0.00 |
| Worker | $0.01 |
| **Total** | **$0.40** |
