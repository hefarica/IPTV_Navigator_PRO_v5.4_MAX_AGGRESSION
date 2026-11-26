/* APE — sincronizacion de perfiles con el VPS.
 * Lo consume ProfileManagerV9._pushProfilesToVps() al pulsar Guardar.
 * El token NO es un secreto fuerte (viaja en la pagina); es defensa contra
 * escrituras sin contexto. Ver prisma/api/ape-profiles-state.php. */
window.APE_PROFILES_SYNC = {
  url: 'https://iptv-ape.duckdns.org/prisma/api/ape-profiles-state.php',
  token: '6a7e4ad7b9ce5dc5b1e9a26b44d7ee868cae31c3ed54085f519d9321dbd86114'
};