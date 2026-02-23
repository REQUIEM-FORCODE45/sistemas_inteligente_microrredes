import { configureStore } from '@reduxjs/toolkit';
import authReducer from './auth/authSlice';   // 👈 importa el reducer directamente
import uiReducer from './ui/uiSlice';         // 👈 igual aquí
import deviceReducer from '../../Dashboard/store/device/deviceSlice'; // 👈 importa el reducer de dispositivos
export const store = configureStore({

    reducer: {
        auth: authReducer,   // 👈 ya es el reducer directamente
        ui: uiReducer,
        devices: deviceReducer, // 👈 incluye el reducer de dispositivos
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
        serializableCheck: false,
    }),
});
