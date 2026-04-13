import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Divider,
  MenuItem,
  Tabs,
  Tab,
} from '@mui/material';
import { Save as SaveIcon, Person as PersonIcon } from '@mui/icons-material';
import perfilService from '../services/perfilService';
import type { PerfilUsuario, DadosMedico } from '../services/perfilService';
import { logger } from '../utils/logger';

// Tokens Synchro
const T = {
  cyan:        '#00c8f0',
  cyanGlow:    '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover:   '0 6px 22px rgba(0,200,240,0.38)',
  textPrimary: '#1a2332',
  textSecond:  '#64748b',
  border:      'rgba(15, 30, 60, 0.10)',
  surface:     '#FFFFFF',
  inputBg:     '#F7F9FC',
  navy:        '#0a1628',
  cardShadow:  '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: T.inputBg,
    borderRadius: '10px',
    '& fieldset': { borderColor: 'rgba(15,30,60,0.11)' },
    '&:hover fieldset': { borderColor: 'rgba(15,30,60,0.22)' },
    '&.Mui-focused fieldset': { borderColor: T.cyan, borderWidth: 1.5 },
  },
  '& .MuiInputLabel-root': { color: T.textSecond, fontSize: '0.875rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: T.cyan },
  '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: T.textSecond },
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`perfil-tabpanel-${index}`}
      aria-labelledby={`perfil-tab-${index}`}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function MeuPerfilPage() {
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [buscandoCEP, setBuscandoCEP] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState(0);

  const [formData, setFormData] = useState({ nome: '', email: '', cpf: '', dt_nascimento: '' });

  const [dadosMedico, setDadosMedico] = useState<DadosMedico>({
    especialidade: undefined, inscricao: '', tempo_sessao: undefined,
    endereco: '', numero: undefined, complemento: '', bairro: '',
    cidade: '', uf: '', cep: '', nacionalidade: '', estado_civil: '',
    telefone: '', logo: '', assinatura: ''
  });

  const ehMedico = perfil?.perfil === 'MEDICO' || perfil?.perfil === 'ADMIN';

  useEffect(() => { carregarPerfil(); }, []);

  const carregarPerfil = async () => {
    try {
      setLoading(true);
      setErro('');
      const dados = await perfilService.buscarMeuPerfil();
      setPerfil(dados);
      setFormData({ nome: dados.nome, email: dados.email, cpf: dados.cpf, dt_nascimento: dados.dt_nascimento || '' });
      if (dados.dados_medico) {
        setDadosMedico({
          especialidade: dados.dados_medico.especialidade !== undefined && dados.dados_medico.especialidade !== null
            ? (isNaN(Number(dados.dados_medico.especialidade)) ? undefined : Number(dados.dados_medico.especialidade))
            : undefined,
          inscricao: dados.dados_medico.inscricao || '',
          tempo_sessao: dados.dados_medico.tempo_sessao || undefined,
          endereco: dados.dados_medico.endereco || '',
          numero: dados.dados_medico.numero,
          complemento: dados.dados_medico.complemento || '',
          bairro: dados.dados_medico.bairro || '',
          cidade: dados.dados_medico.cidade || '',
          uf: dados.dados_medico.uf || '',
          cep: dados.dados_medico.cep || '',
          nacionalidade: dados.dados_medico.nacionalidade || '',
          estado_civil: dados.dados_medico.estado_civil || '',
          telefone: dados.dados_medico.telefone || '',
          logo: dados.dados_medico.logo || '',
          assinatura: dados.dados_medico.assinatura || ''
        });
      }
    } catch (error: any) {
      logger.error('Erro ao carregar perfil', error);
      setErro(error.response?.data?.error || 'Erro ao carregar perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleMedicoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'especialidade') {
      setDadosMedico(prev => ({ ...prev, especialidade: value ? Number(value) : undefined }));
    } else if (name === 'tempo_sessao') {
      setDadosMedico(prev => ({ ...prev, tempo_sessao: value ? Number(value) : undefined }));
    } else {
      setDadosMedico(prev => ({ ...prev, [name]: value }));
    }
  };

  const formatarCEP = (cep: string) => {
    const n = cep.replace(/\D/g, '');
    return n.length <= 5 ? n : `${n.slice(0, 5)}-${n.slice(5, 8)}`;
  };

  const formatarTelefone = (telefone: string) => {
    const n = telefone.replace(/\D/g, '');
    return n.length <= 10
      ? n.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
      : n.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  };

  const buscarCEP = async (cep: string) => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;
    try {
      setBuscandoCEP(true);
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await response.json();
      if (data.erro) { setErro('CEP não encontrado'); return; }
      setDadosMedico(prev => ({ ...prev, endereco: data.logradouro || '', bairro: data.bairro || '', cidade: data.localidade || '', uf: data.uf || '' }));
    } catch (error: any) {
      logger.error('Erro ao buscar CEP', error);
      setErro('Erro ao buscar CEP');
    } finally {
      setBuscandoCEP(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSalvando(true);
      setErro('');
      setSucesso('');
      const dados: any = { ...formData };
      if (ehMedico) {
        dados.dados_medico = { ...dadosMedico, numero: dadosMedico.numero ? Number(dadosMedico.numero) : undefined };
      }
      await perfilService.atualizarMeuPerfil(dados);
      setSucesso('Perfil atualizado com sucesso!');
      setTimeout(() => setSucesso(''), 3000);
    } catch (error: any) {
      logger.error('Erro ao atualizar perfil', error);
      setErro(error.response?.data?.error || 'Erro ao atualizar perfil');
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress sx={{ color: T.cyan }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, fontFamily: '"Inter", system-ui, sans-serif' }}>

      {erro && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setErro('')}>
          {erro}
        </Alert>
      )}
      {sucesso && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSucesso('')}>
          {sucesso}
        </Alert>
      )}

      <Paper elevation={0} sx={{
        borderRadius: '16px',
        border: `1px solid ${T.border}`,
        boxShadow: T.cardShadow,
        backgroundColor: T.surface,
        overflow: 'hidden',
      }}>

        {/* Header do card */}
        <Box sx={{
          px: { xs: 3, sm: 4 }, py: 2.5,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          <Box sx={{
            width: 44, height: 44, borderRadius: '12px',
            backgroundColor: 'rgba(0,200,240,0.08)',
            border: '1px solid rgba(0,200,240,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <PersonIcon sx={{ color: T.cyan, fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
              Meu Perfil
            </Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, mt: 0.25 }}>
              Gerencie seus dados pessoais e profissionais
            </Typography>
          </Box>
        </Box>

        <Box sx={{ px: { xs: 3, sm: 4 }, pb: 4 }}>

          {/* Tabs */}
          <Box sx={{ borderBottom: `1px solid ${T.border}`, mt: 0 }}>
            <Tabs
              value={abaAtiva}
              onChange={(_, v) => setAbaAtiva(v)}
              aria-label="abas de perfil"
              sx={{
                '& .MuiTab-root': {
                  fontSize: '0.875rem', fontWeight: 500,
                  color: T.textSecond, textTransform: 'none', minHeight: 48,
                  '&.Mui-selected': { color: T.cyan, fontWeight: 600 },
                },
                '& .MuiTabs-indicator': { backgroundColor: T.cyan, height: 2 },
              }}
            >
              <Tab label="Dados Pessoais / Profissionais" />
              {ehMedico && <Tab label="Endereço" />}
            </Tabs>
          </Box>

          <form onSubmit={handleSubmit}>

            {/* ABA 1 — Dados Pessoais */}
            <TabPanel value={abaAtiva} index={0}>
              <Stack spacing={3}>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: T.textSecond, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 2 }}>
                    Dados Pessoais
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField fullWidth label="Nome" name="nome" value={formData.nome} onChange={handleChange} required sx={inputSx} />
                    <TextField fullWidth label="Data de Nascimento" name="dt_nascimento" type="date" value={formData.dt_nascimento} onChange={handleChange} slotProps={{ inputLabel: { shrink: true } }} sx={inputSx} />
                  </Stack>
                </Box>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField fullWidth label="E-mail" name="email" type="email" value={formData.email} onChange={handleChange} required sx={inputSx} />
                  <TextField fullWidth label="CPF" name="cpf" value={formData.cpf} disabled sx={inputSx} />
                </Stack>

                {ehMedico && (
                  <>
                    <Divider sx={{ borderColor: T.border }} />
                    <Box>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: T.textSecond, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 2 }}>
                        Dados Profissionais
                      </Typography>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField fullWidth label="Nacionalidade" name="nacionalidade" value={dadosMedico.nacionalidade} onChange={handleMedicoChange} sx={inputSx} />
                        <TextField fullWidth select label="Estado Civil" name="estado_civil" value={dadosMedico.estado_civil} onChange={handleMedicoChange} sx={inputSx}>
                          <MenuItem value="">Selecione</MenuItem>
                          <MenuItem value="Solteiro(a)">Solteiro(a)</MenuItem>
                          <MenuItem value="Casado(a)">Casado(a)</MenuItem>
                          <MenuItem value="Divorciado(a)">Divorciado(a)</MenuItem>
                          <MenuItem value="Viúvo(a)">Viúvo(a)</MenuItem>
                        </TextField>
                        <TextField
                          fullWidth label="Telefone" name="telefone"
                          value={dadosMedico.telefone}
                          onChange={(e) => setDadosMedico(prev => ({ ...prev, telefone: formatarTelefone(e.target.value) }))}
                          inputProps={{ maxLength: 15 }}
                          sx={inputSx}
                        />
                      </Stack>
                    </Box>
                  </>
                )}
              </Stack>
            </TabPanel>

            {/* ABA 2 — Endereço */}
            {ehMedico && (
              <TabPanel value={abaAtiva} index={1}>
                <Stack spacing={3}>
                  <Box>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: T.textSecond, letterSpacing: '0.06em', textTransform: 'uppercase', mb: 2 }}>
                      Endereço
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField
                        sx={{ flex: 1, ...inputSx }} label="CEP" name="cep"
                        value={dadosMedico.cep}
                        onChange={(e) => setDadosMedico(prev => ({ ...prev, cep: formatarCEP(e.target.value) }))}
                        onBlur={(e) => buscarCEP(e.target.value)}
                        inputProps={{ maxLength: 9 }}
                      />
                      <TextField sx={{ flex: 3, ...inputSx }} label="Endereço" name="endereco" value={dadosMedico.endereco} onChange={handleMedicoChange} disabled={buscandoCEP} />
                    </Stack>
                  </Box>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField sx={{ flex: 1, ...inputSx }} label="Número" name="numero" type="number" value={dadosMedico.numero || ''} onChange={handleMedicoChange} />
                    <TextField sx={{ flex: 2, ...inputSx }} label="Complemento" name="complemento" value={dadosMedico.complemento} onChange={handleMedicoChange} />
                    <TextField sx={{ flex: 2, ...inputSx }} label="Bairro" name="bairro" value={dadosMedico.bairro} onChange={handleMedicoChange} disabled={buscandoCEP} />
                  </Stack>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField sx={{ flex: 3, ...inputSx }} label="Cidade" name="cidade" value={dadosMedico.cidade} onChange={handleMedicoChange} disabled={buscandoCEP} />
                    <TextField sx={{ flex: 1, ...inputSx }} label="UF" name="uf" value={dadosMedico.uf} onChange={handleMedicoChange} disabled={buscandoCEP} inputProps={{ maxLength: 2, style: { textTransform: 'uppercase' } }} />
                  </Stack>
                </Stack>
              </TabPanel>
            )}

            {/* Rodapé — salvar */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4, pt: 3, borderTop: `1px solid ${T.border}` }}>
              <Button
                type="submit"
                variant="contained"
                disabled={salvando}
                startIcon={salvando ? <CircularProgress size={16} sx={{ color: T.navy }} /> : <SaveIcon />}
                sx={{
                  height: 44, px: 3.5, borderRadius: '10px',
                  backgroundColor: T.cyan, color: T.navy,
                  fontWeight: 700, textTransform: 'none',
                  boxShadow: T.cyanGlow,
                  '&:hover': { backgroundColor: '#00b8e0', boxShadow: T.cyanHover },
                  '&.Mui-disabled': { backgroundColor: 'rgba(0,200,240,0.35)', color: T.navy },
                }}
              >
                {salvando ? 'Salvando...' : 'Salvar Perfil'}
              </Button>
            </Box>
          </form>
        </Box>
      </Paper>
    </Box>
  );
}
