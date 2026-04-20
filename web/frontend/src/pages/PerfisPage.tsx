import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TablePagination,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, CircularProgress, Stack, InputAdornment, Checkbox,
  Collapse, Tooltip, Divider,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Search as SearchIcon, ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon, Security as SecurityIcon,
} from '@mui/icons-material';
import { perfisService } from '../services/perfisService';
import type { Perfil, SysModulo, PerfilPermissao } from '../types';
import { logger } from '../utils/logger';

// ─── Tokens de estilo ────────────────────────────────────────────────────────

const T = {
  cyan: '#00c8f0',
  cyanGlow: '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover: '0 6px 22px rgba(0,200,240,0.38)',
  cyanDim: 'rgba(0, 200, 240, 0.08)',
  cyanBorder: 'rgba(0, 200, 240, 0.18)',
  textPrimary: '#1a2332',
  textSecond: '#64748b',
  border: 'rgba(15, 30, 60, 0.09)',
  surface: '#FFFFFF',
  inputBg: '#F7F9FC',
  navy: '#0a1628',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: T.inputBg, borderRadius: '10px',
    '& fieldset': { borderColor: 'rgba(15,30,60,0.11)' },
    '&:hover fieldset': { borderColor: 'rgba(15,30,60,0.22)' },
    '&.Mui-focused fieldset': { borderColor: T.cyan, borderWidth: 1.5 },
  },
  '& .MuiInputLabel-root': { color: T.textSecond, fontSize: '0.875rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: T.cyan },
};

const thCellSx = {
  fontSize: '0.75rem', fontWeight: 600, color: T.textSecond,
  letterSpacing: '0.04em', textTransform: 'uppercase' as const,
  borderBottom: `1px solid ${T.border}`, py: 1.5, backgroundColor: '#F8FAFC',
};

const dialogPaper = {
  borderRadius: '16px', border: `1px solid ${T.border}`,
  boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
  maxHeight: '92vh',
};

const btnPrimary = {
  height: 40, borderRadius: '10px',
  backgroundColor: T.cyan, color: T.navy,
  fontWeight: 700, textTransform: 'none' as const,
  boxShadow: T.cyanGlow,
  '&:hover': { backgroundColor: '#00b8e0', boxShadow: T.cyanHover },
  '&.Mui-disabled': { backgroundColor: 'rgba(0,200,240,0.35)', color: T.navy },
};

const btnOutlined = {
  height: 40, borderRadius: '10px',
  borderColor: 'rgba(15,30,60,0.18)', color: T.textSecond,
  textTransform: 'none' as const, fontWeight: 600,
  '&:hover': { borderColor: 'rgba(15,30,60,0.35)', backgroundColor: 'rgba(15,30,60,0.03)' },
};

// ─── Tipo auxiliar para permissões no form ────────────────────────────────────

type PermMap = Record<number, { inserir: boolean; alterar: boolean; consultar: boolean; excluir: boolean }>;

const ACTIONS = ['consultar', 'inserir', 'alterar', 'excluir'] as const;
type Action = typeof ACTIONS[number];

const ACTION_LABELS: Record<Action, string> = {
  consultar: 'Consultar',
  inserir: 'Inserir',
  alterar: 'Alterar',
  excluir: 'Excluir',
};

// ─── Component ────────────────────────────────────────────────────────────────

