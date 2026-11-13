# PROPUESTA: PROVISION DEL SECRETO DE ENROLAMIENTO EN RUNTIME

**Estado: PROPUESTA. NO IMPLEMENTADA. NO PROBADA EN DISPOSITIVO. NO AUTORIZADA.**
**Autor:** http-prober (equipo canary-jit-20261111) · **Tarea:** t24 · **Fecha:** 2026-11-11

> **Nada de este documento esta hecho.** No se ha tocado codigo, no se ha recompilado nada por este motivo, no se ha probado en dispositivo, no se ha rotado ningun valor y no se ha descifrado ningun blob. Es una propuesta para que el operador **decida**.

---

## 0. JERARQUIA (lo primero, porque ordena todo lo demas)

> **1. La rotacion del servidor es lo que cierra la exposicion.**
> **2. Reconstruir el APK es continuidad, no seguridad.**

Un binario ya distribuido no se arregla recompilandolo: se neutraliza **cambiando en el servidor el valor que acepta** ([`docs/ops/SECRET_ROTATION_PROCEDURE.md`](SECRET_ROTATION_PROCEDURE.md) §0 y §3). Esta propuesta **no sustituye** a esa rotacion; resuelve el problema **de la siguiente emision**: que el secreto **no vuelva a viajar dentro del binario**.

Si el operador solo puede hacer una cosa, hace la rotacion. Esta propuesta es el paso siguiente.

---

## 1. EL PROBLEMA, CON LA CAUSA RAIZ

### 1.1 Por que un valor inyectado en build **siempre** acaba en el `.dex`

No es un descuido de este proyecto: es el mecanismo, y ocurre en cadena:

| Paso | Que pasa | Fuente |
|---|---|---|
| 1 | El build lee el valor de `local.properties` o del entorno, con placeholder como ultimo recurso | `app/build.gradle.kts:12-19` |
| 2 | Lo inyecta como **constante de compilacion** | `app/build.gradle.kts:31` `buildConfigField("String", "ENROLL_SECRET", "\"$apeEnrollSecret\"")` |
| 3 | AGP genera la clase `BuildConfig` con ese `public static final String` | `app/build.gradle.kts:48-50` `buildFeatures { buildConfig = true }` |
| 4 | El compilador materializa el literal en el **pool de cadenas** del `.dex` | medido: `classes5.dex` del `app-debug.apk`, **offset 423.327** |
| 5 | Ese literal **no se puede eliminar** porque el codigo lo usa | `EnrollClient.kt:46` `.put("secret", BuildConfig.ENROLL_SECRET)` |
| 6 | Y no hay reduccion de codigo que lo limpie: **minificacion desactivada** en ambas variantes | `app/build.gradle.kts:54` (`release`) y `:61` (`debug`), `isMinifyEnabled = false` |

**Conclusion:** mientras el valor entre por `buildConfigField` y se lea en `EnrollClient.kt:46`, estara en el `.dex`. No es configurable, no es opcional. **La unica forma de que no este es que no se inyecte.**

### 1.2 Por que ofuscarlo no es la salida (y este repo ya tiene la prueba)

`EmbeddedKey.kt` intenta exactamente eso con la clave de `/sync`: guarda el blob cifrado en `BuildConfig.SYNC_KEY_ENC` y **la clave de descifrado hardcodeada al lado**:

```
EmbeddedKey.kt:21   private const val AES_KEY_HEX = "<64 hex = 32 bytes>"   // fichero TRACKED
EmbeddedKey.kt:26   val parts = BuildConfig.SYNC_KEY_ENC.split('.')
EmbeddedKey.kt:34   SecretKeySpec(hex(AES_KEY_HEX), "AES")
EmbeddedKey.kt:13   "Esto es OFUSCACIÓN, no seguridad fuerte: la clave de descifrado también vive en el APK."
```

Ese comentario no es una opinion: es la demostracion empirica. **Cifrar con una clave que viaja junto al cifrado mueve el secreto de sitio, no lo protege.** Cualquiera que abra el APK tiene ambas mitades.

**NO_COMPUTADO (deliberado):** no se ha intentado descifrar `SYNC_KEY_ENC` ni usado `AES_KEY_HEX`. Se cita como evidencia de diseño, no como vulnerabilidad explotada. Que esa clave sea un placeholder sintetico (`A1B2C3D4…` repetido) es una observacion de lectura, no una confirmacion de que el blob se descifre con ella.

