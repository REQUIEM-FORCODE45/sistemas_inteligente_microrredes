import { Component } from 'react';

// ErrorBoundary ligero: si cualquier componente del Dashboard lanza en render,
// muestra un mensaje con opcion de recargar en vez de colapsar la aplicacion
// (pantalla en blanco).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Error desconocido' };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: null });
  };

  render() {
    if (this.state.hasError) {
      // fallback compacto: no oculta el resto del dashboard cuando se usa
      // por seccion (prop compact).
      if (this.props.compact) {
        return (
          <div className="bg-card border border-dashed rounded-xl p-4 text-center">
            <p className="text-[11px] text-muted-foreground">
              Sección no disponible: {this.state.message}
            </p>
            <button
              onClick={this.handleReload}
              className="mt-2 px-3 py-1 rounded-lg border border-input text-[11px] font-medium hover:bg-muted transition-colors"
            >
              Reintentar
            </button>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-10 text-center">
          <div className="p-4 bg-destructive/10 rounded-full">
            <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-foreground">Algo salió mal en el Dashboard</p>
            <p className="text-sm text-muted-foreground max-w-[320px] mt-1">
              {this.state.message || 'Error inesperado al renderizar.'}
            </p>
          </div>
          <button
            onClick={this.handleReload}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
