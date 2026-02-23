import React, { StrictMode } from 'react'
import { AppRouter } from './router/AppRouter';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './Authentication/store/store';
export const GestionApp = () => {
    return (
        <Provider store={store}>
            <BrowserRouter>
                <AppRouter />
            </BrowserRouter>
        </Provider>
    )
}