### 1.3 Por que el placeholder inerte NO es solucion

Compilar sin valor (`build.gradle.kts:16-18` cae a `CHANGE_ME_ENROLL_SECRET_AT_LEAST_32_CHARS`) consigue que el APK **no lleve el secreto**… y que **no pueda enrolar**:

| Elemento | Valor | Fuente |
|---|---|---|
| El placeholder se envia como secreto | `EnrollClient.kt:46` | **VERIFICADO** |
| El servidor compara contra el valor real | `hash_equals($secret, $given)` | `ara-enroll.php:38` |
| Resultado | **401 `BAD_SECRET`** | `ara-enroll.php:38` |

Es *fail-closed* (bien) pero **inutiliza el enrolamiento** (mal). Un APK que no puede enrolar no es una solucion: es una regresion funcional con buena postura de seguridad.

**Medido ademas:** en los 36 APK escaneados, el placeholder aparece **0 veces** — todos los builds inyectaron un valor real. Es decir, **hoy nadie usa la via del placeholder**.

---

## 2. EL DISENO PROPUESTO

### 2.1 Idea

Sacar el secreto del build y **provisionarlo por dispositivo en el primer arranque**, guardandolo en el almacen cifrado que la app **ya tiene**.

```
HOY:     local.properties --build--> BuildConfig.ENROLL_SECRET --dex--> APK (secreto dentro)
PROPUESTO: operador --primer arranque--> Secure (EncryptedSharedPreferences) --POST--> VPS
```

### 2.2 Flujo

| # | Paso | Soporte en el codigo actual |
|---|---|---|
| 1 | La app arranca y detecta que **no esta enrolada ni provisionada** | `EnrollClient.kt:80` `isEnrolled()` ya existe; falta un `isProvisioned()` analogo |
| 2 | Muestra una **pantalla de provision** (el operador introduce/escanea el secreto una vez) | **NO EXISTE** — hay que crearla; la app es TV (`leanback-launchable-activity`, ver `APK_FEASIBILITY_20261111.md` §6) |
| 3 | Guarda el secreto en almacen cifrado | `Secure.kt:30-32` (`put`/`get`/`has`) ya existe y ya se usa asi para el material WireGuard (`EnrollClient.kt:68-73`) |
| 4 | `ensureEnrolled()` lee de ahi en vez de `BuildConfig` | cambio en `EnrollClient.kt:46` |
| 5 | POST `/ara/enroll` **sin cambios** (mismo contrato) | `EnrollClient.kt:52-55`, `ara-enroll.php:29-38` intactos |
| 6 | Si el servidor responde 200, se marca provisionado; si 401, se borra y se pide de nuevo | `EnrollClient.kt:57-59` ya distingue `!isSuccessful` |

### 2.3 Que habria que tocar, fichero:linea

| # | Fichero:linea | Cambio | Riesgo |
|---|---|---|---|
| 1 | `app/build.gradle.kts:12-19` | **Eliminar** el bloque que lee `ape.enroll.secret` de `local.properties` / env | bajo |
| 2 | `app/build.gradle.kts:31` | **Eliminar** `buildConfigField("String","ENROLL_SECRET", …)` | bajo — deja de compilar `:46` hasta el paso 3 |
| 3 | `EnrollClient.kt:46` | `.put("secret", BuildConfig.ENROLL_SECRET)` → `.put("secret", sec.get("enroll_secret") ?: "")` + guardia: si vacio, **no** lanzar el POST y pedir provision | **medio** — cambia el flujo de arranque |
| 4 | `EnrollClient.kt:38-78` | Anadir `isProvisioned()`; si no hay secreto, **no** intentar enrolar (hoy intentaria con `""` → 401) | medio |
| 5 | `EnrollClient.kt:97-101` | Actualizar el comentario: deja de ser "BAKED (decisión del propietario)" | nulo |
| 6 | **Nuevo**: pantalla/actividad de provision | UI para introducir el secreto (o escanear codigo) | **alto** — UX en TV, sin teclado comodo |
| 7 | `Secure.kt:23-25, 26-28` | **Decidir** el fallback API 22 (ver §2.4) | **alto** si se ignora |
| 8 | `EmbeddedKey.kt:21` | **Fuera de alcance de esta propuesta**, pero es el mismo patron: `AES_KEY_HEX` hardcodeada en fichero TRACKED. Requiere su propia decision (§4 Q6) | medio |
| 9 | `ara-enroll.php:29-38` | **Sin cambios obligatorios**: sigue leyendo `env[APE_ENROLL_SECRET]` y comparando con `hash_equals`. **Opcional**: aceptar varios valores durante transicion, o pasar a tokens por dispositivo (§4 Q5) | medio si se opta por tokens |

