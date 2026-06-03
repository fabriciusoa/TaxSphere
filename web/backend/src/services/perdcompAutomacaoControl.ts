/**
 * Controle in-memory de pause/cancel para a automação PERD/Comp por empresa.
 *
 * O runner consulta `shouldCancel()` no início de cada etapa e aborta cedo se
 * sinalizado. Para pausa, chama `waitWhilePaused()` que dorme até o usuário
 * retomar ou cancelar.
 *
 * Estado é volátil — se o backend reiniciar, o pipeline em curso já será
 * marcado como erro pelo boot cleanup do scheduler.
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

export const automacaoControl = {
  /** Marca como pausada — runner suspende entre etapas. */
  pause(idEmpresa: number): void {
    get(idEmpresa).paused = true;
  },
  /** Retoma execução pausada. */
  resume(idEmpresa: number): void {
    get(idEmpresa).paused = false;
  },
  /** Sinaliza cancelamento — runner aborta na próxima checagem. */
  cancel(idEmpresa: number): void {
    const s = get(idEmpresa);
    s.cancelled = true;
    s.paused = false; // libera caso esteja dormindo
  },
  /** Reseta para nova execução. */
  reset(idEmpresa: number): void {
    estados.set(idEmpresa, { paused: false, cancelled: false });
  },
  /** Snapshot do estado (sem auto-criar). */
  snapshot(idEmpresa: number): EstadoControle {
    return estados.get(idEmpresa) || { paused: false, cancelled: false };
  },
  isPaused(idEmpresa: number): boolean { return get(idEmpresa).paused; },
  isCancelled(idEmpresa: number): boolean { return get(idEmpresa).cancelled; },
  /** Aguarda enquanto estiver pausado (polling 500ms). Retorna true se foi cancelado. */
  async waitWhilePaused(idEmpresa: number): Promise<boolean> {
    while (get(idEmpresa).paused && !get(idEmpresa).cancelled) {
      await new Promise(r => setTimeout(r, 500));
    }
    return get(idEmpresa).cancelled;
  },
};
