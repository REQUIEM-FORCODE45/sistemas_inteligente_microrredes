import { configureStore } from '@reduxjs/toolkit';
import authReducer from './auth/authSlice';
import uiReducer from './ui/uiSlice';
import deviceReducer from '../../Dashboard/store/device/deviceSlice';
import diagramReducer from '../../Dashboard/store/diagram/diagramSlice';
import optimizationReducer from '../../Dashboard/store/optimization/optimizationSlice';
export const store = configureStore({

    reducer: {
        auth: authReducer,
        ui: uiReducer,
        devices: deviceReducer,
        diagram: diagramReducer,
        optimization: optimizationReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
        serializableCheck: false,
    }),
});
