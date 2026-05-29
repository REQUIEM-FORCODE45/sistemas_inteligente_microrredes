const { Annotation } = require('@langchain/langgraph');

const GraphState = Annotation.Root({
  sensorId: Annotation({
    reducer: (_, next) => next,
    default: () => null,
  }),
  sensorName: Annotation({
    reducer: (_, next) => next,
    default: () => 'Sensor desconocido',
  }),
  sensorType: Annotation({
    reducer: (_, next) => next,
    default: () => 'meter',
  }),
  datosActuales: Annotation({
    reducer: (_, next) => next,
    default: () => ({}),
  }),
  analisisPrevio: Annotation({
    reducer: (_, next) => next,
    default: () => ({
      anomalia: false,
      nivel_alerta: 'normal',
      detalles: [],
    }),
  }),
  contexto: Annotation({
    reducer: (prev, next) => (next !== undefined ? next : prev),
    default: () => '',
  }),
  ruta: Annotation({
    reducer: (_, next) => next,
    default: () => null,
  }),
  resultadoFinalRaw: Annotation({
    reducer: (_, next) => next,
    default: () => null,
  }),
  resultadoFinal: Annotation({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

module.exports = { GraphState };
