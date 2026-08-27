import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  status: 'idle',
  jobId: null,
  results: null,
  latestResult: null,
  error: null,
  mpc: {
    running: false,
    interval_minutes: 15,
    cycle_active: false,
  },
  experimentA: {
    summary: null,
    traces: null,
    running: false,
    lastRun: null,
    error: null,
  },
};

const optimizationSlice = createSlice({
  name: 'optimization',
  initialState,
  reducers: {
    setOptimizationStatus(state, action) {
      state.status = action.payload.status;
      state.jobId = action.payload.jobId || state.jobId;
      state.error = action.payload.error || null;
    },
    setOptimizationResult(state, action) {
      state.results = action.payload;
      state.latestResult = action.payload;
      state.status = action.payload?.status || 'complete';
    },
    setOptimizationError(state, action) {
      state.error = action.payload;
      state.status = 'error';
    },
    setMpcStatus(state, action) {
      state.mpc = { ...state.mpc, ...action.payload };
    },
    clearOptimization(state) {
      state.status = 'idle';
      state.error = null;
    },
    setExperimentSummary(state, action) {
      state.experimentA.summary = action.payload;
      state.experimentA.error = null;
    },
    setExperimentTraces(state, action) {
      state.experimentA.traces = { ...(state.experimentA.traces || {}), ...action.payload };
    },
    setExperimentRunning(state, action) {
      state.experimentA.running = action.payload;
    },
    setExperimentError(state, action) {
      state.experimentA.error = action.payload;
    },
    clearExperiment(state) {
      state.experimentA = { summary: null, traces: null, running: false, lastRun: null, error: null };
    },
  },
});

export const {
  setOptimizationStatus,
  setOptimizationResult,
  setOptimizationError,
  setMpcStatus,
  clearOptimization,
  setExperimentSummary,
  setExperimentTraces,
  setExperimentRunning,
  setExperimentError,
  clearExperiment,
} = optimizationSlice.actions;

export default optimizationSlice.reducer;