const PerfisPage: React.FC = () => {
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [filtroBusca, setFiltroBusca] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  const [openModal, setOpenModal] = useState(false);
  const [editingPerfil, setEditingPerfil] = useState<Perfil | null>(null);
  const [nomePerfil, setNomePerfil] = useState('');
  const [nomeErro, setNomeErro] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalErro, setModalErro] = useState('');

  const [arvore, setArvore] = useState<SysModulo[]>([]);
  const [arvoreLoading, setArvoreLoading] = useState(false);
  const [permMap, setPermMap] = useState<PermMap>({});
  const [modulosAbertos, setModulosAbertos] = useState<Record<number, boolean>>({});

  // ─── Carregamento ──────────────────────────────────────────────────────────

  const carregarPerfis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await perfisService.listar({ busca: filtroBusca || undefined, page: page + 1, limit: rowsPerPage });
      setPerfis(res.data);
      setTotalRecords(res.pagination.total);
    } catch (error: any) {
      logger.error('Erro ao carregar perfis:', error);
      setErro(error.response?.data?.error || 'Erro ao carregar perfis');
    } finally {
      setLoading(false);
    }
  }, [filtroBusca, page, rowsPerPage]);

  useEffect(() => { carregarPerfis(); }, [carregarPerfis]);

  useEffect(() => {
    if (sucesso) { const t = setTimeout(() => setSucesso(''), 4000); return () => clearTimeout(t); }
  }, [sucesso]);

  const carregarArvore = async () => {
    setArvoreLoading(true);
    try {
      const data = await perfisService.arvoreMenu();
      setArvore(data);
      // Abrir todos os módulos por padrão
      const abertos: Record<number, boolean> = {};
      data.forEach(m => { abertos[m.id] = true; });
      setModulosAbertos(abertos);
    } catch (error: any) {
      logger.error('Erro ao carregar árvore de menu:', error);
    } finally {
      setArvoreLoading(false);
    }
  };

  // ─── Modal ────────────────────────────────────────────────────────────────

  const handleOpenModal = async (perfil?: Perfil) => {
    setModalErro('');
    setNomeErro('');
    await carregarArvore();

    if (perfil) {
      setEditingPerfil(perfil);
      setNomePerfil(perfil.perfil);
      // Carregar permissões existentes
      try {
        const detalhes = await perfisService.buscarPorId(perfil.id);
        const map: PermMap = {};
        (detalhes.permissoes ?? []).forEach(p => {
          map[p.funcionalidade_id] = {
            inserir: p.inserir, alterar: p.alterar,
            consultar: p.consultar, excluir: p.excluir,
          };
        });
        setPermMap(map);
      } catch {
        setPermMap({});
      }
    } else {
      setEditingPerfil(null);
      setNomePerfil('');
      setPermMap({});
    }
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setEditingPerfil(null);
    setNomePerfil('');
    setPermMap({});
    setNomeErro('');
    setModalErro('');
  };

  // ─── Permissões ───────────────────────────────────────────────────────────

  const togglePermissao = (funcId: number, action: Action) => {
    setPermMap(prev => {
      const atual = prev[funcId] ?? { inserir: false, alterar: false, consultar: false, excluir: false };
      return { ...prev, [funcId]: { ...atual, [action]: !atual[action] } };
    });
  };

  // ─── Salvar ───────────────────────────────────────────────────────────────

  const handleSalvar = async () => {
    if (!nomePerfil.trim()) { setNomeErro('Nome do perfil é obrigatório'); return; }
    if (nomePerfil.trim().length < 3) { setNomeErro('Nome deve ter no mínimo 3 caracteres'); return; }

    const permissoes: Omit<PerfilPermissao, 'id'>[] = Object.entries(permMap)
      .filter(([, v]) => v.inserir || v.alterar || v.consultar || v.excluir)
      .map(([funcId, v]) => ({
        funcionalidade_id: Number(funcId),
        inserir: v.inserir,
        alterar: v.alterar,
        consultar: v.consultar,
        excluir: v.excluir,
      }));

    try {
      setSaving(true);
      setModalErro('');
      const payload = { perfil: nomePerfil.trim(), permissoes };

      if (editingPerfil) {
        await perfisService.atualizar(editingPerfil.id, payload);
        setSucesso('Perfil atualizado com sucesso');
      } else {
        await perfisService.criar(payload);
        setSucesso('Perfil criado com sucesso');
      }
      handleCloseModal();
      carregarPerfis();
    } catch (error: any) {
      logger.error('Erro ao salvar perfil:', error);
      const rd = error.response?.data;
      let msg = 'Erro ao salvar perfil';
      if (rd?.errors && Array.isArray(rd.errors)) msg = rd.errors.map((e: any) => e.message || e.msg).join('; ');
      else if (rd?.error) msg = rd.error;
      setModalErro(msg);
    } finally {
      setSaving(false);
    }
  };

  // ─── Excluir ──────────────────────────────────────────────────────────────

  const handleExcluir = async (perfil: Perfil) => {
    if (!window.confirm(`Deseja realmente excluir o perfil "${perfil.perfil}"?`)) return;
    try {
      await perfisService.excluir(perfil.id);
      setSucesso('Perfil excluído com sucesso');
      carregarPerfis();
    } catch (error: any) {
      logger.error('Erro ao excluir perfil:', error);
      setErro(error.response?.data?.error || 'Erro ao excluir perfil');
    }
  };

  // ─── Render da árvore de permissões ──────────────────────────────────────

  const renderArvore = () => {
    if (arvoreLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} sx={{ color: T.cyan }} />
        </Box>
      );
    }

    return (
      <Box sx={{ border: `1px solid ${T.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        {/* Cabeçalho da tabela */}
        <Box sx={{
          display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 100px',
          backgroundColor: '#F8FAFC', px: 2, py: 1.25,
          borderBottom: `1px solid ${T.border}`,
        }}>
          <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: T.textSecond, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Funcionalidade
          </Typography>
          {ACTIONS.map(a => (
            <Typography key={a} sx={{ fontSize: '0.6875rem', fontWeight: 700, color: T.textSecond, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
              {ACTION_LABELS[a]}
            </Typography>
          ))}
        </Box>

        {arvore.map((modulo) => (
          <Box key={modulo.id}>
            {/* Linha do módulo */}
            <Box
              sx={{
                display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 100px',
                px: 2, py: 1,
                backgroundColor: 'rgba(0,200,240,0.04)',
                borderBottom: `1px solid ${T.border}`,
                cursor: 'pointer',
                '&:hover': { backgroundColor: 'rgba(0,200,240,0.08)' },
              }}
              onClick={() => setModulosAbertos(prev => ({ ...prev, [modulo.id]: !prev[modulo.id] }))}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton size="small" sx={{ p: 0.25, color: T.textSecond }}>
                  {modulosAbertos[modulo.id] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: T.textPrimary }}>
                  {modulo.modulo}
                </Typography>
              </Box>
              {/* Checkbox selecionar tudo no módulo */}
              {ACTIONS.map(a => (
                <Box key={a} sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <Tooltip title={`${ACTION_LABELS[a]} tudo em ${modulo.modulo}`}>
                    <Checkbox
                      size="small"
                      checked={modulo.funcionalidades.every(f => permMap[f.id]?.[a])}
                      indeterminate={
                        modulo.funcionalidades.some(f => permMap[f.id]?.[a]) &&
                        !modulo.funcionalidades.every(f => permMap[f.id]?.[a])
                      }
                      onChange={(e) => {
                        e.stopPropagation();
                        setPermMap(prev => {
                          const novo = { ...prev };
                          modulo.funcionalidades.forEach(f => {
                            novo[f.id] = { ...(novo[f.id] ?? { inserir: false, alterar: false, consultar: false, excluir: false }), [a]: e.target.checked };
                          });
                          return novo;
                        });
                      }}
                      onClick={e => e.stopPropagation()}
                      sx={{ '&.Mui-checked': { color: T.cyan }, '&.MuiCheckbox-indeterminate': { color: T.cyan } }}
                    />
                  </Tooltip>
                </Box>
              ))}
            </Box>

            {/* Funcionalidades do módulo */}
            <Collapse in={modulosAbertos[modulo.id] ?? true}>
              {modulo.funcionalidades.map((func, idx) => (
                <Box
                  key={func.id}
                  sx={{
                    display: 'grid', gridTemplateColumns: '1fr 100px 100px 100px 100px',
                    px: 2, py: 0.75,
                    backgroundColor: idx % 2 === 0 ? T.surface : '#FAFBFD',
                    borderBottom: `1px solid ${T.border}`,
                    '&:last-child': { borderBottom: 'none' },
                  }}
                >
                  <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, pl: 3, display: 'flex', alignItems: 'center' }}>
                    {func.funcionalidade}
                  </Typography>
                  {ACTIONS.map(a => (
                    <Box key={a} sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Checkbox
                        size="small"
                        checked={permMap[func.id]?.[a] ?? false}
                        onChange={() => togglePermissao(func.id, a)}
                        sx={{ '&.Mui-checked': { color: T.cyan } }}
                      />
                    </Box>
                  ))}
                </Box>
              ))}
            </Collapse>
          </Box>
        ))}

        {arvore.length === 0 && (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.875rem', color: T.textSecond }}>
              Nenhum módulo cadastrado
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  // ─── Render principal ─────────────────────────────────────────────────────

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
            Perfis de Acesso
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
            Gerencie os perfis e permissões do sistema
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenModal()} sx={btnPrimary}>
          Novo Perfil
        </Button>
      </Box>

      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2, borderRadius: '10px' }}>{erro}</Alert>}
      {sucesso && <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2, borderRadius: '10px' }}>{sucesso}</Alert>}

      {/* Filtro */}
      <Paper elevation={0} sx={{ p: 2.5, mb: 2, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
        <TextField
          fullWidth size="small" placeholder="Buscar por nome do perfil"
          value={filtroBusca}
          onChange={(e) => { setFiltroBusca(e.target.value); setPage(0); }}
          sx={{ ...inputSx, maxWidth: 480 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: T.textSecond }} />
                </InputAdornment>
              ),
            },
          }}
        />
      </Paper>

      {/* Tabela */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress sx={{ color: T.cyan }} />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={thCellSx}>Nome do Perfil</TableCell>
                  <TableCell sx={thCellSx}>Cliente</TableCell>
                  <TableCell align="center" sx={thCellSx}>Qtd. Permissões</TableCell>
                  <TableCell align="center" sx={thCellSx}>Criado em</TableCell>
                  <TableCell align="center" sx={thCellSx}>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {perfis.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: T.textSecond, fontSize: '0.875rem' }}>
                      Nenhum perfil encontrado
                    </TableCell>
                  </TableRow>
                ) : perfis.map((p) => (
                  <TableRow key={p.id} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.25 } }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SecurityIcon sx={{ fontSize: 16, color: T.cyan }} />
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary }}>{p.perfil}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>
                      {p.cliente_nome || (p.adm_mindtax ? 'MindTax (Admin)' : '—')}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8125rem', color: T.textSecond }}>
                      —
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8125rem', color: T.textSecond }}>
                      {p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '—'}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => handleOpenModal(p)}
                        sx={{ color: T.textSecond, '&:hover': { color: T.cyan, backgroundColor: T.cyanDim } }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleExcluir(p)}
                        sx={{ color: T.textSecond, '&:hover': { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)' } }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={totalRecords}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            labelRowsPerPage="Registros por página"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count !== -1 ? count : `mais de ${to}`}`}
            sx={{ borderTop: `1px solid ${T.border}`, '& .MuiTablePagination-toolbar': { px: 2 } }}
          />
        </Paper>
      )}

      {/* Modal de criação / edição */}
      <Dialog open={openModal} onClose={handleCloseModal} maxWidth="md" fullWidth scroll="paper"
        slotProps={{ paper: { sx: dialogPaper } }}>
        <DialogTitle sx={{ fontSize: '1.0625rem', fontWeight: 700, color: T.textPrimary, pb: 1 }}>
          {editingPerfil ? 'Editar Perfil' : 'Novo Perfil de Acesso'}
        </DialogTitle>
        <DialogContent dividers sx={{ px: 3, pb: 3 }}>
          {modalErro && (
            <Alert severity="error" onClose={() => setModalErro('')} sx={{ mb: 2, borderRadius: '10px' }}>{modalErro}</Alert>
          )}

          {/* Nome do perfil */}
          <TextField
            label="Nome do Perfil"
            value={nomePerfil}
            onChange={(e) => { setNomePerfil(e.target.value); setNomeErro(''); }}
            fullWidth required
            error={!!nomeErro} helperText={nomeErro}
            sx={{ ...inputSx, mb: 3 }}
          />

          <Divider sx={{ mb: 2.5 }} />

          {/* Árvore de permissões */}
          <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: T.textPrimary }}>
              Permissões de Acesso
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" sx={{ ...btnOutlined, height: 32, fontSize: '0.75rem' }}
                onClick={() => {
                  const novo: PermMap = {};
                  arvore.forEach(m => m.funcionalidades.forEach(f => {
                    novo[f.id] = { inserir: true, alterar: true, consultar: true, excluir: true };
                  }));
                  setPermMap(novo);
                }}>
                Selecionar Tudo
              </Button>
              <Button size="small" variant="outlined" sx={{ ...btnOutlined, height: 32, fontSize: '0.75rem' }}
                onClick={() => setPermMap({})}>
                Limpar Tudo
              </Button>
            </Stack>
          </Box>

          {renderArvore()}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleCloseModal} variant="outlined" disabled={saving} sx={btnOutlined}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} variant="contained" disabled={saving} sx={btnPrimary}>
            {saving
              ? <CircularProgress size={20} sx={{ color: T.navy }} />
              : editingPerfil ? 'Atualizar' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PerfisPage;
