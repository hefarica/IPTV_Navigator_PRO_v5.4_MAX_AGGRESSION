/**
 * INTEGRACIÓN DE SUBIDA STREAMING CON ELEMENTOS UI ESPECÍFICOS
 * 
 * Elementos requeridos en HTML:
 * - #file-selector-row: Selector de archivo
 * - #gateway-file-input: Input file oculto
 * - #gateway-upload-btn: Botón de subida
 * - #file-selector-text: Texto del nombre del archivo
 * - #file-selector-info: Info del archivo (tamaño, canales)
 * - #file-selector-icon: Icono de estado
 */

// ═══════════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN GLOBAL
// ═══════════════════════════════════════════════════════════════════════════════════

const GATEWAY_CONFIG = {
    api_url: 'https://iptv-ape.duckdns.org/api',
    upload_endpoint: '/upload-stream',
    chunk_size: 1024 * 1024, // 1MB
    max_retries: 3,
    timeout: 0 // Sin timeout (dejar que el navegador maneje)
};

// Estado global de la subida
let UPLOAD_STATE = {
    file: null,
    filename: null,
    filesize: null,
    uploading: false,
    progress: 0,
    speed: 0,
    startTime: null,
    lastProgressTime: null,
    lastProgressBytes: 0
};

// ═══════════════════════════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function () {
    // Configurar selector de archivo
    const fileSelectorRow = document.getElementById('file-selector-row');
    const fileInput = document.getElementById('gateway-file-input');

    if (fileSelectorRow && fileInput) {
        fileSelectorRow.addEventListener('click', function () {
            fileInput.click();
        });

        fileInput.addEventListener('change', handleFileSelect);
    }

    // Configurar botón de subida
    const uploadBtn = document.getElementById('gateway-upload-btn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', uploadToGateway);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════════
// MANEJADOR DE SELECCIÓN DE ARCHIVO
// ═══════════════════════════════════════════════════════════════════════════════════

