import { useDispatch, useSelector } from 'react-redux';
import { setUser, setLoading, setMsg, logout as logoutAction } from '../src/Authentication/store';
import GridAPI from '../src/api/grid-api.js';

export const useAuthSystem = () => {
    const dispatch = useDispatch();
    const { user: currentUser, token, loading, msg } = useSelector(state => state.auth);

    const login = async (email, password) => {
        dispatch(setLoading(true));
        try {
            const response = await GridAPI.post('/auth', { email, password });

            if (!response.data.ok) {
                dispatch(setMsg({ type: 'error', text: response.data.msg || 'Credenciales incorrectas' }));
                return null;
            }

            const { uid, name, token } = response.data;
            const user = { id: uid, fullName: name };

            dispatch(setUser({ user, token }));
            localStorage.setItem('sensor_user', JSON.stringify(user));
            localStorage.setItem('sensor_token', token);

            dispatch(setMsg({ type: '', text: '' }));
            return user;
        } catch (error) {
            const errorMsg = error.response?.data?.msg || 'Error al iniciar sesión';
            dispatch(setMsg({ type: 'error', text: errorMsg }));
            return null;
        } finally {
            dispatch(setLoading(false));
        }
    };

    const register = async (email, password, name) => {
        dispatch(setLoading(true));
        try {
            await GridAPI.post('/auth/new', { name, email, password });
            dispatch(setMsg({ type: 'success', text: 'Registro exitoso.' }));
            return true;
        } catch (error) {
            const errorMsg = error.response?.data?.msg || 'Error en el registro';
            dispatch(setMsg({ type: 'error', text: errorMsg }));
            return false;
        } finally {
            dispatch(setLoading(false));
        }
    };

    const logout = () => {
        dispatch(logoutAction());
    };

    return {
        currentUser,
        loading,
        msg,
        isAuthenticated: currentUser !== null,
        setMsg: (payload) => dispatch(setMsg(payload)),
        login,
        register,
        logout,
    };
};