# Reglas Absolutas: IPTV OMEGA ABSOLUTO (Full Builder v4)

Estas reglas dictan el comportamiento estricto al reconstruir o dar mantenimiento a la arquitectura IPTV OMEGA Híbrida. El incumplimiento de cualquiera de estas reglas se considera una violación crítica del estándar de calidad.

## 1. Reglas de Oro (Inmutables)
*   **NUNCA optimizar líneas**: Si una directiva parece redundante, asume sistemáticamente que no lo es. El control dictatorial sobre hardware asímétrico requiere redundancia explícita.
*   **Cadena de Degradación Inviolable**: Los 7 niveles de rescate (CMAF → fMP4 → TS → HTTP Redirect, etc.) deben inyectarse siempre en todo código de fallback que se elabore.
*   **Idempotencia Visual Estricta**: El resultado en pantalla debe ser matemáticamente idéntico en cada zapping, incluso si los hashes MD5 y la firma criptográfica de la lista muten para evasión de ISP.

## 2. Las 5 Doctrinas OMEGA (PhD Level)
1.  **Player Enslavement**: Forzado absoluto de decodificación por Hardware y anulación de perfiles adaptativos (ABR) no confiables en el cliente original.
2.  **GPU Rendering Supremo**: Explotar todo el Pipeline GPU (LCEVC Phase 4, HDR10+ a 5000 nits, y AI Super Resolution).
3.  **Evasión de ISP Total**: Utilizar Swarm Phantom Hydra Stealth (escalamiento hasta 2048 conexiones TCP encubiertas).
4.  **Polimorfismo e Idempotencia**: Emplear siempre Hashes Dinámicos (MD5/SHA256) atados a Session IDs constantes para burlar proxies.
5.  **Telchemy TVQM Activo**: Monitoreo hiper-granular y resolución automática de impedimentos de transporte en <60ms.

Cualquier cambio a la infraestructura base (tanto al UI M3U8 Generator local, como al resolver OMEGA PHP en VPS) DEBE respetar esta doctrina.
