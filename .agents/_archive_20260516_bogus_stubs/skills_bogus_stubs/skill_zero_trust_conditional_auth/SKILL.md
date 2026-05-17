---
description: Zero Trust Architecture - Autenticación Condicional Continua (Zero Trust L7)
---
# Autenticación Condicional Continua (Zero Trust L7)

## 1. Definición Operativa
Eliminar por completo el concepto de "Perímetro Seguro". El hecho de que un usuario posea una credencial válida y esté dentro de la VPN no implica confianza. Esta habilidad evalúa microscópicamente CADA solicitud (Request HTTP/RPC) basándose en contexto comportamental y criptográfico, bloqueando movimientos anómalos o exfiltraciones incluso si el token está activo.

## 2. Capacidades Específicas
- **Micro-Segmentación Perimetral**: Anular todo acceso de red L4/L7 de manera predeterminada (`default-deny`). Un microservicio A no puede hablar con el B a menos que una política criptográfica mutual (mTLS) lo avale explícitamente y justifique la ruta.
- **Inspección de Tráfico Asimétrica (Machine Identification)**: Perfilar criptográficamente (Fingerprinting de red, TCP Window sizes) al emisor para validar si es un reproductor genuino o un Bot disfrazado con la cuenta del usuario.
- **Autorización Context-Aware**: Rebocar permisos en milisegundos si la geolocalización o el comportamiento de un usuario muta drásticamente sin desloguearlo directamente (Degradación de acceso).
- **Gestión Estricta M2M (Machine to Machine Auth)**: Implantar rotación ininterrumpida de tokens STS (Security Token Service) para que los propios servidores backend no mantengan contraseñas legíbles en su memoria viva.

## 3. Herramientas y Tecnologías
**Istio Service Mesh, mTLS (Mutual TLS), SPIFFE/SPIRE, Cloudflare Access, Nginx Lua Security Context.**

## 4. Métrica de Dominio
**Tasa de Incursión Zero por Credencial Robada**. Se evalúa inyectando en la red un binario malicioso que roba un Token Maestro válido. La métrica se aprueba si la red anula las peticiones del binario infractor en **<25ms** basándose en su desvío de comportamiento o malformación de huellas TCP L4/L7, independientemente de que la contraseña fuera 100% correcta.

## 5. Ejemplo Real Aplicado
**IPTV OMEGA Guardian Engine**: Si un atacante roba el Payload Xtream y hace `GET /resolve.php` desde su computadora (distinta IP, distinto ISP, distinto User-Agent), la arquitectura bloquea el Payload con HTTP 403, asumiendo "Zero Trust", forzando al usuario a solo poder disfrutar su contenido si se encuentra usando el Frontend oficial verificado criptográficamente por la nube.
