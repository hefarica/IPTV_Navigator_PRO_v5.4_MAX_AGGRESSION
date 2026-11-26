'use strict';

// Adaptador de referencia: usar los parámetros devueltos ANTES de firmar la URL.
// No abre enlaces ni modifica URLs, metadatos de origen ni parámetros d=.
function seleccionarHibrido(config, consulta = {}) {
  const politica = config?._meta?.crystal_hybrid;
  if (politica?.schema !== 'ape.crystal.hybrid/1') {
    throw new TypeError('Se requiere el contrato ape.crystal.hybrid/1');
  }
  const { fuenteVerificada, ancho, alto, solicitar4K } = consulta;
  const medido = fuenteVerificada === true && Number.isInteger(ancho) && ancho > 0 &&
    Number.isInteger(alto) && alto > 0;
  const mismaGeometria = medido && ancho === 1920 && alto === 1080;
  const conservar = medido && (alto > 1080 || ancho > 1920);
  const admite4K = medido && !conservar && politica.max_eligibility.eligible_verified_source_heights.includes(alto);
  const id = conservar ? 'native' : solicitar4K === true && admite4K
    ? politica.explicit_4k_route : politica.default_route;
  const ruta = politica.routes[id];
  let filtro = 'pendiente_de_medir';
  if (conservar) filtro = 'sin_escalado';
  else if (medido) filtro = id === 'balanced' && mismaGeometria
    ? 'no_ampliar_si_el_aspecto_decodificado_coincide' : 'pendiente_de_capacidad_y_confirmacion';
  return {
    ruta: id,
    cartucho: ruta.cartridge_profile,
    parametrosPulse: { ...ruta.pulse_query },
    fuenteMedidaPx: medido ? [ancho, alto] : null,
    lienzoObjetivoPx: ruta.canvas_px ? [...ruta.canvas_px] : null,
    filtrosCandidatos: ruta.filtergraphs ? { ...ruta.filtergraphs } : {},
    rutasRespaldo: [...(politica.playback.fallback_routes[id] || [])],
    estadoFiltro: filtro,
    ejecutado: false,
    motivo4KNoActivado: solicitar4K !== true || id === 'max' ? null :
      conservar ? 'conservar_fuente_superior' : medido ? 'altura_fuera_de_politica' : 'fuente_no_verificada',
  };
}

module.exports = { seleccionarHibrido };
