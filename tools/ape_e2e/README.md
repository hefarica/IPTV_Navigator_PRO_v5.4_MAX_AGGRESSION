# APE Header Validator E2E (Capa 1)

Este paquete contiene el script de prueba de extremo a extremo (E2E) para validar que los headers inyectados por el generador M3U8 (`#EXTHTTP` y `#KODIPROP`) son exactamente los mismos que llegan al servidor IPTV en producción.

## Estructura
- `e2e-runner.js`: Orquestador principal.
- `capture-server.js`: Servidor falso que simula al provider IPTV y captura los headers reales.
- `m3u8-parser.js`: Lee la lista M3U8 y extrae los headers declarados por el generador.
- `sanity-validator.js`: Ejecuta los 12 invariantes críticos comparando declarados vs reales.
- `coherence-validator.js`: Valida la coherencia interna entre los 4 headers de identidad (12 reglas R1-R12).

## Cómo ejecutar
1. Asegúrate de tener Node.js instalado.
2. Ejecuta el orquestador apuntando a tu lista generada:
   ```bash
   node e2e-runner.js /ruta/a/tu/lista.m3u8 Reporte_E2E.md
   ```
3. Para validar coherencia interna (sin servidor de captura):
   ```bash
   node coherence-validator.js /ruta/a/tu/lista.m3u8 --max 20 --report Reporte_Coherencia.md
   ```
4. Revisa el archivo de reporte generado.

## Nota de plataforma
`e2e-runner.js` usa `SIGUSR1` para la comunicación IPC con `capture-server.js`.
En Windows, ejecutar con **Git Bash** o **WSL** — PowerShell no soporta SIGUSR1.
`coherence-validator.js` funciona en PowerShell/CMD directamente.

## Pool de dominios neutros (sincronizado con generador)
El pool de 20 dominios en `sanity-validator.js` y `coherence-validator.js` debe mantenerse
sincronizado con `_NEUTRAL_REFERER_POOL` en `m3u8-typed-arrays-ultimate.js`.
Actualizado en commit `037e6cf` (C2 — doble rotación espacial × temporal via epochSeed).

## Invariantes E2E Validados (sanity-validator.js)
1. **I1**: Tamaño real de headers <= 8192 bytes.
2. **I2**: Referer es dominio neutro (no expone VPS).
3. **I3**: Origin es dominio neutro.
4. **I4**: Sec-CH-UA versión coincide con la versión Chrome del User-Agent.
5. **I5**: traceparent ausente (WAF bot signal).
6. **I6**: X-Auth-Type neutralizado.
7. **I7**: X-Device-Capabilities coherente con el perfil.
8. **I8**: X-Requested-With ausente.
9. **I9**: X-Client-Version sin fingerprints OMEGA/APE.
10. **I10**: Todos los headers declarados en #EXTHTTP llegan intactos.
11. **I11**: El reproductor no inyecta headers extra tóxicos.
12. **I12**: Idempotencia de User-Agent confirmada (Real == Declarado).
