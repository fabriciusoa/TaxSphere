import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api from '../services/api';
import { logger } from '../utils/logger';

export interface AuthUser {
  id: number;
  nome: string;
  email: string;
  cpf: string;
  perfil: string;
  perfil_id: number;
  status: string;
  adm_system: boolean;
  user_modulos: UserModulos[];
}

export interface UserModulos {
  usuario_id: number;
  perfil: string;
  adm_system?: boolean;
  modulo?: string | null;
  user_funcionalidade?: UserFuncionalidade[];
}

export interface UserFuncionalidade {
  usuario_id: number;
  modulo?: string | null;
  funcionalidade?: string | null;
  inserir?: boolean;
  excluir?: boolean;
  consultar?: boolean;
  alterar?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Cache de dados do usuário em sessionStorage (não o token — apenas dados não-sensíveis)
// Persiste no F5, mas é limpo ao fechar o browser. O token permanece seguro no cookie httpOnly.
const USER_CACHE_KEY = 'taxsphere_user';

function getCachedUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch (error: any) {
    logger.error('Falha ao ler cache de usuário', { error });
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialUser = getCachedUser();

  const [user, setUser] = useState<AuthUser | null>(initialUser);
  // Se há cache, não mostra spinner — validação via /auth/me ocorre em background
  const [loading, setLoading] = useState(!initialUser);

  useEffect(() => {
    api.get<AuthUser>('/auth/me')
      .then(({ data }) => {
        setUser(data);
        sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(data));
      })
      .catch((error: any) => {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
          logger.error('Sessão inválida ou expirada', { status });
          setUser(null);
          sessionStorage.removeItem(USER_CACHE_KEY);
        } else {
          logger.error('Erro de rede ao validar sessão, mantendo cache', { error: error?.message });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, senha: string) => {
    const { data } = await api.post<{ user: AuthUser }>('/auth/login', { email, senha });
    setUser(data.user);
    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(data.user));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (error: any) {
      logger.error('Erro ao fazer logout', { error });
      // silencioso — limpar estado mesmo se o servidor falhar
    } finally {
      setUser(null);
      sessionStorage.removeItem(USER_CACHE_KEY);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Hook para consumir o AuthContext em qualquer componente */
// eslint-disable-next-line react-refresh/only-export-components -- padrão Context: Provider + hook no mesmo arquivo
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
