
import { AuthInput } from '../ui/AuthInput';
import {
    Cpu,
    CheckCircle2,
    AlertCircle,

} from 'lucide-react';


export const AuthView = ({ isLogin, onSubmit, onToggleView, showPassword, onTogglePassword, msg, register, errors }) => (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 font-sans text-slate-900">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
            <div className="flex justify-center mb-6">
                <div className="bg-blue-600 p-3 rounded-xl text-white">
                    <Cpu size={32} />
                </div>
            </div>
            <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">
                {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </h2>
            <p className="text-slate-500 text-center text-sm mb-8 font-medium italic underline">SensorGuard Security</p>

            {msg.text && (
                <div className={`p-3 rounded-lg mb-4 text-sm flex items-center gap-2 ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {msg.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                    {msg.text}
                </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
                {!isLogin && (
                    <AuthInput
                        label="Nombre Completo"
                        name="name"
                        register={register}
                        error={errors.name}
                        validation={{
                            required: "El nombre es obligatorio",
                            minLength: { value: 3, message: "Nombre demasiado corto" }
                        }}
                    />
                )}
                <AuthInput
                    label="Usuario"
                    name="email"
                    register={register}
                    error={errors.email}
                    validation={{
                        required: "El usuario es obligatorio",
                        minLength: { value: 4, message: "Mínimo 4 caracteres" }
                    }}
                />
                <AuthInput
                    label="Contraseña"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    register={register}
                    error={errors.password}
                    validation={{
                        required: "La contraseña es obligatoria",
                        minLength: { value: 6, message: "Mínimo 6 caracteres" }
                    }}
                    showPassword={showPassword}
                    togglePassword={onTogglePassword}
                />
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-100">
                    {isLogin ? 'Entrar al Sistema' : 'Registrarme'}
                </button>
            </form>
            <button onClick={onToggleView} className="w-full mt-6 text-sm text-slate-500 hover:text-blue-600 font-medium text-center">
                {isLogin ? '¿No tienes cuenta? Regístrate' : 'Ya tengo cuenta, volver al login'}
            </button>
        </div>
    </div>
);