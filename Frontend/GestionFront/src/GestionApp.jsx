import { useEffect } from 'react';
import { AppRouter } from './router/AppRouter';
import { BrowserRouter } from 'react-router-dom';
import { Provider, useDispatch } from 'react-redux';
import { store } from './Authentication/store/store';
import { logout } from './Authentication/store';
import { setAuthExpiredHandler } from './api/grid-api';

function AuthInterceptorInit() {
    const dispatch = useDispatch();

    useEffect(() => {
        setAuthExpiredHandler(() => {
            dispatch(logout());
        });
    }, [dispatch]);

    return null;
}

export const GestionApp = () => {
    return (
        <Provider store={store}>
            <BrowserRouter>
                <AuthInterceptorInit />
                <AppRouter />
            </BrowserRouter>
        </Provider>
    );
};
