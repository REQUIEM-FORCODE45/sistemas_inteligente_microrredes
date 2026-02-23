import React, { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Sidebar } from '../components/layout/Sidebar.jsx';
import { AuthView } from '../components/views/AuthView';
import { useAuthSystem } from '../../../Hooks/UseAuthSystem.js';

export const AuthPage = () => {
    const { currentUser, msg, setMsg, login, register, logout } = useAuthSystem();

    const { register: registerField, handleSubmit, reset, formState: { errors } } = useForm({
        defaultValues: { name: '', email: '', password: '' }
    });

    const [view, setView] = useState('login');
    const [showPassword, setShowPassword] = useState(false);

    const onAuthSubmit = async (data) => {
        if (view === 'login') {
            await login(data.email, data.password);
        } else {
            const success = await register(data.email, data.password, data.name);
            if (success) {
                setView('login');
                reset();
            }
        }
    };

    const toggleView = () => {
        setView(prev => prev === 'login' ? 'register' : 'login');
        setMsg({ type: '', text: '' });
        reset();
    };

    if (view === 'login' || view === 'register') {
        return (
            <AuthView
                isLogin={view === 'login'}
                onSubmit={handleSubmit(onAuthSubmit)}
                onToggleView={toggleView}
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword(!showPassword)}
                msg={msg}
                register={registerField}
                errors={errors}
            />
        );
    }

    return (
        <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
            <Sidebar currentUser={currentUser} onLogout={logout} />

            <main className="flex-1 overflow-y-auto p-8">
                <div className="mb-8">
                    <h2 className="text-3xl font-bold mb-2 text-slate-800">
                        Bienvenido, {currentUser?.fullName}
                    </h2>
                    <p className="text-slate-500">Visualiza el estado de tus dispositivos en tiempo real.</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm w-fit">
                    <p className="text-sm text-slate-500">Usuario activo</p>
                    <p className="text-lg font-bold text-slate-800">{currentUser?.fullName}</p>
                </div>
            </main>
        </div>
    );
};