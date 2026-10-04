import * as PlotlyNS from 'plotly.js-dist-min';

// plotly.js-dist-min se distribuye como UMD/CJS. Segun el bundler y la fase,
// el objeto llega como `module.exports` crudo, como namespace con `default`, o
// como `exports.Plotly`. Importarlo directamente con `import Plotly from
// 'plotly.js-dist-min'` y usar `Plotly.newPlot` funciona en dev (Vite
// pre-empaqueta con esbuild e inyecta `default`) pero revienta en el build de
// produccion con rolldown-vite, que no inyecta `default`:
//
//   Uncaught TypeError: v.default is undefined
//
// Como el error ocurre al evaluar el modulo, tumba la app entera y la pagina
// queda en blanco. Por eso normalizamos aqui: elegimos la forma que exponga
// la API real, en vez de asumir una.
function resolvePlotly(ns) {
  return [ns, ns?.default, ns?.Plotly].find((c) => typeof c?.newPlot === 'function');
}

const Plotly = resolvePlotly(PlotlyNS);

if (!Plotly) {
  throw new Error(
    'plotly.js-dist-min: no se encontro `newPlot` en ninguna forma del modulo ' +
      '(namespace, default ni Plotly). Revisa el interop CommonJS del build.'
  );
}

export default Plotly;