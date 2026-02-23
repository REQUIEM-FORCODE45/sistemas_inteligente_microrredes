import deviceReducer from './device/deviceSlice'; // 
import { configureStore } from '@reduxjs/toolkit';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        ui: uiReducer,
        devices: deviceReducer, // 👈
    },
});