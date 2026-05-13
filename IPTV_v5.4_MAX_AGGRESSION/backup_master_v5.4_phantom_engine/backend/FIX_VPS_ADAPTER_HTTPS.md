# 🔧 Fix: vps-adapter.js usando HTTP en lugar de HTTPS

## ⚠️ Problema Detectado

En los logs veo:
```
vps-adapter.js:38 🚀 [VPS Adapter] Inicializado: {baseUrl: 'http://178.156.147.234', ...}
```

Pero el archivo ya tiene HTTPS configurado. El problema es **caché del navegador** o **localStorage**.

---

## ✅ Solución (2 minutos)

### **Opción 1: Limpiar localStorage y recargar**

**En la consola del navegador (F12), ejecuta:**

```javascript
// 1. Verificar qué hay en localStorage
console.log('VPS URL en localStorage:', localStorage.getItem('vps_base_url'));

// 2. Si es HTTP, cambiarlo a HTTPS
if (localStorage.getItem('vps_base_url')?.startsWith('http://')) {
    localStorage.setItem('vps_base_url', 'https://178.156.147.234');
    console.log('✅ Actualizado a HTTPS');
}

// 3. Limpiar caché y recargar
location.reload(true);
```

---

### **Opción 2: Recarga forzada sin caché**

```
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)
```

Esto fuerza al navegador a descargar los archivos JS actualizados.

---

### **Opción 3: Limpiar todo y empezar de nuevo**

**En la consola (F12):**

```javascript
// Limpiar localStorage relacionado con VPS
localStorage.removeItem('vps_base_url');
localStorage.removeItem('gateway_vps_url');

// Limpiar caché del navegador
// Chrome/Edge: Ctrl+Shift+Delete → Selecciona "Cached images and files" → Limpiar

// Recargar
location.reload(true);
```

---

## 🧪 Verificación

**Después de recargar, en la consola:**

```javascript
// Debe mostrar HTTPS
console.log('VPS Adapter URL:', window.vpsAdapter?.config?.baseUrl);
// Resultado esperado: "https://178.156.147.234"

// También verificar gateway manager
console.log('Gateway Manager URL:', window.gatewayManager?.config?.vps_url);
// Resultado esperado: "https://178.156.147.234"
```

---

## 📋 Estado Actual (de los logs)

✅ **upload-manager-v1.js** → `https://178.156.147.234` ✅  
✅ **vps-monitor-v1.js** → `https://178.156.147.234` ✅  
⚠️ **vps-adapter.js** → `http://178.156.147.234` ❌ (necesita fix)

---

## 🎯 Después del Fix

Una vez que `vps-adapter.js` muestre HTTPS, todo estará listo para probar el upload.

**Próximo paso:** Probar subir un archivo M3U8 desde la aplicación.
