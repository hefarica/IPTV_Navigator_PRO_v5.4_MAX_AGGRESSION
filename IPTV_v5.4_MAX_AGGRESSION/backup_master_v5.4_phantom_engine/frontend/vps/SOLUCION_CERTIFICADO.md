# 🔒 Solución: ERR_CERT_AUTHORITY_INVALID

## ⚠️ Problema Detectado

El navegador está bloqueando HTTPS porque el certificado auto-firmado no ha sido aceptado.

**Error:** `net::ERR_CERT_AUTHORITY_INVALID`

---

## ✅ Solución (2 minutos)

### **Paso 1: Abrir la URL directamente en el navegador**

**NO uses la consola todavía.** Primero debes aceptar el certificado:

1. **Abre una pestaña nueva** en tu navegador
2. **Escribe en la barra de direcciones:**
   ```
   https://178.156.147.234/health
   ```
3. **Presiona Enter**

---

### **Paso 2: Aceptar el certificado**

**Chrome/Edge:**
- Verás una pantalla roja con: **"Tu conexión no es privada"**
- Haz clic en **"Avanzado"** o **"Advanced"** (abajo de la página)
- Haz clic en **"Continuar a 178.156.147.234 (no seguro)"** o **"Proceed to 178.156.147.234 (unsafe)"**
- ✅ La página cargará y mostrará JSON con el status del servidor

**Firefox:**
- Verás: **"Advertencia: Posible riesgo de seguridad"**
- Haz clic en **"Avanzado"** o **"Advanced"**
- Haz clic en **"Aceptar el riesgo y continuar"** o **"Accept the Risk and Continue"**
- ✅ La página cargará

---

### **Paso 3: Verificar que funciona**

**Después de aceptar el certificado**, vuelve a la consola y ejecuta:

```javascript
fetch('https://178.156.147.234/health')
    .then(r => r.json())
    .then(d => console.log('✅ Health OK:', d))
    .catch(e => console.error('❌', e));
```

**Debe mostrar:** `✅ Health OK: {status: "ok", ...}`

---

### **Paso 4: Probar Upload**

**Ahora sí, ejecuta el test de upload:**

```javascript
fetch('https://178.156.147.234/upload_chunk.php?upload_id=test&chunk=1&total=1', {
    method: 'POST',
    body: 'test',
    headers: {'Content-Type': 'application/octet-stream'},
    mode: 'cors',
    credentials: 'omit'
})
.then(r => r.json())
.then(d => console.log('✅ LISTO:', d))
.catch(e => console.error('❌', e));
```

**Debe mostrar:** `✅ LISTO: {success: true, ...}`

---

## 🎯 Importante

**El certificado se acepta POR NAVEGADOR Y POR SESIÓN:**

- ✅ Si aceptas en Chrome, funciona en Chrome
- ✅ Si aceptas en Edge, funciona en Edge
- ✅ Si aceptas en Firefox, funciona en Firefox
- ⚠️ Si cierras el navegador, puede que necesites aceptarlo de nuevo

---

## 🚨 Si Sigue Fallando

### Opción A: Limpiar caché y cookies del sitio

1. **Chrome/Edge:** `Ctrl+Shift+Delete` → Selecciona "Cookies y datos de sitios" → Limpiar
2. **Firefox:** `Ctrl+Shift+Delete` → Selecciona "Cookies" → Limpiar
3. Vuelve a abrir `https://178.156.147.234/health` y acepta el certificado

### Opción B: Modo Incógnito

1. Abre ventana incógnita (`Ctrl+Shift+N`)
2. Ve a `https://178.156.147.234/health`
3. Acepta el certificado
4. Prueba el fetch en la consola de incógnito

---

## ✅ Checklist

- [ ] Abrí `https://178.156.147.234/health` en el navegador
- [ ] Acepté el certificado (Advanced → Proceed)
- [ ] La página cargó correctamente (mostró JSON)
- [ ] Probé el fetch en consola y funcionó
- [ ] Probé el upload y funcionó

---

**Una vez que completes estos pasos, el error desaparecerá y el upload funcionará.** 🚀
