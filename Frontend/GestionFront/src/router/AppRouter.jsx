import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { AuthPage } from '../Authentication/pages/AuthPage';
import { App } from '../Dashboard/pages/App';

export const AppRouter = () => {
    const { user } = useSelector(state => state.auth);
    const isAuthenticated = !!user;

    return (
        <Routes>
            {isAuthenticated ? (
                <>
                    <Route path="/*" element={<App />} />
                    <Route path="/auth/*" element={<Navigate to="/" />} />
                </>
            ) : (
                <>
                    <Route path="/auth/*" element={<AuthPage />} />
                    <Route path="/*" element={<Navigate to="/auth" />} />
                </>
            )}
        </Routes>
    );
};
