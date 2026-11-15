/**
 * Client half of the Upscale Lab bundle.
 *
 * Registers, on the live Web page:
 *   1. a `sidebar.panellist` entry (icon + localized label) — the left sidebar row,
 *   2. the matching `main` keyed panel, and
 *   3. the `/upscale` slash command that opens that panel.
 *
 * Text goes through the Client locale service; styling uses host theme tokens
 * (`--dsw-alias-*`, `--dsw-radius-*`) only, so light/dark follow the shell.
 */
window.__ModuleLoader__.load({
  id: '@local/upscale-lab',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    /** Client locale namespace owned by this plugin. */
    const NS = 'upscaleLab';
    /** Sidebar list id; the same string is the `main` key the row selects. */
    const PANEL_ID = 'upscale-lab';
    /** Composer slash command that opens the panel. */
    const COMMAND = 'upscale';

    const REPO_UAV = 'https://github.com/sczhou/Upscale-A-Video';
    const REPO_RVE = 'https://github.com/TNTwise/REAL-Video-Enhancer';
    const REPO_ANIME4K = 'https://github.com/bloc97/Anime4K';
    const REPO_VIDEO2X = 'https://github.com/k4yt3x/video2x';

    const CMD_CLONE_UAV = 'git clone ' + REPO_UAV + '.git';
    const CMD_CLONE_RVE = 'git clone ' + REPO_RVE + '.git';
    const CMD_UAV = [
      'python inference_upscale_a_video.py \\',
      '  --input lq_video.mp4 \\',
      '  --output hq_4k.mp4 \\',
      '  --upscale 4 \\',
      '  --text "high quality, sharp details"',
    ].join('\n');
    const CMD_VIDEO2X =
      'video2x -i source.mp4 -s 4 -e realesrgan -m RealESRGAN_x4plus_anime_6B';
    const CMD_MPV =
      'mpv upscaled_4k.mp4 --glsl-shaders="Anime4K_Upscale_CNN_L_x2.glsl"';
    const CMD_WEBSR = "websr.attachToVideo(player, {quality: '6k'});";

    /** One table row per use case; product names stay verbatim. */
    const CASE_ROWS = [
      { need: 'case.live', repo: 'Anime4K', url: REPO_ANIME4K, config: 'case.live.config' },
      { need: 'case.vod', repo: 'Upscale-A-Video', url: REPO_UAV, config: 'case.vod.config' },
      { need: 'case.batch', repo: 'Video2X', url: REPO_VIDEO2X, config: 'case.batch.config' },
      { need: 'case.web', repo: 'WebSR', url: '', config: 'case.web.config' },
      { need: 'case.easy', repo: 'REAL-Video-Enhancer', url: REPO_RVE, config: 'case.easy.config' },
    ];

    const en = {
      'panel.label': 'Upscale Lab',
      'command.label': 'Upscale Lab',
      'command.description':
        'Open the extreme 4K/6K upscaling reference: models, use-case table and hybrid stack.',
      title: 'Upscale Lab — Extreme 4K/6K',
      subtitle:
        'Reference panel for the upscaling stack: diffusion, neural upscale, interpolation and real-time shaders. This panel only documents the tools; it executes nothing.',
      hint: 'Composer command',
      'copy.label': 'Copy',
      'copy.done': 'Copied',
      'copy.title': 'Copy to clipboard',
      'repo.label': 'Repository',
      'why.title': 'Why it is extreme',
      'pipeline.title': 'Pipeline',
      'limit.title': 'Limitation',
      'uav.title': 'Upscale-A-Video (CVPR 2024)',
      'uav.p1': 'Temporally consistent diffusion model: no frame-by-frame flicker.',
      'uav.p2': 'Trained on real-world degradations.',
      'uav.p3': '4K/6K output with texture coherence across frames.',
      'uav.p4': 'Beats ESRGAN on photorealism.',
      'uav.pipeline': 'Text-guided upscaling:',
      'uav.limit':
        'Massive VRAM required (24 GB+) and minutes per frame. This is offline VOD work, not live streaming.',
      'rve.title': 'REAL-Video-Enhancer — all in one',
      'rve.p1': 'Interpolation (RIFE) + upscale (ESRGAN/Anime4K) + denoise in one pipeline.',
      'rve.p2': 'Native GUI for Linux, Windows and macOS.',
      'rve.p3': 'Batch processing queue.',
      'rve.p4': 'Pre-configured for 4K/8K.',
      'rve.limit':
        'A strong GPU is required for real-time or large batches; CPU-only paths are slow. The video output is decided by the model and by the source quality.',
      'case.title': 'Pick by use case',
      'case.need': 'Need',
      'case.repo': 'Repo',
      'case.config': 'Config',
      'case.live': 'Live 4K streaming',
      'case.live.config': 'Shaders in MPV/VLC',
      'case.vod': 'VOD 6K, maximum quality',
      'case.vod.config': 'Diffusion + temporal',
      'case.batch': 'Fast batch 4K/8K',
      'case.batch.config': 'Real-ESRGAN + RIFE',
      'case.web': 'Web/OTT streaming',
      'case.web.config': 'WebGPU on the client',
      'case.easy': 'Easy all-in-one',
      'case.easy.config': 'Native GUI',
      'stack.title': 'Hybrid extreme stack',
      'stack.s1': '1. Offline pre-process with Video2X',
      'stack.s2': '2. Real-time streaming with Anime4K shaders',
      'stack.s3': '3. On the web, WebSR for clients',
      'note.title': 'Honest scope',
      'note.body':
        'These tools produce real pixels offline or on the device. A playlist can only declare enhancement metadata; it must never claim that the server upscaled the stream. Real output depends on GPU, model and source quality.',
    };

    const es = {
      'panel.label': 'Upscale Lab',
      'command.label': 'Escalado extremo',
      'command.description':
        'Abre la referencia de escalado extremo 4K/6K: modelos, tabla por caso de uso y stack híbrido.',
      title: 'Upscale Lab — Escalado extremo 4K/6K',
      subtitle:
        'Panel de referencia del stack de escalado: difusión, escalado neuronal, interpolación y shaders en tiempo real. Este panel solo documenta las herramientas; no ejecuta nada.',
      hint: 'Comando en el compositor',
      'copy.label': 'Copiar',
      'copy.done': 'Copiado',
      'copy.title': 'Copiar al portapapeles',
      'repo.label': 'Repositorio',
      'why.title': 'Por qué es extremo',
      'pipeline.title': 'Pipeline',
      'limit.title': 'Limitación',
      'uav.title': 'Upscale-A-Video (CVPR 2024)',
      'uav.p1': 'Modelo de difusión temporalmente consistente: sin parpadeo frame a frame.',
      'uav.p2': 'Entrenado con degradaciones reales del mundo.',
      'uav.p3': 'Salida 4K/6K con coherencia de textura entre frames.',
      'uav.p4': 'Supera a ESRGAN en fotorrealismo.',
      'uav.pipeline': 'Escalado guiado por texto:',
      'uav.limit':
        'Requiere VRAM masiva (24 GB+) y minutos por frame. Es trabajo offline de VOD, no streaming en vivo.',
      'rve.title': 'REAL-Video-Enhancer — todo en uno',
      'rve.p1': 'Interpolación (RIFE) + escalado (ESRGAN/Anime4K) + denoise en un solo pipeline.',
      'rve.p2': 'GUI nativa para Linux, Windows y macOS.',
      'rve.p3': 'Cola de procesamiento por lotes.',
      'rve.p4': 'Pre-configurado para 4K/8K.',
      'rve.limit':
        'Necesita una GPU potente para tiempo real o lotes grandes; las rutas solo-CPU son lentas. La salida real depende del modelo y de la calidad de la fuente.',
      'case.title': 'Recomendación por caso de uso',
      'case.need': 'Necesidad',
      'case.repo': 'Repo',
      'case.config': 'Config',
      'case.live': 'Streaming live 4K',
      'case.live.config': 'Shaders en MPV/VLC',
      'case.vod': 'VOD 6K, máxima calidad',
      'case.vod.config': 'Difusión + temporal',
      'case.batch': 'Batch 4K/8K rápido',
      'case.batch.config': 'Real-ESRGAN + RIFE',
      'case.web': 'Streaming web/OTT',
      'case.web.config': 'WebGPU en el cliente',
      'case.easy': 'Todo en uno fácil',
      'case.easy.config': 'GUI nativa',
      'stack.title': 'Stack extremo híbrido',
      'stack.s1': '1. Pre-proceso offline con Video2X',
      'stack.s2': '2. Streaming en tiempo real con shaders Anime4K',
      'stack.s3': '3. En la web, WebSR para clientes',
      'note.title': 'Alcance honesto',
      'note.body':
        'Estas herramientas producen píxeles reales offline o en el dispositivo. Una lista solo puede declarar metadata de mejora; nunca debe afirmar que el servidor escaló el stream. La salida real depende de GPU, modelo y calidad de la fuente.',
    };

    /** Theme-token-only styles; artwork (the icon) carries its own color. */
    const S = {
      page: {
        height: '100%',
        boxSizing: 'border-box',
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 clamp(24px, 4vw, 48px) 48px',
        color: 'var(--dsw-alias-label-primary)',
      },
      wrap: { width: '100%', maxWidth: '960px', boxSizing: 'border-box', paddingTop: '24px' },
      titleRow: { display: 'flex', alignItems: 'center', gap: '12px' },
      title: { margin: 0, fontSize: '20px', fontWeight: 600, lineHeight: '28px' },
      subtitle: {
        margin: '8px 0 0',
        fontSize: '13.5px',
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-secondary)',
        maxWidth: '720px',
      },
      hintRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '14px' },
      hintLabel: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' },
      chip: {
        fontFamily: 'var(--ds-font-family-code, monospace)',
        fontSize: '12.5px',
        padding: '2px 8px',
        borderRadius: 'var(--dsw-radius-sm)',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-primary)',
      },
      card: {
        marginTop: '20px',
        padding: '18px 20px',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 'var(--dsw-radius-lg)',
      },
      cardTitle: { margin: 0, fontSize: '15px', fontWeight: 600, lineHeight: '22px' },
      metaRow: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginTop: '10px' },
      metaLabel: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' },
      link: {
        color: 'var(--dsw-alias-state-business-primary)',
        textDecoration: 'none',
        fontFamily: 'var(--ds-font-family-code, monospace)',
        fontSize: '12.5px',
        wordBreak: 'break-all',
      },
      subhead: {
        margin: '16px 0 0',
        fontSize: '11.5px',
        fontWeight: 600,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)',
      },
      list: { margin: '6px 0 0', paddingLeft: '18px', fontSize: '13.5px', lineHeight: '1.7' },
      limitText: {
        margin: '12px 0 0',
        fontSize: '12.5px',
        lineHeight: '19px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      codeWrap: { position: 'relative', marginTop: '6px' },
      pre: {
        margin: 0,
        padding: '12px 14px',
        paddingRight: '64px',
        background: 'var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-2))',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: 'var(--dsw-radius-md)',
        overflowX: 'auto',
        fontFamily: 'var(--ds-font-family-code, monospace)',
        fontSize: '12.5px',
        lineHeight: '1.6',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      },
      copyBtn: {
        position: 'absolute',
        top: '8px',
        right: '8px',
        padding: '3px 8px',
        fontSize: '11px',
        fontFamily: 'inherit',
        color: 'var(--dsw-alias-label-secondary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 'var(--dsw-radius-xs)',
        cursor: 'pointer',
      },
      table: { width: '100%', marginTop: '10px', borderCollapse: 'collapse', fontSize: '13px' },
      th: {
        textAlign: 'left',
        padding: '8px 10px',
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-secondary)',
        borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
      },
      td: {
        padding: '8px 10px',
        borderBottom: '0.5px solid var(--dsw-alias-border-l1)',
        verticalAlign: 'top',
        lineHeight: '1.5',
      },
      step: { marginTop: '14px' },
      stepTitle: { margin: '0 0 2px', fontSize: '13px', fontWeight: 600, lineHeight: '20px' },
      note: {
        marginTop: '24px',
        paddingTop: '14px',
        borderTop: '0.5px solid var(--dsw-alias-border-l1)',
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-tertiary)',
      },
    };

    /** Sidebar glyph: an expand frame around an outward arrow (artwork). */
    function UpscaleIcon(props) {
      const size = props && typeof props.size === 'number' ? props.size : 24;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 64 64',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', { d: 'M26 12H12v14' }),
        h('path', { d: 'M38 12h14v14' }),
        h('path', { d: 'M52 38v14H38' }),
        h('path', { d: 'M12 38v14h14' }),
        h('path', { d: 'M24.5 39.5 39.5 24.5' }),
        h('path', { d: 'M39.5 24.5H31' }),
        h('path', { d: 'M39.5 24.5V33' }),
      );
    }

    function CodeBlock(props) {
      const text = props.text;
      const t = props.t;
      const [copied, setCopied] = useState(false);
      const timer = useRef(0);
      useEffect(
        () => () => {
          if (timer.current) clearTimeout(timer.current);
        },
        [],
      );
      const copy = () => {
        const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
        if (!clipboard || typeof clipboard.writeText !== 'function') return;
        clipboard.writeText(text).then(
          () => {
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1500);
          },
          () => {},
        );
      };
      return h(
        'div',
        { style: S.codeWrap },
        h('pre', { style: S.pre }, h('code', null, text)),
        h(
          'button',
          { type: 'button', onClick: copy, style: S.copyBtn, title: t('copy.title') },
          copied ? t('copy.done') : t('copy.label'),
        ),
      );
    }

    function Bullets(props) {
      return h(
        'ul',
        { style: S.list },
        props.items.map((line, index) => h('li', { key: index, style: { marginBottom: '4px' } }, line)),
      );
    }

    function Card(props) {
      return h('section', { style: S.card }, h('h2', { style: S.cardTitle }, props.title), props.children);
    }

    function RepoRow(props) {
      return h(
        'div',
        { style: S.metaRow },
        h('span', { style: S.metaLabel }, props.t('repo.label')),
        h(
          'a',
          { href: props.url, target: '_blank', rel: 'noreferrer noopener', style: S.link },
          props.url,
        ),
      );
    }

    function UpscaleLabPage(props) {
      const t = props.t;
      return h(
        'div',
        { style: S.page },
        h(
          'div',
          { style: S.wrap },
          h(
            'div',
            { style: S.titleRow },
            h(
              'span',
              { style: { color: 'var(--dsw-alias-state-business-primary)', display: 'flex' } },
              h(UpscaleIcon, { size: 30 }),
            ),
            h('h1', { style: S.title }, t('title')),
          ),
          h('p', { style: S.subtitle }, t('subtitle')),
          h(
            'div',
            { style: S.hintRow },
            h('span', { style: S.hintLabel }, t('hint')),
            h('code', { style: S.chip }, '/' + COMMAND),
          ),

          h(
            Card,
            { title: t('uav.title') },
            h(RepoRow, { t: t, url: REPO_UAV }),
            h(CodeBlock, { text: CMD_CLONE_UAV, t: t }),
            h('h3', { style: S.subhead }, t('why.title')),
            h(Bullets, { items: [t('uav.p1'), t('uav.p2'), t('uav.p3'), t('uav.p4')] }),
            h('h3', { style: S.subhead }, t('pipeline.title')),
            h('p', { style: S.limitText }, t('uav.pipeline')),
            h(CodeBlock, { text: CMD_UAV, t: t }),
            h('p', { style: S.limitText }, h('strong', null, t('limit.title') + ': '), t('uav.limit')),
          ),

          h(
            Card,
            { title: t('rve.title') },
            h(RepoRow, { t: t, url: REPO_RVE }),
            h(CodeBlock, { text: CMD_CLONE_RVE, t: t }),
            h('h3', { style: S.subhead }, t('why.title')),
            h(Bullets, { items: [t('rve.p1'), t('rve.p2'), t('rve.p3'), t('rve.p4')] }),
            h('p', { style: S.limitText }, h('strong', null, t('limit.title') + ': '), t('rve.limit')),
          ),

          h(
            Card,
            { title: t('case.title') },
            h(
              'table',
              { style: S.table },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  h('th', { style: S.th }, t('case.need')),
                  h('th', { style: S.th }, t('case.repo')),
                  h('th', { style: S.th }, t('case.config')),
                ),
              ),
              h(
                'tbody',
                null,
                CASE_ROWS.map((row) =>
                  h(
                    'tr',
                    { key: row.need },
                    h('td', { style: S.td }, t(row.need)),
                    h(
                      'td',
                      { style: S.td },
                      row.url
                        ? h(
                            'a',
                            { href: row.url, target: '_blank', rel: 'noreferrer noopener', style: S.link },
                            row.repo,
                          )
                        : row.repo,
                    ),
                    h('td', { style: { ...S.td, color: 'var(--dsw-alias-label-secondary)' } }, t(row.config)),
                  ),
                ),
              ),
            ),
          ),

          h(
            Card,
            { title: t('stack.title') },
            h(
              'div',
              { style: S.step },
              h('p', { style: S.stepTitle }, t('stack.s1')),
              h(CodeBlock, { text: CMD_VIDEO2X, t: t }),
            ),
            h(
              'div',
              { style: S.step },
              h('p', { style: S.stepTitle }, t('stack.s2')),
              h(CodeBlock, { text: CMD_MPV, t: t }),
            ),
            h(
              'div',
              { style: S.step },
              h('p', { style: S.stepTitle }, t('stack.s3')),
              h(CodeBlock, { text: CMD_WEBSR, t: t }),
            ),
          ),

          h('div', { style: S.note }, h('strong', null, t('note.title') + ': '), t('note.body')),
        ),
      );
    }

    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(NS, 'en', en),
        'upscale-lab: english dictionary',
      );
      ctx.effect(
        () => ctx.locale.register(NS, 'es', es),
        'upscale-lab: spanish dictionary',
      );
      const t = ctx.locale.bind(NS);

      // Left sidebar entry. The id doubles as the `main` key it selects.
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 20,
            locale: NS,
            label: () => t('panel.label'),
          },
          UpscaleIcon,
        ),
      );

      // The panel the sidebar row (and the slash command) opens.
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, UpscaleLabPage),
      );

      // `/upscale`: a client-side action that selects the panel. It submits
      // nothing, so it never touches the composer draft or session log.
      ctx.inject(['commandUi', 'layout'], (scope) => {
        scope.effect(
          () =>
            scope.commandUi.register({
              name: COMMAND,
              label: () => t('command.label'),
              description: () => t('command.description'),
              available: () => true,
              ui: {
                kind: 'action',
                run: () => {
                  scope.layout.selectPanel(PANEL_ID);
                },
              },
            }),
          'upscale-lab: slash command',
        );
      });
    }

    return { inject: ['slots', 'locale'], apply };
  },
});
