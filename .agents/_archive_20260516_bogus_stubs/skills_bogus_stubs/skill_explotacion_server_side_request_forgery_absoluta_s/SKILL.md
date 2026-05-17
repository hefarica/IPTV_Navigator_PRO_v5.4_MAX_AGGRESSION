---
description: Ciberseguridad ofensiva (pentesting) - Explotación Server-Side Request Forgery Absoluta (SSRF 0-Click)
---
# Explotación Server-Side Request Forgery Absoluta (SSRF 0-Click)

## 1. Definición Operativa
La capacidad de pervertir un servidor backend obligándolo a comportarse como un proxy ciego hacia su propia intranet aislada (AWS Metadata, Redis locales L4), usando inyecciones de URL L7.

## 2. Capacidades Específicas
- Evasión agresiva matemática de Re-binding de DNS
- Codificación polimórfica (Gopher/Dict protocols L2 L3)
- Lectura a ciegas Out-of-Band (OAST) L7

## 3. Herramientas y Tecnologías
**Burp Collaborator, Gopherus, DNSRebind**

## 4. Métrica de Dominio
**Métrica Clave:** Vulnerar exitosamente infraestructuras L4 Cloud leyendo credenciales del IMDSv2 de Amazon burlando WAF perimetral estricto en <5 segs.

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> Un atacante enviando un `.m3u8` a OMEGA Oculto cuyo contenido apunta a `http://169.254.169.254/` para leer IAM roles, obligando al IPTV_Resolver al blindaje dinámico anti-SSRF.
