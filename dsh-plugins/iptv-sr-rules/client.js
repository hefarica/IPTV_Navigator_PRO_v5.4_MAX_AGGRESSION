/**
 * Mitad Client de `@local/iptv-sr-rules`.
 *
 * Dos registros, el patron nativo del sidebar:
 *   1. `sidebar.panellist` id `iptv-sr-rules` -> SOLO el icono.
 *      El sidebar duenio el boton y le pasa { size, active }.
 *   2. `main` key `iptv-sr-rules`             -> la pagina que ese icono abre.
 *      "Each list id addresses the matching main panel", del catalogo del slot.
 *
 * No se renderiza <button> propio (el sidebar ya lo hace), no hay overlay ni
 * store: el duenio despacha la key y el slot main monta la pagina. Montar UI en
 * el lugar equivocado es lo que rompe la consistencia con el tema y el layout.
 */

window.__ModuleLoader__.load({
  id: '@local/iptv-sr-rules',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // ---------------------------------------------------------------------
    // Reglas derivadas del glosario de superresolucion de Ultralytics.
    // Cada una se traduce a una consecuencia VERIFICABLE en la lista.
    // ---------------------------------------------------------------------
    const RULES = [
      {
        id: 'SR-R1',
        title: 'El modelo de degradacion manda',
        source: 'El modelo de degradacion usado al entrenar determina que entradas reales puede procesar la red.',
        list: 'Sin conocer desenfoque, escala, ruido y compresion del stream no se puede prometer superresolucion. DECLARED es el unico estado honesto.',
        verdict: 'NO_COMPUTADO',
        why: 'La red solo reconoce las degradaciones con las que fue entrenada. Aplicarla a otra degradacion no es superresolucion: es alucinacion con forma de mejora.',
      },
      {
        id: 'SR-R2',
        title: 'PSNR y SSIM necesitan el ORIGINAL',
        source: 'La fidelidad se mide con PSNR y SSIM comparando contra la imagen de alta resolucion de referencia.',
        list: 'En IPTV el original no existe. Declarar PSNR, SSIM o VMAF sobre una fuente IPTV no mide: inventa una referencia que nadie tiene.',
        verdict: 'PROHIBIDO',
        why: 'Ambas metricas son una diferencia contra la verdad. Sin verdad no hay metrica, solo aritmetica sobre pixeles propios.',
      },
      {
        id: 'SR-R3',
        title: 'La perdida adversarial inventa detalle',
        source: 'La perdida adversarial produce texturas nitidas y realistas que pueden no coincidir pixel a pixel con la escena real.',
        list: 'Declarar AI-SR sobre una fuente 360p es la misma mentira que declarar 6K sobre 360p. Solo ENHANCEMENT, nunca SOURCE.',
        verdict: 'PROHIBIDO',
        why: 'El modelo elige la respuesta mas plausible, no la verdadera. Lo que aparece puede no haber estado nunca en la escena.',
      },
      {
        id: 'SR-R4',
        title: 'Interpolacion no es superresolucion',
        source: 'La interpolacion bicubica solo distribuye los pixeles existentes; un modelo entrenado predice los detalles de alta frecuencia que faltan.',
        list: 'LANCZOS y BICUBIC son INTERPOLATION. Solo un modelo entrenado es SUPER_RESOLUTION. No pueden compartir etiqueta en la metadata.',
        verdict: 'PERMITIDO',
        why: 'Ambos son legitimas. Confundirlas en la etiqueta es lo que convierte una mejora real en una declaracion falsa.',
      },
      {
        id: 'SR-R5',
        title: 'Restauracion condicionada, no generacion libre',
        source: 'La superresolucion se condiciona a una imagen de entrada y debe respetar su contenido; no crea imagenes desde una indicacion.',
        list: 'unsharp, eq y noise son realce de contraste, no superresolucion. Etiquetarlos igual que un modelo falsea la procedencia.',
        verdict: 'PROHIBIDO',
        why: 'El realce opera sobre lo que ya esta; el modelo predice lo que falta. Son operaciones distintas con riesgo distinto.',
      },
      {
        id: 'SR-R6',
        title: 'La interpolacion de fotogramas es el eje temporal',
        source: 'La interpolacion de fotogramas sintetiza fotogramas entre los existentes: es el equivalente temporal de la superresolucion espacial.',
        list: 'minterpolate declara FRAME_INTERPOLATION. Nunca RESOLUTION. Son ejes distintos y mezclarlos rompe la trazabilidad.',
        verdict: 'PERMITIDO',
        why: 'Espacial y temporal se pueden declarar juntos, pero cada uno con su propio campo. Un solo campo para dos ejes no audita nada.',
      },
      {
        id: 'SR-R7',
        title: 'Broadcast y archivo: el caso legitimo',
        source: 'Las cadenas de television y los restauradores cinematograficos amplian material de definicion estandar y de archivo para pantallas HD y 4K.',
        list: 'El unico escenario IPTV donde la superresolucion tiene sentido declarado es archivo y VOD, con modelo y presupuesto medidos. Nunca live sin medir.',
        verdict: 'PERMITIDO',
        why: 'El archivo no tiene prisa. El directo si, y ahi el coste de un detalle inventado se paga en cada fotograma.',
      },
    ];

    const BUDGET = {
      lead: 'Presupuesto real, medido en la fuente',
      body: 'ESPCN 4x con modelo de ~100 KB: +1 dB de PSNR equivale a ~21 % menos error cuadratico medio. Ese es el punto de partida honesto, no una promesa de 6K.',
    };

    const VERDICT_TONE = {
      PERMITIDO: { bg: 'var(--dsw-alias-success, #2f7d4f)', fg: '#fff' },
      PROHIBIDO: { bg: 'var(--dsw-alias-danger, #b23c3c)', fg: '#fff' },
      NO_COMPUTADO: { bg: 'var(--dsw-alias-warning, #8a6d1f)', fg: '#fff' },
    };

    // ---------------------------------------------------------------------
    // Estilos como elemento React: al desmontar la pagina, desaparecen.
    // Solo tokens --dsw-alias-*; un token renombrado degrada, nunca rompe.
    // ---------------------------------------------------------------------
    function Styles() {
      return h('style', null, `
        .srp-page {
          height: 100%; overflow: auto; padding: 24px 28px 40px;
          color: var(--dsw-alias-text, #e8e8e8);
          font-size: 13.5px; line-height: 1.6;
        }
        .srp-wrap { max-width: 820px; margin: 0 auto; }
        .srp-h1 { font-size: 19px; font-weight: 650; margin: 0 0 4px; letter-spacing: -0.01em; }
        .srp-lead { margin: 0 0 18px; opacity: .72; font-size: 12.5px; }
        .srp-budget {
          margin: 0 0 22px; padding: 11px 14px; border-radius: 9px;
          background: var(--dsw-alias-bg-subtle, rgba(255,255,255,.045));
          border-left: 3px solid var(--dsw-alias-accent, #4a8fd4);
        }
        .srp-budget-lead { font-weight: 640; font-size: 12.5px; margin-bottom: 3px; }
        .srp-budget-body { font-size: 12.5px; opacity: .85; }
        .srp-rule { padding: 15px 0; border-top: 1px solid var(--dsw-alias-border, #3a3a3a); }
        .srp-rule:first-of-type { border-top: none; padding-top: 0; }
        .srp-rule-head { display: flex; align-items: baseline; gap: 9px; margin-bottom: 6px; }
        .srp-h2 { font-size: 13.5px; font-weight: 650; margin: 0; }
        .srp-id { font-family: ui-monospace, Consolas, monospace; font-size: 11px; opacity: .55; }
        .srp-tag {
          margin-left: auto; font-size: 9.5px; font-weight: 700; letter-spacing: .05em;
          padding: 2.5px 8px; border-radius: 999px; white-space: nowrap;
        }
        .srp-src { opacity: .62; font-size: 12px; margin: 0 0 6px; font-style: italic; }
        .srp-line { margin: 0 0 5px; }
        .srp-line b { font-weight: 640; }
        .srp-why { margin: 0; opacity: .7; font-size: 12px; }
        .srp-foot {
          margin-top: 26px; padding-top: 14px;
          border-top: 1px solid var(--dsw-alias-border, #3a3a3a);
          font-size: 11.5px; opacity: .58;
        }
      `);
    }

    // ---------------------------------------------------------------------
    // 1) Icono de la barra lateral izquierda.
    //    El sidebar duenio el boton: aqui solo se dibuja el glifo.
    //    `size` es la arista pedida; `active` marca el panel seleccionado.
    // ---------------------------------------------------------------------
    function SidebarIcon(props) {
      const size = (props && props.size) || 20;
      const active = !!(props && props.active);
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        'aria-hidden': true,
        style: { display: 'block', opacity: active ? 1 : 0.6 },
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
        // Tres escalones ascendentes = resolucion reconstruida.
        h('path', { d: 'M3 19h4v-4H3z' }),
        h('path', { d: 'M9 19h4V9H9z' }),
        h('path', { d: 'M15 19h4V4h-4z' }),
        // Trazo discontinuo = lo que solo la interpolacion rellena.
        h('path', { d: 'M21 4v15', strokeDasharray: '2 3', opacity: 0.5 })
      );
    }

    // ---------------------------------------------------------------------
    // 2) Pagina del panel central.
    // ---------------------------------------------------------------------
    function RulesPage() {
      return h('div', { className: 'srp-page' },
        h(Styles),
        h('div', { className: 'srp-wrap' },
          h('h1', { className: 'srp-h1' }, 'Superresolucion aplicada a listas IPTV'),
          h('p', { className: 'srp-lead' },
            'Siete reglas derivadas del glosario de superresolucion de Ultralytics, traducidas a consecuencias verificables en M3U, M3U8 y metadata JSON.'
          ),
          h('div', { className: 'srp-budget' },
            h('div', { className: 'srp-budget-lead' }, BUDGET.lead),
            h('div', { className: 'srp-budget-body' }, BUDGET.body)
          ),
          ...RULES.map((r) => {
            const tone = VERDICT_TONE[r.verdict] || { bg: '#666', fg: '#fff' };
            return h('div', { className: 'srp-rule', key: r.id },
              h('div', { className: 'srp-rule-head' },
                h('span', { className: 'srp-id' }, r.id),
                h('h2', { className: 'srp-h2' }, r.title),
                h('span', {
                  className: 'srp-tag',
                  style: { background: tone.bg, color: tone.fg },
                }, r.verdict)
              ),
              h('p', { className: 'srp-src' }, r.source),
              h('p', { className: 'srp-line' }, h('b', null, 'En la lista: '), r.list),
              h('p', { className: 'srp-why' }, r.why)
            );
          }),
          h('div', { className: 'srp-foot' },
            'Fuente conceptual: ultralytics.com/es/glossary/super-resolution. Las siete reglas son una relectura aplicada de esa fuente, no una copia de su texto. '
            + 'Un detalle inventado no es una mejora: es una afirmacion sin referencia.',
            h('br'),
            h('br'),
            'Esta pagina MUESTRA las reglas. Quien las APLICA es el candado: '
            + 'contracts/super_resolution_rules.json es la fuente unica, y '
            + 'tools/quality/check_sr_rules.js las verifica sobre una lista real. '
            + 'Una regla que solo se lee no es una regla.'
          )
        )
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Icono en la barra lateral izquierda. El id direcciona el panel `main`.
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'iptv-sr-rules',
          order: 40,
        }, SidebarIcon));

        // Panel central con la MISMA key que el id del icono.
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'iptv-sr-rules',
        }, RulesPage));
      },
    };
  },
});
