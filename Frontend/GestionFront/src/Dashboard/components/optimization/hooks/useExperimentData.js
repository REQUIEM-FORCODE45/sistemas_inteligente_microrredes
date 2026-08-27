import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import GridAPI from '@/api/grid-api';
import { setExperimentSummary, setExperimentTraces, setExperimentRunning, setExperimentError } from '@/Dashboard/store/optimization/optimizationSlice';

export const useExperimentData = () => {
  const dispatch = useDispatch();
  const exp = useSelector(s => s.optimization.experimentA);
  const fetchSummary = useCallback(async () => {
    try {
      const res = await GridAPI.get('/front/optimization/experiment/summary', { timeout: 60000 });
      if (res.data?.success) dispatch(setExperimentSummary(res.data.summary));
    } catch (e) { dispatch(setExperimentError(e.code==='ECONNABORTED' ? 'Tiempo agotado (60s) - reintenta' : e.message)); }
  }, [dispatch]);
  const fetchTraces = useCallback(async (only) => {
    const strategies = only ? [only] : ['smpc','dmpc','heur','mpc-pi'];
    const all = {};
    for (const s of strategies) {
      try {
        const res = await GridAPI.get(`/front/optimization/experiment/traces/${s}`, { timeout: 60000 });
        if (res.data?.success) all[s] = res.data.rows;
      } catch {}
    }
    if (only) {
      dispatch(setExperimentTraces({ ...exp?.traces, ...all }));
    } else {
      dispatch(setExperimentTraces(all));
    }
    return all;
  }, [dispatch, exp?.traces]);
  const fetchStatus = useCallback(async () => {
    try {
      const res = await GridAPI.get('/front/optimization/experiment/status', { timeout: 10000 });
      if (res.data?.success) dispatch(setExperimentRunning(!!res.data.running));
    } catch {}
  }, [dispatch]);
  const run = useCallback(async (days=14) => {
    await GridAPI.post('/front/optimization/experiment/run', { days });
    dispatch(setExperimentRunning(true));
  }, [dispatch]);
  return { exp, fetchSummary, fetchTraces, fetchStatus, run };
};
