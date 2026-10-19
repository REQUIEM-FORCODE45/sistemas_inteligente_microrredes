
import { useDispatch, useSelector } from 'react-redux';
import { useEffect } from 'react';
import GridAPI from '../src/api/grid-api.js';
import { fetchDevices, registerDevice, updateSensorStatus as updateSensorStatusThunk, deleteSensor as deleteSensorThunk, fetchDeleteImpact as fetchDeleteImpactThunk, clearMessages } from '../src/Dashboard/store/device/deviceSlice';

// P2: el modo viaja por llamada. Default false (diagrama, selectores);
// solo DeviceList pasa { includeInactive: true }.
export const useDevices = (opts = {}) => {
    const dispatch = useDispatch();
    const { devices, loading, error, successMsg } = useSelector(state => state.devices);
    const includeInactive = opts?.includeInactive === true;

    useEffect(() => {
        dispatch(fetchDevices({ includeInactive }));
    }, [dispatch, includeInactive]);

    const addDevice = async (deviceData) => {
        const result = await dispatch(registerDevice(deviceData));
        return !result.error;
    };

    const shareSensor = async (sensorId, payload) => {
        try {
            const response = await GridAPI.post(`/front/sensors/${sensorId}/share`, payload);
            dispatch(fetchDevices({ includeInactive }));
            return { success: true, data: response.data.sharedWith };
        } catch (err) {
            return { success: false, message: err.response?.data?.message || 'No se pudo compartir el sensor' };
        }
    };

    const unshareSensor = async (sensorId, targetId) => {
        try {
            const response = await GridAPI.post(`/front/sensors/${sensorId}/unshare`, { userId: targetId });
            dispatch(fetchDevices({ includeInactive }));
            return { success: true, data: response.data.sharedWith };
        } catch (err) {
            return { success: false, message: err.response?.data?.message || 'No se pudo revocar el acceso' };
        }
    };

    const updateSensorStatus = async (sensorId, status) => {
        const result = await dispatch(updateSensorStatusThunk({ id: sensorId, status }));
        if (result.error) return { success: false, message: result.payload };
        return { success: true };
    };

    const deleteSensor = async (sensorId, force = false) => {
        const result = await dispatch(deleteSensorThunk({ id: sensorId, force }));
        if (result.error) {
            // P3: 409 con referencias -> payload trae impact + message.
            if (result.payload?.conflict) return { success: false, conflict: true, ...result.payload };
            return { success: false, message: result.payload };
        }
        return { success: true, ...result.payload };
    };

    const deleteImpact = async (sensorId) => {
        const result = await dispatch(fetchDeleteImpactThunk(sensorId));
        if (result.error) return { success: false, message: result.payload };
        return { success: true, impact: result.payload };
    };

    const refreshDevices = () => dispatch(fetchDevices({ includeInactive }));

    const clearMsgs = () => dispatch(clearMessages());

    return { devices, loading, error, successMsg, addDevice, shareSensor, unshareSensor, updateSensorStatus, deleteSensor, deleteImpact, refreshDevices, clearMsgs };
};
