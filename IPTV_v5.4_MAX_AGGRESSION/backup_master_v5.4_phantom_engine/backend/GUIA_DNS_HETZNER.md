# 🌐 Configurar DNS con Hetzner - Guía Paso a Paso

## 📋 Requisitos

1. ✅ Cuenta Hetzner activa
2. ✅ Dominio registrado (puede estar en cualquier registrador)
3. ✅ Acceso a Hetzner Cloud Console

---

## 🎯 OPCIÓN A: DNS Completo en Hetzner (Recomendado)

### Paso 1: Acceder a Hetzner DNS

1. **Abre tu navegador** y ve a: https://console.hetzner.cloud/
2. **Inicia sesión** con tu cuenta Hetzner
3. **En el menú lateral**, busca **"DNS"** (puede estar en "Networking" o directamente)
4. **Haz clic en "DNS"**

---

### Paso 2: Crear Nueva Zona DNS

1. **Haz clic en "Create new zone"** o **"Add zone"**
2. **Configura la zona:**
   ```
   Zone name: tudominio.com
   Type: Authoritative
   ```
3. **Haz clic en "Create"**

---

### Paso 3: Configurar Nameservers en tu Registrador

**IMPORTANTE:** Hetzner te dará nameservers personalizados. Debes configurarlos en tu registrador de dominio.

**Después de crear la zona, Hetzner mostrará algo como:**
```
ns1.hetzner.com
ns2.hetzner.com
ns3.hetzner.com
```

**Ve a tu registrador (Godaddy, Namecheap, etc.) y:**
1. Busca **"DNS Settings"** o **"Nameservers"**
2. Cambia de "Default" a **"Custom Nameservers"**
3. Ingresa los 3 nameservers de Hetzner
4. **Guarda los cambios**

**Espera 15-30 minutos** para que se propague.

---

### Paso 4: Crear Registro A para Gateway

**En Hetzner DNS Console:**

1. **Haz clic en tu zona** (`tudominio.com`)
2. **Haz clic en "Add record"** o **"Create record"**
3. **Configura el registro:**
   ```
   Type: A
   Name: gateway
   Value: 178.156.147.234
   TTL: 3600 (o automático)
   ```
4. **Haz clic en "Save"** o **"Create"**

**Resultado:** `gateway.tudominio.com` → `178.156.147.234`

---

## 🎯 OPCIÓN B: DNS Parcial (Solo Subdominio)

Si prefieres mantener tu DNS principal en tu registrador y solo delegar el subdominio:

### Paso 1: Crear Zona para Subdominio

**En Hetzner DNS:**

1. **Create new zone**
2. **Zone name:** `gateway.tudominio.com`
3. **Type:** Authoritative
4. **Create**

### Paso 2: Crear Registro A

1. **En la zona `gateway.tudominio.com`**
2. **Add record:**
   ```
   Type: A
   Name: @ (o dejar vacío)
   Value: 178.156.147.234
   TTL: 3600
   ```

### Paso 3: Configurar NS en Registrador Principal

**En tu registrador (donde está `tudominio.com`):**

1. **Add record:**
   ```
   Type: NS
   Name: gateway
   Value: ns1.hetzner.com
   TTL: 3600
   ```
2. **Repite para:** `ns2.hetzner.com` y `ns3.hetzner.com`

---

## 🧪 Verificación DNS

### Test 1: Verificar Propagación

```bash
# En tu PC (PowerShell o CMD)
nslookup gateway.tudominio.com
```

**Debe mostrar:**
```
Name:    gateway.tudominio.com
Address: 178.156.147.234
```

### Test 2: Verificar con Dig

```bash
# Si tienes dig instalado
dig +short gateway.tudominio.com @8.8.8.8
```

**Debe mostrar:** `178.156.147.234`

### Test 3: Verificar desde el Servidor

```bash
ssh root@178.156.147.234 "dig +short gateway.tudominio.com @8.8.8.8"
```

---

## ⏱️ Tiempos de Propagación

| Cambio | Tiempo Estimado |
|--------|-----------------|
| Crear zona DNS | Inmediato |
| Cambiar nameservers | 15-30 minutos |
| Crear registro A | 1-5 minutos |
| Propagación global | 5-30 minutos |

---

## 🚨 Troubleshooting

### Error: "Zone already exists"

**Solución:** La zona ya existe. Simplemente edítala y agrega el registro A.

### Error: "Nameservers not updated"

**Solución:**
1. Verifica que ingresaste los 3 nameservers correctos
2. Espera 30 minutos más
3. Verifica con: `nslookup -type=NS tudominio.com`

### Error: "DNS not resolving"

**Solución:**
1. Verifica que el registro A existe en Hetzner
2. Verifica que el nombre es correcto (`gateway`, no `gateway.tudominio.com`)
3. Espera 10 minutos más
4. Prueba con diferentes DNS: `8.8.8.8`, `1.1.1.1`

---

## 📋 Checklist

- [ ] Zona DNS creada en Hetzner
- [ ] Nameservers configurados en registrador
- [ ] Registro A creado: `gateway` → `178.156.147.234`
- [ ] DNS propagado (verificado con `nslookup`)
- [ ] Listo para configurar HTTPS

---

## 🎯 Próximo Paso

Una vez que DNS esté funcionando:

```powershell
# Ejecutar setup HTTPS
.\DEPLOY_HTTPS_COMPLETE.ps1 -Domain "gateway.tudominio.com" -Email "tu@email.com"
```

---

**¡DNS configurado!** 🎉
