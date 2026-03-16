import { useState, useCallback } from 'react';

export const CHART_MODES = {
    COMBINED: 'combined',
    SEPARATED: 'separated',
};

export const useChartOptions = () => {
    const [chartMode, setChartMode] = useState(CHART_MODES.COMBINED);
    const [separatedKeys, setSeparatedKeys] = useState([]);

    const toggleSeparatedKey = useCallback((key) => {
        setSeparatedKeys(prev => 
            prev.includes(key) 
                ? prev.filter(k => k !== key)
                : [...prev, key]
        );
    }, []);

    const selectAllSeparated = useCallback((keys) => {
        setSeparatedKeys(keys);
    }, []);

    const clearSeparated = useCallback(() => {
        setSeparatedKeys([]);
    }, []);

    const resetToDefault = useCallback(() => {
        setChartMode(CHART_MODES.COMBINED);
        setSeparatedKeys([]);
    }, []);

    return {
        chartMode,
        setChartMode,
        separatedKeys,
        toggleSeparatedKey,
        selectAllSeparated,
        clearSeparated,
        resetToDefault,
    };
};
