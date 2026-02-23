import { configureStore } from '@reduxjs/toolkit';
import authReducer from './auth/authSlice';   // 👈 importa el reducer directamente
import uiReducer from './ui/uiSlice';         // 👈 igual aquí

export const store = configureStore({
    reducer: {
        auth: authReducer,   // 👈 ya es el reducer directamente
        ui: uiReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
        serializableCheck: false,
    }),
});
