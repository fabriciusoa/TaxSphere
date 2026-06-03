/**
 * Controle in-memory de pause/cancel para a automação DCTFweb por empresa.
 *
 * Mesmo padrão do perdcompAutomacaoControl — runner verifica entre etapas e
 * aborta cedo se cancelado, ou dorme se pausado.
 *
 * Estado é volátil: se o backend reiniciar, o pipeline em curso já será
 * marcado como erro pela limpeza de boot em `server.ts`.
 */

interface EstadoControle {
  paused: boolean;
  cancelled: boolean;
}

const estados = new Map<number, EstadoControle>();

function get(idEmpresa: number): EstadoControle {
  let s = estados.get(idEmpresa);
  if (!s) {
    s = { paused: false, cancelled: false };
    estados.set(idEmpresa, s);
  }
  return s;
}

export const dctfwebControl = {
  pause(idEmpresa: number): void { get(idEmpresa).paused = true; },
  resume(idEmpresa: number): void { get(idEmpresa).paused = false; },
  cancel(idEmpresa: number): void {
    const s = get(idEmpresa);
    s.cancelled = true;
    s.paused = false; // libera caso esteja dormindo
  },
  reset(idEmpresa: number): void {
    estados.set(idEmpresa, { paused: false, cancelled: false });
  },
  snapshot(idEmpresa: number): EstadoControle {
    return estados.get(idEmpresa) || { paused: false, cancelled: false };
  },
  isPaused(idEmpresa: number): boolean { return get(idEmpresa).paused; },
  isCancelled(idEmpresa: number): boolean { return get(idEmpresa).cancelled; },

  /** Aguarda enquanto pausado (polling 500ms). Retorna true se foi cancelado. */
  async waitWhilePaused(idEmpresa: number): Promise<boolean> {
    while (get(idEmpresa).paused && !get(idEmpresa).cancelled) {
      await new Promise(r => setTimeout(r, 500));
    }
    return get(idEmpresa).cancelled;
  },
};
