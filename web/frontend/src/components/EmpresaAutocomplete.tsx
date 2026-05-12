import { useMemo, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import type { SxProps, Theme } from '@mui/material/styles';
import { useEmpresa, type EmpresaItem } from '../contexts/EmpresaContext';

export type EmpresaFilterOption = EmpresaItem | { id: ''; razao_social: string; cnpj: string };

export interface EmpresaAutocompleteProps {
  label?: string;
  minWidth?: number | string;
  todasLabel?: string;
  sx?: SxProps<Theme>;
  /** Chamado após atualizar o contexto (ex.: `setPage(0)` na listagem). */
  onEmpresaSelected?: (id: number | '') => void;
}

/**
 * Filtro de empresa com busca por razão social ou CNPJ.
 * Usa `EmpresaProvider` — lista é recarregada após login.
 */
export function EmpresaAutocomplete({
  label = 'Empresa',
  minWidth = 280,
  todasLabel = 'Todas as empresas',
  sx,
  onEmpresaSelected,
}: EmpresaAutocompleteProps) {
  const { empresaId, setEmpresaId, empresas, loadingEmpresas } = useEmpresa();
  // Controla a abertura do popup manualmente — garante que cliques no campo abrem
  // o dropdown mesmo quando o campo tem valor (texto selecionável).
  const [open, setOpen] = useState(false);

  const options: EmpresaFilterOption[] = useMemo(
    () => [{ id: '', razao_social: todasLabel, cnpj: '' }, ...empresas],
    [empresas, todasLabel],
  );

  const value = useMemo(
    () => options.find(o => o.id === empresaId) ?? options[0],
    [options, empresaId],
  );

  return (
    <Autocomplete
      size="small"
      sx={{ minWidth, cursor: 'pointer', ...sx }}
      options={options}
      loading={loadingEmpresas}
      value={value}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      // Popup acima do AppBar (z-index 1100) e do user button (z-index 9999).
      slotProps={{ popper: { sx: { zIndex: 10000 } } }}
      openOnFocus
      selectOnFocus
      handleHomeEndKeys
      onChange={(_, opt) => {
        const id: number | '' = !opt || opt.id === '' ? '' : (opt.id as number);
        setEmpresaId(id);
        onEmpresaSelected?.(id);
      }}
      getOptionLabel={(o) => (o.cnpj ? `${o.razao_social} — ${o.cnpj}` : o.razao_social)}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      filterOptions={(opts, state) => {
        const q = state.inputValue.trim().toLowerCase().replace(/\D/g, '');
        const qText = state.inputValue.trim().toLowerCase();
        if (!qText) return opts;
        return opts.filter((o) => {
          if (o.id === '') return 'todas'.includes(qText) || o.razao_social.toLowerCase().includes(qText);
          const matchNome = o.razao_social.toLowerCase().includes(qText);
          const digits = (o.cnpj || '').replace(/\D/g, '');
          const matchCnpj = q.length >= 2 && digits.includes(q);
          return matchNome || matchCnpj;
        });
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder="Buscar por nome ou CNPJ…"
          // mousedown dispara antes do click e focus — força abrir o popup
          // mesmo que algum outro elemento esteja interceptando o click.
          onMouseDownCapture={(e) => {
            // Não bloqueia o comportamento padrão; só garante o open
            setOpen(true);
            // Permite que o focus aconteça normalmente
            void e;
          }}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          InputProps={{
            ...params.InputProps,
            sx: { cursor: 'pointer' },
            endAdornment: (
              <>
                {loadingEmpresas ? <CircularProgress color="inherit" size={18} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
