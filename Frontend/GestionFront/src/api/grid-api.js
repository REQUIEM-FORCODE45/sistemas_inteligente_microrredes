import axios from 'axios';

const GridAPI = axios.create({
    baseURL: 'http://localhost:3000/api'
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