import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import GridAPI from '@/api/grid-api';
import { setForecastComparison, setForecastSeries, setForecastRunning, setForecastError } from '@/Dashboard/store/optimization/optimizationSlice';

export const useForecastComparison = () => {
  const dispatch = useDispatch();
  const fc = useSelector(s => s.optimization.forecastComparison);
  const fetchSummary = useCallback(async () => {
    try {
      const res = await GridAPI.get('/front/prediction/forecast/comparison', { timeout: 60000 });
      if (res.data?.success) dispatch(setForecastComparison(res.data));
    } catch (e) { dispatch(setForecastError(e.code === 'ECONNABORTED' ? 'Tiempo agotado (60s) - reintenta' : e.message)); }
  }, [dispatch]);
  const fetchSeries = useCallback(async () => {
    try {
      const res = await GridAPI.get('/front/prediction/forecast/comparison/series', { timeout: 60000 });
      if (res.data?.success) dispatch(setForecastSeries(res.data));
    } catch (e) { console.error('[useForecastComparison] series:', e?.message || e); }
  }, [dispatch]);
  const fetchStatus = useCallback(async () => {
    try {
      const res = await GridAPI.get('/front/prediction/forecast/comparison/status', { timeout: 10000 });
      if (res.data?.success) dispatch(setForecastRunning(!!res.data.running));
    } catch (e) { console.error('[useForecastComparison] status:', e?.message || e); }
  }, [dispatch]);
  const run = useCallback(async (months = 20) => {
    await GridAPI.post('/front/prediction/forecast/comparison/run', { months });
    dispatch(setForecastRunning(true));
  }, [dispatch]);
  return { fc, fetchSummary, fetchSeries, fetchStatus, run };
};
