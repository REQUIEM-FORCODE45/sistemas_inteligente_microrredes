// store/slices/deviceSlice.js
import GridAPI from '@/api/grid-api';
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';


export const fetchDevices = createAsyncThunk(
    'devices/fetchAll',
    // P2: el flag viaja POR LLAMADA. Default false (diagrama, selectores);
    // solo la gestion pasa { includeInactive: true }.
    async (opts = {}, { rejectWithValue }) => {
        try {
            const includeInactive = opts?.includeInactive === true;
            const response = await GridAPI.get('/front/sensors', { params: includeInactive ? { includeInactive: true } : {} });
            return { devices: response.data.data, includeInactive };
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Error al cargar dispositivos');
        }
    }
);

export const registerDevice = createAsyncThunk(
    'devices/register',
    async (deviceData, { rejectWithValue, dispatch, getState }) => {
        try {
            const response = await GridAPI.post('/front/register_sensor', deviceData);
            // Refresca la lista completa (owner/sharedWith poblados) para que el
            // sensor nuevo aparezca de inmediato con su topic copiable.
            await dispatch(fetchDevices({ includeInactive: getState().devices.includeInactive }));
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Error al registrar dispositivo');
        }
    }
);

export const updateSensorStatus = createAsyncThunk(
    'devices/updateStatus',
    async ({ id, status }, { rejectWithValue, dispatch, getState }) => {
        try {
            const response = await GridAPI.patch(`/front/sensors/${id}/status`, { status });
            await dispatch(fetchDevices({ includeInactive: getState().devices.includeInactive }));
            return response.data;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'Error al actualizar el estado del dispositivo');
        }
    }
);

export const deleteSensor = createAsyncThunk(
    'devices/delete',
    // P3: force=true solo cuando el preflight encontro referencias vivas.
    async ({ id, force = false }, { rejectWithValue, dispatch, getState }) => {
        try {
            const response = await GridAPI.delete(`/front/sensors/${id}${force ? '?force=true' : ''}`);
            await dispatch(fetchDevices({ includeInactive: getState().devices.includeInactive }));
            return { id, ...response.data };
        } catch (error) {
            // P3: el 409 con referencias se devuelve integro (impact) para la UI.
            if (error.response?.status === 409 && error.response?.data?.impact) {
                return rejectWithValue({ conflict: true, ...error.response.data });
            }
            return rejectWithValue(error.response?.data?.message || 'Error al eliminar el dispositivo');
        }
    }
);

// P3: preflight de borrado (conteo + referencias, sin borrar).
export const fetchDeleteImpact = createAsyncThunk(
    'devices/deleteImpact',
    async (id, { rejectWithValue }) => {
        try {
            const response = await GridAPI.get(`/front/sensors/${id}/impact`);
            return response.data.impact;
        } catch (error) {
            return rejectWithValue(error.response?.data?.message || 'No se pudo calcular el impacto del borrado');
        }
    }
);

const deviceSlice = createSlice({
    name: 'devices',
    initialState: {
        devices: [],
        includeInactive: false,
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
                state.devices = action.payload.devices;
                state.includeInactive = action.payload.includeInactive;
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