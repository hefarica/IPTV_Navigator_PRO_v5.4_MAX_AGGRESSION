---
name: credential-lock
description: "Credential Lock — Las credenciales validadas por la API son INMUTABLES. NUNCA se alteran caracteres visibles de user/pass después de una conexión exitosa. Incluye protección anti-autofill del browser."
---

# 🔒 Credential Lock — Credenciales Inmutables Post-Validación

## Regla Absoluta

> **"Si la conexión fue exitosa con esas credenciales, esas credenciales son sagradas y no deben cambiar nunca más. La conexión exitosa es la garantía de que NUNCA más se tienen que cambiar. De lo contrario ya no será posible loguearse."**

## Prohibiciones

1. **NUNCA** reemplazar caracteres visibles de una contraseña (ej: `@` → `B`, `!` → `1`, etc.)
2. **NUNCA** crear sanitizadores que muten el contenido alfanumérico/simbólico
3. **NUNCA** asumir que un carácter específico "no es válido" — cada proveedor IPTV define sus propias reglas
4. **NUNCA** re-leer credenciales del DOM después de la validación inicial — usar las congeladas

## Patrón Credential Lock

### Paso 1: Captura (connectServer)

```javascript
const user = (userEl?.value || '').trim();
const pass = (passEl?.value || '').trim();
// Se envían TAL CUAL a la API
const rawChannels = await this.connectXuiApi(baseHost, user, pass);
```

### Paso 2: Congelamiento (después de respuesta exitosa)

```javascript
if (rawChannels && rawChannels.length > 0) {
    this.state.currentServer._credentialsValidated = true;
    this.state.currentServer._validatedAt = Date.now();
    this.state.currentServer._lockedUsername = user;   // EXACTO, byte a byte
    this.state.currentServer._lockedPassword = pass;   // EXACTO, byte a byte
}
```

### Paso 3: Consumo (en TODOS los puntos downstream)

```javascript
// SIEMPRE priorizar _locked sobre raw
const user = srv._lockedUsername || srv.username || srv.user || '';
const pass = srv._lockedPassword || srv.password || srv.pass || '';
```

## Puntos de Aplicación

Cada uno de estos puntos DEBE leer `_lockedUsername`/`_lockedPassword` primero:

### app.js

| Método | Propósito |
| ------ | --------- |
| `connectServer()` | Congela credenciales tras API exitosa |
| `saveServerToLibrary()` | Graba locked creds en localStorage |
| `connectFromLibrary()` | Lee locked creds al reconectar |
| `addServerToConnections()` | Lee locked creds al agregar servidor |

### m3u8-typed-arrays-ultimate.js

| Función | Propósito |
| ------- | --------- |
| `addServer()` en `buildCredentialsMap()` | Prioriza `_lockedUsername`/`_lockedPassword` |
| `buildChannelUrl()` STEP 3 | Lookup por serverId en activeServers |
| `buildChannelUrl()` STEP 4 | Lookup por hostname en activeServers |
| `buildChannelUrl()` LAST RESORT | Fallback directo a servidor |
| Generador `srv=` token (`btoa()`) | Token base64 para resolve_quality.php |

### server-library-multi-save.js

| Función | Propósito |
| ------- | --------- |
| `saveAllActiveServersToLibrary()` | Guardado masivo usa locked creds |

## sanitizeCredential() — Qué SÍ puede hacer

```javascript
function sanitizeCredential(value) {
    if (!value || typeof value !== 'string') return value || '';
    let clean = value.trim();                                    // ✅ Quitar espacios
    clean = clean.replace(/[\u200B\u200C\u200D\uFEFF\u00A0]/g, ''); // ✅ Quitar invisibles
    return clean;                                                // ❌ NO tocar nada más
}
```

## Backend Safety Net (ape_credentials.php)

El VPS tiene `ape_credentials.php` como red de seguridad para listas M3U8 históricas que contengan credenciales antiguas. Este SSOT backend es el ÚNICO autorizado a sustituir credenciales, y solo lo hace al comunicarse con el proveedor upstream — nunca modifica lo que devuelve al reproductor.

## Anti-Patrones (PROHIBIDOS)

