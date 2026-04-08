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
  Avatar,
  IconButton,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  Checkbox,
  Card,
  CardContent
} from '@mui/material';
import { Save as SaveIcon, CloudUpload as UploadIcon, Delete as DeleteIcon, Add as AddIcon, Remove as RemoveIcon } from '@mui/icons-material';
import perfilService from '../services/perfilService';
import usuarioParametrosService from '../services/usuarioParametrosService';
import type { PerfilUsuario, DadosMedico } from '../services/perfilService';
import { logger } from '../utils/logger';

interface DiaDisponibilidade {
  ativo: boolean;
  horarios: { tempo_inicio: string; tempo_fim: string }[];
}

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

// Estado padrão para disponibilidades
const getDisponibilidadePadrao = (): Record<string, DiaDisponibilidade> => ({
  'Segunda-feira': { ativo: false, horarios: [{ tempo_inicio: '08:00', tempo_fim: '18:00' }] },
  'Terça-feira': { ativo: false, horarios: [{ tempo_inicio: '08:00', tempo_fim: '18:00' }] },
  'Quarta-feira': { ativo: false, horarios: [{ tempo_inicio: '08:00', tempo_fim: '18:00' }] },
  'Quinta-feira': { ativo: false, horarios: [{ tempo_inicio: '08:00', tempo_fim: '18:00' }] },
  'Sexta-feira': { ativo: false, horarios: [{ tempo_inicio: '08:00', tempo_fim: '18:00' }] },
  'Sábado': { ativo: false, horarios: [{ tempo_inicio: '08:00', tempo_fim: '12:00' }] },
  'Domingo': { ativo: false, horarios: [{ tempo_inicio: '08:00', tempo_fim: '12:00' }] }
});

