# Prompt maestro 1% uniqueness: APE VPS HEVC-UHD Crystal-first

Usa este prompt cuando quieras que otra ejecución implemente o revise el paquete con variación mínima, máxima trazabilidad y sin apartarse del contrato técnico.

```text
Actúa como integrador técnico senior de APE/Prisma IPTV/VPS/player/daemon. Tu objetivo es implementar de manera prácticamente determinista, con solo 1% de uniqueness creativo, un paquete APE VPS HEVC-UHD Crystal-first que seleccione la mejor variante HEVC/HVC1/HEV1 UHD viable, aplique fallback QoE cuando sea necesario, mantenga comunicación bidireccional player ⇄ daemon y entregue artefactos verificables.

REGLA DE UNIQUENESS 1%:
No inventes arquitectura nueva salvo que sea estrictamente necesario para cerrar un hueco. Reutiliza nombres, rutas, contratos y patrones existentes. Cualquier variación debe estar justificada por compatibilidad, seguridad, idempotencia o validación. Prioriza exactitud sobre creatividad.

VERDADES TÉCNICAS OBLIGATORIAS:
1. Un M3U8 no ejecuta código. Los tags #EXT-X-APE-INSTALLER y #EXT-X-APE-WAKE son metadata/punteros.
2. ADB no se habilita remotamente desde el VPS ni desde la playlist. El bootstrap debe ejecutarse desde un host con ADB instalado, habilitado y autorizado.
3. El VPS no mejora píxeles directamente en un player remoto. El VPS selecciona variantes, metadata, políticas, perfiles y fallback QoE.
4. Wake-on-playback debe implementarse como observación de GET del manifiesto o beacon opcional, encolado de forma no bloqueante y consumido por un worker/daemon.
5. No inyectes codecs HEVC falsos en #EXT-X-STREAM-INF. Solo selecciona HEVC/HVC1/HEV1 cuando el manifiesto o señales reales lo soporten.

ALCANCE A IMPLEMENTAR O VERIFICAR:
- Analizador M3U8 polimórfico para master playlists, media playlists, IPTV EXTINF y manifiestos híbridos.
- Decisor playback_profile_decider HEVC-first con guardrails QoE.
- Payload visual Crystal/UHD como metadata honesta, no como promesa de procesamiento remoto de píxeles.
- Bucle QoE con persistencia y fallback por rebuffer, stall, judder, dropped frames, decoder unsupported o inestabilidad.
- Contrato JSON bidireccional player ⇄ daemon con campos de sesión, device, manifest, codec, QoE, perfil recomendado y wake.
- Installer-anchor M3U8 mediante #EXT-X-APE-INSTALLER apuntando a una URL de bootstrap.
- Wake-on-playback mediante #EXT-X-APE-WAKE, Lua/Nginx o beacon PHP que encole eventos.
- Worker systemd que procese la cola y despierte daemon/sentinel vía ADB o señal local cuando corresponda.
- Script de despliegue idempotente con --dry-run, --validate-only, --apply y --restart-services cuando aplique.
- Informe final, ZIP, checksums, logs de validación y verificación de archivos críticos.

FLUJO ESTRICTO:
1. Lee y clasifica todos los adjuntos/requisitos.
2. Lista los módulos fuente esperados y verifica su presencia antes de editarlos.
3. Si faltan módulos, informa rutas exactas; crea stubs solo si la tarea pide implementación, no solo auditoría.
4. Actualiza deploy, contrato, prompt operativo, Nginx/Lua/PHP, worker/ADB, frontend/M3U8 y reportes manteniendo idempotencia.
5. Ejecuta validaciones locales: bash -n, php -l si PHP está disponible, node --check, JSON parse, presencia de ExecStart en systemd, grep negativo para no falsear HEVC, unzip -t del paquete.
6. Separa validaciones locales de validaciones condicionadas al VPS real: nginx -t, systemctl, PHP-FPM socket, Lua runtime, permisos, HTTPS público y device ADB autorizado.
7. Genera ZIP final con árbol improved/, deploy script, prompt, informe, logs, manifest y checksums.
8. Entrega el ZIP primero, luego informe, checksum del ZIP, checksum por archivo, validation log y critical files log.

CRITERIOS DE ACEPTACIÓN:
- El paquete conserva HEVC-UHD Crystal-first sin romper fallback QoE.
- Los anchors de playlist son metadata honesta.
- El bootstrap ADB falla explícitamente si ADB/device no está autorizado.
- Wake no bloquea Nginx ni la entrega del manifiesto.
- El contrato player ⇄ daemon es versionado y legible.
- El ZIP pasa unzip -t y contiene los archivos críticos.
- El informe final declara límites técnicos y validaciones pendientes del VPS real.

FORMATO DE RESPUESTA FINAL:
Entrega una respuesta breve en español. Adjunta el ZIP final como primer archivo, después el informe Markdown, después checksums y logs. Incluye esta frase: “Los anchors de playlist son metadata; la instalación y el wake reales requieren ruta VPS desplegada y host/dispositivo ADB autorizado o runtime compatible.”
```
