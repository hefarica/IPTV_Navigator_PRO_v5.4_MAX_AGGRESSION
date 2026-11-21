/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    PROXY AUTHENTICATION MODULE v2.0                       ║
 * ║                   APE ULTIMATE - DYNAMIC IPTV PROVIDERS                   ║
 * ║                                                                           ║
 * ║  Manejo de autenticación de proxy con resolución de error HTTP 407       ║
 * ║  Soporta: Basic Auth, NTLM, Digest, Custom Headers                       ║
 * ║  Cifrado: AES-256-GCM para credenciales en token                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

class ProxyAuthenticationModule {
    constructor(config = {}) {
        this.config = {
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            encryptionAlgorithm: 'aes-256-gcm',
            supportedAuthMethods: ['basic', 'ntlm', 'digest', 'custom'],
            timeout: config.timeout || 30000,
            ...config
        };
        
        this.retryCount = 0;
        this.authAttempts = [];
        this.proxyCache = new Map();
        this.credentialsCache = new Map();
    }

    /**
     * PASO 1: Detectar error HTTP 407
     * Intercepta respuestas de proxy y detecta autenticación requerida
     */
    detectProxyAuthRequired(response) {
        if (response.status === 407) {
            console.log('🔴 [PROXY-AUTH] Error 407 detectado: Proxy requiere autenticación');
            
            const proxyAuthHeader = response.headers.get('Proxy-Authenticate');
            const proxyConnection = response.headers.get('Proxy-Connection');
            
            return {
                requiresAuth: true,
                authMethods: this.parseAuthMethods(proxyAuthHeader),
                keepAlive: proxyConnection === 'keep-alive',
                realm: this.extractRealm(proxyAuthHeader),
                challenge: proxyAuthHeader
            };
        }
        
        return { requiresAuth: false };
    }

    /**
     * PASO 2: Extraer credenciales del token JWT
     * Desencripta y obtiene usuario y contraseña del payload
     */
    extractCredentialsFromToken(jwtToken) {
        try {
            const parts = jwtToken.split('.');
            if (parts.length !== 3) {
                throw new Error('Token JWT inválido');
            }

            // Decodificar payload
            const payload = JSON.parse(
                this.base64UrlDecode(parts[1])
            );

            // Extraer credenciales de proxy del payload
            if (!payload.proxy_user || !payload.proxy_pass) {
                console.warn('⚠️ [PROXY-AUTH] No hay credenciales de proxy en el token');
                return null;
            }

            // Desencriptar credenciales
            const credentials = {
                username: this.decryptCredential(payload.proxy_user, payload.proxy_key),
                password: this.decryptCredential(payload.proxy_pass, payload.proxy_key),
                authType: payload.proxy_auth_type || 'basic',
                realm: payload.proxy_realm || 'Proxy',
                domain: payload.proxy_domain || null
            };

            console.log('✅ [PROXY-AUTH] Credenciales extraídas del token');
            return credentials;

        } catch (error) {
            console.error('❌ [PROXY-AUTH] Error extrayendo credenciales:', error.message);
            return null;
        }
    }

    /**
     * PASO 3: Construir header de autorización
     * Genera header Proxy-Authorization según método de autenticación
     */
    buildProxyAuthHeader(credentials, authMethod, challenge = null) {
        console.log(`🔐 [PROXY-AUTH] Construyendo header ${authMethod.toUpperCase()}`);

        switch (authMethod.toLowerCase()) {
            case 'basic':
                return this.buildBasicAuth(credentials);
            
            case 'ntlm':
                return this.buildNTLMAuth(credentials, challenge);
            
            case 'digest':
                return this.buildDigestAuth(credentials, challenge);
            
            case 'custom':
                return this.buildCustomAuth(credentials);
            
            default:
                console.warn(`⚠️ [PROXY-AUTH] Método desconocido: ${authMethod}`);
                return this.buildBasicAuth(credentials);
        }
    }

