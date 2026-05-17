---
name: Protocolo Maestro de Generación Segura de Listas (Credenciales y Puertos E2E SSOT)
description: Doctrina absoluta que dicta cómo DEBEN manipularse puertos y credenciales desde la Interfaz Frontend hasta la Orquestación M3U8 para prevenir fugas L7 (Zero-Leak) y mutilación de puertos (HTTP 403 / 509).
---

# Protocolo Maestro: Credenciales y Puertos E2E SSOT

Este protocolo (**MANDATORY RULE**) dicta el manejo estricto de cualquier Host o Enlace (con y sin puerto), Nombre de Usuario y Contraseña enviados a través del ecosistema OMEGA de IPTV Navigator PRO y APE VPS. 

**CUALQUIER MODIFICACIÓN A LOS GENERADORES FRONTEND O PROXIES BACKEND DEBE SOMETERSE A ESTAS REGLAS.** El incumplimiento genera Fuga de Credenciales y Degradación Masiva de Conectividad (Errores HTTP 403/404 y Caída Masiva en reproductores).

---

## 🛑 REGLA 1: El Puerto es Intocable en el Parseo (Backend)

Bajo ningún concepto se mutilará el puerto (`:80`, `:8080`) asignado explícitamente en el panel Frontend por un proveedor.
- **Prohibido:** `explode(':', $host)[0];` al parsear la URL recibida para el re-emparejamiento SSOT.
- **Implementación Aceptada:** Mantener el host limpio intacto (Ej. `nov202gg.xyz:80`). Usar una estrategia de cascada (Fallback Lookup) para consultar la tabla de contraseñas. Primero buscar la cadena exacta (con puerto), y en caso de fracaso, probar con la versión truncada (strip-port).

## 🛑 REGLA 2: Política Zero-Leak ( Frontend -> Proxy M3U8 )

Cualquier generador Frontend que estructure la Lista y enmascare los proxies locales contra el VPS, tiene estrictamente prohibido pasar la URL en texto claro. Toda autenticación nativa debe ser eliminada antes de tocar el documento físico descargable que el usuario se lleva.
- **Inyección Suicida:** `url=encodeURIComponent(http://ky-tv.cc:80/live/admin/12345/1.m3u8)`
- **Estructura Cifrada Obligatoria:** `url=encodeURIComponent(http://ky-tv.cc:80/live/APE_SSOT_USER/APE_SSOT_PASS/1.m3u8)`
- **Por Qué:** Un tercero que robe y lea el `.m3u8` jamás debe poder extraer el Usuario ni la Contraseña, y si esta viaja como variable expuesta bajo el tag `#EXTATTRFROMURL:`, el sistema se vuelve altamente vulnerable a abusos de listas.

## 🛑 REGLA 3: Mandatory Base64 Binding (`&srv=`)

Toda solicitud a `resolve_quality*.php` o enrutadores del núcleo APE VPS **TIENE** que estar atada, sellada y parametrizada con la firma criptográfica base64 `&srv=` que adjunte el host, el usuario purificado y el pasword ofuscado en una única carga.
- **Formato Correcto:** `&srv=BASE64(HOST|USER|PASS)` -> `&srv=Znhje...`
- **Generación en Frontend:** Los archivos Javascript (como `m3u8-typed-arrays-ultimate.js`, `m3u8-api-wrapper`) prepararán incondicionalmente este Header Criptográfico y lo concatenarán obligatoriamente en el tail de `resolverUrl`. 

---

## Ejecución Obligatoria (Puntos de Control)
Si la instrucción encomendada es reestructurar o tocar `app.js`, `resolve_quality.php` (y derivados) o CUALQUIER archivo generador:
1. Valida de inmediato si los tres pilares arriba fueron respetados.
2. Abre y ejecuta el Workflow `/audit-credential-url-assembly` antes de concluir.
