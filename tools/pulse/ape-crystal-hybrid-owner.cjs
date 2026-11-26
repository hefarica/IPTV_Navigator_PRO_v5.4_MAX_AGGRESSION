'use strict';

// [OWNER OVERRIDE 2026-11-24] Integra el contrato ape.crystal.hybrid/1, pero
// el propietario rechazó el gate "solo 4K con fuente verificada": TODAS las
// resoluciones se upscalan por video filters. max (P1.5/p=P1) para todo <8K;
// 8K se conserva en P0. upscaleAll=false recupera el contrato original.
const { seleccionarHibrido } = require('./ape-crystal-hybrid.cjs');

function seleccionarHibridoOwner(config, consulta = {}) {
  const base = seleccionarHibrido(config, consulta);
  if (consulta.upscaleAll === false) return base;
  const politica = config && config._meta && config._meta.crystal_hybrid;
  if (!politica) return base;
  const alto = Number(consulta.alto) || 0;
  if (alto >= 4320) {
    return Object.assign({}, base, {
      ruta: 'max8k',
      cartucho: 'P0',
      parametrosPulse: { p: 'P0' },
      lienzoObjetivoPx: [7680, 4320],
      estadoFiltro: 'sin_escalado_8k',
      ejecutado: false,
      motivo4KNoActivado: null,
      ownerOverride: 'ALL_RESOLUTIONS_UPSCALE',
    });
  }
  const ruta = politica.routes.max;
  return Object.assign({}, base, {
    ruta: 'max',
    cartucho: ruta.cartridge_profile,
    parametrosPulse: Object.assign({}, ruta.pulse_query),
    lienzoObjetivoPx: ruta.canvas_px ? [...ruta.canvas_px] : null,
    estadoFiltro: 'pendiente_de_capacidad_y_confirmacion',
    ejecutado: false,
    motivo4KNoActivado: null,
    ownerOverride: 'ALL_RESOLUTIONS_UPSCALE',
  });
}

module.exports = { seleccionarHibridoOwner };
