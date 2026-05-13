---
name: "Metacognition: Never Trust Variable Names — Leer El Valor Real, No El Nombre"
description: "Un function llamada generateJWT puede retornar un string. Un método llamado getUA puede no existir. Un parámetro llamado 'headers' puede ser un string. SIEMPRE verificar el TYPE y VALUE real."
---

# Never Trust Variable Names

## La regla

**El nombre de una función, variable, o archivo es una INTENCIÓN, no una garantía. Solo el valor de retorno y el tipo real importan.**

## Catálogo de engaños documentados en este proyecto

### 1. Función con nombre engañoso

```javascript
function generateJWT68Fields(channel, profile, index) {
    return "JWT_STUB";  // NO es un JWT. Es un string literal.
}
```

El consumidor asume objeto:
```javascript
jwt.token     // undefined (string no tiene .token)
jwt.sessionId // undefined
```

**Lección:** `typeof generateJWT68Fields(...)` es `"string"`, no `"object"`.

### 2. Método que NO existe en la API

```javascript
// API expuesta:
return { init, get, getForChannel, getForZapping, getForRecovery, getLayeredUA };

// Llamada en el código:
UAPhantomEngine.getUA('ANDROID');  // getUA NO EXISTE, undefined, fallback
```

**Lección:** Leer el `return { ... }` del IIFE, no asumir.

### 3. Variable que retorna tipo inesperado

```javascript
// build_exthttp() retorna:
return `#EXTHTTP:${JSON.stringify(primaryHeaders)}`;  // STRING

// Consumidor espera:
_exthttp_base.headers  // undefined (string no tiene .headers)
```

### 4. Key de mapa con case-sensitivity

```javascript
// tierMap (real):
'Android': [111, 120],  'iOS': [103, 111],  'Safari': [83, 91]

// Llamadas (incorrectas):
get('ANDROID')   // no matchea, fallback random
```

### 5. Array que fue shuffleado

```javascript
// BANK original: [SmartTV_0..59, ..., Android_111..119]
// _epochPermutation: shuffle global, Android_111 ahora en posicion 47

tierMap['Android'] = [111, 120];
_epochPermutation[111]  // YA NO es Android tras shuffle
```

## Protocolo

```javascript
const result = someFunction();
console.log(typeof result, result);

if (typeof result === 'object' && result !== null && result.expectedProp) { /* safe */ }
if (typeof SomeModule.expectedMethod === 'function') { SomeModule.expectedMethod(); }
```

## Mandamiento

> **Los nombres mienten. Los tipos no.**
