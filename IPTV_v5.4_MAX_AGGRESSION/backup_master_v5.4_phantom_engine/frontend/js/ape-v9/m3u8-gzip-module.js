/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║        📦 M3U8 GZIP COMPRESSION MODULE v2.0                             ║
 * ║        Comprime listas M3U8 usando browser CompressionStream API        ║
 * ║        Compatible: OTT Navigator, TiviMate, VLC, Kodi, Perfect Player  ║
 * ║                                                                         ║
 * ║  300 MB M3U8 → ~90 MB .m3u8.gz (~70% reducción)                        ║
 * ║                                                                         ║
 * ║  ESTRATEGIA: Intercepta document.createElement('a') para capturar      ║
 * ║  CUALQUIER descarga de .m3u8, sin importar qué generador la produce.   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
(function () {
    'use strict';

    const VERSION = '2.0.0';
    const GZIP_SUPPORTED = typeof CompressionStream !== 'undefined';

    if (!GZIP_SUPPORTED) {
        console.warn('📦 [GZIP] CompressionStream API no disponible en este navegador');
        console.warn('   Requiere: Chrome 80+, Edge 80+, Firefox 113+, Safari 16.4+');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔍 CHECKBOX STATE
    // ═══════════════════════════════════════════════════════════════════════════

    function isGzipEnabled() {
        const checkbox = document.getElementById('gzipCompressionEnabled');
        return checkbox && checkbox.checked;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 📦 CORE: Comprimir Blob a GZIP
    // ═══════════════════════════════════════════════════════════════════════════

    async function compressBlobToGzip(blob) {
        if (!GZIP_SUPPORTED) {
            throw new Error('CompressionStream API no disponible');
        }

        const startTime = performance.now();
        const originalSize = blob.size;

        // Blob → ReadableStream → CompressionStream('gzip') → Blob
        const compressedStream = blob.stream().pipeThrough(new CompressionStream('gzip'));
        const compressedResponse = new Response(compressedStream);
        const compressedBlob = await compressedResponse.blob();

        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        const ratio = ((1 - compressedBlob.size / originalSize) * 100).toFixed(1);

        console.log(`📦 [GZIP] Compresión completada en ${elapsed}s`);
        console.log(`   📊 Original: ${(originalSize / 1024 / 1024).toFixed(1)} MB → Comprimido: ${(compressedBlob.size / 1024 / 1024).toFixed(1)} MB (${ratio}% reducción)`);

        return compressedBlob;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔌 INTERCEPTOR: Hook en HTMLAnchorElement.click()
    // Captura CUALQUIER descarga de .m3u8, de CUALQUIER generador.
    // Si GZIP está ON: comprime el blob antes de descargar.
    // ═══════════════════════════════════════════════════════════════════════════

    const originalClick = HTMLAnchorElement.prototype.click;

    HTMLAnchorElement.prototype.click = function () {
        // Solo interceptar si:
        // 1. GZIP checkbox está ON
        // 2. Es un download link
        // 3. El archivo es .m3u8
        // 4. Tiene un blob: URL
        if (
            isGzipEnabled() &&
            GZIP_SUPPORTED &&
            this.download &&
            this.download.endsWith('.m3u8') &&
            this.href &&
            this.href.startsWith('blob:')
        ) {
            // Evitar re-entrada
            if (this._gzipProcessing) {
                return originalClick.call(this);
            }
            this._gzipProcessing = true;

            const anchor = this;
            const originalHref = this.href;
            const originalFilename = this.download;

            console.log(`📦 [GZIP] Interceptando descarga: ${originalFilename}`);

            // Fetch el blob original desde la URL
            fetch(originalHref)
                .then(r => r.blob())
                .then(originalBlob => compressBlobToGzip(originalBlob))
                .then(compressedBlob => {
                    // Crear nueva URL con el blob comprimido
                    const gzipUrl = URL.createObjectURL(compressedBlob);
                    const gzipFilename = originalFilename + '.gz';

                    // Reemplazar y hacer click real
                    anchor.href = gzipUrl;
                    anchor.download = gzipFilename;
                    anchor._gzipProcessing = true; // Mantener flag para evitar loop

                    console.log(`📦 [GZIP] Descargando: ${gzipFilename} (${(compressedBlob.size / 1024 / 1024).toFixed(1)} MB)`);

                    originalClick.call(anchor);

                    // Cleanup
                    setTimeout(() => {
                        URL.revokeObjectURL(gzipUrl);
                        anchor._gzipProcessing = false;
                    }, 5000);
                })
                .catch(err => {
                    console.error('📦 [GZIP] Error comprimiendo, descargando sin comprimir:', err);
                    anchor._gzipProcessing = false;
                    originalClick.call(anchor);
                });

            return; // No hacer click original aún
        }

        // Si no aplica GZIP, click normal
        return originalClick.call(this);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // 📊 INIT & API
    // ═══════════════════════════════════════════════════════════════════════════

    if (typeof window !== 'undefined') {
        window.M3U8GzipModule = {
            version: VERSION,
            supported: GZIP_SUPPORTED,
            isEnabled: isGzipEnabled,
            compressBlob: compressBlobToGzip
        };

        console.log(`📦 [GZIP] v${VERSION} — Interceptor de descarga activo`);
        console.log(`   ✅ CompressionStream: ${GZIP_SUPPORTED ? 'Disponible' : '❌ No disponible'}`);
        console.log(`   ✅ Estrategia: Intercept HTMLAnchorElement.click()`);
        console.log(`   ✅ Checkbox: gzipCompressionEnabled`);
        console.log(`   ✅ Cuando ON: .m3u8 → .m3u8.gz (~70% más pequeño)`);
    }

})();
