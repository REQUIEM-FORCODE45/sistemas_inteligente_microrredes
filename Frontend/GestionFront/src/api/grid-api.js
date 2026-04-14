import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const GridAPI = axios.create({
    baseURL: API_URL
});

// Añadimos el interceptor para inyectar el token en las cabeceras
GridAPI.interceptors.request.use((config) => {
    const token = localStorage.getItem('sensor_token');
    if (token) {
        config.headers['x-token'] = token;
    }
    return config;
});

export default GridAPI;