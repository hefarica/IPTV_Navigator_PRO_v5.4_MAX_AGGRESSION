---
name: Floating Confirm Modal (Glassmorphism)
description: Componente UI reutilizable — modal flotante con backdrop blur, animación scale+translate, botones Confirmar/Cancelar con hover states. Estilo dark glassmorphism (slate-900, cyan-400 accent).
---

# Floating Confirm Modal — Componente UI Reutilizable

## Cuándo usar
Cualquier acción que requiera confirmación del usuario con contexto visual: eliminar, confirmar, activar features, etc.

## Implementación JS puro (sin dependencias)

```javascript
/**
 * showConfirmModal — Modal flotante glassmorphism con animación
 * @param {Object} opts
 * @param {string} opts.icon     - Emoji o icono (ej: "🛡️", "⚠️", "🗑️")
 * @param {string} opts.title    - Título del modal
 * @param {string} opts.subtitle - Nombre/detalle del item
 * @param {string} opts.body     - Texto descriptivo (HTML permitido)
 * @param {string} opts.confirmText  - Texto botón confirmar (default: "CONFIRMAR")
 * @param {string} opts.cancelText   - Texto botón cancelar (default: "CANCELAR")
 * @param {string} opts.accentColor  - Color accent CSS (default: "#38bdf8")
 * @param {Function} opts.onConfirm  - Callback al confirmar
 * @param {Function} opts.onCancel   - Callback al cancelar (opcional)
 */
function showConfirmModal(opts) {
    const id = 'confirmModal_' + Date.now();
    if (document.getElementById(id)) return;

    const accent = opts.accentColor || '#38bdf8';

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px);
        z-index: 9999; display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity 0.3s ease;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
        border: 1px solid ${accent}66;
        border-radius: 16px; width: 90%; max-width: 420px;
        padding: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
        transform: scale(0.95) translateY(20px);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        text-align: center; color: #f8fafc;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    `;

    modal.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 12px; text-shadow: 0 0 15px ${accent}80;">${opts.icon || '⚡'}</div>
        <h3 style="margin: 0 0 12px 0; font-size: 1.25rem; font-weight: 600; color: ${accent};">${opts.title || 'Confirmar'}</h3>
        <p style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 20px; line-height: 1.5;">
            ${opts.subtitle ? `<strong style="color: #e2e8f0; font-size: 1.05rem;">${opts.subtitle}</strong>` : ''}
        </p>
        ${opts.body ? `<p style="text-align:left; font-size: 0.8rem; color: #cbd5e1; margin-bottom: 24px; background: ${accent}1a; padding: 12px; border-radius: 8px; border-left: 3px solid ${accent};">${opts.body}</p>` : ''}
        <div style="display: flex; gap: 12px; justify-content: center;">
            <button data-action="cancel" style="flex: 1; padding: 12px; border: 1px solid rgba(239,68,68,0.5); background: rgba(239,68,68,0.1); color: #fca5a5; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                ${opts.cancelText || 'CANCELAR'}
            </button>
            <button data-action="confirm" style="flex: 1; padding: 12px; border: none; background: ${accent}; color: #0f172a; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s; box-shadow: 0 4px 6px -1px ${accent}4d;">
                ${opts.confirmText || 'CONFIRMAR'}
            </button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        modal.style.transform = 'scale(1) translateY(0)';
    });

    const close = () => {
        overlay.style.opacity = '0';
        modal.style.transform = 'scale(0.95) translateY(20px)';
        setTimeout(() => overlay.remove(), 300);
    };

    const btnCancel = modal.querySelector('[data-action="cancel"]');
    const btnConfirm = modal.querySelector('[data-action="confirm"]');

    btnCancel.addEventListener('mouseenter', () => btnCancel.style.background = 'rgba(239,68,68,0.2)');
    btnCancel.addEventListener('mouseleave', () => btnCancel.style.background = 'rgba(239,68,68,0.1)');
    btnCancel.onclick = () => { close(); if (opts.onCancel) opts.onCancel(); };

    btnConfirm.addEventListener('mouseenter', () => btnConfirm.style.background = '#0ea5e9');
    btnConfirm.addEventListener('mouseleave', () => btnConfirm.style.background = accent);
    btnConfirm.onclick = () => { close(); if (opts.onConfirm) opts.onConfirm(); };
}
```

## Ejemplo de uso

```javascript
showConfirmModal({
    icon: '🗑️',
    title: '¿Eliminar servidor?',
    subtitle: 'KEMOTV',
    body: 'Esta acción eliminará el servidor y todos sus canales de la biblioteca.',
    confirmText: 'SÍ, ELIMINAR',
    cancelText: 'NO, CONSERVAR',
    accentColor: '#ef4444',
    onConfirm: () => deleteServer(serverId),
    onCancel: () => console.log('Cancelado')
});
```

## Variantes de color

| Uso | Color | Hex |
|-----|-------|-----|
| Info/Default | Cyan | `#38bdf8` |
| Peligro | Rojo | `#ef4444` |
| Éxito | Verde | `#22c55e` |
| Advertencia | Amber | `#f59e0b` |