function handleFileSelect(event) {
    const file = event.target.files[0];

    if (!file) {
        console.log('[GATEWAY] No file selected');
        return;
    }

    // Validar que sea M3U8
    if (!file.name.endsWith('.m3u8') && !file.type.includes('mpegURL')) {
        alert('Por favor selecciona un archivo M3U8');
        return;
    }

    // Guardar información del archivo
    UPLOAD_STATE.file = file;
    UPLOAD_STATE.filename = file.name;
    UPLOAD_STATE.filesize = file.size;

    // Actualizar UI
    updateFileSelector(file.name, file.size);

    console.log(`[GATEWAY] Archivo seleccionado: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ACTUALIZAR UI DEL SELECTOR
// ═══════════════════════════════════════════════════════════════════════════════════

function updateFileSelector(filename, filesize) {
    const fileSelectorText = document.getElementById('file-selector-text');
    const fileSelectorInfo = document.getElementById('file-selector-info');
    const fileSelectorIcon = document.getElementById('file-selector-icon');

    if (fileSelectorText) {
        fileSelectorText.textContent = filename;
    }

    if (fileSelectorInfo) {
        const sizeMB = (filesize / (1024 * 1024)).toFixed(2);
        fileSelectorInfo.textContent = `${sizeMB} MB • Listo para subir`;
    }

    if (fileSelectorIcon) {
        fileSelectorIcon.textContent = '✅';
        fileSelectorIcon.style.color = '#86efac';
    }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL DE SUBIDA
// ═══════════════════════════════════════════════════════════════════════════════════

async function uploadToGateway() {
    // Validar que hay archivo seleccionado
    if (!UPLOAD_STATE.file) {
        alert('Por favor selecciona un archivo primero');
        return;
    }

    // Evitar subidas múltiples
    if (UPLOAD_STATE.uploading) {
        console.log('[GATEWAY] Subida ya en progreso');
        return;
    }

    try {
        UPLOAD_STATE.uploading = true;
        updateUploadButton(true);

        const result = await uploadFileStream(UPLOAD_STATE.file);

        if (result.success) {
            console.log('[GATEWAY] ✅ Subida exitosa');
            console.log('[GATEWAY] URL:', result.url);

            // Mostrar resultado
            showUploadSuccess(result);

            // Guardar en localStorage
            localStorage.setItem('last_upload_url', result.url);
            localStorage.setItem('last_upload_id', result.list_id);
            localStorage.setItem('last_upload_time', new Date().toISOString());
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (error) {
        console.error('[GATEWAY] ❌ Error:', error.message);
        showUploadError(error.message);
    } finally {
        UPLOAD_STATE.uploading = false;
        updateUploadButton(false);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// SUBIDA CON STREAMING (XMLHttpRequest)
// ═══════════════════════════════════════════════════════════════════════════════════

function uploadFileStream(file) {
    return new Promise((resolve, reject) => {
        const apiUrl = GATEWAY_CONFIG.api_url + GATEWAY_CONFIG.upload_endpoint;

        // Crear FormData
        const formData = new FormData();
        formData.append('file', file, file.name);

        // Crear XMLHttpRequest
        const xhr = new XMLHttpRequest();

        // Inicializar estado
        UPLOAD_STATE.startTime = Date.now();
        UPLOAD_STATE.lastProgressTime = UPLOAD_STATE.startTime;
        UPLOAD_STATE.lastProgressBytes = 0;

        // Evento: Progreso de subida
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                const currentTime = Date.now();
                const timeDelta = (currentTime - UPLOAD_STATE.lastProgressTime) / 1000; // segundos
                const bytesDelta = event.loaded - UPLOAD_STATE.lastProgressBytes;
                const speedMBps = (bytesDelta / (1024 * 1024)) / timeDelta;

                // Actualizar estado
                UPLOAD_STATE.progress = percentComplete;
                UPLOAD_STATE.speed = speedMBps;

                // Actualizar UI cada 500ms
                if (currentTime - UPLOAD_STATE.lastProgressTime > 500) {
                    updateProgressUI(percentComplete, speedMBps, event.loaded, event.total);
                    UPLOAD_STATE.lastProgressTime = currentTime;
                    UPLOAD_STATE.lastProgressBytes = event.loaded;
                }
            }
        });

        // Evento: Error de conexión
        xhr.addEventListener('error', () => {
            console.error('[GATEWAY] Error de conexión');
            reject(new Error('Error de conexión durante la subida'));
        });

        // Evento: Timeout
        xhr.addEventListener('timeout', () => {
            console.error('[GATEWAY] Timeout');
            reject(new Error('Timeout durante la subida'));
        });

        // Evento: Carga completada
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);

                    if (response.status === 'ok') {
                        console.log('[GATEWAY] Respuesta del servidor:', response);

                        resolve({
                            success: true,
                            url: response.list_url,
                            list_id: response.list_id,
                            file_size_mb: response.file_size_mb,
                            parsed_config: response.parsed_config
                        });
                    } else {
                        reject(new Error(response.message || 'Error desconocido del servidor'));
                    }
                } catch (e) {
                    reject(new Error('Error parseando respuesta: ' + e.message));
                }
            } else if (xhr.status === 413) {
                reject(new Error('Archivo demasiado grande. El servidor rechazó la solicitud.'));
            } else {
                reject(new Error(`Error ${xhr.status}: ${xhr.statusText}`));
            }
        });

        // Configurar y enviar
        xhr.open('POST', apiUrl, true);
        xhr.timeout = GATEWAY_CONFIG.timeout;
        xhr.send(formData);
    });
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ACTUALIZAR UI DE PROGRESO
// ═══════════════════════════════════════════════════════════════════════════════════

function updateProgressUI(percentComplete, speedMBps, loaded, total) {
    const uploadBtn = document.getElementById('gateway-upload-btn');
    const fileSelectorInfo = document.getElementById('file-selector-info');

    if (uploadBtn) {
        const loadedMB = (loaded / (1024 * 1024)).toFixed(2);
        const totalMB = (total / (1024 * 1024)).toFixed(2);
        uploadBtn.innerHTML = `<span class="icon">📤</span><span>${percentComplete.toFixed(1)}% (${speedMBps.toFixed(2)} MB/s)</span>`;
    }

    if (fileSelectorInfo) {
        const loadedMB = (loaded / (1024 * 1024)).toFixed(2);
        const totalMB = (total / (1024 * 1024)).toFixed(2);
        fileSelectorInfo.textContent = `${loadedMB}/${totalMB} MB • ${percentComplete.toFixed(1)}% • ${speedMBps.toFixed(2)} MB/s`;
    }

    console.log(`[GATEWAY] Progreso: ${percentComplete.toFixed(1)}% (${speedMBps.toFixed(2)} MB/s)`);
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ACTUALIZAR ESTADO DEL BOTÓN
// ═══════════════════════════════════════════════════════════════════════════════════

function updateUploadButton(uploading) {
    const uploadBtn = document.getElementById('gateway-upload-btn');

    if (!uploadBtn) return;

    if (uploading) {
        uploadBtn.disabled = true;
        uploadBtn.style.opacity = '0.6';
        uploadBtn.style.cursor = 'not-allowed';
    } else {
        uploadBtn.disabled = false;
        uploadBtn.style.opacity = '1';
        uploadBtn.style.cursor = 'pointer';
        uploadBtn.innerHTML = '<span class="icon">📤</span><span>Subir al Gateway</span>';
    }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// MOSTRAR RESULTADO EXITOSO
// ═══════════════════════════════════════════════════════════════════════════════════

function showUploadSuccess(result) {
    const message = `✅ Subida exitosa!\n\nURL: ${result.url}\n\nTamaño: ${result.file_size_mb} MB\n\nCanales: ${result.parsed_config.channels_count || 'N/A'}`;

    alert(message);

    // Mostrar en consola
    console.log('[GATEWAY] Resultado:', result);

    // Actualizar UI
    const fileSelectorIcon = document.getElementById('file-selector-icon');
    if (fileSelectorIcon) {
        fileSelectorIcon.textContent = '✅';
        fileSelectorIcon.style.color = '#86efac';
    }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// MOSTRAR ERROR
// ═══════════════════════════════════════════════════════════════════════════════════

function showUploadError(errorMessage) {
    alert(`❌ Error en la subida:\n\n${errorMessage}`);

    // Actualizar UI
    const fileSelectorIcon = document.getElementById('file-selector-icon');
    if (fileSelectorIcon) {
        fileSelectorIcon.textContent = '❌';
        fileSelectorIcon.style.color = '#ff6b6b';
    }

    const fileSelectorInfo = document.getElementById('file-selector-info');
    if (fileSelectorInfo) {
        fileSelectorInfo.textContent = `Error: ${errorMessage}`;
        fileSelectorInfo.style.color = '#ff6b6b';
    }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// EXPORTAR FUNCIONES (para uso global)
// ═══════════════════════════════════════════════════════════════════════════════════

window.uploadToGateway = uploadToGateway;
window.handleFileSelect = handleFileSelect;
window.GATEWAY_CONFIG = GATEWAY_CONFIG;
window.UPLOAD_STATE = UPLOAD_STATE;
