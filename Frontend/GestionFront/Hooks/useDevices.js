
import { useDispatch, useSelector } from 'react-redux';
import { useEffect } from 'react';
import GridAPI from '../src/api/grid-api.js';
import { fetchDevices, registerDevice, clearMessages } from '../src/Dashboard/store/device/deviceSlice';

export const useDevices = () => {
    const dispatch = useDispatch();
    const { devices, loading, error, successMsg } = useSelector(state => state.devices);

    useEffect(() => {
        dispatch(fetchDevices());
    }, [dispatch]);

    const addDevice = async (deviceData) => {
        const result = await dispatch(registerDevice(deviceData));
        return !result.error;
    };

    const shareSensor = async (sensorId, payload) => {
        try {
            const response = await GridAPI.post(`/front/sensors/${sensorId}/share`, payload);
            dispatch(fetchDevices());
            return { success: true, data: response.data.sharedWith };
        } catch (err) {
            return { success: false, message: err.response?.data?.message || 'No se pudo compartir el sensor' };
        }
    };

    const unshareSensor = async (sensorId, targetId) => {
        try {
            const response = await GridAPI.post(`/front/sensors/${sensorId}/unshare`, { userId: targetId });
            dispatch(fetchDevices());
            return { success: true, data: response.data.sharedWith };
        } catch (err) {
            return { success: false, message: err.response?.data?.message || 'No se pudo revocar el acceso' };
        }
    };

    const refreshDevices = () => dispatch(fetchDevices());

    const clearMsgs = () => dispatch(clearMessages());

    return { devices, loading, error, successMsg, addDevice, shareSensor, unshareSensor, refreshDevices, clearMsgs };
};
