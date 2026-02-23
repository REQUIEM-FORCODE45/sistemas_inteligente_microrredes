// store/slices/deviceSlice.js
import GridAPI from '@/api/grid-api';
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';


export const fetchDevices = createAsyncThunk(
    'devices/fetchAll',
    async (_, { rejectWithValue }) => {
        try {
            const response = await GridAPI.get('/front/sensors');
            return response.data.sensors;
        } catch (error) {
            return rejectWithValue(error.response?.data?.msg || 'Error al cargar dispositivos');
        }
    }
);

export const registerDevice = createAsyncThunk(
    'devices/register',
    async (deviceData, { rejectWithValue }) => {
        try {
            const response = await GridAPI.post('/front/register_sensor', deviceData);
            return response.data.sensor;
        } catch (error) {
            return rejectWithValue(error.response?.data?.msg || 'Error al registrar dispositivo');
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
            .addCase(registerDevice.fulfilled, (state, action) => {
                state.loading = false;
                state.successMsg = 'Dispositivo registrado correctamente.';
                if (action.payload) state.devices.push(action.payload);
            })
            .addCase(registerDevice.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    }
});

export const { clearMessages } = deviceSlice.actions;
export default deviceSlice.reducer;