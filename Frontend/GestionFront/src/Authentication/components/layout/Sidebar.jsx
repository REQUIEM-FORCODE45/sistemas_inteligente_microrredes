import {
    Cpu,
    LogOut,
    UserCircle,
} from 'lucide-react';

export const Sidebar = ({ currentUser, onLogout }) => (
    <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6 border-b flex items-center gap-3">
            <Cpu className="text-blue-600" />
            <span className="font-bold text-lg">SensorGuard</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 mb-2">Menú Principal</div>
            <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 text-left">
                <UserCircle size={18} />
                <span className="truncate">Mi Panel</span>
            </button>
        </nav>
        <div className="p-4 border-t space-y-3">
            <div className="flex items-center gap-3 px-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 flex-shrink-0">
                    {currentUser?.fullName?.[0]?.toUpperCase()}
                </div>
                <div className="overflow-hidden">
                    <p className="text-sm font-bold truncate leading-none mb-1">{currentUser?.fullName}</p>
                </div>
            </div>
            <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors font-semibold">
                <LogOut size={16} /> Salir
            </button>
        </div>
    </aside>
);