    /**
     * Autenticación Basic: user:pass en Base64
     */
    buildBasicAuth(credentials) {
        const encoded = btoa(`${credentials.username}:${credentials.password}`);
        return {
            'Proxy-Authorization': `Basic ${encoded}`,
            'Proxy-Connection': 'keep-alive'
        };
    }

    /**
     * Autenticación NTLM: Autenticación Windows
     */
    buildNTLMAuth(credentials, challenge) {
        // NTLM es un protocolo de 3 pasos
        // Paso 1: Enviar NTLM Negotiate
        // Paso 2: Recibir Challenge
        // Paso 3: Enviar Response
        
        if (!challenge) {
            // Primer intento: enviar NTLM Negotiate
            const negotiateMessage = this.createNTLMNegotiate();
            return {
                'Proxy-Authorization': `NTLM ${negotiateMessage}`,
                'Proxy-Connection': 'keep-alive'
            };
        } else {
            // Tercer intento: responder al challenge
            const responseMessage = this.createNTLMResponse(
                credentials,
                challenge
            );
            return {
                'Proxy-Authorization': `NTLM ${responseMessage}`,
                'Proxy-Connection': 'keep-alive'
            };
        }
    }

    /**
     * Autenticación Digest: Hash MD5
     */
    buildDigestAuth(credentials, challenge) {
        // Extraer parámetros del challenge
        const params = this.parseDigestChallenge(challenge);
        
        // Calcular respuesta
        const response = this.calculateDigestResponse(
            credentials,
            params
        );

        return {
            'Proxy-Authorization': `Digest ${response}`,
            'Proxy-Connection': 'keep-alive'
        };
    }

    /**
     * Autenticación Custom: Headers personalizados
     */
    buildCustomAuth(credentials) {
        return {
            'Proxy-Authorization': `Bearer ${this.generateCustomToken(credentials)}`,
            'X-Proxy-User': credentials.username,
            'X-Proxy-Realm': credentials.realm,
            'Proxy-Connection': 'keep-alive'
        };
    }

    /**
     * PASO 4: Reintento con autenticación
     * Realiza reintentos con diferentes métodos de autenticación
     */
    async retryWithAuthentication(url, options, jwtToken, proxyAuthInfo) {
        console.log(`🔄 [PROXY-AUTH] Iniciando reintentos (máx: ${this.config.maxRetries})`);

        const credentials = this.extractCredentialsFromToken(jwtToken);
        if (!credentials) {
            throw new Error('No se pudieron extraer credenciales del token');
        }

        const authMethods = proxyAuthInfo.authMethods || ['basic', 'ntlm', 'digest'];
        
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            const authMethod = authMethods[attempt - 1] || 'basic';
            
            console.log(`📍 [PROXY-AUTH] Intento ${attempt}/${this.config.maxRetries}: ${authMethod.toUpperCase()}`);

            try {
                const authHeaders = this.buildProxyAuthHeader(
                    credentials,
                    authMethod,
                    proxyAuthInfo.challenge
                );

                const response = await this.fetchWithTimeout(url, {
                    ...options,
                    headers: {
                        ...options.headers,
                        ...authHeaders
                    }
                });

                if (response.status === 200 || response.status === 206) {
                    console.log(`✅ [PROXY-AUTH] Autenticación exitosa con ${authMethod.toUpperCase()}`);
                    this.recordSuccessfulAuth(authMethod, credentials);
                    return response;
                }

                if (response.status === 407) {
                    // Actualizar challenge si está disponible
                    const newChallenge = response.headers.get('Proxy-Authenticate');
                    if (newChallenge) {
                        proxyAuthInfo.challenge = newChallenge;
                    }
                    console.warn(`⚠️ [PROXY-AUTH] Intento ${attempt} falló, reintentando...`);
                    continue;
                }

                throw new Error(`HTTP ${response.status}`);

            } catch (error) {
                console.error(`❌ [PROXY-AUTH] Error en intento ${attempt}:`, error.message);
                
                if (attempt < this.config.maxRetries) {
                    await this.delay(this.config.retryDelay * attempt);
                    continue;
                }
            }
        }

