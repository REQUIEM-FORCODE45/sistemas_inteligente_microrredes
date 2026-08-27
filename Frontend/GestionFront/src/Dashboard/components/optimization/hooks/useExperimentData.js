import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import GridAPI from '@/api/grid-api';
import { setExperimentSummary, setExperimentTraces, setExperimentRunning, setExperimentError } from '@/Dashboard/store/optimization/optimizationSlice';

export const useExperimentData = () => {
  const dispatch = useDispatch();
  const exp = useSelector(s => s.optimization.experimentA);
  const fetchSummary = useCallback(async () => {
    try {
      const res = await GridAPI.get('/front/optimization/experiment/summary');
      if (res.data?.success) dispatch(setExperimentSummary(res.data.summary));
    } catch (e) { dispatch(setExperimentError(e.message)); }
  }, [dispatch]);
  const fetchTraces = useCallback(async () => {
    const strategies = ['smpc','dmpc','heur','oracle'];
    const all = {};
    for (const s of strategies) {
      try {
        const res = await GridAPI.get(`/front/optimization/experiment/traces/${s}`);
        if (res.data?.success) all[s] = res.data.rows;
      } catch {}
    }
    dispatch(setExperimentTraces(all));
  }, [dispatch]);
  const fetchStatus = useCallback(async () => {
    try {
      const res = await GridAPI.get('/front/optimization/experiment/status');
      if (res.data?.success) dispatch(setExperimentRunning(!!res.data.running));
    } catch {}
  }, [dispatch]);
  const run = useCallback(async (days=14) => {
    await GridAPI.post('/front/optimization/experiment/run', { days });
    dispatch(setExperimentRunning(true));
  }, [dispatch]);
  return { exp, fetchSummary, fetchTraces, fetchStatus, run };
};
