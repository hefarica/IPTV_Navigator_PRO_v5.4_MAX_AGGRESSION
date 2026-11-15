/**
 * Client half of the APE Profile Studio bundle.
 *
 * Registers, on the live Web page:
 *   1. a `sidebar.panellist` entry (icon + localized label) — the left sidebar row,
 *   2. the matching `main` keyed panel.
 *
 * The panel is a read-only studio over three measured sources:
 *   - `contracts/ape_profiles_12.json` (the 12-profile contract) via the Host half,
 *   - the project classifier `vps/bin/ape-profile-classifier.js`, invoked by the
 *     Host half for a pasted `#EXTINF` block,
 *   - the public served list, probed by the Host half (HEAD + Range sample).
 *
 * Every number shown comes from the Host response. Anything the Host could not
 * measure is rendered as `no computado` next to its exact reason; this file
 * never fills a gap with a guess, and it never writes anything.
 *
 * Text goes through the Client locale service; styling uses host theme tokens
 * (`--dsw-alias-*`, `--dsw-radius-*`, `--ds-font-family-code`) only.
 */
window.__ModuleLoader__.load({
  id: '@local/ape-profile-studio',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    /** Client locale namespace owned by this plugin. */
    const NS = 'apeProfileStudio';
    /** Sidebar list id; the same string is the `main` key the row selects. */
    const PANEL_ID = 'ape-profile-studio';
    /** Same-origin routes served by the Host half. */
    const API_STATE = '/ape-profile-studio/api/state';
    const API_CLASSIFY = '/ape-profile-studio/api/classify';

    const en = {
      'panel.label': 'APE Profile Studio',
      title: 'APE Profile Studio',
      subtitle:
        'Read-only studio over the APE ecosystem: the profile contract, the per-channel classifier and the state of the served list. It shows what it measured; everything else says so.',
      refresh: 'Refresh',
      probing: 'Measuring the served list…',
      loading: 'Reading the workspace…',
      'unavailable.title': 'Host half not reachable',
      'unavailable.body':
        'The panel could not read /ape-profile-studio/api/state. That endpoint is served by this bundle Host half, so the plugin is probably loaded without it, or the route failed. Nothing is shown as a number because nothing was measured.',
      'contract.title': 'Profile contract',
      'contract.found': 'found',
      'contract.missing.title': 'Contract not found',
      'contract.missing.body':
        'contracts/ape_profiles_12.json does not exist in the workspace yet, so this panel shows no profiles. Profiles are never invented here: the table fills itself when the contract exists.',
      'contract.count': 'profiles listed',
      'contract.declared': 'declared',
      'contract.mismatch':
        'The document declares a different count than the rows it lists. Both numbers are shown as read, not reconciled.',
      'contract.extra': 'extra fields in the contract',
      'contract.shape': 'shape',
      'contract.notes': 'Notes carried by the contract',
      'col.id': 'ID',
      'col.name': 'Name',
      'col.level': 'Level',
      'col.tier': 'Tier / quality',
      'col.resolution': 'Resolution',
      'col.fps': 'fps',
      'col.hdr': 'HDR',
      'col.codec': 'Codec',
      'col.fallback': 'Fallback',
      'col.channels': 'Channels',
      'contract.error.invalid': 'The contract exists but is not valid JSON',
      'contract.error.shape': 'The contract exists but its shape is not recognised',
      'contract.error.keys': 'keys seen',
      'classifier.title': 'Classifier',
      'classifier.found': 'classifier found',
      'classifier.missing':
        'The classifier does not exist yet, so no classification is possible. The panel will call it as soon as the file appears; it does not simulate a result.',
      'classifier.placeholder':
        'Paste one channel block: the #EXTINF line with its tags and the stream URL.',
      'classifier.run': 'Classify',
      'classifier.running': 'Classifying…',
      'classifier.empty': 'Paste a block first: the input is empty.',
      'classifier.result': 'Classification result',
      'classifier.profile': 'Profile',
      'classifier.fallback': 'Fallback',
      'classifier.confidence': 'Confidence',
      'classifier.score': 'Score',
      'classifier.signals': 'Classifier signals',
      'classifier.input': 'Channel read from the block',
      'classifier.reason': 'Reason',
      'classifier.via': 'interface',
      'classifier.failed': 'The classification did not produce a result',
      'classifier.tried': 'interfaces tried',
      'classifier.none': 'not reported',
      'list.title': 'Served list',
      'list.url': 'URL',
      'list.source': 'URL source',
      'list.status': 'State',
      'list.measure': 'Measure',
      'list.computed': 'measured',
      'list.nocomputed': 'no computado',
      'list.notprobed': 'not probed yet',
      'list.http': 'HTTP status',
      'list.type': 'content-type',
      'list.bytes': 'content-length',
      'list.etag': 'etag',
      'list.lastmod': 'last-modified',
      'list.sample': 'Head sample',
      'list.sampleLines': 'lines sampled',
      'list.sampleExtinf': 'tags sampled',
      'list.sampleBytes': 'bytes sampled',
      'list.sampleRange': 'range accepted',
      'list.fullCount': 'full channel count',
      'list.attempts': 'attempts',
      'list.reason': 'reason',
      'evidence.title': 'Measured artifacts',
      'evidence.artifact': 'Artifact',
      'evidence.state': 'State',
      'evidence.bytes': 'bytes',
      'evidence.sha': 'sha256',
      'evidence.root': 'workspace root',
      'evidence.rootNote':
        'Relative paths resolve against that root. Set APE_PROFILE_STUDIO_WORKSPACE to override it, and APE_PROFILE_STUDIO_LIST_URL to point at another list.',
      'evidence.yes': 'found',
      'evidence.no': 'not found',
      'note.title': 'Honest scope',
      'note.body':
        'This panel only reads: it does not touch the M3U8 generator, the served list, the Harness runtime or any profile file. A missing artifact is reported as missing; it is never replaced with sample data.',
    };

    const es = {
      'panel.label': 'APE Profile Studio',
      title: 'APE Profile Studio',
      subtitle:
        'Estudio de solo lectura sobre el ecosistema APE: el contrato de perfiles, el clasificador por canal y el estado de la lista servida. Muestra lo que midio; lo que no, lo declara.',
      refresh: 'Actualizar',
      probing: 'Midiendo la lista servida…',
      loading: 'Leyendo el workspace…',
      'unavailable.title': 'Mitad Host inalcanzable',
      'unavailable.body':
        'El panel no pudo leer /ape-profile-studio/api/state. Ese endpoint lo sirve la mitad Host de este bundle, asi que el plugin esta cargado sin ella o la ruta fallo. No se muestra ningun numero porque no se midio ninguno.',
      'contract.title': 'Contrato de perfiles',
      'contract.found': 'encontrado',
      'contract.missing.title': 'Contrato no encontrado',
      'contract.missing.body':
        'contracts/ape_profiles_12.json todavia no existe en el workspace, asi que este panel no muestra perfiles. Aqui los perfiles no se inventan: la tabla se llena sola cuando el contrato exista.',
      'contract.count': 'perfiles listados',
      'contract.declared': 'declarados',
      'contract.mismatch':
        'El documento declara un numero distinto de filas de las que lista. Los dos numeros se muestran tal como se leyeron, sin reconciliar.',
      'contract.extra': 'campos adicionales del contrato',
      'contract.shape': 'forma',
      'contract.notes': 'Notas que trae el contrato',
      'col.id': 'ID',
      'col.name': 'Nombre',
      'col.level': 'Nivel',
      'col.tier': 'Tier / calidad',
      'col.resolution': 'Resolucion',
      'col.fps': 'fps',
      'col.hdr': 'HDR',
      'col.codec': 'Codec',
      'col.fallback': 'Fallback',
      'col.channels': 'Canales',
      'contract.error.invalid': 'El contrato existe pero no es JSON valido',
      'contract.error.shape': 'El contrato existe pero su forma no se reconoce',
      'contract.error.keys': 'claves vistas',
      'classifier.title': 'Clasificador',
      'classifier.found': 'clasificador encontrado',
      'classifier.missing':
        'El clasificador no existe todavia, asi que no hay clasificacion posible. El panel lo llamara en cuanto el fichero aparezca; no simula un resultado.',
      'classifier.placeholder':
        'Pega un bloque de canal: la linea #EXTINF con sus tags y la URL del stream.',
      'classifier.run': 'Clasificar',
      'classifier.running': 'Clasificando…',
      'classifier.empty': 'Pega primero un bloque: la entrada esta vacia.',
      'classifier.result': 'Resultado de la clasificacion',
      'classifier.profile': 'Perfil',
      'classifier.fallback': 'Fallback',
      'classifier.confidence': 'Confianza',
      'classifier.score': 'Score',
      'classifier.signals': 'Señales del clasificador',
      'classifier.input': 'Canal leido del bloque',
      'classifier.reason': 'Razon',
      'classifier.via': 'interfaz',
      'classifier.failed': 'La clasificacion no produjo resultado',
      'classifier.tried': 'interfaces probadas',
      'classifier.none': 'no reportado',
      'list.title': 'Lista servida',
      'list.url': 'URL',
      'list.source': 'origen de la URL',
      'list.status': 'Estado',
      'list.measure': 'Medir',
      'list.computed': 'medido',
      'list.nocomputed': 'no computado',
      'list.notprobed': 'sin sondear todavia',
      'list.http': 'estado HTTP',
      'list.type': 'content-type',
      'list.bytes': 'content-length',
      'list.etag': 'etag',
      'list.lastmod': 'last-modified',
      'list.sample': 'Muestra de cabecera',
      'list.sampleLines': 'lineas muestreadas',
      'list.sampleExtinf': 'tags muestreados',
      'list.sampleBytes': 'bytes muestreados',
      'list.sampleRange': 'range aceptado',
      'list.fullCount': 'conteo completo de canales',
      'list.attempts': 'intentos',
      'list.reason': 'razon',
      'evidence.title': 'Artefactos medidos',
      'evidence.artifact': 'Artefacto',
      'evidence.state': 'Estado',
      'evidence.bytes': 'bytes',
      'evidence.sha': 'sha256',
      'evidence.root': 'raiz del workspace',
      'evidence.rootNote':
        'Las rutas relativas se resuelven contra esa raiz. Ajusta APE_PROFILE_STUDIO_WORKSPACE para cambiarla y APE_PROFILE_STUDIO_LIST_URL para apuntar a otra lista.',
      'evidence.yes': 'encontrado',
      'evidence.no': 'no encontrado',
      'note.title': 'Alcance honesto',
      'note.body':
        'Este panel solo lee: no toca el generador M3U8, ni la lista servida, ni el runtime del Harness, ni ningun fichero de perfiles. Un artefacto ausente se reporta como ausente; nunca se sustituye por datos de ejemplo.',
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
        padding: '0 clamp(20px, 3.5vw, 44px) 48px',
        color: 'var(--dsw-alias-label-primary)',
      },
      wrap: { width: '100%', maxWidth: '1080px', boxSizing: 'border-box', paddingTop: '24px' },
      titleRow: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
      title: { margin: 0, fontSize: '20px', fontWeight: 600, lineHeight: '28px' },
      subtitle: {
        margin: '8px 0 0',
        fontSize: '13.5px',
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-secondary)',
        maxWidth: '760px',
      },
      toolbar: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '14px' },
      card: {
        marginTop: '18px',
        padding: '16px 18px',
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 'var(--dsw-radius-lg)',
      },
      cardHead: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
      },
      cardTitle: { margin: 0, fontSize: '15px', fontWeight: 600, lineHeight: '22px' },
      chip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11.5px',
        lineHeight: '18px',
        padding: '1px 8px',
        borderRadius: 'var(--dsw-radius-sm)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        whiteSpace: 'nowrap',
      },
      chipOk: {
        color: 'var(--dsw-alias-state-success-primary, var(--dsw-alias-label-primary))',
        borderColor: 'var(--dsw-alias-state-success-primary, var(--dsw-alias-border-l2))',
      },
      chipBad: {
        color: 'var(--dsw-alias-state-error-primary, var(--dsw-alias-label-primary))',
        borderColor: 'var(--dsw-alias-state-error-primary, var(--dsw-alias-border-l2))',
      },
      chipWarn: {
        color: 'var(--dsw-alias-state-warning-primary, var(--dsw-alias-label-primary))',
        borderColor: 'var(--dsw-alias-state-warning-primary, var(--dsw-alias-border-l2))',
      },
      kv: {
        display: 'grid',
        gridTemplateColumns: 'minmax(140px, max-content) 1fr',
        gap: '4px 14px',
        marginTop: '10px',
        fontSize: '12.5px',
        lineHeight: '19px',
      },
      key: { color: 'var(--dsw-alias-label-tertiary)' },
      val: {
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'var(--ds-font-family-code, monospace)',
        fontSize: '12px',
        wordBreak: 'break-all',
      },
      valPlain: { color: 'var(--dsw-alias-label-primary)', wordBreak: 'break-word' },
      table: { width: '100%', marginTop: '12px', borderCollapse: 'collapse', fontSize: '12.5px' },
      th: {
        textAlign: 'left',
        padding: '7px 9px',
        fontSize: '11.5px',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-secondary)',
        borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        whiteSpace: 'nowrap',
      },
      td: {
        padding: '7px 9px',
        borderBottom: '0.5px solid var(--dsw-alias-border-l1)',
        verticalAlign: 'top',
        lineHeight: '1.5',
        wordBreak: 'break-word',
      },
      empty: {
        marginTop: '12px',
        padding: '14px 16px',
        borderRadius: 'var(--dsw-radius-md)',
        border: '0.5px dashed var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        fontSize: '13px',
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      textarea: {
        marginTop: '10px',
        width: '100%',
        minHeight: '96px',
        boxSizing: 'border-box',
        padding: '10px 12px',
        fontFamily: 'var(--ds-font-family-code, monospace)',
        fontSize: '12.5px',
        lineHeight: '1.6',
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 'var(--dsw-radius-md)',
        resize: 'vertical',
      },
      btn: {
        padding: '5px 12px',
        fontSize: '12.5px',
        fontFamily: 'inherit',
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '0.5px solid var(--dsw-alias-border-l2)',
        borderRadius: 'var(--dsw-radius-sm)',
        cursor: 'pointer',
      },
      btnPrimary: {
        padding: '5px 14px',
        fontSize: '12.5px',
        fontFamily: 'inherit',
        color: 'var(--dsw-alias-label-inverse, #fff)',
        background: 'var(--dsw-alias-state-business-primary)',
        border: '0.5px solid var(--dsw-alias-state-business-primary)',
        borderRadius: 'var(--dsw-radius-sm)',
        cursor: 'pointer',
      },
      btnDisabled: {
        padding: '5px 14px',
        fontSize: '12.5px',
        fontFamily: 'inherit',
        color: 'var(--dsw-alias-label-tertiary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: 'var(--dsw-radius-sm)',
        cursor: 'not-allowed',
      },
      subhead: {
        margin: '14px 0 0',
        fontSize: '11.5px',
        fontWeight: 600,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)',
      },
      small: {
        margin: '8px 0 0',
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-tertiary)',
      },
      warn: {
        margin: '10px 0 0',
        padding: '9px 12px',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderLeft: '3px solid var(--dsw-alias-state-warning-primary, var(--dsw-alias-border-l2))',
        fontSize: '12.5px',
        lineHeight: '19px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      error: {
        margin: '10px 0 0',
        padding: '9px 12px',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderLeft: '3px solid var(--dsw-alias-state-error-primary, var(--dsw-alias-border-l2))',
        fontSize: '12.5px',
        lineHeight: '19px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      note: {
        marginTop: '24px',
        paddingTop: '14px',
        borderTop: '0.5px solid var(--dsw-alias-border-l1)',
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-tertiary)',
      },
    };

    /** Sidebar glyph: a profile ladder inside a frame (original artwork). */
    function StudioIcon(props) {
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
        h('rect', { x: 10, y: 10, width: 44, height: 44, rx: 8 }),
        h('path', { d: 'M18 42h7' }),
        h('path', { d: 'M18 34h12' }),
        h('path', { d: 'M18 26h18' }),
        h('path', { d: 'M18 18h24' }),
      );
    }

    /* ------------------------------------------------------------- rendering */

    function Chip(props) {
      const tone = props.tone === 'ok' ? S.chipOk : props.tone === 'bad' ? S.chipBad : props.tone === 'warn' ? S.chipWarn : null;
      return h('span', { style: tone ? { ...S.chip, ...tone } : S.chip }, props.children);
    }

    function Card(props) {
      return h(
        'section',
        { style: S.card },
        h(
          'div',
          { style: S.cardHead },
          h('h2', { style: S.cardTitle }, props.title),
          props.right || null,
        ),
        props.children,
      );
    }

    function KeyValue(props) {
      const rows = props.rows.filter(Boolean);
      if (!rows.length) return null;
      return h(
        'div',
        { style: S.kv },
        rows.map((row, index) =>
          h(
            'div',
            { key: `k${index}`, style: { display: 'contents' } },
            h('span', { style: S.key }, row.label),
            h('span', { style: row.mono === false ? S.valPlain : S.val }, row.value),
          ),
        ),
      );
    }

    function shortHash(value) {
      return typeof value === 'string' && value.length > 16 ? `${value.slice(0, 16)}…` : value;
    }

    function displayValue(value) {
      if (value === null || value === undefined) return null;
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      try {
        return JSON.stringify(value);
      } catch (error) {
        return String(value);
      }
    }

    const CONTRACT_COLUMNS = [
      { field: 'id', labelKey: 'col.id' },
      { field: 'name', labelKey: 'col.name' },
      { field: 'level', labelKey: 'col.level' },
      { field: 'tier', labelKey: 'col.tier' },
      { field: 'resolution', labelKey: 'col.resolution' },
      { field: 'fps', labelKey: 'col.fps' },
      { field: 'hdr', labelKey: 'col.hdr' },
      { field: 'codec', labelKey: 'col.codec' },
      { field: 'fallback', labelKey: 'col.fallback' },
      { field: 'channels', labelKey: 'col.channels' },
    ];

    function ContractTable(props) {
      const t = props.t;
      const profiles = props.profiles;
      const columns = CONTRACT_COLUMNS.filter((column) =>
        profiles.some((profile) => profile.values[column.field] !== undefined),
      );
      if (!columns.length) {
        return h('p', { style: S.small }, 'rows present but none of the expected fields was found: ' +
          profiles.map((profile) => Object.keys(profile.extra).join(', ')).join(' | '));
      }
      return h(
        'div',
        { style: { width: '100%', overflowX: 'auto' } },
        h(
          'table',
          { style: S.table },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              columns.map((column) => h('th', { key: column.field, style: S.th }, t(column.labelKey))),
            ),
          ),
          h(
            'tbody',
            null,
            profiles.map((profile) =>
              h(
                'tr',
                { key: profile.key },
                columns.map((column) =>
                  h(
                    'td',
                    { key: column.field, style: S.td },
                    displayValue(profile.values[column.field]) ?? '—',
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    function ContractCard(props) {
      const t = props.t;
      const contract = props.contract;
      const status = contract ? contract.status : 'unknown';

      if (!contract || status === 'not_found') {
        return h(
          Card,
          { title: t('contract.title'), right: h(Chip, { tone: 'bad' }, t('evidence.no')) },
          h(
            'div',
            { style: S.empty },
            h('strong', null, t('contract.missing.title')),
            h('div', { style: { marginTop: '6px' } }, t('contract.missing.body')),
            contract && contract.relative
              ? h(
                  'div',
                  { style: { ...S.val, marginTop: '10px' } },
                  `${contract.relative} — ${contract.reason || ''}`,
                )
              : null,
          ),
        );
      }

      if (status !== 'found') {
        return h(
          Card,
          { title: t('contract.title'), right: h(Chip, { tone: 'warn' }, status) },
          h(
            'div',
            { style: S.error },
            h('strong', null, status === 'invalid_json' ? t('contract.error.invalid') : t('contract.error.shape')),
            contract.reason ? h('div', null, contract.reason) : null,
            Array.isArray(contract.keys) && contract.keys.length
              ? h('div', { style: { marginTop: '6px' } }, `${t('contract.error.keys')}: ${contract.keys.join(', ')}`)
              : null,
          ),
        );
      }

      const mismatch =
        typeof contract.declaredCount === 'number' && contract.declaredCount !== contract.count;

      return h(
        Card,
        {
          title: t('contract.title'),
          right: h(
            'span',
            { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
            h(Chip, { tone: 'ok' }, `${contract.count} ${t('contract.count')}`),
            mismatch
              ? h(Chip, { tone: 'warn' }, `${contract.declaredCount} ${t('contract.declared')}`)
              : null,
          ),
        },
        h(KeyValue, {
          rows: [
            { label: 'path', value: contract.relative },
            { label: t('contract.shape'), value: contract.shape },
            { label: 'bytes', value: String(contract.bytes) },
            { label: 'sha256', value: shortHash(contract.sha256) },
          ],
        }),
        mismatch ? h('div', { style: S.warn }, t('contract.mismatch')) : null,
        h(ContractTable, { t, profiles: contract.profiles }),
        (() => {
          const noted = contract.profiles.filter((profile) => profile.values.reason !== undefined);
          if (!noted.length) return null;
          return h(
            'div',
            { style: { marginTop: '12px' } },
            h('h3', { style: S.subhead }, t('contract.notes')),
            h(
              'ul',
              { style: { margin: '6px 0 0', paddingLeft: '18px', fontSize: '12.5px', lineHeight: '19px' } },
              noted.map((profile) =>
                h(
                  'li',
                  { key: profile.key },
                  h('strong', null, `${displayValue(profile.values.id) ?? profile.key}: `),
                  displayValue(profile.values.reason),
                ),
              ),
            ),
          );
        })(),
        contract.fields && contract.fields.extra && contract.fields.extra.length
          ? h(
              'p',
              { style: S.small },
              `${t('contract.extra')}: ${contract.fields.extra.join(', ')}`,
            )
          : null,
      );
    }

    function ClassifierCard(props) {
      const t = props.t;
      const classifier = props.classifier || {};
      const missing = classifier.status !== 'found';
      const result = props.result;

      return h(
        Card,
        {
          title: t('classifier.title'),
          right: h(
            Chip,
            { tone: missing ? 'bad' : 'ok' },
            missing ? t('evidence.no') : t('classifier.found'),
          ),
        },
        h(KeyValue, {
          rows: [
            classifier.relative ? { label: 'path', value: classifier.relative } : null,
            classifier.bytes ? { label: 'bytes', value: String(classifier.bytes) } : null,
            classifier.sha256 ? { label: 'sha256', value: shortHash(classifier.sha256) } : null,
          ],
        }),
        missing
          ? h('div', { style: S.empty }, t('classifier.missing'))
          : h(
              'div',
              null,
              h('textarea', {
                style: S.textarea,
                placeholder: t('classifier.placeholder'),
                spellCheck: false,
                value: props.value,
                onChange: (event) => props.onChange(event.target.value),
              }),
              h(
                'div',
                { style: { display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' } },
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: props.onRun,
                    disabled: props.running,
                    style: props.running ? S.btnDisabled : S.btnPrimary,
                  },
                  props.running ? t('classifier.running') : t('classifier.run'),
                ),
                props.inputError ? h('span', { style: { ...S.chip, ...S.chipWarn } }, props.inputError) : null,
              ),
            ),
        props.error ? h('div', { style: S.error }, props.error) : null,
        result
          ? h(
              'div',
              { style: { marginTop: '14px' } },
              h(
                'div',
                { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
                h('h3', { style: S.subhead }, t('classifier.result')),
                h(
                  Chip,
                  { tone: result.ok ? 'ok' : 'warn' },
                  result.ok ? String(result.via || 'ok') : result.status || t('classifier.failed'),
                ),
              ),
              result.ok
                ? h(
                    'div',
                    null,
                    h(KeyValue, {
                      rows: [
                        { label: t('classifier.profile'), value: displayValue(result.result.profile) ?? t('classifier.none') },
                        { label: t('classifier.fallback'), value: displayValue(result.result.fallback) ?? t('classifier.none') },
                        { label: t('classifier.confidence'), value: displayValue(result.result.confidence) ?? t('classifier.none') },
                        { label: t('classifier.score'), value: displayValue(result.result.score) ?? t('classifier.none') },
                        { label: t('classifier.reason'), value: displayValue(result.result.reason) ?? t('classifier.none'), mono: false },
                        { label: t('classifier.via'), value: String(result.via || '') },
                        result.input
                          ? {
                              label: t('classifier.input'),
                              value: [result.input.name, result.input.group].filter(Boolean).join(' · ') || t('classifier.none'),
                              mono: false,
                            }
                          : null,
                      ],
                    }),
                    Array.isArray(result.signals) && result.signals.length
                      ? h(
                          'div',
                          { style: { marginTop: '10px' } },
                          h('h3', { style: S.subhead }, t('classifier.signals')),
                          h(
                            'div',
                            { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' } },
                            result.signals.map((signal, index) =>
                              h('span', { key: index, style: S.chip }, signal),
                            ),
                          ),
                        )
                      : null,
                  )
                : h(
                    'div',
                    { style: S.warn },
                    h('strong', null, result.reason || t('classifier.failed')),
                    Array.isArray(result.tried) && result.tried.length
                      ? h(
                          'ul',
                          { style: { margin: '8px 0 0', paddingLeft: '18px' } },
                          result.tried.map((attempt, index) =>
                            h(
                              'li',
                              { key: index },
                              `${attempt.interface || '?'}: ${attempt.ok ? 'ok' : attempt.reason || 'failed'}`,
                            ),
                          ),
                        )
                      : null,
                  ),
            )
          : null,
      );
    }

    function ListCard(props) {
      const t = props.t;
      const list = props.servedList;

      if (!list) {
        return h(
          Card,
          { title: t('list.title'), right: h(Chip, null, t('list.notprobed')) },
          h('p', { style: S.small }, t('probing')),
        );
      }

      const status = list.status;
      const computed = status === 'computed';
      const sample = list.sample || null;

      return h(
        Card,
        {
          title: t('list.title'),
          right: h(
            'span',
            { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
            h(
              Chip,
              { tone: computed ? 'ok' : status === 'not_probed' ? null : 'bad' },
              computed ? t('list.computed') : status === 'not_probed' ? t('list.notprobed') : t('list.nocomputed'),
            ),
            h(
              'button',
              { type: 'button', onClick: props.onMeasure, style: S.btn },
              t('list.measure'),
            ),
          ),
        },
        h(KeyValue, {
          rows: [
            { label: t('list.url'), value: list.url },
            { label: t('list.source'), value: list.source || '—' },
            list.httpStatus ? { label: t('list.http'), value: String(list.httpStatus) } : null,
            list.contentType ? { label: t('list.type'), value: list.contentType } : null,
            list.contentLength ? { label: t('list.bytes'), value: String(list.contentLength) } : null,
            list.etag ? { label: t('list.etag'), value: list.etag } : null,
            list.lastModified ? { label: t('list.lastmod'), value: list.lastModified } : null,
            list.probedAt ? { label: 'probedAt', value: list.probedAt } : null,
            typeof list.durationMs === 'number' ? { label: 'durationMs', value: String(list.durationMs) } : null,
          ],
        }),
        list.reason ? h('div', { style: S.error }, h('strong', null, `${t('list.reason')}: `), list.reason) : null,
        sample
          ? h(
              'div',
              { style: { marginTop: '12px' } },
              h('h3', { style: S.subhead }, t('list.sample')),
              h(KeyValue, {
                rows: [
                  { label: t('list.sampleLines'), value: String(sample.linesSampled) },
                  { label: t('list.sampleExtinf'), value: String(sample.extinfSampled) },
                  { label: t('list.sampleBytes'), value: String(sample.bytesSampled) },
                  { label: t('list.sampleRange'), value: String(sample.acceptedRange) },
                  { label: '#EXTM3U', value: String(sample.startsWithExtm3u) },
                ],
              }),
              h('p', { style: S.small }, sample.label),
            )
          : null,
        list.fullCount
          ? h(
              'div',
              { style: S.warn },
              h('strong', null, `${t('list.fullCount')}: ${list.fullCount.status} — `),
              list.fullCount.reason,
            )
          : null,
        Array.isArray(list.attempts) && list.attempts.length
          ? h(
              'div',
              { style: { marginTop: '10px' } },
              h('h3', { style: S.subhead }, t('list.attempts')),
              h(
                'ul',
                { style: { margin: '6px 0 0', paddingLeft: '18px', fontSize: '12px', lineHeight: '18px' } },
                list.attempts.map((attempt, index) =>
                  h('li', { key: index }, `${attempt.method}: ${attempt.ok ? `HTTP ${attempt.status}` : attempt.reason}`),
                ),
              ),
            )
          : null,
      );
    }

    function EvidenceCard(props) {
      const t = props.t;
      const state = props.state;
      const artifacts = state && state.artifacts ? state.artifacts : {};
      const rows = Object.entries(artifacts).map(([name, artifact]) => ({
      name,
        relative: artifact.relative,
        status: artifact.status,
        bytes: artifact.bytes,
        sha256: artifact.sha256,
        reason: artifact.reason,
      }));
      const workspace = state && state.workspace ? state.workspace : null;

      return h(
        Card,
        { title: t('evidence.title'), right: workspace ? h(Chip, null, workspace.source) : null },
        workspace
          ? h(KeyValue, {
              rows: [{ label: t('evidence.root'), value: workspace.root }],
            })
          : null,
        h(
          'table',
          { style: S.table },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', { style: S.th }, t('evidence.artifact')),
              h('th', { style: S.th }, t('evidence.state')),
              h('th', { style: S.th }, t('evidence.bytes')),
              h('th', { style: S.th }, t('evidence.sha')),
            ),
          ),
          h(
            'tbody',
            null,
            rows.map((row) =>
              h(
                'tr',
                { key: row.name },
                h('td', { style: { ...S.td, ...S.val } }, row.relative),
                h(
                  'td',
                  { style: S.td },
                  h(
                    Chip,
                    { tone: row.status === 'found' ? 'ok' : 'bad' },
                    row.status === 'found' ? t('evidence.yes') : `${t('evidence.no')}${row.reason ? ` (${row.reason})` : ''}`,
                  ),
                ),
                h('td', { style: S.td }, row.bytes === null || row.bytes === undefined ? '—' : String(row.bytes)),
                h('td', { style: { ...S.td, ...S.val } }, shortHash(row.sha256) || '—'),
              ),
            ),
          ),
        ),
        h('p', { style: S.small }, t('evidence.rootNote')),
      );
    }

    function readJson(response) {
      return response.text().then((text) => {
        try {
          return { ok: true, value: JSON.parse(text) };
        } catch (error) {
          return { ok: false, reason: `respuesta no JSON (HTTP ${response.status}): ${text.slice(0, 180)}` };
        }
      });
    }

    function studioApi(path) {
      return fetch(path, { headers: { accept: 'application/json' } }).then((response) =>
        readJson(response).then((parsed) => {
          if (!response.ok) {
            throw new Error(parsed.ok ? `HTTP ${response.status}` : parsed.reason);
          }
          if (!parsed.ok) throw new Error(parsed.reason);
          return parsed.value;
        }),
      );
    }

    function ApeProfileStudioPage(props) {
      const t = props.t;
      const [state, setState] = useState(null);
      const [stateError, setStateError] = useState(null);
      const [loading, setLoading] = useState(true);
      const [probing, setProbing] = useState(false);
      const [line, setLine] = useState('');
      const [inputError, setInputError] = useState(null);
      const [result, setResult] = useState(null);
      const [classifying, setClassifying] = useState(false);
      const [classifyError, setClassifyError] = useState(null);
      const alive = useRef(true);

      useEffect(() => {
        alive.current = true;
        return () => {
          alive.current = false;
        };
      }, []);

      const loadState = useCallback((options) => {
        const params = new URLSearchParams();
        params.set('probe', options && options.probe ? '1' : '0');
        if (options && options.refresh) params.set('refresh', '1');
        return studioApi(`${API_STATE}?${params.toString()}`);
      }, []);

      const refresh = useCallback(
        (options) => {
          setLoading(true);
          loadState({ probe: false })
            .then((value) => {
              if (!alive.current) return;
              setState(value);
              setStateError(null);
              setLoading(false);
              if (!(options && options.skipProbe)) {
                setProbing(true);
                loadState({ probe: true, refresh: true })
                  .then((probed) => {
                    if (!alive.current) return;
                    setState(probed);
                    setProbing(false);
                  })
                  .catch((error) => {
                    if (!alive.current) return;
                    setProbing(false);
                    setStateError(String((error && error.message) || error));
                  });
              }
            })
            .catch((error) => {
              if (!alive.current) return;
              setState(null);
              setLoading(false);
              setStateError(String((error && error.message) || error));
            });
        },
        [loadState],
      );

      useEffect(() => {
        refresh();
      }, [refresh]);

      const measure = useCallback(() => {
        setProbing(true);
        loadState({ probe: true, refresh: true })
          .then((probed) => {
            if (!alive.current) return;
            setState(probed);
            setProbing(false);
          })
          .catch((error) => {
            if (!alive.current) return;
            setProbing(false);
            setStateError(String((error && error.message) || error));
          });
      }, [loadState]);

      const runClassifier = useCallback(() => {
        if (!line.trim()) {
          setInputError(t('classifier.empty'));
          return;
        }
        setInputError(null);
        setClassifyError(null);
        setResult(null);
        setClassifying(true);
        fetch(API_CLASSIFY, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ line }),
        })
          .then((response) =>
            readJson(response).then((parsed) => {
              if (!parsed.ok) throw new Error(parsed.reason);
              return parsed.value;
            }),
          )
          .then((value) => {
            if (!alive.current) return;
            setResult(value);
            setClassifying(false);
          })
          .catch((error) => {
            if (!alive.current) return;
            setClassifyError(String((error && error.message) || error));
            setClassifying(false);
          });
      }, [line, t]);

      const classifier = state && state.artifacts ? state.artifacts.classifier : null;

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
              h(StudioIcon, { size: 30 }),
            ),
            h('h1', { style: S.title }, t('title')),
            h(
              'span',
              { style: { marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' } },
              loading ? h(Chip, null, t('loading')) : null,
              probing ? h(Chip, { tone: 'warn' }, t('probing')) : null,
              h(
                'button',
                { type: 'button', onClick: () => refresh(), style: S.btn },
                t('refresh'),
              ),
            ),
          ),
          h('p', { style: S.subtitle }, t('subtitle')),

          stateError
            ? h(
                Card,
                { title: t('unavailable.title'), right: h(Chip, { tone: 'bad' }, t('list.nocomputed')) },
                h('div', { style: S.error }, t('unavailable.body'), h('div', { style: { marginTop: '8px' } }, stateError)),
              )
            : null,

          h(ContractCard, { t, contract: state ? state.contract : null }),
          h(ClassifierCard, {
            t,
            classifier,
            value: line,
            onChange: (next) => {
              setLine(next);
              setInputError(null);
            },
            onRun: runClassifier,
            running: classifying,
            inputError,
            error: classifyError,
            result,
          }),
          h(ListCard, {
            t,
            servedList: state ? state.servedList : null,
            onMeasure: measure,
          }),
          h(EvidenceCard, { t, state }),

          h('div', { style: S.note }, h('strong', null, `${t('note.title')}: `), t('note.body')),
        ),
      );
    }

    function apply(ctx) {
      ctx.effect(
        () => ctx.locale.register(NS, 'en', en),
        'ape-profile-studio: english dictionary',
      );
      ctx.effect(
        () => ctx.locale.register(NS, 'es', es),
        'ape-profile-studio: spanish dictionary',
      );
      const t = ctx.locale.bind(NS);

      // Left sidebar entry. The id doubles as the `main` key it selects.
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 21,
            locale: NS,
            label: () => t('panel.label'),
          },
          StudioIcon,
        ),
      );

      // The panel the sidebar row opens.
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, ApeProfileStudioPage),
      );
    }

    return { inject: ['slots', 'locale'], apply };
  },
});
