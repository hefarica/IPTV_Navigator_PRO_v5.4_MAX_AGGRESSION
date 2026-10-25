# Persistencia de la DNA del LAB (sobrevive refresh y hard refresh)

> Implementado **2026-10-24** en `frontend/js/ape-lab-import-helper.js` v2.0.

## 1. Causa raíz del fallo

`APE_PROFILES_CONFIG.importFromLABData()` escribe `ape_lab_metadata` —de donde se lee
`labExportedAt`— **al final** de una cadena larga de `localStorage.setItem`
(`profiles`, `manifest`, `strategicHeaders`, `ape_lab_nivel1…servers`, `ape_lab_metadata`,
`ape_lab_bulletproof_meta`, `ape_lab_prisma_sync`).

Si el origen agota la cuota (~5 MB) a mitad de la cadena:

- en memoria el LAB queda cargado → **la sesión actual genera bien** (tu lista de 1.118 GB lo prueba:
  su cabecera lleva `#EXT-X-APE-LAB-VERSION:omega_v1` y `#EXT-X-APE-LAB-EXPORTED-AT:2026-05-23T05:39:38`);
- `ape_lab_metadata` no se llega a escribir → tras recargar, `labExportedAt` vuelve vacío →
  el generador aborta con *"LAB JSON no importado"*.

Ese es exactamente el síntoma que viste.

## 2. Solución: 3 capas, en orden de coste

| Capa | Dónde | Tamaño | Para qué |
|---|---|---|---|
| **1. Llave mínima** | `localStorage['ape_lab_gate_v1']` | ~150 B | Cabe **siempre**, incluso con la cuota llena. Guarda `exported_at`, `lab_version`, `lab_schema_variant`, `bulletproof`, `labFileName` → el gate se satisface al instante |
| **2. DNA completa** | IndexedDB `APELabDNA / dna / current` | ~280 KB | Sin cuota de 5 MB. Permite **reimportar** todo (incluidos `profiles`) aunque localStorage se haya quedado corto |
| **3. Fichero local** | `frontend/lab_master_22.6.0.json` | 280 KB | Último recurso, mismo origen, sin CORS, sin exponer credenciales |

En el arranque, `bootEnsure()` hace en este orden: gate abierto → refresca snapshot ·
else llave mínima → `else` IDB → `else` fichero local.

Y **cualquier** importación exitosa guarda el snapshot: se parchea
`APE_PROFILES_CONFIG.importFromLABData` (marcado `__apeLabPatched`), así que también
persiste cuando importas con el **selector de archivos nativo** del Profile Manager.

## 3. API de operación

```js
apeLabStatus()                 // { ok, labExportedAt, profiles, nivel1… }
await apeLabSnapshotRestore()   // fuerza restauración desde IndexedDB
await apeLabSnapshotSave()      // fuerza guardado (requiere DNA en memoria)
auditLabPersist()               // cuánto ocupa localStorage, si hay snapshot, etc.
await apeLabForget()            // borra snapshot (para probar de cero)
localStorage.ape_lab_auto='0'   // desactiva el auto-arranque
```

## 4. Cómo verificar la garantía (2 minutos)

```js
auditLabPersist()      // debe mostrar localStorage.gateKey con exported_at y idb.saved:true
```
1. **`Ctrl+Shift+R`** (actualización forzada).
2. En consola, **sin tocar nada más**: `apeLabStatus()` → debe responder `ok: true` con
   `labExportedAt: "2026-05-23T05:39:38"` y `profiles: ['P0'…'P5']`.
3. Si quieres ver que no depende del fichero: borra temporalmente `lab_master_22.6.0.json`
   y repite — debe restaurar desde IndexedDB.

> Nota: ni `F5` ni `Ctrl+Shift+R` borran `localStorage`/IndexedDB (solo "borrar datos del
> sitio" lo haría). Con estas 3 capas, incluso en ese caso basta volver a importar una vez.

## 5. Seguridad

La DNA contiene **4 servidores con usuario y contraseña** → `lab_master_22.6.0.json` está en
`.gitignore` y **no** se publica en internet (nada de endpoints públicos con ACAO). Vive solo
en el servidor local y en el almacenamiento del navegador del propietario.
