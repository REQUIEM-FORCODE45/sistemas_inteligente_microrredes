import { configureStore } from '@reduxjs/toolkit';
import authReducer from './auth/authSlice';
import uiReducer from './ui/uiSlice';
import deviceReducer from '../../Dashboard/store/device/deviceSlice';
export const store = configureStore({

    reducer: {
        auth: authReducer,
        ui: uiReducer,
        devices: deviceReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
        serializableCheck: false,
    }),
});
