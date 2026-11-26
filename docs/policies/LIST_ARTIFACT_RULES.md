# REGLAS DE ARTEFACTOS DE LISTA — VINCULANTES

> **Origen:** decisión explícita del propietario, 2026-11-22.
> Estas dos reglas no se reinterpretan, no se reabren en un informe y no admiten "pero técnicamente".
> Un agente que las proponga está equivocado por definición.

---

## R1 · EL CATÁLOGO NO SE ADELGAZA. NUNCA.

**Prohibido proponer, escribir o ejecutar cualquier forma de adelgazamiento, recorte, "artefacto
delgado", "versión ligera", "lista útil", "sin metadata" o sustitución del catálogo servido por otro
más pequeño.**

El catálogo de la lista (`APE_LISTA_*.m3u8`, ~734 MB, ~1 044 líneas por canal) **es el producto**, no
un exceso. Es el único canal con **100 % de alcance al player**: el manifest por canal solo alcanza
~81 % porque ~18 % de los canales responden **302** a un destino sin `.m3u8` y se saltan el
`body_filter` (skill `ape-url2-metadata-cartridge-arrays`). Sus líneas por canal son la **cartridge
bus** y la ley `iptv-omega-no-delete` prohíbe recortarlas: son funcionales.

**Consecuencias operativas:**

- No se re-apunta el menú a otro artefacto.
- No se "aprovecha" el límite de V8 (`MAX_STRING_LENGTH`) para justificar un recorte: si un player
  concreto no puede cargar el catálogo, es una **limitación de ese player** y se reporta como tal.
- Un informe que mida el peso del catálogo describe un **hecho**; si además recomienda recortarlo,
  la recomendación es nula y debe retirarse del artefacto.

**Precedente:** `artifacts/verify/playlist_gigante.md` §6 fue retirado por esta regla (commit
`cb3f2726`). Se conserva el censo; se anula la recomendación.

---

## R2 · UN PLACEHOLDER ES `.m3u8` (o `.m3u`). NUNCA `.gz`.

**Prohibido proponer, generar o servir un placeholder comprimido.** Un fichero placeholder de lista
se nombra y se entrega con extensión de lista:

```
CORRECTO    APE_LISTA_<id>_CDN_PLACEHOLDER.m3u8
CORRECTO    APE_LISTA_<id>_CDN_PLACEHOLDER.m3u
PROHIBIDO   APE_LISTA_<id>_CDN_PLACEHOLDER.m3u8.gz
PROHIBIDO   APE_LISTA_<id>_CDN_PLACEHOLDER.gz
```

Motivo: el consumidor es un reproductor o un humano que pega una URL. Una extensión comprimida no es
una lista: no se abre, no se pega en un player, y obliga a un paso extra que rompe el flujo
"copiar URL y pegar". El `.gz` puede existir como **hermano de transporte** de una lista servida
(`gzip_static`), pero **jamás como el artefacto placeholder en sí**.

**Consecuencias operativas:**

- Ningún script del repo debe emitir `*PLACEHOLDER*.gz`.
- Si se encuentra un `.gz` con nombre de placeholder, es un **defecto**: se materializa el `.m3u8`
  y se retira el `.gz` (retirar el `.gz` no borra contenido: el `.m3u8` es el original).
- El placeholder debe servirse con `Content-Type: application/vnd.apple.mpegurl` o `audio/x-mpegurl`.

---

## Cómo se comprueba (comandos reproducibles)

```bash
# R2 · ningún placeholder comprimido en el directorio servido
ssh <vps> "ls /var/www/lists/pulse/ | grep -i placeholder | grep -E '\.gz$' || echo 'OK: 0 placeholders .gz'"

# R2 · el placeholder se sirve como lista, sin comprimir
curl -sI https://iptv-ape.duckdns.org/lists/<PLACEHOLDER>.m3u8 \
  | egrep -i 'HTTP/|content-type|content-length|content-encoding'

# R1 · el catálogo sigue siendo el catálogo (no se sustituyó por uno menor)
ssh <vps> "stat -c '%s %n' /var/www/lists/pulse/APE_LISTA_*.m3u8 | sort -rn | head"
```

---

## Lo que NO dice esta política

- No prohíbe medir el peso, la estructura ni el vocabulario del catálogo. Medir es obligatorio.
- No prohíbe que existan **otros** artefactos para otros fines (una lista de entrada para un
  inyector, un índice de búsqueda). Prohíbe **sustituir** el catálogo por ellos y prohíbe que un
  placeholder se entregue comprimido.
- No autoriza borrar nada sin evidencia de que es un duplicado exacto y sin rollback.