```javascript
// ❌ PROHIBIDO: Reemplazar caracteres en contraseñas
pass = pass.replace('@', 'B');
pass = pass.replace('U56@DP', 'U56BDP');
password: (srv.password || '').replace('U56@DP', 'U56BDP');

// ❌ PROHIBIDO: Asumir formato de contraseña
if (pass.includes('@')) pass = pass.replace(/@/g, 'B');

// ❌ PROHIBIDO: Re-leer del DOM después de validar
const pass = document.getElementById('password').value; // SOLO en connectServer() inicial
```

---

# 🛡️ Anti-Autofill / Anti-Password Manager — Protección del Buscador

## Regla Absoluta

> **"El campo de búsqueda (#searchQuery) NUNCA debe mostrar credenciales guardadas, valores pre-llenados, ni sugerencias del gestor de contraseñas del browser. Debe arrancar SIEMPRE vacío en cada carga."**

## Problema

Edge/Chrome detectan inputs de texto cerca de campos `type="password"` y los tratan como campos de login, mostrando el popup "Contraseñas guardadas". Los atributos `autocomplete="off"`, `autocomplete="nope"`, `autocomplete="new-password"` son **ignorados por Edge** en inputs sueltos.

## Solución Verificada (3 capas)

### Capa 1: HTML — Form Isolation (OBLIGATORIA)

El input de búsqueda DEBE estar dentro de su propio `<form>` aislado. Edge respeta `autocomplete="off"` en `<form>`, NO en `<input>` suelto.

```html
<form autocomplete="off" onsubmit="return false" style="display:inline; margin:0; padding:0;">
  <input type="search" id="searchQuery" class="input"
    placeholder="Buscar canal / categoría…"
    aria-label="Buscar canal o categoría"
    autocomplete="off" role="searchbox"
    data-lpignore="true" data-form-type="other" data-1p-ignore="true" />
</form>
```

Atributos requeridos:
- `autocomplete="off"` en el `<form>` Y en el `<input>`
- `role="searchbox"` — indica al browser que NO es un campo de login
- `data-lpignore="true"` — bloquea LastPass
- `data-form-type="other"` — bloquea Dashlane
- `data-1p-ignore="true"` — bloquea 1Password

### Capa 2: JavaScript — Multi-Timer Anti-Autofill

El browser autofill ejecuta DESPUÉS de DOMContentLoaded. Se requieren múltiples timers para vencerlo:

```javascript
const searchInput = document.getElementById('searchQuery');
if (searchInput) {
  searchInput.value = '';
  // Clear again after browser autofill (100ms, 500ms, 1.5s)
  [100, 500, 1500].forEach(ms => setTimeout(() => {
    if (searchInput.value && searchInput.value !== searchInput.dataset.userTyped) {
      searchInput.value = '';
    }
  }, ms));
  // Track user-typed values so we don't erase what the user actually types
  searchInput.addEventListener('input', () => {
    searchInput.dataset.userTyped = searchInput.value;
  });
}
```

### Capa 3: Estado — Never Restore searchQuery

En `loadFilterState()`, el `searchQuery` NUNCA se restaura desde IndexedDB:

```javascript
// V4.28: Never restore search — always start clean
this.state.searchQuery = '';
if ($('searchQuery')) $('searchQuery').value = '';
```

Los filtros (tier, codec, language) SÍ se restauran. Solo el texto de búsqueda arranca vacío.

## Anti-Patrones (PROHIBIDOS)

```html
<!-- ❌ PROHIBIDO: autocomplete="nope" — valor inválido, browser lo ignora -->
<input autocomplete="nope" />

<!-- ❌ PROHIBIDO: input suelto sin form wrapper — Edge ignora autocomplete="off" -->
<input type="search" autocomplete="off" />

<!-- ❌ PROHIBIDO: restaurar searchQuery desde persistencia -->
this.state.searchQuery = data.searchQuery || '';
```

## Archivos Afectados

| Archivo | Cambio |
| ------- | ------ |
| `index-v4.html` L1254 | `<form>` wrapper + atributos anti-autofill |
| `index-v4.html` L3260 | Multi-timer anti-autofill (DOMContentLoaded) |
| `app.js` loadFilterState() | `searchQuery = ''` siempre |
