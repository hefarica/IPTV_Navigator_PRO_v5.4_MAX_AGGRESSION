/**
 * CloudflareR2Adapter.js
 * 
 * V4.19.3: Integración con Cloudflare R2 vía Worker Proxy.
 * Permite la subida automatizada de listas M3U8 generadas.
 */

window.CloudflareR2Adapter = {
    /**
     * Sube un archivo a Cloudflare R2 a través del Worker Proxy.
     * @param {string|Blob} content - Contenido del archivo.
     * @param {string} filename - Nombre del archivo en R2.
     * @param {object} config - Configuración { workerUrl, secretKey }.
     * @returns {Promise<object>} Respuesta del servidor.
     */
    async upload(content, filename, config) {
        if (!config.workerUrl) {
            throw new Error('Cloudflare Worker URL no configurada.');
        }

        console.log(`[R2 Adapter] Subiendo ${filename} a ${config.workerUrl}...`);

        try {
            const response = await fetch(config.workerUrl, {
                method: 'PUT',
                headers: {
                    'X-R2-Secret': config.secretKey || '',
                    'X-R2-Filename': filename,
                    'Content-Type': 'application/x-mpegurl'
                },
                body: content
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error R2 (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            console.log('[R2 Adapter] Subida exitosa:', result);
            return result;
        } catch (error) {
            console.error('[R2 Adapter] Error en subida:', error);
            throw error;
        }
    },

    /**
     * Guarda la configuración en localStorage.
     */
    saveConfig(config) {
        localStorage.setItem('ape_r2_config', JSON.stringify(config));
    },

    /**
     * Carga la configuración desde localStorage.
     */
    loadConfig() {
        const saved = localStorage.getItem('ape_r2_config');
        return saved ? JSON.parse(saved) : { workerUrl: '', secretKey: '', autoUpload: false };
    }
};
