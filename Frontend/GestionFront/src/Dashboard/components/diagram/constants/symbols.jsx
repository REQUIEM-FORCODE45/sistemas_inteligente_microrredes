// Cambio 12.4 — símbolos SVG propios copiados VERBATIM de la referencia
// (integracion_plataforma/cambio_12_cadena_confianza/reference/figuras/simbolos.svg).
// NO inventar iconografía: los path son los del archivo. Se inyectan UNA vez
// con <SvgSymbolDefs/> y cada tarjeta los usa con <svg><use href="#s-..."/></svg>.
// (SYMBOL_FOR_TYPE y CATEGORY_ACCENT viven en deviceTypes.js para no mezclar
// componentes con constantes: regla react-refresh/only-export-components.)
const SYMBOLS = {
  's-grid': (
    <symbol id="s-grid" viewBox="0 0 24 24">
      <path d="M2 8h20M2 16h20M7 3v18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </symbol>
  ),
  's-pv': (
    <symbol id="s-pv" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 4v13M15 4v13M3 10.5h18" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".75" />
      <path d="M12 17v4M9 21h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </symbol>
  ),
  's-die': (
    <symbol id="s-die" viewBox="0 0 24 24">
      <circle cx="12" cy="13.5" r="7" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M14.6 11.1a3.2 3.2 0 1 0 .8 4.2h-2.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 6.2h6M12 6.2V4.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </symbol>
  ),
  's-inv': (
    <symbol id="s-inv" viewBox="0 0 24 24">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.2 19.2L19.8 4.8" fill="none" stroke="currentColor" strokeWidth="1.15" opacity=".6" />
      <path d="M6.4 8.7h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12.6 15.3c1-2.2 2.1-2.2 3.1 0s2.1 2.2 3.1 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </symbol>
  ),
  's-trafo': (
    <symbol id="s-trafo" viewBox="0 0 24 24">
      <circle cx="12" cy="8.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="15.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </symbol>
  ),
  's-batt': (
    <symbol id="s-batt" viewBox="0 0 24 24">
      <path d="M5 6h14M7.5 10.5h9M5 15h14M7.5 19.5h9" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </symbol>
  ),
  's-load': (
    <symbol id="s-load" viewBox="0 0 24 24">
      <path d="M3 5h18L12 20z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </symbol>
  ),
  's-sw-c': (
    <symbol id="s-sw-c" viewBox="0 0 24 24">
      <path d="M6 12h12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="4.5" y="9.5" width="15" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </symbol>
  ),
  's-sw-o': (
    <symbol id="s-sw-o" viewBox="0 0 24 24">
      <path d="M6 16l10-8.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="6" cy="16" r="1.8" fill="currentColor" /><circle cx="16.5" cy="7.5" r="1.8" fill="currentColor" />
      <rect x="4.5" y="9.5" width="15" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".55" />
    </symbol>
  ),
};

export function SvgSymbolDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>{Object.values(SYMBOLS)}</defs>
    </svg>
  );
}

import { SYMBOL_FOR_TYPE } from './deviceTypes';

export function TypeSymbol({ type, size = 20, color = 'currentColor' }) {
  const id = SYMBOL_FOR_TYPE[type];
  if (!id) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ color }} aria-hidden="true">
      {/* width/height explicitos: sin ellos Chrome no pinta el use (cambio 12.4) */}
      <use href={`#${id}`} width="24" height="24" />
    </svg>
  );
}
