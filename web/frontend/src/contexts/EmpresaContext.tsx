import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { empresasService } from '../services/empresasService';
import { useAuth } from './AuthContext';

export interface EmpresaItem {
  id: number;
  razao_social: string;
  cnpj: string;
}

interface EmpresaContextValue {
  empresaId: number | '';
  setEmpresaId: (id: number | '') => void;
  empresas: EmpresaItem[];
  empresa: EmpresaItem | undefined;
  loadingEmpresas: boolean;
  /** Recarrega a lista de empresas da API (ex.: após cadastrar uma nova). */
  recarregarEmpresas: () => Promise<void>;
}

const EmpresaContext = createContext<EmpresaContextValue>({
  empresaId: '',
  setEmpresaId: () => {},
  empresas: [],
  empresa: undefined,
  loadingEmpresas: false,
  recarregarEmpresas: async () => {},
});

const STORAGE_KEY = 'mindtax_empresa_id';

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [empresaId, setEmpresaIdState] = useState<number | ''>('');
  const [empresas, setEmpresas] = useState<EmpresaItem[]>([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);

  const aplicarListaELocalStorage = useCallback((list: EmpresaItem[]) => {
    setEmpresas(list);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const storedId = Number(stored);
      if (list.some(e => e.id === storedId)) {
        setEmpresaIdState(storedId);
      } else {
        setEmpresaIdState('');
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const recarregarEmpresas = useCallback(async () => {
    if (!user) return;
    setLoadingEmpresas(true);
    try {
      const r = await empresasService.listar({ limit: 500 });
      aplicarListaELocalStorage(r.data || []);
    } catch {
      setEmpresas([]);
    } finally {
      setLoadingEmpresas(false);
    }
  }, [user, aplicarListaELocalStorage]);

  /** Só busca empresas quando a sessão estiver válida.
   * Evita lista vazia permanente após o login (requisição na tela /login retornava 401). */
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setEmpresas([]);
      setEmpresaIdState('');
      localStorage.removeItem(STORAGE_KEY);
      setLoadingEmpresas(false);
      return;
    }

    let cancelled = false;
    setLoadingEmpresas(true);
    empresasService
      .listar({ limit: 500 })
      .then((r) => {
        if (cancelled) return;
        aplicarListaELocalStorage(r.data || []);
      })
      .catch(() => {
        if (!cancelled) setEmpresas([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingEmpresas(false);
      });

    return () => { cancelled = true; };
  }, [user, authLoading, aplicarListaELocalStorage]);

  const setEmpresaId = (id: number | '') => {
    setEmpresaIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, String(id));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const empresa = empresaId ? empresas.find(e => e.id === empresaId) : undefined;

  return (
    <EmpresaContext.Provider value={{ empresaId, setEmpresaId, empresas, empresa, loadingEmpresas, recarregarEmpresas }}>
      {children}
    </EmpresaContext.Provider>
  );
}

export function useEmpresa() {
  return useContext(EmpresaContext);
}
