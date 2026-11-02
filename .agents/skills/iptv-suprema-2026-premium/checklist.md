# Checklist — IPTV PREMIUM

## Antes

- [ ] Leer `profiles/IPTV_PREMIUM.json`.
- [ ] Identificar target y modo.
- [ ] Registrar ruta/hash/fecha de la evidencia.
- [ ] Confirmar que no se tocarán VPS/LAB/listas.

## Durante

- [ ] Separar los cuatro ámbitos.
- [ ] Marcar cada afirmación como `declared/observed/resolved/applied/verified`.
- [ ] No convertir `STREAM-INF` en prueba de bitstream.
- [ ] No convertir tags CMAF en CMAF real.
- [ ] No convertir audio declarado en audio medido.
- [ ] No sondear 10k URLs sin rate-limit.
- [ ] Redactar credenciales.

## Después

- [ ] Validar JSON del perfil.
- [ ] Verificar que el reporte incluye límites.
- [ ] Verificar que no hay juicio de calidad no solicitado.
- [ ] Guardar reporte en `.agents/reports/`.

## Rollback

- [ ] No se modifica producción.
- [ ] Si se creó un reporte, se puede eliminar sin afectar la lista.


