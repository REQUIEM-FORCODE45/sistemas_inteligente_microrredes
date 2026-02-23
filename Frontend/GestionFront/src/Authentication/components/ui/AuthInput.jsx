import {
    Eye,
    EyeOff,
} from 'lucide-react';

export const AuthInput = ({ label, name, type = "text", register, validation, error, showPassword, togglePassword }) => (
    <div className="space-y-1">
        <label className="block text-xs font-bold text-slate-700 uppercase">{label}</label>
        <div className="relative">
            <input
                {...register(name, validation)}
                type={type}
                className={`w-full px-4 py-2 rounded-lg border focus:ring-2 outline-none transition-all ${error ? 'border-red-500 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-500'
                    }`}
            />
            {togglePassword && (
                <button type="button" onClick={togglePassword} className="absolute right-3 top-2.5 text-slate-400">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            )}
        </div>
        {error && <p className="text-[10px] text-red-500 font-bold uppercase">{error.message}</p>}
    </div>
);