# Seguridad: la APK de producción es debuggable y su clave ADB privada está legible · 2026-11-13

**Severidad: ALTA.** No es una sospecha: está reproducido con prueba directa y con control.

## 1 · La APK es debuggable

```
dumpsys package com.ape.crystalagent
  pkgFlags=[ DEBUGGABLE HAS_CODE ALLOW_CLEAR_USER_DATA ]
```

**Verificado con `run-as`, y con control sobre otra app del mismo aparato:**

```
run-as com.ape.crystalagent id
  -> uid=10124(u0_a124) ... context=u:r:runas_app:s0:c124,c256,c512,c768

run-as studio.scillarium.ottnavigator id
  -> run-as: package not debuggable: studio.scillarium.ottnavigator   ← CONTROL
```

El control descarta que sea una limitación del aparato: **otra app del mismo ONN sí lo rechaza.** Es una propiedad de esta APK.

## 2 · Qué hay dentro, por nombre

Listado con `run-as ... ls -la`. **Solo nombres, tamaños y fechas. No se ha abierto ningún fichero.**

| Ruta | Tamaño | Qué es |
|---|---|---|
| **`files/adbkey`** | **1.703 B** | **Clave PRIVADA de un host ADB** |
| `files/adbkey.pub` | 716 B | Su clave pública |
| **`files/state_token`** | **48 B** | Token de API |
| **`files/event_token`** | **44 B** | Token de API |
| `files/fluid_events.jsonl` | 48.824 B | Cola de eventos |
| `shared_prefs/ape_secure.xml` | 1.144 B | Preferencias "secure" |
| `shared_prefs/ape_sync.xml` | 4.444 B | Sincronización |
| `shared_prefs/ape.xml` | 24.079 B | Preferencias |
| `databases/exoplayer_internal.db` | 192.512 B | Estado del reproductor |

## 3 · Por qué `files/adbkey` es lo más grave

Una **clave privada ADB** en el almacenamiento privado de una app **debuggable** significa:

1. Cualquiera con acceso ADB a esta caja lee la clave con un `run-as` (probado que funciona).
2. Esa clave **autentica contra los dispositivos que la tengan autorizada**.
3. Y esta APK **habla ADB** — su `adbkey` existe precisamente para conectarse a dispositivos.

**La exposición no termina en este televisor: una clave ADB privada es una credencial que se puede usar contra otros aparatos.** No he comprobado contra cuáles — eso sería usar la clave, y no se hace.

## 4 · Lo que NO se hizo, deliberadamente

- **No se abrió `adbkey`.** No se leyó ni se copió ningún byte de la clave privada.
- **No se abrieron `state_token` ni `event_token`.** No se imprimió ningún valor.
- **No se abrió `ape_secure.xml`.**
- **No se usó la clave contra ningún dispositivo.**

El hallazgo se sostiene en la **existencia, el tamaño y la legibilidad** de esos ficheros, no en su contenido. Un informe que necesite mostrar el secreto para probar que existe es un informe que lo ha filtrado.

## 5 · Qué lo arregla

En orden de menor a mayor alcance:

1. **Compilar la APK con `debuggable false`.** Un `android:debuggable="true"` no debe salir de un build de release. Es la corrección de raíz y la más barata.
2. **No guardar la clave ADB privada en el almacenamiento de la app.** Si la APK necesita ADB, la clave va al Keystore de Android o se provisiona por sesión; un fichero plano en `files/` es lo peor de ambos mundos.
3. **Rotar la clave ADB** una vez que el punto 1 esté cerrado: si estuvo expuesta en un equipo con depuración habilitada, hay que asumirla comprometida.
4. **Rotar `state_token` y `event_token`** por la misma razón.

**Ninguna se ha aplicado.** 1 y 2 son cambios de build; 3 y 4 son acciones de servidor. Todas son del operador.

## 6 · Por qué esto encaja en §14

El criterio de §14 para Seguridad es: *«Secretos protegidos, rutas autorizadas y permisos mínimos»*.

- **Secretos protegidos:** no. Clave ADB privada y dos tokens en almacenamiento legible.
- **Permisos mínimos:** no. La app pide más de lo necesario al ser debuggable en producción.

La fila de Seguridad de la matriz **sigue en FAILED**, y ahora con un motivo medido más concreto que el que tenía.
