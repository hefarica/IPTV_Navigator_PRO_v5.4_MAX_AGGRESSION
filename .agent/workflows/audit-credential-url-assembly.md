---
description: Flujo de trabajo y Auditoría E2E para Asegurar Credenciales SSOT y Blindaje de Puertos en Generadores M3U8.
---

# Flujo de Auditoría End-to-End: Credenciales, SSOT y Puertos

Si el usuario te invoca para revisar puertos caídos, errores `403 / 404 / 509` en credenciales de orígenes, o pide revisar la integridad de los generadores HTTP, DEBES obligatoriamente ejecutar este workflow paso a paso.

## FASE 0 (CRÍTICA): Verificar que channel.url NO se usa como shortcut

> **BUG HISTÓRICO 2026-04-17**: El API de Xtream Codes devuelve URLs pre-tokenizadas (`/live/play/TOKEN/id`) que NO son las credenciales reales. Si `buildChannelUrl()` retorna `channel.url` directamente, TODOS los canales fallan con "clave incorrecta".

1. **Abrir `m3u8-typed-arrays-ultimate.js` → `buildChannelUrl()`**
2. **VERIFICAR** que NO exista este patrón:
   ```javascript
   // ❌ PROHIBIDO
   if (existingUrl && existingUrl.includes('/live/')) return existingUrl;
   ```
3. **VERIFICAR** que el flujo SIEMPRE intente reconstruir desde `credentialsMap` PRIMERO
4. **VERIFICAR** que `existingUrl` solo se use como ÚLTIMO RECURSO (cuando `credentialsMap` está vacío)
5. **VERIFICAR** que TODOS los canales del MISMO servidor tengan el MISMO username y password en la URL final

**Formato correcto**: `http://{host}/live/{USERNAME_REAL}/{PASSWORD_REAL}/{stream_id}.m3u8`
**Formato PROHIBIDO**: `http://{host}/live/play/{TOKEN_BASE64}/{stream_id}` ← clave incorrecta

## FASE 1: Verificación de Adquisición Frontend
Asegurar que la Interfaz de Usuario y su almacenamiento persisten correctamente el puerto.

1.  **Auditar `app.js` (Lógica de Conexión):**
    Ubica la función asociadas a `connectServer` y `normalizeXtreamBase`.
    *Test:* Verifica que la regex y las purgas eliminen las barras finales, pero NO eliminen el formato `:port` numérico de la cadena final. La URL almacenada debe verse como `http://host:puerto/player_api.php`.

## FASE 2: Política Zero-Leak en Generadores M3U8
Asegurar que el texto claro de Usuario/Contraseña no permee a la lista final y que exista vinculación cifrada obligatoria con el VPS.

1.  **Auditar Generadores Javascript (Typed Arrays / API Wrapper):**
    Busca `resolverUrl` o la variable equivalente que dictamine el proxy M3U8.
2.  **Validar Inyección Cifrada:**
    Verifica la existencia y concatenación final de la variable que encapsule con `.btoa(...)` la trama `(BaseURL|Usuario|Contraseña)`. El URL de salida DEBE llevar `&srv=`.
3.  **Sanitización de Pasa-bordo (`url=`):**
    Comprueba si existe la inyección de `APE_SSOT_USER`/`APE_SSOT_PASS` (o el comodín establecido) reemplazando los nombres en la URL expuesta. El `.m3u8` NUNCA debe exhibir los accesos en el bloque `#EXTATTRFROMURL` o en tags paralelos.

## FASE 3: Tolerancia Antidesgarro (Backend proxy)
Asegurar que el Proxy PHP lea la autenticación sin destruir dependencias.

1.  **Auditar `ApeCredentials::resolve` / Backend Routing:**
    Asegúrate de que la función de búsqueda en el diccionario NUNCA mutile el host real proveniente de Javascript a priori. `explode(':', $host)` está prohibido en las fases iniciales.
2.  **Verificar Lógica Dual:**
    Garantiza un mecanismo "Fallback Lookup". El sistema debe cotejar contra matrices como `$dictionary['nov202gg.xyz:80']` primero. Solo si esto falla, caer en `$dictionary['nov202gg.xyz']`.

## FASE 4: Validaciones
1. **Compilación Simbólica:** 
   Inyecta código de consola o extrae localmente una lista para certificar que el archivo luce como: `...url=http://host:puerto/live/APE_SSOT_USER/APE_SSOT_PASS/id.m3u8&srv=ZZZZZ`.
2. **Ping a Origen HTTP (Si hay VPS):**
   Ejecuta `test_providers.php` incrustando `&srv=` para descartar rechazos tempranos y documentar un estado **DONE** ante el usuario.
