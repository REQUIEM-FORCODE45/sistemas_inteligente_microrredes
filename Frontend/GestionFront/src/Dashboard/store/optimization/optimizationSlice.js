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
  },
});

export const {
  setOptimizationStatus,
  setOptimizationResult,
  setOptimizationError,
  setMpcStatus,
  clearOptimization,
} = optimizationSlice.actions;

export default optimizationSlice.reducer;
