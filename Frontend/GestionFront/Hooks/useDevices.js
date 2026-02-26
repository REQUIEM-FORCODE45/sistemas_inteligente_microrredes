// Dashboard/hooks/useDevices.js
import { useDispatch, useSelector } from 'react-redux';
import { useEffect } from 'react';
import { fetchDevices, registerDevice, clearMessages } from '../src/Dashboard/store/device/deviceSlice.js';

export const useDevices = () => {
    const storeState = useSelector(state => state);
    const dispatch = useDispatch();
    const { devices, loading, error, successMsg } = useSelector(state => state.devices);

    useEffect(() => {
        dispatch(fetchDevices());
    }, [dispatch]);

    const addDevice = async (deviceData) => {
        const result = await dispatch(registerDevice(deviceData));
        return !result.error; // true si fue exitoso
    };

    const clearMsgs = () => dispatch(clearMessages());

    return { devices, loading, error, successMsg, addDevice, clearMsgs };
};