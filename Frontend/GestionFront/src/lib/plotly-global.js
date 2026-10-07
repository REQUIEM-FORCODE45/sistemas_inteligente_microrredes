// Plotly se sirve como script global (public/plotly.min.js, cargado antes
// que el bundle en index.html). Importar plotly.js-dist-min por el bundler
// revienta el build de produccion de rolldown-vite (el UMD topa en un
// "default/prototype is undefined" en el eval del modulo). Todos los imports
// de 'plotly.js-dist-min' se redirigen aqui via alias en vite.config.js.
const Plotly = typeof window !== "undefined" ? window.Plotly : undefined

export default Plotly