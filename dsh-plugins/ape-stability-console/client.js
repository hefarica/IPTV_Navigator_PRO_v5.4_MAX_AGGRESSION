/**
 * Client half of the APE Stability Console bundle.
 *
 * Registers, on the live Web page:
 *   1. a `sidebar.panellist` entry (icon + localized label) — the LEFT SIDEBAR row,
 *   2. the matching `main` keyed panel with the four cards.
 *
 * The panel is a read-only console over the production infra of the APE VPS:
 *   1. availability : nginx / php8.3-fpm / ape-jit + the ape-*.timer set,
 *   2. projection   : gate [11] — bytes, channels and tags of the served list,
 *   3. stability    : per-channel score (skill `iptv-stream-stability-score`),
 *   4. failover     : last 5xx/timeout + whether failover is armed, keeping
 *                     provider blocking apart from a network failure.
 *
 * Every number comes from the Host response. What the Host could not measure is
 * rendered as `no computado` next to its exact reason; this file never fills a gap
 * with a guess, never writes anything and never touches the runtime.
 *
 * Text goes through the Client locale service; styling uses host theme tokens
 * (`--dsw-alias-*`, `--dsw-radius-*`) only.
 */
window.__ModuleLoader__.load({
  id: '@local/ape-stability-console',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    /** Client locale namespace owned by this plugin. */
    const NS = 'apeStabilityConsole';
    /** Sidebar list id; the same string is the `main` key the row selects. */
    const PANEL_ID = 'ape-stability-console';
    /** Same-origin routes served by the Host half. */
    const API_STATE = '/ape-stability-console/api/state';
    const API_GATE = '/ape-stability-console/api/gate';

    const en = {
      'panel.label': 'APE Stability',
      title: 'APE Stability Console',
      subtitle:
        'Read-only console over the production infra: service availability, projection of the served list, per-channel stability and failover. It shows what it measured and names what it could not.',
      refresh: 'Refresh',
      loading: 'Loading…',
      measuring: 'Reading the VPS (read-only)…',
      'unavailable.title': 'Host half not reachable',
      'unavailable.body':
        'The panel could not read /ape-stability-console/api/state. That endpoint is served by this bundle Host half, so the plugin is probably loaded without it, or the route failed. Nothing is shown as a number because nothing was measured.',
      'notprobed.title': 'Not measured yet',
      'notprobed.body':
        'The first paint does not run the read-only VPS probe, so the page opens immediately. The panel runs it in a second request; if it never arrives, the reason appears here.',
      'card.availability': 'Availability',
      'card.projection': 'Projection — gate [11]',
      'card.stability': 'Stability',
      'card.failover': 'Failover and errors',
      'svc.unit': 'Unit',
      'svc.state': 'State',
      'svc.timers': 'ape-* timers',
      'svc.timersCount': 'timers listed',
      'svc.deadTimers': 'Declared but NOT armed',
      'svc.watchdog': 'Module watchdog',
      'svc.watchdogVerdict': 'verdict',
      'svc.fallos': 'failures',
      'svc.modules': 'modules',
      'svc.module': 'Module',
      'svc.detail': 'Detail',
      'proj.gate': 'Last gate measurement',
      'proj.gateTs': 'measured at',
      'proj.gateDetail': 'detail',
      'proj.expected': 'expected',
      'proj.live': 'Live recount of the file',
      'proj.measure': 'Measure now',
      'proj.measuring': 'Counting the file…',
      'proj.bytes': 'bytes',
      'proj.channels': 'channels',
      'proj.tags': 'tags',
      'proj.ape': 'APE lines',
      'proj.age': 'age (s)',
      'proj.path': 'file',
      'proj.consistent': 'consistent: channels > 0, one tag per channel, zero APE lines',
      'proj.inconsistent': 'INCONSISTENT with the gate contract',
      'proj.notMeasured': 'not re-counted in this read',
      'stab.formula': 'formula',
      'stab.channels': 'channels in window',
      'stab.withEvidence': 'with n >= 30',
      'stab.samples': 'pulse samples',
      'stab.window': 'log window (lines)',
      'stab.verdicts': 'verdicts',
      'stab.col.channel': 'Channel',
      'stab.col.n': 'n',
      'stab.col.A': 'A',
      'stab.col.L': 'L',
      'stab.col.C': 'C',
      'stab.col.F': 'F',
      'stab.col.score': 'Score',
      'stab.col.verdict': 'Verdict',
      'stab.col.reason': 'Reason / what is missing',
      'stab.none': 'no computado',
      'stab.attribution': 'Segment attribution (component C)',
      'stab.freshness': 'Freshness (component F)',
      'stab.blocks': 'provider blocks',
      'fail.errfile': 'Error log',
      'fail.errMeasured': 'what this file is',
      'fail.totalError': '[error] lines',
      'fail.fastcgi': 'FastCGI stderr lines',
      'fail.network': 'real network events',
      'fail.note': 'reading',
      'fail.lastlines': 'Last network events',
      'fail.window': 'Access window classification',
      'fail.providerBlock': 'provider blocking (401/403/407/429/451/461)',
      'fail.5xx': '5xx',
      'fail.excluded': '499 — operator zapping, excluded',
      'fail.histogram': 'status histogram',
      'fail.armed': 'Failover armed',
      'fail.armedYes': 'yes',
      'fail.armedNo': 'no',
      'fail.multiBackend': 'backend failover (upstream + backup)',
      'fail.directives': 'directives',
      'fail.upstreamBlocks': 'upstream blocks',
      'fail.backups': 'backup servers',
      'fail.cacheStale': 'proxy_cache_use_stale',
      'fail.reason': 'reason',
      'evidence.title': 'Evidence of this read',
      'evidence.command': 'command',
      'evidence.duration': 'duration (ms)',
      'evidence.cached': 'served from the 30 s local cache',
      'evidence.workspace': 'workspace root',
      'evidence.attempts': 'ssh attempts',
      'evidence.nocomputado': 'Not computed, with its reason',
      'note.title': 'Honest scope',
      'note.body':
        'This panel only reads: systemctl is-active/list-timers/list-units, stat, grep -c, tail and nginx -T over ssh. It never starts, stops, restarts or reloads anything, never writes a file and never touches the M3U8 generator or the served list. A missing measurement is reported as missing, never replaced with sample data.',
    };

    const es = {
      'panel.label': 'Estabilidad APE',
      title: 'Consola de Estabilidad APE',
      subtitle:
        'Consola de solo lectura sobre la infraestructura real: disponibilidad de servicios, proyeccion de la lista servida, estabilidad por canal y failover. Muestra lo que midio y nombra lo que no pudo medir.',
      refresh: 'Actualizar',
      loading: 'Cargando…',
      measuring: 'Leyendo el VPS (solo lectura)…',
      'unavailable.title': 'Mitad Host inalcanzable',
      'unavailable.body':
        'El panel no pudo leer /ape-stability-console/api/state. Ese endpoint lo sirve la mitad Host de este bundle, asi que el plugin esta cargado sin ella o la ruta fallo. No se muestra ningun numero porque no se midio ninguno.',
      'notprobed.title': 'Todavia sin medir',
      'notprobed.body':
        'La primera pintura no lanza el sondeo read-only al VPS, para que la pagina abra al instante. El panel lo lanza en una segunda peticion; si nunca llega, la razon aparece aqui.',
      'card.availability': 'Disponibilidad',
      'card.projection': 'Proyeccion — gate [11]',
      'card.stability': 'Estabilidad',
      'card.failover': 'Failover y errores',
      'svc.unit': 'Unidad',
      'svc.state': 'Estado',
      'svc.timers': 'timers ape-*',
      'svc.timersCount': 'timers listados',
      'svc.deadTimers': 'Declarados pero NO armados',
      'svc.watchdog': 'Vigilante de modulos',
      'svc.watchdogVerdict': 'veredicto',
      'svc.fallos': 'fallos',
      'svc.modules': 'modulos',
      'svc.module': 'Modulo',
      'svc.detail': 'Detalle',
      'proj.gate': 'Ultima medicion del gate',
      'proj.gateTs': 'medido a las',
      'proj.gateDetail': 'detalle',
      'proj.expected': 'esperado',
      'proj.live': 'Recuento en vivo del fichero',
      'proj.measure': 'Medir ahora',
      'proj.measuring': 'Contando el fichero…',
      'proj.bytes': 'bytes',
      'proj.channels': 'canales',
      'proj.tags': 'tags',
      'proj.ape': 'lineas APE',
      'proj.age': 'antiguedad (s)',
      'proj.path': 'fichero',
      'proj.consistent': 'consistente: canales > 0, un tag por canal, cero lineas APE',
      'proj.inconsistent': 'INCONSISTENTE con el contrato del gate',
      'proj.notMeasured': 'no recontado en esta lectura',
      'stab.formula': 'formula',
      'stab.channels': 'canales en la ventana',
      'stab.withEvidence': 'con n >= 30',
      'stab.samples': 'muestras de pulse',
      'stab.window': 'ventana del log (lineas)',
      'stab.verdicts': 'veredictos',
      'stab.col.channel': 'Canal',
      'stab.col.n': 'n',
      'stab.col.A': 'A',
      'stab.col.L': 'L',
      'stab.col.C': 'C',
      'stab.col.F': 'F',
      'stab.col.score': 'Score',
      'stab.col.verdict': 'Veredicto',
      'stab.col.reason': 'Razon / que falta',
      'stab.none': 'no computado',
      'stab.attribution': 'Atribucion de segmentos (componente C)',
      'stab.freshness': 'Frescura (componente F)',
      'stab.blocks': 'bloqueos del proveedor',
      'fail.errfile': 'Log de errores',
      'fail.errMeasured': 'que es este fichero',
      'fail.totalError': 'lineas [error]',
      'fail.fastcgi': 'lineas FastCGI stderr',
      'fail.network': 'eventos de red reales',
      'fail.note': 'lectura',
      'fail.lastlines': 'Ultimos eventos de red',
      'fail.window': 'Clasificacion de la ventana de acceso',
      'fail.providerBlock': 'bloqueo del proveedor (401/403/407/429/451/461)',
      'fail.5xx': '5xx',
      'fail.excluded': '499 — zapping del operador, excluido',
      'fail.histogram': 'histograma de estados',
      'fail.armed': 'Failover armado',
      'fail.armedYes': 'si',
      'fail.armedNo': 'no',
      'fail.multiBackend': 'failover entre backends (upstream + backup)',
      'fail.directives': 'directivas',
      'fail.upstreamBlocks': 'bloques upstream',
      'fail.backups': 'servidores backup',
      'fail.cacheStale': 'proxy_cache_use_stale',
      'fail.reason': 'razon',
      'evidence.title': 'Evidencia de esta lectura',
      'evidence.command': 'comando',
      'evidence.duration': 'duracion (ms)',
      'evidence.cached': 'servido desde la cache local de 30 s',
      'evidence.workspace': 'raiz del workspace',
      'evidence.attempts': 'intentos ssh',
      'evidence.nocomputado': 'No computado, con su razon',
      'note.title': 'Alcance honesto',
      'note.body':
        'Este panel solo lee: systemctl is-active/list-timers/list-units, stat, grep -c, tail y nginx -T por ssh. Nunca arranca, para, reinicia ni recarga nada, no escribe ficheros y no toca el generador M3U8 ni la lista servida. Una medicion ausente se declara ausente, nunca se sustituye por datos de ejemplo.',
    };

    /* -------------------------------------------------------------- styling */

    const S = {
      page: { width: '100%', height: '100%', overflow: 'auto', background: 'var(--dsw-alias-bg-layer-1)' },
      wrap: {
        maxWidth: '1180px',
        margin: '0 auto',
        padding: '28px 24px 56px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontFamily: 'inherit',
      },
      titleRow: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
      title: { margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      subtitle: {
        margin: 0,
        fontSize: '13px',
        lineHeight: 1.55,
        color: 'var(--dsw-alias-label-secondary)',
        maxWidth: '86ch',
      },
      card: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 'var(--dsw-radius-lg)',
        background: 'var(--dsw-alias-bg-layer-2)',
        overflow: 'hidden',
      },
      cardHead: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        flexWrap: 'wrap',
      },
      cardTitle: { fontSize: '14px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      cardBody: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' },
      th: {
        textAlign: 'left',
        padding: '6px 8px',
        color: 'var(--dsw-alias-label-tertiary)',
        fontWeight: 600,
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        whiteSpace: 'nowrap',
      },
      td: {
        padding: '6px 8px',
        color: 'var(--dsw-alias-label-secondary)',
        borderBottom: '1px solid var(--dsw-alias-border-l2)',
        verticalAlign: 'top',
      },
      val: { color: 'var(--dsw-alias-label-primary)', fontFamily: 'var(--ds-font-family-code, monospace)' },
      kv: { display: 'grid', gridTemplateColumns: 'minmax(140px, 220px) 1fr', gap: '6px 14px', fontSize: '12.5px' },
      key: { color: 'var(--dsw-alias-label-tertiary)' },
      small: { margin: 0, fontSize: '12px', lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)' },
      btn: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 'var(--dsw-radius-sm)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        padding: '5px 12px',
        fontSize: '12.5px',
        cursor: 'pointer',
      },
      pre: {
        margin: 0,
        padding: '10px 12px',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l1)',
        fontFamily: 'var(--ds-font-family-code, monospace)',
        fontSize: '11.5px',
        lineHeight: 1.5,
        color: 'var(--dsw-alias-label-secondary)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: '220px',
        overflow: 'auto',
      },
      note: {
        fontSize: '12px',
        lineHeight: 1.55,
        color: 'var(--dsw-alias-label-tertiary)',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
        paddingTop: '10px',
      },
      error: { fontSize: '12.5px', color: 'var(--dsw-alias-label-primary)', lineHeight: 1.55 },
      list: { margin: 0, paddingLeft: '18px', fontSize: '12px', lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)' },
    };

    function Chip(props) {
      const tone = props.tone || 'neutral';
      const map = {
        good: 'var(--dsw-alias-state-business-primary)',
        bad: '#d9534f',
        warn: '#c8862b',
        neutral: 'var(--dsw-alias-label-tertiary)',
      };
      return h(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '2px 8px',
            borderRadius: '999px',
            border: `1px solid ${map[tone] || map.neutral}`,
            color: map[tone] || map.neutral,
            fontSize: '11.5px',
            lineHeight: 1.5,
            whiteSpace: 'nowrap',
          },
        },
        props.children,
      );
    }

    function Card(props) {
      return h(
        'section',
        { style: S.card },
        h(
          'div',
          { style: S.cardHead },
          h('span', { style: S.cardTitle }, props.title),
          props.right ? h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '6px' } }, props.right) : null,
        ),
        h('div', { style: S.cardBody }, props.children),
      );
    }

    function KeyVals(props) {
      const rows = (props.rows || []).filter((row) => row && row.value !== undefined && row.value !== null);
      if (!rows.length) return null;
      return h(
        'div',
        { style: S.kv },
        ...rows.flatMap((row, index) => [
          h('div', { key: `k${index}`, style: S.key }, row.label),
          h('div', { key: `v${index}`, style: row.mono ? S.val : { color: 'var(--dsw-alias-label-primary)' } }, row.value),
        ]),
      );
    }

    function NotComputed(props) {
      return h(
        'div',
        { style: S.small },
        h('strong', null, `${props.label || 'no computado'}: `),
        props.reason || '—',
      );
    }

    const ICON_PATHS = [
      ['rect', { x: 6, y: 8, width: 52, height: 34, rx: 6 }],
      ['path', { d: 'M10 34h8l5-13 6 22 6-16 5 7h14' }],
      ['path', { d: 'M24 50h16' }],
      ['path', { d: 'M32 42v8' }],
    ];

    function ConsoleIcon(props) {
      const size = (props && props.size) || 18;
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
          'aria-hidden': 'true',
        },
        ...ICON_PATHS.map(([tag, attrs], index) => h(tag, { key: index, ...attrs })),
      );
    }

    function fmt(value, digits) {
      if (value === null || value === undefined) return '—';
      if (typeof value === 'number') {
        return Number.isInteger(value) ? String(value) : value.toFixed(digits === undefined ? 3 : digits);
      }
      return String(value);
    }

    function tsShort(value) {
      if (!value) return '—';
      return String(value).replace('T', ' ').replace('Z', 'Z');
    }

    /* ------------------------------------------------------------------ api */

    function readJson(response) {
      return response.text().then((text) => {
        try {
          return { ok: true, value: JSON.parse(text) };
        } catch (error) {
          return { ok: false, reason: `respuesta no JSON (HTTP ${response.status}): ${text.slice(0, 180)}` };
        }
      });
    }

    function callApi(path, options) {
      return fetch(path, options).then((response) =>
        readJson(response).then((parsed) => {
          if (!response.ok) throw new Error(parsed.ok ? `HTTP ${response.status}` : parsed.reason);
          if (!parsed.ok) throw new Error(parsed.reason);
          return parsed.value;
        }),
      );
    }

    /* ----------------------------------------------------------------- cards */

    function AvailabilityCard(props) {
      const t = props.t;
      const data = props.data;
      if (!data || data.status === 'no_computado') {
        return h(
          Card,
          { title: t('card.availability'), right: h(Chip, { tone: 'warn' }, t('stab.none')) },
          h(NotComputed, { reason: data ? data.reason : '—' }),
        );
      }
      const dead = data.timers.deadTimers || [];
      return h(
        Card,
        {
          title: t('card.availability'),
          right: [
            h(Chip, { key: 'svc', tone: data.servicesOk === data.services.length ? 'good' : 'bad' },
              `${data.servicesOk}/${data.services.length}`),
            h(Chip, { key: 'timers', tone: dead.length ? 'warn' : 'good' }, `${data.timers.count} timers`),
          ],
        },
        h(
          'table',
          { style: S.table },
          h('thead', null, h('tr', null, h('th', { style: S.th }, t('svc.unit')), h('th', { style: S.th }, t('svc.state')))),
          h(
            'tbody',
            null,
            ...data.services.map((row) =>
              h(
                'tr',
                { key: row.unit },
                h('td', { style: { ...S.td, ...S.val } }, row.unit),
                h(
                  'td',
                  { style: S.td },
                  h(Chip, { tone: row.ok ? 'good' : 'bad' }, row.state),
                ),
              ),
            ),
          ),
        ),
        h(
          'div',
          null,
          h('div', { style: S.key }, `${t('svc.timers')} — ${data.timers.count} ${t('svc.timersCount')}`),
          dead.length
            ? h(
                'div',
                { style: { marginTop: '6px' } },
                h('div', { style: S.key }, t('svc.deadTimers')),
                h('ul', { style: S.list }, ...dead.map((row, index) => h('li', { key: index }, `${row.name} → ${row.active}/${row.sub}`))),
              )
            : h('div', { style: S.small }, `${t('svc.deadTimers')}: 0`),
        ),
        data.watchdog && data.watchdog.status === 'found'
          ? h(
              'div',
              null,
              h(
                'div',
                { style: S.key },
                `${t('svc.watchdog')} — ${t('svc.watchdogVerdict')} ${data.watchdog.verdict} · ${t('svc.fallos')} ${data.watchdog.fallos} · ${data.watchdog.modules.length} ${t('svc.modules')} · ${tsShort(data.watchdog.ts)}`,
              ),
              h(
                'table',
                { style: { ...S.table, marginTop: '6px' } },
                h('thead', null, h('tr', null, h('th', { style: S.th }, t('svc.module')), h('th', { style: S.th }, t('svc.state')), h('th', { style: S.th }, t('svc.detail')))),
                h(
                  'tbody',
                  null,
                  ...data.watchdog.modules.map((row) =>
                    h(
                      'tr',
                      { key: row.module },
                      h('td', { style: { ...S.td, ...S.val } }, row.module),
                      h('td', { style: S.td }, row.status),
                      h('td', { style: S.td }, row.detail),
                    ),
                  ),
                ),
              ),
            )
          : h(NotComputed, { label: t('svc.watchdog'), reason: data.watchdog ? data.watchdog.reason : '—' }),
      );
    }

    function ProjectionCard(props) {
      const t = props.t;
      const data = props.data;
      if (!data) {
        return h(Card, { title: t('card.projection') }, h(NotComputed, { reason: t('notprobed.body') }));
      }
      const gate = data.gate;
      const live = data.live;
      return h(
        Card,
        {
          title: t('card.projection'),
          right: [
            gate && gate.verdict
              ? h(Chip, { key: 'g', tone: gate.verdict === 'ok' ? 'good' : 'bad' }, `gate [11]: ${gate.verdict}`)
              : h(Chip, { key: 'g', tone: 'warn' }, t('stab.none')),
            h(
              'button',
              { key: 'm', type: 'button', onClick: props.onMeasure, style: S.btn, disabled: props.running },
              props.running ? t('proj.measuring') : t('proj.measure'),
            ),
          ],
        },
        gate && gate.status === 'computed'
          ? h(KeyVals, {
              rows: [
                { label: t('proj.gate'), value: gate.verdict, mono: true },
                { label: t('proj.gateTs'), value: tsShort(gate.ts), mono: true },
                { label: t('proj.gateDetail'), value: gate.detail, mono: true },
                { label: t('proj.expected'), value: gate.expected, mono: true },
              ],
            })
          : h(NotComputed, { label: t('proj.gate'), reason: gate ? gate.reason : '—' }),
        live && live.status === 'computed'
          ? h(
              'div',
              null,
              h(
                'div',
                { style: S.key },
                `${t('proj.live')} — ${live.consistent ? t('proj.consistent') : t('proj.inconsistent')}`,
              ),
              h(KeyVals, {
                rows: [
                  { label: t('proj.bytes'), value: fmt(live.bytes), mono: true },
                  { label: t('proj.channels'), value: fmt(live.channels), mono: true },
                  { label: t('proj.tags'), value: `${fmt(live.tags)} (#EXTSHIMOTT)`, mono: true },
                  { label: t('proj.ape'), value: fmt(live.apeLines), mono: true },
                  { label: t('proj.age'), value: fmt(live.ageSeconds), mono: true },
                  { label: t('proj.path'), value: live.path, mono: true },
                ],
              }),
            )
          : h(NotComputed, { label: t('proj.live'), reason: live ? live.reason : '—' }),
      );
    }

    function StabilityCard(props) {
      const t = props.t;
      const data = props.data;
      if (!data || data.status !== 'computed') {
        return h(
          Card,
          { title: t('card.stability'), right: h(Chip, { tone: 'warn' }, t('stab.none')) },
          h(NotComputed, { reason: data ? data.reason : '—' }),
        );
      }
      const verdictTone = (verdict) => {
        if (verdict === 'PASS') return 'good';
        if (verdict === 'FAIL') return 'bad';
        return 'warn';
      };
      return h(
        Card,
        {
          title: t('card.stability'),
          right: [
            h(Chip, { key: 'w', tone: data.withEvidence ? 'good' : 'warn' }, `${t('stab.withEvidence')}: ${data.withEvidence}`),
            h(Chip, { key: 's', tone: 'neutral' }, `${data.totalPulseSamples} ${t('stab.samples')}`),
          ],
        },
        h(KeyVals, {
          rows: [
            { label: t('stab.formula'), value: data.formula },
            { label: t('stab.channels'), value: `${data.channels}` },
            { label: t('stab.window'), value: `${data.windowLines}` },
            {
              label: t('stab.verdicts'),
              value: `PASS ${data.verdicts.PASS} · FAIL ${data.verdicts.FAIL} · SKIP ${data.verdicts.SKIP} · SIN_VEREDICTO ${data.verdicts.SIN_VEREDICTO}`,
              mono: true,
            },
          ],
        }),
        h(
          'table',
          { style: S.table },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { style: S.th }, t('stab.col.channel')),
              h('th', { style: S.th }, t('stab.col.n')),
              h('th', { style: S.th }, t('stab.col.A')),
              h('th', { style: S.th }, t('stab.col.L')),
              h('th', { style: S.th }, t('stab.col.C')),
              h('th', { style: S.th }, t('stab.col.F')),
              h('th', { style: S.th }, t('stab.blocks')),
              h('th', { style: S.th }, t('stab.col.score')),
              h('th', { style: S.th }, t('stab.col.verdict')),
              h('th', { style: S.th }, t('stab.col.reason')),
            ),
          ),
          h(
            'tbody',
            null,
            ...data.rows.map((row) =>
              h(
                'tr',
                { key: row.channel },
                h('td', { style: { ...S.td, ...S.val } }, row.channel),
                h('td', { style: S.td }, String(row.n)),
                h('td', { style: S.td }, fmt(row.A)),
                h('td', { style: S.td }, fmt(row.L)),
                h('td', { style: S.td }, row.C === null ? t('stab.none') : fmt(row.C)),
                h('td', { style: S.td }, row.F === null ? t('stab.none') : fmt(row.F)),
                h('td', { style: S.td }, String(row.bloqueoProveedor)),
                h('td', { style: { ...S.td, ...S.val } }, row.score === null ? '—' : fmt(row.score, 1)),
                h('td', { style: S.td }, h(Chip, { tone: verdictTone(row.veredicto) }, row.veredicto)),
                h('td', { style: S.td }, row.veredictoRazon),
              ),
            ),
          ),
        ),
        h('div', { style: S.small }, h('strong', null, `${t('stab.attribution')}: `), data.attribution.reason),
        h('div', { style: S.small }, h('strong', null, `${t('stab.freshness')}: `), data.freshness.reason),
      );
    }

    function FailoverCard(props) {
      const t = props.t;
      const data = props.data;
      if (!data || data.status !== 'computed') {
        return h(
          Card,
          { title: t('card.failover'), right: h(Chip, { tone: 'warn' }, t('stab.none')) },
          h(NotComputed, { reason: data ? data.reason : '—' }),
        );
      }
      const armed = data.failoverArmed;
      return h(
        Card,
        {
          title: t('card.failover'),
          right: [
            h(Chip, { key: 'a', tone: armed.armed ? 'good' : 'bad' }, `${t('fail.armed')}: ${armed.armed ? t('fail.armedYes') : t('fail.armedNo')}`),
            h(Chip, { key: 'b', tone: data.accessWindow.providerBlock ? 'warn' : 'neutral' },
              `${t('fail.providerBlock')}: ${data.accessWindow.providerBlock}`),
          ],
        },
        h(
          'div',
          null,
          h('div', { style: S.key }, `${t('fail.errfile')} — ${data.errorLog.file}`),
          h(KeyVals, {
            rows: [
              { label: t('fail.errMeasured'), value: data.errorLog.measured },
              { label: t('fail.totalError'), value: fmt(data.errorLog.totalError), mono: true },
              { label: t('fail.fastcgi'), value: fmt(data.errorLog.fastcgiStderr), mono: true },
              { label: t('fail.network'), value: fmt(data.errorLog.networkEvents), mono: true },
              { label: t('fail.note'), value: data.errorLog.note },
            ],
          }),
        ),
        data.lastNetworkLines.length
          ? h(
              'div',
              null,
              h('div', { style: S.key }, t('fail.lastlines')),
              h('pre', { style: S.pre }, ...data.lastNetworkLines.map((line, index) => h('div', { key: index }, line))),
            )
          : null,
        h(
          'div',
          null,
          h('div', { style: S.key }, t('fail.window')),
          h(KeyVals, {
            rows: [
              { label: t('fail.5xx'), value: fmt(data.accessWindow.serverErrors), mono: true },
              { label: t('fail.providerBlock'), value: fmt(data.accessWindow.providerBlock), mono: true },
              { label: t('fail.excluded'), value: fmt(data.accessWindow.excluded), mono: true },
            ],
          }),
          h(
            'div',
            { style: { ...S.small, marginTop: '6px' } },
            `${t('fail.histogram')}: `,
            ...data.accessWindow.histogram.slice(0, 12).map((row, index) =>
              h('span', { key: index }, `${row.status}×${row.count}${index < 11 ? ' · ' : ''}`),
            ),
          ),
          h('div', { style: { ...S.small, marginTop: '4px' } }, data.accessWindow.note),
        ),
        h(
          'div',
          null,
          h('div', { style: S.key }, t('fail.armed')),
          h(KeyVals, {
            rows: [
              { label: t('fail.multiBackend'), value: armed.multiBackend ? t('fail.armedYes') : t('fail.armedNo') },
              { label: t('fail.directives'), value: (armed.nextUpstreamDirectives || []).join(' ') || '—', mono: true },
              { label: t('fail.upstreamBlocks'), value: fmt(armed.upstreamBlocks), mono: true },
              { label: t('fail.backups'), value: fmt(armed.backupServers), mono: true },
              { label: t('fail.cacheStale'), value: fmt(armed.cacheUseStale), mono: true },
              { label: t('fail.reason'), value: armed.reason },
            ],
          }),
        ),
      );
    }

    function EvidenceCard(props) {
      const t = props.t;
      const state = props.state;
      if (!state) return null;
      const remote = state.remote || null;
      return h(
        Card,
        { title: t('evidence.title') },
        h(KeyVals, {
          rows: [
            remote && remote.command ? { label: t('evidence.command'), value: `${remote.command.target} · ${remote.command.mode}`, mono: true } : null,
            remote && remote.durationMs !== undefined ? { label: t('evidence.duration'), value: String(remote.durationMs), mono: true } : null,
            remote && remote.attempts ? { label: t('evidence.attempts'), value: JSON.stringify(remote.attempts) } : null,
            remote && remote.cached ? { label: t('evidence.cached'), value: t('fail.armedYes') } : null,
            state.workspace ? { label: t('evidence.workspace'), value: state.workspace.root, mono: true } : null,
            { label: 'generatedAt', value: tsShort(state.generatedAt), mono: true },
          ],
        }),
        Array.isArray(state.noComputado) && state.noComputado.length
          ? h(
              'div',
              null,
              h('div', { style: S.key }, t('evidence.nocomputado')),
              h('ul', { style: S.list }, ...state.noComputado.map((line, index) => h('li', { key: index }, line))),
            )
          : null,
        Array.isArray(state.localLists)
          ? h(
              'div',
              { style: S.small },
              ...state.localLists.map((row, index) =>
                h('div', { key: index }, `${row.relative}: ${row.status}${row.bytes !== undefined ? ` · ${row.bytes} B` : ''}${row.reason ? ` (${row.reason})` : ''}`),
              ),
            )
          : null,
      );
    }

    /* ------------------------------------------------------------------ page */

    function ApeStabilityConsolePage(props) {
      const t = props.t;
      const [state, setState] = useState(null);
      const [stateError, setStateError] = useState(null);
      const [loading, setLoading] = useState(true);
      const [measuring, setMeasuring] = useState(false);
      const [gateRunning, setGateRunning] = useState(false);
      const [gateError, setGateError] = useState(null);
      const alive = useRef(true);

      useEffect(() => {
        alive.current = true;
        return () => {
          alive.current = false;
        };
      }, []);

      const load = useCallback((options) => {
        const params = new URLSearchParams();
        params.set('probe', options && options.probe ? '1' : '0');
        if (options && options.gate) params.set('gate', '1');
        if (options && options.refresh) params.set('refresh', '1');
        return callApi(`${API_STATE}?${params.toString()}`, { headers: { accept: 'application/json' } });
      }, []);

      const refresh = useCallback(() => {
        setLoading(true);
        load({ probe: false })
          .then((value) => {
            if (!alive.current) return;
            setState(value);
            setStateError(null);
            setLoading(false);
            setMeasuring(true);
            load({ probe: true, refresh: true })
              .then((probed) => {
                if (!alive.current) return;
                setState(probed);
                setMeasuring(false);
              })
              .catch((error) => {
                if (!alive.current) return;
                setMeasuring(false);
                setStateError(String((error && error.message) || error));
              });
          })
          .catch((error) => {
            if (!alive.current) return;
            setState(null);
            setLoading(false);
            setStateError(String((error && error.message) || error));
          });
      }, [load]);

      useEffect(() => {
        refresh();
      }, [refresh]);

      const measureGate = useCallback(() => {
        setGateRunning(true);
        setGateError(null);
        callApi(API_GATE, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: '{}',
        })
          .then((value) => {
            if (!alive.current) return;
            setState(value);
            setGateRunning(false);
          })
          .catch((error) => {
            if (!alive.current) return;
            setGateRunning(false);
            setGateError(String((error && error.message) || error));
          });
      }, []);

      const status = state && state.status;
      const notProbed = status === 'not_probed';
      const notComputed = status === 'no_computado';

      return h(
        'div',
        { style: S.page },
        h(
          'div',
          { style: S.wrap },
          h(
            'div',
            { style: S.titleRow },
            h('span', { style: { color: 'var(--dsw-alias-state-business-primary)', display: 'flex' } }, h(ConsoleIcon, { size: 30 })),
            h('h1', { style: S.title }, t('title')),
            h(
              'span',
              { style: { marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' } },
              loading ? h(Chip, null, t('loading')) : null,
              measuring ? h(Chip, { tone: 'warn' }, t('measuring')) : null,
              gateRunning ? h(Chip, { tone: 'warn' }, t('proj.measuring')) : null,
              h('button', { type: 'button', onClick: refresh, style: S.btn }, t('refresh')),
            ),
          ),
          h('p', { style: S.subtitle }, t('subtitle')),

          stateError
            ? h(
                Card,
                { title: t('unavailable.title'), right: h(Chip, { tone: 'bad' }, t('stab.none')) },
                h('div', { style: S.error }, t('unavailable.body'), h('div', { style: { marginTop: '8px' } }, stateError)),
              )
            : null,

          notProbed
            ? h(Card, { title: t('notprobed.title') }, h('div', { style: S.error }, t('notprobed.body')))
            : null,

          notComputed && state
            ? h(Card, { title: t('unavailable.title') }, h('div', { style: S.error }, state.reason || '—'))
            : null,

          gateError
            ? h(Card, { title: t('card.projection') }, h('div', { style: S.error }, gateError))
            : null,

          h(AvailabilityCard, { t, data: state ? state.availability : null }),
          h(ProjectionCard, {
            t,
            data: state ? state.projection : null,
            onMeasure: measureGate,
            running: gateRunning,
          }),
          h(StabilityCard, { t, data: state ? state.stability : null }),
          h(FailoverCard, { t, data: state ? state.failover : null }),
          h(EvidenceCard, { t, state }),

          h('div', { style: S.note }, h('strong', null, `${t('note.title')}: `), t('note.body')),
        ),
      );
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, 'en', en), 'ape-stability-console: english dictionary');
      ctx.effect(() => ctx.locale.register(NS, 'es', es), 'ape-stability-console: spanish dictionary');
      const t = ctx.locale.bind(NS);

      // Left sidebar entry. The id doubles as the `main` key it selects.
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 23,
            locale: NS,
            label: () => t('panel.label'),
          },
          ConsoleIcon,
        ),
      );

      // The panel the sidebar row opens.
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, ApeStabilityConsolePage),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply,
      /** Exposed for the render smoke test; the page does not use it. */
      __testing: { PANEL_ID, NS, ApeStabilityConsolePage, ConsoleIcon },
    };
  },
});
