import {
    Sun,
    Zap,
    Database,
    Thermometer,
    Wifi,
    BarChart2,
} from 'lucide-react';

export const SENSORS = [
    {
        id: 'sensor_solar_01',
        label: 'Panel Solar Bloque A',
        icon: Sun,
        group: 'Solar',
    },
    {
        id: 'sensor_solar_02',
        label: 'Panel Solar Bloque B',
        icon: Sun,
        group: 'Solar',
    },
    {
        id: 'sensor_inv_01',
        label: 'Inversor Principal',
        icon: Zap,
        group: 'Inversores',
    },
    {
        id: 'sensor_inv_02',
        label: 'Inversor Secundario',
        icon: Zap,
        group: 'Inversores',
    },
    {
        id: 'sensor_bat_01',
        label: 'Batería Banco 1',
        icon: Database,
        group: 'Baterías',
    },
    {
        id: 'sensor_bat_02',
        label: 'Batería Banco 2',
        icon: Database,
        group: 'Baterías',
    },
    {
        id: 'sensor_temp_01',
        label: 'Temperatura Sala',
        icon: Thermometer,
        group: 'Ambiente',
    },
    {
        id: 'sensor_red_01',
        label: 'Medidor Red Pública',
        icon: Wifi,
        group: 'Red',
    },
    {
        id: 'sensor_cons_01',
        label: 'Consumo Total',
        icon: BarChart2,
        group: 'Consumo',
    },
];

export const SENSOR_GROUPS = [...new Set(SENSORS.map(s => s.group))];
