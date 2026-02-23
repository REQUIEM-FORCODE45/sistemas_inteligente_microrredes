import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';


import {
  Layout,
  Activity,
  Settings,
  Bell,
  ShieldCheck,
  Menu,
  ChevronLeft,
  ChevronRight,
  Database,
  Users,
  LogOut,
  Search,
  UserPlus,
  MoreVertical,
  Shield,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import UserManagment from '../components/users/UserManagment';


import { logout } from '../../Authentication/store';


// shadcn components (simulated via Tailwind for the demo to be self-contained)
const Button = ({ children, variant = "ghost", className = "", size = "icon", ...props }) => {
  const variants = {
    ghost: "hover:bg-accent hover:text-accent-foreground",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  };
  const sizes = {
    icon: "h-10 w-10",
    sm: "h-8 px-3 text-xs",
    default: "h-10 px-4 py-2",
  };
  return (
    <button className={`inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size || 'default']} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Badge = ({ children, variant = "default" }) => {
  const variants = {
    default: "bg-primary/10 text-primary border-primary/20",
    success: "bg-green-500/10 text-green-600 border-green-500/20",
    warning: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    outline: "border text-muted-foreground",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${variants[variant]}`}>
      {children}
    </span>
  );
};

const SidebarItem = ({ icon: Icon, label, active = false, isCollapsed = false }) => (
  <div
    className={`flex items-center cursor-pointer transition-all duration-200 group
      ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}
      ${isCollapsed ? 'justify-center mx-2' : 'px-3 mx-2'} 
      py-2.5 rounded-lg mb-1`}
  >
    <Icon size={20} className={`${active ? 'text-primary' : 'group-hover:scale-110 transition-transform'}`} />
    {!isCollapsed && (
      <span className="ml-3 font-medium text-sm whitespace-nowrap overflow-hidden animate-in fade-in slide-in-from-left-2">
        {label}
      </span>
    )}
  </div>
);

export const App = () => {


  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  const dispatch = useDispatch();
  const handleLogout = () => dispatch(logout());

  // Logic to handle auto-collapse on smaller screens (but not mobile)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024 && window.innerWidth > 768) {
        setIsCollapsed(true);
      } else if (window.innerWidth >= 1024) {
        setIsCollapsed(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Layout },
    { id: 'realtime', label: 'Monitoreo Real-time', icon: Activity },
    { id: 'devices', label: 'Dispositivos IoT', icon: Database },
    { id: 'users', label: 'Gestión de Operadores', icon: Users },
    { id: 'security', label: 'Seguridad y Logs', icon: ShieldCheck },
    { id: 'settings', label: 'Configuración', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* --- DESKTOP SIDEBAR --- */}
      <aside
        className={`hidden md:flex flex-col border-r bg-card transition-all duration-300 ease-in-out
          ${isCollapsed ? 'w-[70px]' : 'w-[260px]'}`}
      >
        <div className="p-4 flex items-center justify-between border-b h-16">
          {!isCollapsed && (
            <div className="flex items-center gap-2 font-bold text-xl tracking-tight animate-in fade-in duration-500">
              <div className="bg-primary p-1 rounded-md text-primary-foreground">
                <Activity size={20} />
              </div>
              <span>SolarGrid</span>
            </div>
          )}
          {isCollapsed && (
            <div className="mx-auto bg-primary p-1.5 rounded-md text-primary-foreground">
              <Activity size={18} />
            </div>
          )}
        </div>

        <nav className="flex-1 pt-4 overflow-y-auto no-scrollbar">
          {menuItems.map((item) => (
            <div key={item.id} onClick={() => setActiveTab(item.id)}>
              <SidebarItem
                icon={item.icon}
                label={item.label}
                active={activeTab === item.id}
                isCollapsed={isCollapsed}
              />
            </div>
          ))}
        </nav>

        <div className="p-4 border-t">
          <Button
            variant="ghost"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex justify-center hover:bg-accent"
          >
            {isCollapsed ? <ChevronRight size={20} /> : <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><ChevronLeft size={16} /> <span>Contraer Panel</span></div>}
          </Button>
          <div className="mt-2" onClick={handleLogout}>
            <SidebarItem icon={LogOut} label="Cerrar Sesión" isCollapsed={isCollapsed} />
          </div>
        </div>
      </aside>

      {/* --- MOBILE DRAWER OVERLAY --- */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div className={`fixed inset-y-0 left-0 w-64 bg-card border-r z-50 transform transition-transform duration-300 ease-in-out md:hidden
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 flex items-center justify-between border-b">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Activity className="text-primary" />
            <span>SolarGrid</span>
          </div>
          <Button onClick={() => setIsMobileMenuOpen(false)}>
            <ChevronLeft size={20} />
          </Button>
        </div>
        <nav className="p-2 pt-4">
          {menuItems.map((item) => (
            <div key={item.id} onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}>
              <SidebarItem icon={item.icon} label={item.label} active={activeTab === item.id} />
            </div>
          ))}
        </nav>
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950">
        {/* Header Superior */}
        <header className="h-16 border-b bg-card px-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <Button variant="outline" className="md:hidden" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={20} />
            </Button>
            <div className="hidden sm:flex items-center bg-accent rounded-full px-3 py-1.5 w-64 border transition-all focus-within:ring-2 ring-primary/20">
              <Search size={16} className="text-muted-foreground mr-2" />
              <input
                placeholder="Buscar sensores..."
                className="bg-transparent border-none text-sm focus:outline-none w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative">
              <Button variant="ghost" size="icon" className="relative">
                <Bell size={20} />
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background"></span>
              </Button>
            </div>
            <div className="h-8 w-px bg-border mx-1"></div>
            <div className="flex items-center gap-3 pl-2">
              <div className="hidden text-right lg:block">
                <p className="text-sm font-semibold leading-none">Admin Usuario</p>
                <p className="text-[11px] text-muted-foreground mt-1 font-medium bg-secondary px-1.5 py-0.5 rounded">Super Administrador</p>
              </div>
              <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-md">
                AD
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6 overflow-y-auto">
          <div className="flex flex-col gap-6 max-w-7xl mx-auto">

            {/* Conditional Content Rendering */}
            {activeTab === 'users' ? (
              <UserManagment />
            ) : (
              // Original Dashboard Content
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <h1 className="text-2xl font-bold tracking-tight capitalize">{activeTab.replace('-', ' ')}</h1>
                  <p className="text-muted-foreground">Monitoreo de microrred en tiempo real - Sede Principal.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {[
                    { title: "Generación Solar", val: "42.5", unit: "kW", trend: "+5.2%", color: "text-yellow-500" },
                    { title: "Carga de Red", val: "12.8", unit: "kW", trend: "-1.5%", color: "text-blue-500" },
                    { title: "Nivel Baterías", val: "88", unit: "%", trend: "+0.3%", color: "text-green-500" },
                    { title: "Ahorro CO2", val: "2.4", unit: "ton", trend: "+12%", color: "text-emerald-500" },
                  ].map((stat, i) => (
                    <div key={i} className="p-6 bg-card border rounded-xl shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
                      <div className="flex items-center justify-between mb-2 text-muted-foreground">
                        <p className="text-xs font-bold uppercase tracking-wider">{stat.title}</p>
                        <Activity size={16} className={stat.color} />
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">{stat.val}</span>
                        <span className="text-sm font-medium text-muted-foreground">{stat.unit}</span>
                      </div>
                      <p className={`text-[10px] font-bold mt-2 ${stat.trend.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                        {stat.trend} <span className="text-muted-foreground font-normal">vs periodo anterior</span>
                      </p>
                    </div>
                  ))}
                </div>

                <div className="bg-card border rounded-xl p-6 min-h-[400px] flex items-center justify-center text-muted-foreground border-dashed bg-muted/20">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="p-4 bg-background rounded-full border shadow-sm">
                      <Database size={40} className="text-primary/40" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Analítica de Datos</p>
                      <p className="text-sm max-w-[280px]">Selecciona un sensor o dispositivo para visualizar gráficos de flujo de energía y telemetría.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
};