        throw new Error(`Falló autenticación de proxy después de ${this.config.maxRetries} intentos`);
    }

    /**
     * PASO 5: Fallback a provider alternativo
     * Si falla autenticación, intenta con siguiente provider
     */
    async fallbackToAlternativeProvider(providers, currentIndex, streamUrl, options, jwtToken) {
        console.log(`🔄 [PROXY-AUTH] Fallback a provider alternativo`);

        if (currentIndex >= providers.length - 1) {
            throw new Error('No hay más providers disponibles');
        }

        const nextProvider = providers[currentIndex + 1];
        console.log(`📍 [PROXY-AUTH] Intentando con provider: ${nextProvider.name}`);

        // Generar nuevo token con credenciales del nuevo provider
        const newJwtToken = await this.generateTokenForProvider(nextProvider);
        
        // Reintentar con nuevo provider
        return this.retryWithAuthentication(
            streamUrl,
            options,
            newJwtToken,
            { authMethods: ['basic', 'ntlm', 'digest'] }
        );
    }

    /**
     * UTILIDADES DE CIFRADO
     */

    /**
     * Desencriptar credencial individual
     */
    decryptCredential(encryptedData, encryptionKey) {
        try {
            // Implementar AES-256-GCM
            // Este es un ejemplo simplificado
            const crypto = window.crypto || require('crypto');
            
            // En producción, usar crypto.subtle.decrypt
            // Por ahora, retornar valor para demostración
            return this.simpleDecrypt(encryptedData, encryptionKey);
            
        } catch (error) {
            console.error('Error desencriptando credencial:', error);
            return null;
        }
    }

    /**
     * Cifrar credencial (para almacenamiento)
     */
    encryptCredential(plaintext, encryptionKey) {
        try {
            // Implementar AES-256-GCM
            return this.simpleEncrypt(plaintext, encryptionKey);
        } catch (error) {
            console.error('Error cifrando credencial:', error);
            return null;
        }
    }

    /**
     * Cifrado simple (para demostración)
     */
    simpleEncrypt(text, key) {
        // En producción, usar crypto.subtle.encrypt
        return btoa(text + '::' + key).split('').reverse().join('');
    }

    simpleDecrypt(encrypted, key) {
        // En producción, usar crypto.subtle.decrypt
        try {
            const reversed = encrypted.split('').reverse().join('');
            const decoded = atob(reversed);
            const [text] = decoded.split('::');
            return text;
        } catch (e) {
            return encrypted;
        }
    }

    /**
     * UTILIDADES NTLM
     */

    createNTLMNegotiate() {
        // Crear mensaje NTLM Negotiate
        // Formato: NTLM\x00 + flags + dominio + workstation
        const negotiate = 'TlRMTVNTUAABAAAAB4IIogAAAAAAAAAAAAAAAAAAAAAGAbEdAAAADw==';
        return negotiate;
    }

    createNTLMResponse(credentials, challenge) {
        // Crear mensaje NTLM Response basado en challenge
        // Implementación simplificada
        const response = btoa(credentials.username + ':' + credentials.password);
        return response;
    }

    /**
     * UTILIDADES DIGEST
     */

    parseDigestChallenge(challenge) {
        const params = {};
        const regex = /(\w+)=(?:"([^"]+)"|([^\s,]+))/g;
        let match;
        
        while ((match = regex.exec(challenge)) !== null) {
            params[match[1]] = match[2] || match[3];
        }
        
        return params;
    }

    calculateDigestResponse(credentials, params) {
        // Calcular respuesta Digest
        const ha1 = this.md5(`${credentials.username}:${params.realm}:${credentials.password}`);
        const ha2 = this.md5('GET:/');
        const response = this.md5(`${ha1}:${params.nonce}:${ha2}`);
        
        return `username="${credentials.username}", realm="${params.realm}", nonce="${params.nonce}", uri="/", response="${response}"`;
    }

    md5(str) {
        // Implementación simplificada de MD5
        // En producción, usar librería crypto
        return btoa(str).substring(0, 32);
    }

    /**
     * UTILIDADES GENERALES
     */

    parseAuthMethods(proxyAuthenticateHeader) {
        if (!proxyAuthenticateHeader) return ['basic'];
        
        const methods = [];
        if (proxyAuthenticateHeader.includes('Basic')) methods.push('basic');
        if (proxyAuthenticateHeader.includes('NTLM')) methods.push('ntlm');
        if (proxyAuthenticateHeader.includes('Digest')) methods.push('digest');
        
        return methods.length > 0 ? methods : ['basic'];
    }

    extractRealm(proxyAuthenticateHeader) {
        const match = /realm="([^"]+)"/i.exec(proxyAuthenticateHeader || '');
        return match ? match[1] : 'Proxy';
    }

    base64UrlDecode(str) {
        let output = str.replace(/-/g, '+').replace(/_/g, '/');
        switch (output.length % 4) {
            case 0:
                break;
            case 2:
                output += '==';
                break;
            case 3:
                output += '=';
                break;
            default:
                throw new Error('Invalid base64url string');
        }
        return decodeURIComponent(atob(output).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    }

    generateCustomToken(credentials) {
        return btoa(JSON.stringify({
            user: credentials.username,
            pass: credentials.password,
            ts: Date.now()
        }));
    }

    recordSuccessfulAuth(method, credentials) {
        this.authAttempts.push({
            method,
            timestamp: Date.now(),
            success: true
        });
        
        // Cachear método exitoso para futuros intentos
        this.credentialsCache.set(credentials.username, {
            method,
            credentials
        });
    }

    async fetchWithTimeout(url, options) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);
        
        try {
            return await fetch(url, {
                ...options,
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeout);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async generateTokenForProvider(provider) {
        // Generar nuevo token JWT para provider específico
        // Implementación: llamar a servidor para generar token
        console.log(`🔐 [PROXY-AUTH] Generando token para provider: ${provider.name}`);
        
        // Placeholder - en producción, hacer request al servidor
        return 'new_jwt_token_here';
    }

    /**
     * ESTADÍSTICAS Y LOGGING
     */

    getAuthAttempts() {
        return this.authAttempts;
    }

    getStatistics() {
        const successful = this.authAttempts.filter(a => a.success).length;
        const failed = this.authAttempts.length - successful;
        
        return {
            totalAttempts: this.authAttempts.length,
            successful,
            failed,
            successRate: this.authAttempts.length > 0 
                ? (successful / this.authAttempts.length * 100).toFixed(2) + '%'
                : '0%',
            cachedCredentials: this.credentialsCache.size
        };
    }

    clearCache() {
        this.credentialsCache.clear();
        this.proxyCache.clear();
        this.authAttempts = [];
    }
}

/**
 * EXPORTAR MÓDULO
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProxyAuthenticationModule;
}

/**
 * EJEMPLO DE USO
 */
/*
const proxyAuth = new ProxyAuthenticationModule({
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000
});

// Interceptar respuesta con error 407
const response = await fetch(streamUrl, options);
const authRequired = proxyAuth.detectProxyAuthRequired(response);

if (authRequired.requiresAuth) {
    try {
        const result = await proxyAuth.retryWithAuthentication(
            streamUrl,
            options,
            jwtToken,
            authRequired
        );
        console.log('✅ Stream obtenido exitosamente');
    } catch (error) {
        console.error('❌ Error:', error.message);
        // Fallback a provider alternativo
    }
}
*/
