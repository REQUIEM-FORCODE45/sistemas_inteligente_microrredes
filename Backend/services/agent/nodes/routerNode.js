const RUTA_ALERTA = 'alerta';
const RUTA_OPTIMIZACION = 'optimizacion';

const routerNode = (state) => {
  const { analisisPrevio } = state;
  const anomalia = analisisPrevio?.anomalia === true;

  console.log(
    `Router: Nivel="${analisisPrevio?.nivel_alerta}", Anomalía=${anomalia} → ` +
    `ruta="${anomalia ? RUTA_ALERTA : RUTA_OPTIMIZACION}"`
  );

  return {
    ruta: anomalia ? RUTA_ALERTA : RUTA_OPTIMIZACION,
  };
};

const routeByAnalisis = (state) => {
  return state.ruta;
};

module.exports = { routerNode, routeByAnalisis, RUTA_ALERTA, RUTA_OPTIMIZACION };
