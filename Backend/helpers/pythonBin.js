// helpers/pythonBin.js — Resuelve el ejecutable de Python de forma cross-platform.
// En Windows usa PYTHON_BIN o 'python' (evita python3 de WindowsApps con error 403/acceso denegado).
// En Linux/macOS usa PYTHON_BIN o 'python3'.

function getPythonBin() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

module.exports = {
  getPythonBin,
  PYTHON_BIN: getPythonBin(),
};
