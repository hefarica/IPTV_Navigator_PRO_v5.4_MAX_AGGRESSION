# 🐳 APE v15 + Docker - Guía de Instalación

## Paso 1: Instalar Docker Desktop

1. **Descargar**: <https://www.docker.com/products/docker-desktop/>
2. **Instalar** (requiere reinicio de Windows)
3. **Verificar instalación**:

   ```powershell
   docker --version
   # Esperado: Docker version 24.x.x o superior
   ```

---

## Paso 2: Levantar Redis

Desde la carpeta `backend-ape-v14`:

```powershell
cd "C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v3.0.1_plus_V4.1_STABLE_APE_HEADERS_MODE_FIX3 (3)\IPTV_Navigator_PRO_v3.0.1_plus_V4.1_STABLE_APE_HEADERS_MODE_FIX3\IPTV Navigator PRO v3.0.1_files\backend-ape-v14"

docker-compose up -d
```

**Verificar**:

```powershell
docker-compose ps
# Debe mostrar: ape-redis (Up), ape-redis-ui (Up)
```

---

## Paso 3: Verificar Redis

### Opción A - Desde Python

```powershell
python -c "from config.redis_config import test_redis_connection; print(test_redis_connection())"
```

Resultado esperado:

```
{'connected': True, 'redis_version': '7.x.x', ...}
```

### Opción B - Desde navegador

Abrir: **<http://localhost:8081>**

Esto abre Redis Commander (UI visual para ver keys).

---

## Paso 4: Arrancar APE Server

```powershell
python ape_server_v14_unified.py
```

Logs esperados:

```
✅ Redis connection OK
🚀 APE Server running on http://localhost:5000
```

---

## Keys que verás en Redis

Después de usar APE, en Redis Commander verás:

| Key Pattern | Descripción |
|-------------|-------------|
| `ape:session:*` | Sesiones activas |
| `ape:seq:*` | Último segmento por canal |
| `ape:lru:*` | Segmentos recientes (no-repeat) |
| `ape:profile:*` | Perfil activo por canal |
| `ape:hyst:*` | Estado hysteresis |
| `ape:telem:*` | Métricas telemetría |
| `ape:health:*` | Health del engine |

---

## Comandos Útiles

```powershell
# Ver logs de Redis
docker-compose logs -f redis

# Reiniciar Redis
docker-compose restart redis

# Detener todo
docker-compose down

# Detener y borrar datos
docker-compose down -v
```

---

## Troubleshooting

### "Cannot connect to Docker daemon"

→ Docker Desktop no está corriendo. Ábrelo desde el menú inicio.

### "Port 6379 already in use"

→ Hay otro Redis corriendo. Detén el otro servicio o cambia el puerto en docker-compose.yml.

### "Redis connection refused"

→ Redis no levantó. Revisa logs con `docker-compose logs redis`.
