// store/slices/deviceSlice.js
import GridAPI from '@/api/grid-api';
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';


export const fetchDevices = createAsyncThunk(
    'devices/fetchAll',
    async (_, { rejectWithValue }) => {
        try {
            // includeInactive: la UI de gestion necesita ver tambien los
            // sensores inactivos/en mantenimiento para poder reactivarlos.
            const response = await GridAPI.get('/front/sensors', { params: { includeInactive: true } });
            return response.data.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Error al cargar dispositivos');
        }
    }
);

export const registerDevice = createAsyncThunk(
    'devices/register',
    async (deviceData, { rejectWithValue, dispatch }) => {
        try {
            const response = await GridAPI.post('/front/register_sensor', deviceData);
            // Refresca la lista completa (owner/sharedWith poblados) para que el
            // sensor nuevo aparezca de inmediato con su topic copiable.
            await dispatch(fetchDevices());
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Error al registrar dispositivo');
        }
    }
);

export const updateSensorStatus = createAsyncThunk(
    'devices/updateStatus',
    async ({ id, status }, { rejectWithValue, dispatch }) => {
        try {
            const response = await GridAPI.patch(`/front/sensors/${id}/status`, { status });
            await dispatch(fetchDevices());
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Error al actualizar el estado del dispositivo');
        }
    }
);

export const deleteSensor = createAsyncThunk(
    'devices/delete',
    async (id, { rejectWithValue, dispatch }) => {
        try {
            const response = await GridAPI.delete(`/front/sensors/${id}`);
            await dispatch(fetchDevices());
            return { id, ...response.data };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Error al eliminar el dispositivo');
        }
    }
);

const deviceSlice = createSlice({
    name: 'devices',
    initialState: {
        devices: [],
        loading: false,
        error: null,
        successMsg: null,
    },
    reducers: {
        clearMessages: (state) => {
            state.error = null;
            state.successMsg = null;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchDevices.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchDevices.fulfilled, (state, action) => {
                state.loading = false;
                state.devices = action.payload;
            })
            .addCase(fetchDevices.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            .addCase(registerDevice.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(registerDevice.fulfilled, (state) => {
                state.loading = false;
                state.successMsg = 'Dispositivo registrado correctamente.';
            })
            .addCase(registerDevice.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
            // updateSensorStatus / deleteSensor no escriben el error/success
            // global: son acciones locales del DeviceList, que muestra su
            // propio aviso (evita que AddDeviceForm reciba mensajes ajenos).
    }
});

export const { clearMessages } = deviceSlice.actions;
export default deviceSlice.reducer;