export default function MeuPerfilPage() {
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [buscandoCEP, setBuscandoCEP] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [assinaturaFile, setAssinaturaFile] = useState<File | null>(null);
  const [assinaturaPreview, setAssinaturaPreview] = useState<string>('');
  const [abaAtiva, setAbaAtiva] = useState(0);

  const [parametros, setParametros] = useState({
    duracao_sessao: 50,
    tempo_entre_sessao: 10,
    enviar_email: true,
    enviar_whats: false,
    tempo_lembrete: 24,
    permite_paciente_remarcar: true,
    tempo_remarcacao: 24,
    permite_paciente_cancelar: true,
    tempo_cancelamento: 24
  });

  const [disponibilidades, setDisponibilidades] = useState(getDisponibilidadePadrao());

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
        // Carregar preview do logo se existir
        if (dados.dados_medico.logo) {
          setLogoPreview(`data:image/png;base64,${dados.dados_medico.logo}`);
        }
        // Carregar preview da assinatura se existir
        if (dados.dados_medico.assinatura) {
          setAssinaturaPreview(`data:image/png;base64,${dados.dados_medico.assinatura}`);
        }
      }

      // Carregar parâmetros do usuário se for médico
      if (dados.perfil === 'MEDICO' || dados.perfil === 'ADMIN') {
        try {
          const meuParams = await usuarioParametrosService.buscarMeus();
          if (meuParams) {
            setParametros({
              duracao_sessao: meuParams.duracao_sessao || 50,
              tempo_entre_sessao: meuParams.tempo_entre_sessao || 10,
              enviar_email: meuParams.enviar_email !== false,
              enviar_whats: meuParams.enviar_whats || false,
              tempo_lembrete: meuParams.tempo_lembrete || 24,
              permite_paciente_remarcar: meuParams.permite_paciente_remarcar !== false,
              tempo_remarcacao: meuParams.tempo_remarcacao || 24,
              permite_paciente_cancelar: meuParams.permite_paciente_cancelar !== false,
              tempo_cancelamento: meuParams.tempo_cancelamento || 24
            });
            
          }
        } catch (error: any) {
          logger.error('Erro ao carregar parâmetros do usuário', error);
          // Se não encontrar parâmetros, mantém os valores padrão
          setErro(error.response?.data?.error ||'Parâmetros não encontrados, usando valores padrão');
        }

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

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validar tipo de arquivo
      if (!file.type.startsWith('image/')) {
        setErro('Por favor, selecione um arquivo de imagem');
        return;
      }
      // Validar tamanho (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setErro('O arquivo deve ter no máximo 2MB');
        return;
      }
      setLogoFile(file);
      // Criar preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoverLogo = () => {
    setLogoFile(null);
    setLogoPreview('');
    setDadosMedico(prev => ({ ...prev, logo: '' }));
  };

  const handleAssinaturaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validar tipo de arquivo
      if (!file.type.startsWith('image/')) {
        setErro('Por favor, selecione um arquivo de imagem para a assinatura');
        return;
      }
      // Validar tamanho (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setErro('O arquivo deve ter no máximo 2MB');
        return;
      }
      setAssinaturaFile(file);
      // Criar preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setAssinaturaPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoverAssinatura = () => {
    setAssinaturaFile(null);
    setAssinaturaPreview('');
    setDadosMedico(prev => ({ ...prev, assinatura: '' }));
  };

  const handleParametrosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setParametros(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
    }));
  };

  const handleDisponibilidadeToggle = (dia: string) => {
    setDisponibilidades(prev => ({
      ...prev,
      [dia]: { ...prev[dia], ativo: !prev[dia].ativo }
    }));
  };

  const handleDisponibilidadeChange = (dia: string, index: number, campo: 'tempo_inicio' | 'tempo_fim', valor: string) => {
    setDisponibilidades(prev => ({
      ...prev,
      [dia]: {
        ...prev[dia],
        horarios: prev[dia].horarios.map((horario, idx) => 
          idx === index ? { ...horario, [campo]: valor } : horario
        )
      }
    }));
  };

  const adicionarHorario = (dia: string) => {
    setDisponibilidades(prev => ({
      ...prev,
      [dia]: {
        ...prev[dia],
        horarios: [...prev[dia].horarios, { tempo_inicio: '08:00', tempo_fim: '18:00' }]
      }
    }));
  };

  const removerHorario = (dia: string, index: number) => {
    setDisponibilidades(prev => ({
      ...prev,
      [dia]: {
        ...prev[dia],
        horarios: prev[dia].horarios.filter((_, idx) => idx !== index)
      }
    }));
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
        
        // Adicionar logo se houver arquivo novo
        if (logoFile) {
          const reader = new FileReader();
          const logoBase64 = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(logoFile);
          });
          dados.dados_medico.logo = logoBase64;
        }

        // Adicionar assinatura se houver arquivo novo
        if (assinaturaFile) {
          const reader = new FileReader();
          const assinaturaBase64 = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(assinaturaFile);
          });
          dados.dados_medico.assinatura = assinaturaBase64;
        }
      }

      await perfilService.atualizarMeuPerfil(dados);

      // Salvar parâmetros se for médico ou admin
      if ((perfil?.perfil === 'MEDICO' || perfil?.perfil === 'ADMIN') && ehMedico) {
        try {
          // Incluir cores no payload de parâmetros
          await usuarioParametrosService.atualizar({ ...parametros });
          
        } catch (error: any) {
          logger.error('Erro ao salvar parâmetros', error);
          // Se retornar 404, tenta criar novo registro
          if (error.response?.status === 404) {
            try {
              await usuarioParametrosService.criar({ ...parametros } as any);
            } catch (criarError: any) {
              logger.error('Erro ao criar parâmetros', criarError);
              // Não lança erro pois o perfil já foi salvo
            }
          }
        }        
      }

      setSucesso('Perfil atualizado com sucesso!');
      setLogoFile(null); // Limpar arquivo após salvar
      setAssinaturaFile(null); // Limpar arquivo após salvar
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
            {ehMedico && <Tab label="Parâmetros" />}
            {ehMedico && <Tab label="Disponibilidade" />}
            {ehMedico && <Tab label="Logos" />}
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
                      label="Inscrição Profissional"
                      name="inscricao"
                      value={dadosMedico.inscricao}
                      onChange={handleMedicoChange}
                    />
                    <TextField
                      fullWidth
                      label="Duração da Sessão"
                      name="tempo_sessao"
                      type="number"
                      value={dadosMedico.tempo_sessao ?? ''}
                      onChange={handleMedicoChange}
                      inputProps={{ min: 1 }}
                      helperText="Tempo em minutos"
                    />
                  </Stack>

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
          {/* ABA 3: Parâmetros de Agendamento */}
          {ehMedico && (
            <TabPanel value={abaAtiva} index={2}>
              <Stack spacing={3}>
                <Typography variant="h6">Configurações de Sessão</Typography>
                
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <TextField
                    fullWidth
                    label="Duração da Sessão"
                    name="duracao_sessao"
                    type="number"
                    value={parametros.duracao_sessao}
                    onChange={handleParametrosChange}
                    inputProps={{ min: 1 }}
                    helperText="Minutos"
                  />
                  <TextField
                    fullWidth
                    label="Tempo entre Sessões"
                    name="tempo_entre_sessao"
                    type="number"
                    value={parametros.tempo_entre_sessao}
                    onChange={handleParametrosChange}
                    inputProps={{ min: 0 }}
                    helperText="Minutos"
                  />
                  <TextField
                    fullWidth
                    label="Tempo de Lembrete"
                    name="tempo_lembrete"
                    type="number"
                    value={parametros.tempo_lembrete}
                    onChange={handleParametrosChange}
                    inputProps={{ min: 1 }}
                    helperText="Horas antes"
                  />
                </Stack>

                <Divider sx={{ my: 2 }} />
                <Typography variant="h6">Notificações</Typography>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={parametros.enviar_email}
                        onChange={handleParametrosChange}
                        name="enviar_email"
                      />
                    }
                    label="Enviar E-mail"
                  />
                   {/* TODO: 06 Implementacao do envio de WhatsApp
                  <FormControlLabel 
                    control={
                      <Switch
                        checked={parametros.enviar_whats}
                        onChange={handleParametrosChange}
                        name="enviar_whats"
                      />
                    }
                    label="Enviar WhatsApp"
                  />*/}
                  <Box sx={{ flex: 1 }} />
                </Stack>

                <Divider sx={{ my: 2 }} />
                <Typography variant="h6">Permissões do Paciente</Typography>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
                  <FormControlLabel
                    control={
                      <Switch
                        checked={parametros.permite_paciente_remarcar}
                        onChange={handleParametrosChange}
                        name="permite_paciente_remarcar"
                      />
                    }
                    label="Permitir Remarcação"
                  />
                  <TextField
                    fullWidth
                    label="Prazo para Remarcação"
                    name="tempo_remarcacao"
                    type="number"
                    value={parametros.tempo_remarcacao}
                    onChange={handleParametrosChange}
                    disabled={!parametros.permite_paciente_remarcar}
                    inputProps={{ min: 1 }}
                    helperText="Horas de antecedência"
                  />
                  <Box sx={{ flex: 1 }} />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={parametros.permite_paciente_cancelar}
                        onChange={handleParametrosChange}
                        name="permite_paciente_cancelar"
                      />
                    }
                    label="Permitir Cancelamento"
                  />
                  <TextField
                    fullWidth
                    label="Prazo para Cancelamento"
                    name="tempo_cancelamento"
                    type="number"
                    value={parametros.tempo_cancelamento}
                    onChange={handleParametrosChange}
                    disabled={!parametros.permite_paciente_cancelar}
                    inputProps={{ min: 1 }}
                    helperText="Horas de antecedência"
                  />                  
                </Stack>

              </Stack>
            </TabPanel>
          )}
          {/* ABA 4: Disponibilidade (apenas para médicos) */}
          {ehMedico && (
            <TabPanel value={abaAtiva} index={3}>
              <Stack spacing={3}>
                <Typography variant="h6">Horários de Atendimento</Typography>
                <Typography variant="body2" color="text.secondary">
                  Configure os dias e horários em que você estará disponível para atendimentos
                </Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
                  {Object.keys(disponibilidades).map((dia) => (
                    <Card key={dia} variant="outlined">
                      <CardContent>
                        <Stack spacing={2}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={disponibilidades[dia].ativo}
                                onChange={() => handleDisponibilidadeToggle(dia)}
                              />
                            }
                            label={<Typography variant="subtitle1" fontWeight="medium">{dia}</Typography>}
                          />
                          
                          {disponibilidades[dia].ativo && (
                            <Stack spacing={2}>
                              {disponibilidades[dia].horarios.map((horario, index) => (
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} key={index} alignItems="center">
                                  <TextField
                                    size="small"
                                    label="Início"
                                    type="time"
                                    value={horario.tempo_inicio}
                                    onChange={(e) => handleDisponibilidadeChange(dia, index, 'tempo_inicio', e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    sx={{ flex: 1 }}
                                  />
                                  <TextField
                                    size="small"
                                    label="Fim"
                                    type="time"
                                    value={horario.tempo_fim}
                                    onChange={(e) => handleDisponibilidadeChange(dia, index, 'tempo_fim', e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    sx={{ flex: 1 }}
                                  />
                                  <Stack direction="row" spacing={0.5}>
                                    {index === disponibilidades[dia].horarios.length - 1 && (
                                      <IconButton
                                        size="small"
                                        color="primary"
                                        onClick={() => adicionarHorario(dia)}
                                        title="Adicionar horário"
                                      >
                                        <AddIcon fontSize="small" />
                                      </IconButton>
                                    )}
                                    {disponibilidades[dia].horarios.length > 1 && (
                                      <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() => removerHorario(dia, index)}
                                        title="Remover horário"
                                      >
                                        <RemoveIcon fontSize="small" />
                                      </IconButton>
                                    )}
                                  </Stack>
                                </Stack>
                              ))}
                            </Stack>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              </Stack>
            </TabPanel>
          )}
          {/* ABA 5: Parâmetros - Logo e Assinatura (apenas para médicos) */}
          {ehMedico && (
            <TabPanel value={abaAtiva} index={4}>
              <Stack spacing={3}>
                <Typography variant="h6">Logo e Assinatura</Typography>
                <Typography variant="body2" color="text.secondary">
                  Configure o logo e a assinatura que serão utilizados nos documentos gerados pelo sistema
                </Typography>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} justifyContent="center" sx={{ mt: 3 }}>
                  {/* Logo Upload */}
                  <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                    <Typography variant="subtitle1" fontWeight="medium">Logo</Typography>
                    <Avatar
                      src={logoPreview}
                      sx={{ width: 150, height: 150 }}
                    />
                    <Stack direction="row" spacing={2}>
                      <Button
                        component="label"
                        variant="outlined"
                        startIcon={<UploadIcon />}
                        size="small"
                      >
                        {logoPreview ? 'Alterar' : 'Carregar'}
                        <input
                          type="file"
                          hidden
                          accept="image/*"
                          onChange={handleLogoChange}
                        />
                      </Button>
                      {logoPreview && (
                        <IconButton
                          size="small"
                          color="error"
                          onClick={handleRemoverLogo}
                          title="Remover logo"
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Formatos: PNG, JPG (máx. 2MB)
                    </Typography>
                  </Box>

                  {/* Assinatura Upload */}
                  <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                    <Typography variant="subtitle1" fontWeight="medium">Assinatura</Typography>
                    <Avatar
                      src={assinaturaPreview}
                      sx={{ width: 300, height: 150, backgroundColor: '#f5f5f5' }}
                      variant="square"
                    />
                    <Stack direction="row" spacing={2}>
                      <Button
                        component="label"
                        variant="outlined"
                        startIcon={<UploadIcon />}
                        size="small"
                      >
                        {assinaturaPreview ? 'Alterar' : 'Carregar'}
                        <input
                          type="file"
                          hidden
                          accept="image/*"
                          onChange={handleAssinaturaChange}
                        />
                      </Button>
                      {assinaturaPreview && (
                        <IconButton
                          size="small"
                          color="error"
                          onClick={handleRemoverAssinatura}
                          title="Remover assinatura"
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Formatos: PNG, JPG (máx. 2MB)
                    </Typography>
                  </Box>
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
