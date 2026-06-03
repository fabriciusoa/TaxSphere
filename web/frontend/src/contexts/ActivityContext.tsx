import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Rastreia atividades em curso (filas, sincronizações de longa duração, etc.) que
 * exigem manter a UI estável — em especial o drawer/menu lateral, que NÃO deve
 * fechar enquanto algo importante está rodando.
 *
 * Cada atividade tem uma chave única (ex: 'perdcomp-fila-agendamento'). Páginas
 * marcam `setActive(key, true)` ao iniciar e `setActive(key, false)` ao terminar.
 * O Layout consulta `isAnyActive` para travar o drawer aberto.
 */
interface ActivityState {
  /** Mapa de chaves de atividade ativas → label exibido em tooltips/avisos. */
  active: Record<string, string>;
  /** Existe alguma atividade ativa no momento? */
  isAnyActive: boolean;
  /** Registra/desmarca uma atividade. `label` aparece em tooltips de UI. */
  setActive: (key: string, isActive: boolean, label?: string) => void;
}

const ActivityCtx = createContext<ActivityState | null>(null);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [active, setActiveMap] = useState<Record<string, string>>({});

  const setActive = useCallback((key: string, isActive: boolean, label?: string) => {
    setActiveMap((prev) => {
      const next = { ...prev };
      if (isActive) next[key] = label || key;
      else delete next[key];
      return next;
    });
  }, []);

  const value = useMemo<ActivityState>(() => ({
    active,
    isAnyActive: Object.keys(active).length > 0,
    setActive,
  }), [active, setActive]);

  return <ActivityCtx.Provider value={value}>{children}</ActivityCtx.Provider>;
}

export function useActivity(): ActivityState {
  const v = useContext(ActivityCtx);
  if (!v) throw new Error('useActivity precisa estar dentro de <ActivityProvider>');
  return v;
}
