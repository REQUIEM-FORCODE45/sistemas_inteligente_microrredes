import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const GridAPI = axios.create({
    baseURL: API_URL
});

GridAPI.interceptors.request.use((config) => {
    const token = localStorage.getItem('sensor_token');
    if (token) {
        config.headers['x-token'] = token;
    }
    return config;
});

let authExpiredHandler = null;

export function setAuthExpiredHandler(fn) {
    authExpiredHandler = fn;
}

GridAPI.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401 && authExpiredHandler) {
            authExpiredHandler();
        }
        return Promise.reject(error);
    },
);

export default GridAPI;