### 2.4 La trampa que hay que decidir: API 22 guarda en claro

`Secure.kt` ya usa `EncryptedSharedPreferences` con `MasterKey AES256_GCM` (`:17-22`)… **pero solo en API ≥ 23**, y en API 22 (Fire OS 5) cae a `SharedPreferences` **privado pero SIN cifrar**:

```kotlin
Secure.kt:16-17   if (Build.VERSION.SDK_INT >= 23) { ... MasterKey ... EncryptedSharedPreferences ... }
Secure.kt:23-25   } else { ctx.getSharedPreferences("ape_secure_plain", Context.MODE_PRIVATE) }
Secure.kt:26-28   } catch (e: Exception) { ctx.getSharedPreferences("ape_secure_plain", ...) }
```

Y `minSdk = 22` (`build.gradle.kts:27`), explicito para Fire OS 5. Por tanto:

- En **API ≥ 23**: el secreto provisionado queda bajo **Keystore** (AES-GCM). Bien.
- En **API 22**: queda en un XML **MODE_PRIVATE sin cifrar**. Mejor que un APK descargable (hace falta root o adb para leerlo), pero **no es Keystore**.
- El `catch` (`:26-28`) degrada a claro **en silencio** si `MasterKey` falla en cualquier device: un fallo de Keystore no debe convertir esto en "guardado en claro" sin avisar.

**Decision requerida (§4 Q3).** Mi recomendacion: si se acepta la provision, **exigir API ≥ 23 para enrolar** y en API 22 mantener una via explicita (p.ej. ADB push del config) antes que degradar en silencio.

### 2.5 Lo que esto NO arregla (honestidad)

Provisionar **el mismo secreto compartido** en runtime **reduce el dano** (deja de viajar en un binario descargable; cada device lo guarda en su almacen) pero **no elimina la debilidad de fondo**: el secreto sigue siendo **compartido entre dispositivos**, y un device comprometido lo expone para todos los demas.

La salida **estructural completa** es **credencial por dispositivo**: un token de enrolamiento de un solo uso (o ligado a pubkey) emitido por el operador, validado contra una tabla en el servidor. Eso exige tocar `ara-enroll.php:29-38` y anadir estado en el servidor: **mucho mayor alcance** (§4 Q5).

Esta propuesta **mejora** sin resolver del todo. Decirlo es parte de la propuesta.

---

## 3. POR QUE ESTA ES LA UNICA SALIDA ESTRUCTURAL

| Alternativa | Por que no sirve |
|---|---|
| Seguir inyectando en build | §1.1: acaba siempre en el `.dex`. El proximo APK vuelve a filtrarlo. |
| Placeholder inerte | §1.3: 401 `BAD_SECRET`. Rompe el enrolamiento. |
| Cifrar el secreto en el APK | §1.2: la clave viaja al lado (`EmbeddedKey.kt` es la prueba). Es ofuscacion. |
| Ofuscar el nombre / partir la cadena en trozos | Reconstruible; el valor sigue siendo contiguo en memoria al ejecutar. No pasa una revision seria. |
| Bajar el secreto por HTTPS al primer arranque desde un endpoint publico | Se convierte en "descargable por cualquiera" = equivalente a publicarlo. |
| **Provision por el operador en primer arranque + almacen cifrado** | El secreto **nunca** esta en el binario; cada device lo recibe una vez y lo guarda. **Unica que rompe la cadena de emision.** |

---

## 4. PREGUNTAS ABIERTAS — REQUIEREN DECISION DEL OPERADOR

> **Esta propuesta NO puede implementarse sin que se respondan.** Ninguna la puedo contestar desde el repositorio.

