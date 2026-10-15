// Cambio 16 (C0/C2) — medidor de fluidez, SOLO modo debug (harness).
// No se importa en producción: el CDP lo inyecta o el harness lo monta.
// Mide FPS (rAF) + mutaciones del viewport + notificaciones Redux en ventana.
export function startMeter(store) {
  const st = {
    frames: 0, muts: 0, redux: 0, t0: performance.now(),
  };
  const tick = () => {
    st.frames += 1;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const obs = new MutationObserver((ms) => {
    st.muts += ms.length;
  });
  const pane = document.querySelector('.react-flow__viewport');
  if (pane) {
    obs.observe(pane, {
      attributes: true, subtree: true, attributeFilter: ['style', 'transform'],
    });
  }
  let unsub = null;
  if (store && typeof store.subscribe === 'function') {
    unsub = store.subscribe(() => {
      st.redux += 1;
    });
  }
  return {
    stop() {
      const dt = performance.now() - st.t0;
      if (unsub) unsub();
      obs.disconnect();
      return {
        frames: st.frames,
        muts: st.muts,
        redux: st.redux,
        dt: Math.round(dt),
        fps: +(st.frames / (dt / 1000)).toFixed(1),
      };
    },
  };
}

if (typeof window !== 'undefined') {
  window.__fpsMeter = { startMeter };
}
