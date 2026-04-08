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
import { Save as SaveIcon} from '@mui/icons-material';
import perfilService from '../services/perfilService';
import type { PerfilUsuario, DadosMedico } from '../services/perfilService';
import { logger } from '../utils/logger';


interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`perfil-tabpanel-${index}`}
      aria-labelledby={`perfil-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
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

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cpf: '',
    dt_nascimento: ''
  });

  const [dadosMedico, setDadosMedico] = useState<DadosMedico>({
    especialidade: undefined,
    inscricao: '',
    tempo_sessao: undefined,
    endereco: '',
    numero: undefined,
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    cep: '',
    nacionalidade: '',
    estado_civil: '',
    telefone: '',
    logo: '',
    assinatura: ''
  });

  const ehMedico = perfil?.perfil === 'MEDICO' || perfil?.perfil === 'ADMIN';

  useEffect(() => {
    carregarPerfil();
  }, []);


  const carregarPerfil = async () => {
    try {
      setLoading(true);
      setErro('');
      const dados = await perfilService.buscarMeuPerfil();
      setPerfil(dados);
      
      setFormData({
        nome: dados.nome,
        email: dados.email,
        cpf: dados.cpf,
        dt_nascimento: dados.dt_nascimento || ''
      });

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
      const idVal = value ? Number(value) : undefined;
      setDadosMedico(prev => ({ ...prev, especialidade: idVal }));
    } else if (name === 'tempo_sessao') {
      const tempo = value ? Number(value) : undefined;
      setDadosMedico(prev => ({ ...prev, tempo_sessao: tempo }));
    } else {
      setDadosMedico(prev => ({ ...prev, [name]: value }));
    }
  };

  const formatarCEP = (cep: string) => {
    const numeros = cep.replace(/\D/g, '');
    if (numeros.length <= 5) return numeros;
    return `${numeros.slice(0, 5)}-${numeros.slice(5, 8)}`;
  };

  const formatarTelefone = (telefone: string) => {
    const numeros = telefone.replace(/\D/g, '');
    if (numeros.length <= 10) {
      return numeros.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    }
    return numeros.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  };

  const buscarCEP = async (cep: string) => {
    const cepLimpo = cep.replace(/\D/g, '');
    
    if (cepLimpo.length !== 8) return;

    try {
      setBuscandoCEP(true);
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await response.json();

      if (data.erro) {
        setErro('CEP não encontrado');
        return;
      }

      setDadosMedico(prev => ({
        ...prev,
        endereco: data.logradouro || '',
        bairro: data.bairro || '',
        cidade: data.localidade || '',
        uf: data.uf || ''
      }));
    } catch (error: any) {
      logger.error('Erro ao buscar CEP', error);
      setErro(error.response?.data?.error || 'Erro ao buscar CEP');
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

      const dados: any = {
        ...formData
      };

      if (ehMedico) {
        dados.dados_medico = {
          ...dadosMedico,
          numero: dadosMedico.numero ? Number(dadosMedico.numero) : undefined
        };        
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
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Meu Perfil
      </Typography>

      {erro && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErro('')}>
          {erro}
        </Alert>
      )}

      {sucesso && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucesso('')}>
          {sucesso}
        </Alert>
      )}

      <Paper sx={{ p: 4 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs 
            value={abaAtiva} 
            onChange={(_, newValue) => setAbaAtiva(newValue)}
            aria-label="abas de perfil"
          >
            <Tab label="Dados Pessoais/Profissionais" />
            {ehMedico && <Tab label="Endereço" />}
          </Tabs>
        </Box>

        <form onSubmit={handleSubmit}>
          {/* ABA 1: Dados Pessoais/Profissionais */}
          <TabPanel value={abaAtiva} index={0}>
            <Stack spacing={3}>
              <Typography variant="h6">Dados Pessoais</Typography>
              
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  label="Nome"
                  name="nome"
                  value={formData.nome}
                  onChange={handleChange}
                  required
                />
                <TextField
                  fullWidth
                  label="Data de Nascimento"
                  name="dt_nascimento"
                  type="date"
                  value={formData.dt_nascimento}
                  onChange={handleChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  label="E-mail"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
                <TextField
                  fullWidth
                  label="CPF"
                  name="cpf"
                  value={formData.cpf}
                  disabled
                />
              </Stack>

              {ehMedico && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6">Dados Profissionais</Typography>
                  
                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField
                      fullWidth
                      label="Nacionalidade"
                      name="nacionalidade"
                      value={dadosMedico.nacionalidade}
                      onChange={handleMedicoChange}
                    />
                    <TextField
                      fullWidth
                      select
                      label="Estado Civil"
                      name="estado_civil"
                      value={dadosMedico.estado_civil}
                      onChange={handleMedicoChange}
                    >
                      <MenuItem value="">Selecione</MenuItem>
                      <MenuItem value="Solteiro(a)">Solteiro(a)</MenuItem>
                      <MenuItem value="Casado(a)">Casado(a)</MenuItem>
                      <MenuItem value="Divorciado(a)">Divorciado(a)</MenuItem>
                      <MenuItem value="Viúvo(a)">Viúvo(a)</MenuItem>
                    </TextField>
                    <TextField
                      fullWidth
                      label="Telefone"
                      name="telefone"
                      value={dadosMedico.telefone}
                      onChange={(e) => {
                        const telefone = formatarTelefone(e.target.value);
                        setDadosMedico(prev => ({ ...prev, telefone }));
                      }}
                      inputProps={{ maxLength: 15 }}
                    />
                  </Stack>
                </>
              )}
            </Stack>
          </TabPanel>

          {/* ABA 2: Endereço (apenas para médicos) */}
          {ehMedico && (
            <TabPanel value={abaAtiva} index={1}>
              <Stack spacing={3}>
                <Typography variant="h6">Endereço</Typography>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    sx={{ flex: 1 }}
                    label="CEP"
                    name="cep"
                    value={dadosMedico.cep}
                    onChange={(e) => {
                      const cep = formatarCEP(e.target.value);
                      setDadosMedico(prev => ({ ...prev, cep }));
                    }}
                    onBlur={(e) => buscarCEP(e.target.value)}
                    inputProps={{ maxLength: 9 }}
                  />
                  <TextField
                    sx={{ flex: 3 }}
                    label="Endereço"
                    name="endereco"
                    value={dadosMedico.endereco}
                    onChange={handleMedicoChange}
                    disabled={buscandoCEP}
                  />
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    sx={{ flex: 1 }}
                    label="Número"
                    name="numero"
                    type="number"
                    value={dadosMedico.numero || ''}
                    onChange={handleMedicoChange}
                  />
                  <TextField
                    sx={{ flex: 2 }}
                    label="Complemento"
                    name="complemento"
                    value={dadosMedico.complemento}
                    onChange={handleMedicoChange}
                  />
                  <TextField
                    sx={{ flex: 2 }}
                    label="Bairro"
                    name="bairro"
                    value={dadosMedico.bairro}
                    onChange={handleMedicoChange}
                    disabled={buscandoCEP}
                  />
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    sx={{ flex: 3 }}
                    label="Cidade"
                    name="cidade"
                    value={dadosMedico.cidade}
                    onChange={handleMedicoChange}
                    disabled={buscandoCEP}
                  />
                  <TextField
                    sx={{ flex: 1 }}
                    label="UF"
                    name="uf"
                    value={dadosMedico.uf}
                    onChange={handleMedicoChange}
                    disabled={buscandoCEP}
                    inputProps={{ maxLength: 2, style: { textTransform: 'uppercase' } }}
                  />
                </Stack>
              </Stack>
            </TabPanel>
          )}

          {/* Botão Salvar - aparece em todas as abas */}
          <Box display="flex" justifyContent="flex-end" gap={2} sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Button
              type="submit"
              variant="contained"
              startIcon={salvando ? <CircularProgress size={20} /> : <SaveIcon />}
              disabled={salvando}
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  );
}
