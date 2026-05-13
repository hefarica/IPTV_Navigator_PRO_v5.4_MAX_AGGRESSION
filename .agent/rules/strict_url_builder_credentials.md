---
description: NUNCA usar channel.url directo como shortcut. Las URLs del API vienen tokenizadas (/live/play/TOKEN) y causan errores de clave incorrecta ("invalid password"). SIEMPRE reconstruir desde las credenciales reales en credentialsMap.
---

# 🔴 REGLA ABSOLUTA OMEGA: Reconstrucción Estricta de Credenciales en URL Builder

Esta es una regla de CERO TOLERANCIA que protege la integridad del playback. Si esta regla se viola, **TODOS LOS CANALES** fallarán simultáneamente con error de "**Clave Incorrecta**" (Invalid Password / 401 Unauthorized / 403 Forbidden).

## 1. El Problema: El Engaño del API Xtream Codes

Cuando el frontend consume el API de Xtream Codes (`player_api.php?action=get_live_streams`), el campo `stream_url` o la URL inherente del canal viene en este formato interno/temporal:

```
❌ FORMATO API (TÓXICO PARA PLAYBACK):
http://{host}:{port}/live/play/BASE64_TOKEN_UNICO_POR_CANAL/{stream_id}
```

Ese token base64 (`play/TOKEN...`) es un hash efímero para el panel web o validaciones temporales. **NO ES LA CONTRASEÑA REAL DEL USUARIO.**

Si el URL Builder (`buildChannelUrl` o `buildUniversalUrl`) hace un shortcut y devuelve directamente esta URL (porque ve que "ya empieza con http y tiene /live/"), el reproductor ExoPlayer/VLC enviará ese hash tokenizado, el servidor lo rechazará y colapsará el 100% de la lista.

## 2. El Formato REAL (Omega Standard)

La URL final inyectada en el archivo `.m3u8` DEBE contener las credenciales **REALES** y en texto plano (o su equivalente sanitizado/codificado *después* de esta fase, según la Pipeline OMEGA), porque el backend M3U8/Resolver o el reproductor final necesitan la dupla real para autenticar el socket persistente:

```
✅ FORMATO RECONSTRUIDO (OBLIGATORIO):
http://{host}:{port}/live/{USERNAME_REAL}/{PASSWORD_REAL}/{stream_id}.{ext}
```

## 3. Implementación Mandatoria en Javascript (`m3u8-typed-arrays-ultimate.js`)

Cualquier motor de construcción de URLs dentro del ecosistema APE/OMEGA **debe seguir este flujo, en este orden exacto**:

### PASO 1: Mapeo de Origen (Credentials Map)
Siempre extraer las credenciales reales usando la llave foránea (`serverId` o `host`) contra el `credentialsMap` centralizado:
```javascript
const sid = channel.serverId || channel.server_id || '';
let creds = credentialsMap[sid] || credentialsMap['__current__'];
```

### PASO 2: Reconstrucción Atómica
Armar la URL pieza por pieza. **NUNCA DEVOLVER `channel.url` TEMPRANO.**
```javascript
// La única forma aprobada de construir la URL base
const url = `${creds.baseUrl}/live/${creds.username}/${creds.password}/${streamId}.${ext}`;
```

### PASO 3: Fallback Nuclear (El único momento donde `channel.url` es válido)
La URL original del canal (`existingUrl = channel.url`) **SOLO** debe usarse si y solo si el `credentialsMap` devuelve nulo o le faltan propiedades obligatorias. Es literalmente el último bloque `if` antes del final de la función:

```javascript
// ÚLTIMO RECURSO ANTES DE MORIR
if (!creds || !creds.baseUrl || !creds.username || !creds.password) {
    if (existingUrl) {
        console.warn(`Fallback a channel.url para ${channel.name} por orfandad de credenciales`);
        return existingUrl; 
    }
    return ''; // Falla segura
}
```

## 4. Anti-Patrones Estrictamente Prohibidos

**🔴 PROHIBIDO (Shortcut Asesino):**
```javascript
// NUNCA HACER ESTO - DESTRUYE LA AUTENTICACIÓN
if (channel.url && channel.url.includes('/live/')) {
    return channel.url; 
}
```

**🔴 PROHIBIDO (Extracción de Token como Password):**
```javascript
// NUNCA asumir que el path de la URL original contiene la contraseña real
const urlParts = channel.url.split('/');
const fakePassword = urlParts[urlParts.length - 2]; // Capturará un TOKEN inservible
```

**🔴 PROHIBIDO (Variación de Password por Canal):**
Dentro del mismo Server ID (`sid`), **TODOS** los canales deben tener exactamente el mismo `USERNAME` y `PASSWORD` en su output M3U8 final. Si notas que cada canal tiene un password distinto y larguísimo (Base64), acabas de violar esta regla y tienes fuga de tokens.

---
*Esta regla fue forjada con sangre tras el Incidente de Clave Incorrecta del 2026-04-17 (Bug de Tokenización /live/play).*
