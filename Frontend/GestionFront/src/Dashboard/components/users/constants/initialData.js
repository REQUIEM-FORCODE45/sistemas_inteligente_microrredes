import { SENSORS } from './sensors';

export const INITIAL_USERS = [
    {
        id: '1',
        name: 'Admin Principal',
        email: 'admin@solargrid.co',
        role: 'superadmin',
        active: true,
        passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
        sensorAccess: SENSORS.map(s => s.id),
        createdAt: '2024-01-15',
    },
    {
        id: '2',
        name: 'Carlos Méndez',
        email: 'carlos@solargrid.co',
        role: 'operador',
        active: true,
        passwordHash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
        sensorAccess: ['sensor_solar_01', 'sensor_inv_01', 'sensor_cons_01'],
        createdAt: '2024-02-20',
    },
    {
        id: '3',
        name: 'Laura Torres',
        email: 'laura@solargrid.co',
        role: 'visor',
        active: false,
        passwordHash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
        sensorAccess: ['sensor_cons_01', 'sensor_temp_01'],
        createdAt: '2024-03-10',
    },
];
