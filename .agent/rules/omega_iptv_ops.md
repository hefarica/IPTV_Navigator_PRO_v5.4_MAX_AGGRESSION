# OMEGA IPTV OPS - Reglas Operativas Obligatorias

Estas reglas deben ser cumplidas de manera estricta durante todas las intervenciones de soporte, mantenimiento y generación de código dentro del ecosistema OMEGA IPTV v5.2.

1. **Auditoría Post-Generación Obligatoria**: Toda lista generada (sea por GUI NodeJS o scripts Python) DEBE ser validada estructuralmente buscando las firmas `EXT-X-APE` (Profile, Codec, TargetDuration, Fallback). Nunca entregar una lista a producción sin la validación estructural v10.4.
2. **Protección Criptográfica Permanente**: Bajo ninguna circunstancia se pueden dejar URLs directas al dominio de origen expuestas en plano dentro del `#EXT-X-APE-FALLBACK-DIRECT`. Debe usarse el esquema `&url=...` codificado, o el HMAC-SHA256 si está en modo proxy extremo.
3. **Manejo de Errores de Conectividad / Cliente ("Cannot Resolve")**:
    *   Si el reproductor arroja error de resolución ("cannot resolve"), **la regla de oro** dicta que NUNCA se asume fallo del servidor SSOT / VPS a menos que `curl` directo reporte caída. Siempre diagnosticar primero bloqueo ISP, envenenamiento de caché DNS local o caída del dominio DDNS (DuckDNS).
4. **Mantenimiento SSOT**: El dominio asociado en DuckDNS (o equivalente) debe forzar inspección IP cada vez que se detecte una anomalía.
5. **Autorecuperación del Agente**: Ante los triggers "audita esta lista", "proteger FALLBACK-DIRECT", "el canal no reproduce" o "configurar DuckDNS", el agente DEBE ejecutar automáticamente los scripts provistos en la Skill `omega-iptv-ops`.
