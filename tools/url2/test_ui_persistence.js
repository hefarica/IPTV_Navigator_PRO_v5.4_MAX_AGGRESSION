#!/usr/bin/env node
'use strict';
/**
 * test_ui_persistence.js — verifica la lógica de APE_UI_PERSIST sin navegador,
 * con un DOM falso mínimo (collect/apply/keyOf/isSkipped).
 */
const path = require('path');
const MOD = path.join(__dirname, '..', '..', 'IPTV_v5.4_MAX_AGGRESSION', 'frontend', 'js', 'ape-ui-persistence.js');
const API = require(MOD);

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };

function el(opts) {
  const e = {
    ownerDocument: null,
    tagName: opts.tag || 'INPUT',
    id: opts.id || '',
    name: opts.name || '',
    disabled: !!opts.disabled,
    attrs: opts.attrs || {},
    value: opts.value != null ? opts.value : '',
    defaultValue: opts.defaultValue != null ? opts.defaultValue : (opts.value != null ? opts.value : ''),
    checked: !!opts.checked,
    defaultChecked: opts.defaultChecked != null ? opts.defaultChecked : !!opts.checked,
    options: opts.options || [],
    multiple: !!opts.multiple,
    getAttribute(k) { return this.attrs[k] != null ? this.attrs[k] : (k === 'type' ? (opts.type || '') : null); },
    dispatchEvent() { return true; },
    matches(sel) { return sel.indexOf('input') >= 0 && this.tagName === 'INPUT'; },
    querySelectorAll() { return []; }
  };
  return e;
}

function doc(els) {
  return {
    querySelectorAll(sel) {
      if (sel.indexOf('[name=') === 0) return els.filter(e => '[name="' + e.name + '"]' === sel);
      return els;
    }
  };
}

console.log('== APE_UI_PERSIST · persistencia total de controles ==');
ok('API completa', !!(API && API.saveNow && API.restoreNow && API.status && API._collect && API._apply));

const doc1 = doc([
  el({ id: 'chk1', type: 'checkbox', checked: true }),
  el({ id: 'chk2', type: 'checkbox', checked: false }),
  el({ id: 'sel1', tag: 'SELECT', value: 'b', options: [{ value: 'a', selected: false, defaultSelected: false }, { value: 'b', selected: true, defaultSelected: false }] }),
  el({ id: 'txt1', value: 'hola' }),
  el({ id: 'num1', type: 'number', value: '42' }),
  el({ id: 'pwd1', type: 'password', value: 'secreto' }),
  el({ id: 'tok1', value: 'abc' }),
  el({ id: 'file1', type: 'file' }),
  el({ id: 'hid1', type: 'hidden', value: 'x' })
]);
const st = API._collect(doc1);
ok('captura checkbox true', st.controls['id:chk1'] === 1);
ok('captura checkbox false', st.controls['id:chk2'] === 0);
ok('captura select', st.controls['id:sel1'] === 'b');
ok('captura texto', st.controls['id:txt1'] === 'hola');
ok('captura number', st.controls['id:num1'] === '42');
ok('NO captura password', !('id:pwd1' in st.controls));
ok('NO captura token', !('id:tok1' in st.controls));
ok('NO captura file', !('id:file1' in st.controls));
ok('NO captura hidden', !('id:hid1' in st.controls));

// aplicar sobre "otra carga" (todo en default)
const c1 = el({ id: 'chk1', type: 'checkbox', checked: false });
const s1 = el({ id: 'sel1', tag: 'SELECT', value: 'a', options: [{ value: 'a', selected: true, defaultSelected: true }, { value: 'b', selected: false, defaultSelected: false }] });
const t1 = el({ id: 'txt1', value: '' });
const doc2 = doc([c1, s1, t1]);
const r = API._apply(doc2, st, { force: false });
ok('aplica 3 controles', r.applied === 3, JSON.stringify(r));
ok('checkbox restaurado', c1.checked === true);
ok('texto restaurado', t1.value === 'hola');
ok('select restaurado', s1.value === 'b');
ok('select marca opción b', s1.options[1].selected === true);

// no pisar lo que el usuario cambió (force=false)
const c2 = el({ id: 'chk1', type: 'checkbox', checked: true, defaultChecked: false });
const doc3 = doc([c2]);
const r2 = API._apply(doc3, { controls: { 'id:chk1': 0 } }, { force: false });
ok('no pisa control tocado por el usuario', r2.skipped === 1 && c2.checked === true);
const r3 = API._apply(doc3, { controls: { 'id:chk1': 0 } }, { force: true });
ok('force sí pisa', r3.applied === 1 && c2.checked === false);

// claves estables: sin id usa name+type+índice
const docN = doc([]);
const n1 = el({ name: 'grp', type: 'radio', value: 'x' });
const n2 = el({ name: 'grp', type: 'radio', value: 'y' });
n1.ownerDocument = docN; n2.ownerDocument = docN;
docN.querySelectorAll = (sel) => sel.indexOf('[name=') === 0 ? [n1, n2] : [n1, n2];
ok('clave por nombre+índice', API._keyOf(n1).indexOf('nm:grp:radio#') === 0 && API._keyOf(n1) !== API._keyOf(n2), API._keyOf(n1) + ' / ' + API._keyOf(n2));
ok('data-ape-key tiene prioridad', API._keyOf(el({ attrs: { 'data-ape-key': 'k1' } })) === 'dk:k1');
ok('disabled se omite', API._isSkipped(el({ id: 'd', disabled: true })) === true);
ok('secret por nombre se omite', API._isSkipped(el({ name: 'api_key' })) === true);

console.log('\nRESUMEN UI-PERSIST: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exitCode = fail ? 1 : 0;


