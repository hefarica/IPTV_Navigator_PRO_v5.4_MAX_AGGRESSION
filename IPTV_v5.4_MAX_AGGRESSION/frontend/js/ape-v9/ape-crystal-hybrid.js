/**
 * APE CRYSTAL HYBRID — contrato ape.crystal.hybrid/1 (navegador).
 * Fuente de verdad: contracts/lab/APE_FUSION_HIBRIDO_OPTIMO_12P.json
 * (SHA-256 439e28447371cff6c849eef08989a5eed5403dd6ad001488527e9db3ada58c49).
 * balanced = sin p (P3.5, 1080p emulado); max = p=P1 (P1.5, 4K simulado);
 * native = sin p (fuente >1080, no se degrada). Solo max con fuente medida.
 */
(function (root) {
  'use strict';
  const CONFIG = {
  "_meta": {
    "crystal_hybrid": {
      "schema": "ape.crystal.hybrid/1",
      "scope": [
        "VLC",
        "APE_CRYSTAL"
      ],
      "apply_to_all_generators": true,
      "applies_to_profile_ids": [
        "P0",
        "P1",
        "P2",
        "P3",
        "P4",
        "P5",
        "P0.5",
        "P1.5",
        "P2.5",
        "P3.5",
        "P4.5",
        "P5.5"
      ],
      "precedence": "En modo híbrido, esta política prevalece sobre la cascada y los filtros heredados. Fuera del modo híbrido no modifica los perfiles históricos.",
      "default_route": "balanced",
      "explicit_4k_route": "max",
      "routes": {
        "balanced": {
          "cartridge_profile": "P3.5",
          "pulse_query": {},
          "canvas_px": [
            1920,
            1080
          ],
          "label_when_confirmed": "1080p emulado",
          "placement": "player_post_decode",
          "classification": "simulated_display_output_not_native_source",
          "status_initial": "CONFIGURED_NOT_EXECUTED",
          "filtergraphs": {
            "lanczos": "scale=w='max(2,2*floor(min(1920,1080*if(gt(sar,0),dar,iw/ih))/2))':h='max(2,2*floor(min(1080,1920/if(gt(sar,0),dar,iw/ih))/2))':flags=lanczos,setsar=1,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black",
            "bicubic": "scale=w='max(2,2*floor(min(1920,1080*if(gt(sar,0),dar,iw/ih))/2))':h='max(2,2*floor(min(1080,1920/if(gt(sar,0),dar,iw/ih))/2))':flags=bicubic,setsar=1,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black",
            "bilinear": "scale=w='max(2,2*floor(min(1920,1080*if(gt(sar,0),dar,iw/ih))/2))':h='max(2,2*floor(min(1080,1920/if(gt(sar,0),dar,iw/ih))/2))':flags=bilinear,setsar=1,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black"
          },
          "filter_syntax": "libavfilter"
        },
        "max": {
          "cartridge_profile": "P1.5",
          "pulse_query": {
            "p": "P1"
          },
          "canvas_px": [
            3840,
            2160
          ],
          "label_when_confirmed": "4K simulado",
          "placement": "player_post_decode",
          "classification": "simulated_display_output_not_native_source",
          "status_initial": "CONFIGURED_NOT_EXECUTED",
          "filtergraphs": {
            "lanczos": "scale=w='max(2,2*floor(min(3840,2160*if(gt(sar,0),dar,iw/ih))/2))':h='max(2,2*floor(min(2160,3840/if(gt(sar,0),dar,iw/ih))/2))':flags=lanczos,setsar=1,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:color=black",
            "bicubic": "scale=w='max(2,2*floor(min(3840,2160*if(gt(sar,0),dar,iw/ih))/2))':h='max(2,2*floor(min(2160,3840/if(gt(sar,0),dar,iw/ih))/2))':flags=bicubic,setsar=1,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:color=black",
            "bilinear": "scale=w='max(2,2*floor(min(3840,2160*if(gt(sar,0),dar,iw/ih))/2))':h='max(2,2*floor(min(2160,3840/if(gt(sar,0),dar,iw/ih))/2))':flags=bilinear,setsar=1,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:color=black"
          },
          "filter_syntax": "libavfilter"
        },
        "native": {
          "cartridge_profile": null,
          "pulse_query": {},
          "canvas_px": null,
          "label": "Señal original",
          "active_filter": null
        }
      },
      "max_eligibility": {
        "explicit_opt_in": true,
        "eligible_verified_source_heights": [
          480,
          544,
          720,
          1080
        ],
        "require_measured_source": true,
        "already_above_1080": "preserve_native_without_downgrade"
      },
      "playback": {
        "start_with_native_frame": true,
        "check_device_display_color_and_render_budget": true,
        "if_source_height_unknown": "select_default_cartridge_but_defer_filter_until_measured",
        "if_source_larger_than_default_canvas": "preserve_native_geometry",
        "filter_order": [
          "lanczos",
          "bicubic",
          "bilinear"
        ],
        "fallback_routes": {
          "max": [
            "balanced",
            "native"
          ],
          "balanced": [
            "native"
          ]
        },
        "one_spatial_pass": true,
        "preserve_native_frame_rate": true,
        "do_not_force_hdr_or_codec": true,
        "verify_first_filtered_frame_and_target_surface": true,
        "do_not_claim_upscale_when_source_already_matches_canvas": true,
        "vlc_integration": "Seleccionar cartucho por URL; ejecutar la receta sólo con un adaptador compatible. No pasar la cadena libavfilter a VLC estándar como si fuera un nombre de módulo."
      },
      "generator_contract": {
        "apply_before_url_signing": true,
        "do_not_rewrite_existing_signed_urls": true,
        "never_rewrite_original_uri_or_d": true,
        "place_simulated_canvas_in_sidecar_or_app_status": true,
        "manifest_fields_describe_actual_delivered_video": [
          "RESOLUTION",
          "CODECS",
          "FRAME-RATE",
          "VIDEO-RANGE"
        ],
        "only_mark_executed_from_runtime_evidence": true
      },
      "app_labels": {
        "source": "Fuente real",
        "canvas": "Salida de imagen",
        "default_option": "Equilibrado · hasta 1080p emulado",
        "explicit_4k_option": "Máxima imagen · hasta 4K simulado",
        "pending": "Escalado pendiente de confirmación"
      }
    }
  }
};

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

  // [OWNER OVERRIDE 2026-11-24] El propietario rechazó el gate "solo 4K con
  // fuente verificada": TODAS las resoluciones se upscalan por video filters.
  // El contrato decide rutas/cartuchos; el override fuerza max (P1.5/p=P1)
  // para todo <8K, y conserva 8K en P0. No se degrada ninguno.
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

  root.APECrystalHybrid = { CONFIG, seleccionarHibrido, seleccionarHibridoOwner, VERSION: '9.4-OWNER' };
  if (typeof module !== 'undefined' && module.exports) module.exports = { CONFIG, seleccionarHibrido, seleccionarHibridoOwner };
})(typeof globalThis !== 'undefined' ? globalThis : this);
