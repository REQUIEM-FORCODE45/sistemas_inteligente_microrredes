import axios from 'axios';

const GridAPI = axios.create({
    baseURL: 'http://localhost:3000/api'
});

// Añadimos el interceptor para inyectar el token en las cabeceras
GridAPI.interceptors.request.use((config) => {
    const token = localStorage.getItem('sensor_token');
    if (token) {
        // Asegúrate de que el nombre del header es 'Authorization' si usas Bearer tokens
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
});

export default GridAPI;