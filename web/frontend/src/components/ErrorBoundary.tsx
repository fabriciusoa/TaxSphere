import { Component } from 'react';
import type { ReactNode } from 'react';
import { sendErrorToBackend } from '../services/errorLogService';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    // Não muda nada na UI, apenas marca que houve erro
    return { hasError: false };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    // Apenas loga no console e envia para backend
    console.error('Erro capturado:', error, errorInfo);
    
    // Enviar para backend silenciosamente
    sendErrorToBackend({
      error_message: error.message,
      error_stack: error.stack,
      component_stack: errorInfo.componentStack,
      url: window.location.href,
      user_agent: navigator.userAgent,
      browser_info: JSON.stringify({
        language: navigator.language,
        platform: navigator.platform,
        vendor: navigator.vendor,
        cookieEnabled: navigator.cookieEnabled
      })
    });
  }

  render() {
    // Sempre renderiza os children normalmente
    return this.props.children;
  }
}
