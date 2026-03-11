
import { createSlice } from '@reduxjs/toolkit';


const storedUser = JSON.parse(localStorage.getItem('sensor_user') || 'null');
const storedToken = localStorage.getItem('sensor_token') || null;

const authSlice = createSlice({
    name: 'auth',
    initialState: {
        user: storedUser,
        token: storedToken,
        loading: false,
        msg: { type: '', text: '' }
    },
    reducers: {
        setUser: (state, action) => {
            state.user = action.payload.user;
            state.token = action.payload.token;
        },
        setLoading: (state, action) => {
            state.loading = action.payload;
        },
        setMsg: (state, action) => {
            state.msg = action.payload;
        },
        logout: (state) => {
            state.user = null;
            state.token = null;
            state.msg = { type: '', text: '' };
            localStorage.removeItem('sensor_user');
            localStorage.removeItem('sensor_token');
        }
    }
});

export const { setUser, setLoading, setMsg, logout } = authSlice.actions;
export default authSlice.reducer;