| # | Pregunta | Por que importa | Mi lectura (no vinculante) |
|---|---|---|---|
| **Q1** | **Canal de provision**: ¿como recibe el secreto el device en el primer arranque? (a) teclado del mando, (b) codigo/QR en pantalla escaneado por el movil, (c) `adb shell` escribiendo el pref, (d) fichero empujado al directorio privado | Define la UI y el coste operativo. Un secreto de 48 chars en un mando de TV es penoso pero posible una vez | (c) para el parque actual (ya hay `dadb` en el APK, `build.gradle.kts:104`), (b) para instalaciones nuevas |
| **Q2** | ¿Se acepta **un secreto compartido** provisionado en runtime, o se exige **token por dispositivo**? | §2.5: compartido = mejora parcial; por dispositivo = cambio servidor | Empezar por compartido (rapido), planificar por dispositivo |
| **Q3** | **API 22 (Fire OS 5)**: ¿se exige API ≥ 23 para enrolar, o se acepta `SharedPreferences` en claro (y su `catch` silencioso)? | §2.4: `Secure.kt:23-28` degrada a claro | Exigir ≥23 para enrolar; en 22, via ADB explicita |
| **Q4** | Que debe hacer la app **sin provisionar**: ¿bloquear reproduccion, degradar, o solo impedir el enrolamiento? | Afecta a la experiencia y al soporte | Impedir enrolamiento y avisar; no bloquear reproduccion |
| **Q5** | ¿Se migra el servidor a **tokens por dispositivo** (tabla + validacion por pubkey)? | Es la unica forma de cerrar del todo §2.5 | Si Q2 = por dispositivo, es obligatorio |
| **Q6** | ¿Se aborda tambien `EmbeddedKey.kt:21` (clave AES de `/sync` hardcodeada en fichero TRACKED)? | Mismo patron; su propio comentario ya lo acepta como ofuscacion | Tratar como caso aparte, con decision explicita y por escrito |
| **Q7** | ¿Se acepta un **flag day**: toda instalacion nueva exige provision? | Cambia el despliegue y el soporte | Si, si va acompanado de la rotacion |
| **Q8** | **Pruebas en dispositivo**: ¿que hardware y cuantos? | Sin esto **no se puede declarar la propuesta viable** | Minimo: 1 device API ≥23 y 1 Fire OS 5 (API 22) |

---

## 5. QUE FALTA PARA PODER DECIR "IMPLEMENTADO Y VERIFICADO"

Ninguno de estos pasos se ha ejecutado:

- [ ] Respuestas a Q1–Q8 por escrito del operador.
- [ ] Implementar §2.3 (1–6) en rama aparte.
- [ ] **Compilar** y verificar que el APK resultante **no contiene** el secreto: escaneo con el metodo obligatorio de [`docs/policies/SECRETS_IN_BINARIES.md`](../policies/SECRETS_IN_BINARIES.md) §3 (descomprimiendo; el contenedor dara 0 siempre y **no vale**).
- [ ] **Prueba en dispositivo** de: primer arranque sin provision → se niega a enrolar (no 401 silencioso); provision → enrola 200; reinicio → sigue provisionado; rotacion en servidor → el device ya enrolado **sigue funcionando** (no re-enrola).
- [ ] Prueba en **API 22** del camino alternativo de Q3.
- [ ] Verificar que `Secure` **no** degrada en silencio a claro (o que avisa): `Secure.kt:26-28`.
- [ ] Rotacion del servidor ejecutada segun [`SECRET_ROTATION_PROCEDURE.md`](SECRET_ROTATION_PROCEDURE.md).
- [ ] Re-escanear los 36 APK historicos y decidir su retirada.

> **Sin la prueba en dispositivo, esto sigue siendo una propuesta.** "Compila" no es "funciona"; y "el APK ya no lo lleva" no es "el enrolamiento funciona".

---

## 6. RESUMEN PARA EL OPERADOR

1. **Hoy**: el secreto viaja en **29 de los 34 binarios APK distintos** del workspace, y no se ha rotado en 12 dias. **La accion urgente es la rotacion del servidor**, no esta propuesta.
2. **Esta propuesta** elimina la **causa** de que vuelva a viajar: provision en el primer arranque + almacen cifrado. No toca el contrato HTTP del enrolamiento.
3. **No resuelve** la debilidad de fondo (secreto compartido) salvo que se opte por tokens por dispositivo (Q5), que es un cambio de servidor.
4. **No se puede implementar** sin Q1–Q8 y sin prueba en dispositivo. **NO IMPLEMENTADA.**

---

*Documento escrito el 2026-11-11. Ningun valor de secreto aparece en el: solo rutas, lineas, longitudes y sha256. No se ha descifrado ningun blob, no se ha rotado nada, no se ha tocado el VPS ni se ha hecho push.*
