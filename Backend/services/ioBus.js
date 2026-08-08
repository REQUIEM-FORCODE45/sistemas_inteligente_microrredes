// ioBus.js — referencia central al Socket.IO server.
// Permite emitir eventos desde rutas/servicios sin importar app.js (evita
// dependencias circulares). app.js llama a setIO(io) al arrancar.
let _io = null;

const setIO = (io) => { _io = io; };

const emit = (event, payload) => {
  if (_io) _io.emit(event, payload);
};

module.exports = { setIO, emit };
