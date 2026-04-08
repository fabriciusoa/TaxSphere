import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  TextField,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Stack,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Switch,
  TablePagination,
  Avatar,
  Divider,
  FormControlLabel,
  Checkbox,
  Card,
  CardContent
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  LockOpen as UnlockIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as UncheckedIcon,
  Search as SearchIcon,
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Remove as RemoveIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ptBR } from 'date-fns/locale';
import { ChromePicker } from 'react-color';
import { usuariosService } from '../services/usuariosService';
import { perfisService } from '../services/perfisService';
import usuarioParametrosService from '../services/usuarioParametrosService';
import perfilService from '../services/perfilService';
import { logger } from '../utils/logger';

interface Usuario {
  id: number;
  nome: string;
  email: string;
  cpf: string;
  perfil: string;
  perfil_id: number;
  status: string;
  criado?: string | null;
  dt_inativacao?: string | null;
  dt_nascimento?: string | null;
  dt_ativacao?: string | null;
  ultimo_login?: string | null;
  tentativas_login?: number;
  dt_bloqueio?: string | null;
}

interface Perfil {
  id: number;
  perfil: string;
}

interface DadosMedico {
  especialidade?: number;
  inscricao: string;
  tempo_sessao?: number;
  endereco: string;
  numero?: number;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  nacionalidade: string;
  estado_civil: string;
  telefone: string;
  logo?: string;
  assinatura?: string;
}

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
      id={`usuario-tabpanel-${index}`}
      aria-labelledby={`usuario-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `usuario-tab-${index}`,
    'aria-controls': `usuario-tabpanel-${index}`,
  };
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

const CORES_PADRAO = {
  cor_agendado: '#2196F3',
  cor_confirmado: '#4CAF50',
  cor_cancelado: '#F44336',
  cor_realizado: '#9C27B0',
  cor_faltou: '#FF9800',
  cor_reagendado: '#00BCD4'
};

const UsuariosPage: React.FC = () => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<Usuario | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [loadingPerfis, setLoadingPerfis] = useState(true);
  const [buscandoCEP, setBuscandoCEP] = useState(false);

  // Filtros
  const [filtroDataCriacaoInicio, setFiltroDataCriacaoInicio] = useState<Date | null>(null);
  const [filtroDataCriacaoFim, setFiltroDataCriacaoFim] = useState<Date | null>(null);
  const [filtroBusca, setFiltroBusca] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Formulário básico
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cpf: '',
    senha: '',
    confirmarSenha: '',
    perfil: '',
    dt_nascimento: '',
    status: 'Ativo'
  });

  // Dados profissionais/médicos
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

  // Parâmetros
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

  // Cores do calendário
  const [cores, setCores] = useState(CORES_PADRAO);

  // Disponibilidades
  const [disponibilidades, setDisponibilidades] = useState(getDisponibilidadePadrao());

  // Logos
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [assinaturaFile, setAssinaturaFile] = useState<File | null>(null);
  const [assinaturaPreview, setAssinaturaPreview] = useState<string>('');

  // Requisitos da senha
  const requisitos = [
    { id: 'length', label: 'Mínimo 8 caracteres', test: (senha: string) => senha.length >= 8 },
    { id: 'lowercase', label: 'Pelo menos 1 letra minúscula', test: (senha: string) => /[a-z]/.test(senha) },
    { id: 'uppercase', label: 'Pelo menos 1 letra maiúscula', test: (senha: string) => /[A-Z]/.test(senha) },
    { id: 'special', label: 'Pelo menos 1 caractere especial', test: (senha: string) => /[\W_]/.test(senha) }
  ];

  // Verificar se o usuário em edição é médico
  const ehMedico = editingUsuario?.perfil === 'MEDICO' || editingUsuario?.perfil === 'ADMIN';

  const carregarPerfis = useCallback(async () => {
    try {
      setLoadingPerfis(true);
      const perfisData = await perfisService.listar();
      setPerfis(perfisData);
    } catch (error: any) {
      logger.error('Erro ao carregar perfis:', error);
      setErro(error.response?.data?.erro || 'Erro ao carregar perfis');
    } finally {
      setLoadingPerfis(false);
    }
  }, []);

  const carregarUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const filtros: Record<string, string | number> = {};
      if (filtroDataCriacaoInicio) filtros.data_criacao_inicio = filtroDataCriacaoInicio.toISOString().split('T')[0];
      if (filtroDataCriacaoFim) filtros.data_criacao_fim = filtroDataCriacaoFim.toISOString().split('T')[0];
      if (filtroBusca.trim()) filtros.busca = filtroBusca.trim();
      filtros.page = page + 1;
      filtros.limit = rowsPerPage;

      const response = await usuariosService.listar(filtros);
      setUsuarios(response.data);
      setTotalRecords(response.totalRecords);
    } catch (error: any) {
      logger.error('Erro ao carregar usuários:', error);
      setErro(error.response?.data?.erro || 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, [filtroDataCriacaoInicio, filtroDataCriacaoFim, filtroBusca, page, rowsPerPage]);

  useEffect(() => {
    carregarPerfis();
  }, [carregarPerfis]);

  useEffect(() => {
    carregarUsuarios();
  }, [carregarUsuarios]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleOpenModal = async (usuario?: Usuario) => {
    if (usuario) {
      setEditingUsuario(usuario);
      
      let dataNascimento = '';
      if (usuario.dt_nascimento) {
        if (/^\d{4}-\d{2}-\d{2}/.test(usuario.dt_nascimento)) {
          dataNascimento = usuario.dt_nascimento.split(' ')[0];
        } else {
          const match = usuario.dt_nascimento.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (match) {
            dataNascimento = `${match[3]}-${match[2]}-${match[1]}`;
          }
        }
      }
      
      setFormData({
        nome: usuario.nome,
        email: usuario.email,
        cpf: usuario.cpf,
        senha: '',
        confirmarSenha: '',
        perfil: usuario.perfil_id?.toString() || '',
        dt_nascimento: dataNascimento,
        status: usuario.status
      });

      // Carregar dados médicos se for médico/admin
      if (usuario.perfil === 'MEDICO' || usuario.perfil === 'ADMIN') {
        try {
          const dadosPerfil = await perfilService.buscarPerfilUsuario(usuario.id);
          
          if (dadosPerfil.dados_medico) {
            setDadosMedico({
              especialidade: dadosPerfil.dados_medico.especialidade !== undefined && dadosPerfil.dados_medico.especialidade !== null
                ? (isNaN(Number(dadosPerfil.dados_medico.especialidade)) ? undefined : Number(dadosPerfil.dados_medico.especialidade))
                : undefined,
              inscricao: dadosPerfil.dados_medico.inscricao || '',
              tempo_sessao: dadosPerfil.dados_medico.tempo_sessao || undefined,
              endereco: dadosPerfil.dados_medico.endereco || '',
              numero: dadosPerfil.dados_medico.numero,
              complemento: dadosPerfil.dados_medico.complemento || '',
              bairro: dadosPerfil.dados_medico.bairro || '',
              cidade: dadosPerfil.dados_medico.cidade || '',
              uf: dadosPerfil.dados_medico.uf || '',
              cep: dadosPerfil.dados_medico.cep || '',
              nacionalidade: dadosPerfil.dados_medico.nacionalidade || '',
              estado_civil: dadosPerfil.dados_medico.estado_civil || '',
              telefone: dadosPerfil.dados_medico.telefone || '',
              logo: dadosPerfil.dados_medico.logo || '',
              assinatura: dadosPerfil.dados_medico.assinatura || ''
            });

            if (dadosPerfil.dados_medico.logo) {
              setLogoPreview(`data:image/png;base64,${dadosPerfil.dados_medico.logo}`);
            }
            if (dadosPerfil.dados_medico.assinatura) {
              setAssinaturaPreview(`data:image/png;base64,${dadosPerfil.dados_medico.assinatura}`);
            }
          }

          // Carregar parâmetros
          try {
            const params = await usuarioParametrosService.buscarPorUsuario(usuario.id);
            if (params) {
              setParametros({
                duracao_sessao: params.duracao_sessao || 50,
                tempo_entre_sessao: params.tempo_entre_sessao || 10,
                enviar_email: params.enviar_email !== false,
                enviar_whats: params.enviar_whats || false,
                tempo_lembrete: params.tempo_lembrete || 24,
                permite_paciente_remarcar: params.permite_paciente_remarcar !== false,
                tempo_remarcacao: params.tempo_remarcacao || 24,
                permite_paciente_cancelar: params.permite_paciente_cancelar !== false,
                tempo_cancelamento: params.tempo_cancelamento || 24
              });

              setCores({
                cor_agendado: params.cor_agendado || CORES_PADRAO.cor_agendado,
                cor_confirmado: params.cor_confirmado || CORES_PADRAO.cor_confirmado,
                cor_cancelado: params.cor_cancelado || CORES_PADRAO.cor_cancelado,
                cor_realizado: params.cor_realizado || CORES_PADRAO.cor_realizado,
                cor_faltou: params.cor_faltou || CORES_PADRAO.cor_faltou,
                cor_reagendado: params.cor_reagendado || CORES_PADRAO.cor_reagendado
              });
            }
          } catch (error: any) {
            logger.error('Erro ao carregar parâmetros:', error);
            // Ignorar erro 404 (usuário sem parâmetros cadastrados ainda)
            if (error.response?.status !== 404) {
              setErro(error.response?.data?.erro || error.response?.data?.error || 'Erro ao carregar parâmetros');
            }
          }

        } catch (error: any) {
          logger.error('Erro ao carregar dados profissionais do usuário:', error);
          setErro(error.response?.data?.erro || error.response?.data?.error || 'Erro ao carregar dados profissionais do usuário');
        }
      }
    }
    setTabValue(0);
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setEditingUsuario(null);
    // Resetar dados do formulário
    setDadosMedico({
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
    setParametros({
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
    setCores(CORES_PADRAO);
    setDisponibilidades(getDisponibilidadePadrao());
    setLogoFile(null);
    setLogoPreview('');
    setAssinaturaFile(null);
    setAssinaturaPreview('');
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
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
      if (!file.type.startsWith('image/')) {
        setErro('Por favor, selecione um arquivo de imagem');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setErro('O arquivo deve ter no máximo 2MB');
        return;
      }
      setLogoFile(file);
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
      if (!file.type.startsWith('image/')) {
        setErro('Por favor, selecione um arquivo de imagem para a assinatura');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setErro('O arquivo deve ter no máximo 2MB');
        return;
      }
      setAssinaturaFile(file);
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
      logger.error('Erro ao buscar CEP:', error);
      setErro('Erro ao buscar CEP');
    } finally {
      setBuscandoCEP(false);
    }
  };

  const handleSalvar = async () => {
    try {
      if (!formData.nome || !formData.email || !formData.cpf || !formData.perfil) {
        setErro('Preencha todos os campos obrigatórios');
        return;
      }

      if (!editingUsuario && !formData.senha) {
        setErro('Senha é obrigatória para novo usuário');
        return;
      }

      if (formData.senha) {
        if (formData.senha !== formData.confirmarSenha) {
          setErro('A senha e a confirmação não coincidem');
          return;
        }
        
        if (formData.senha.length < 8) {
          setErro('A senha deve ter no mínimo 8 caracteres');
          return;
        }
        if (!/[a-z]/.test(formData.senha)) {
          setErro('A senha deve conter pelo menos 1 letra minúscula');
          return;
        }
        if (!/[A-Z]/.test(formData.senha)) {
          setErro('A senha deve conter pelo menos 1 letra maiúscula');
          return;
        }
        if (!/[\W_]/.test(formData.senha)) {
          setErro('A senha deve conter pelo menos 1 caractere especial');
          return;
        }
      }

      const dados: any = {
        nome: formData.nome,
        email: formData.email,
        cpf: formData.cpf.replace(/\D/g, ''),
        perfil_id: parseInt(formData.perfil),
        dt_nascimento: formData.dt_nascimento || null
      };
      
      if (editingUsuario) {
        dados.status = formData.status;
      }

      if (formData.senha) {
        dados.senha = formData.senha;
      }

      // Adicionar dados médicos se for médico
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

      if (editingUsuario) {
        await usuariosService.atualizar(editingUsuario.id, dados);

        // Salvar parâmetros se for médico
        if (ehMedico) {
          try {
            await usuarioParametrosService.atualizarPorUsuario(editingUsuario.id, { ...parametros, ...cores });
          } catch (error: any) {
            logger.error('Erro ao atualizar parâmetros:', error);
            if (error.response?.status === 404) {
              try {
                await usuarioParametrosService.criarParaUsuario(editingUsuario.id, { ...parametros, ...cores } as any);
              } catch (criarError: any) {
                logger.error('Erro ao criar parâmetros:', criarError);
                setErro(criarError.response?.data?.erro || criarError.response?.data?.error || 'Erro ao criar parâmetros');
              }
            }
          }
        }

        setSucesso('Usuário atualizado com sucesso');
      } else {
        await usuariosService.criar(dados);
        setSucesso('Usuário criado com sucesso');
      }

      handleCloseModal();
      carregarUsuarios();
    } catch (error: any) {
      if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        const mensagens = error.response.data.errors.map((e: any) => `${e.path?.join('.')}: ${e.message}`).join(', ');
        setErro(mensagens);
      } else {
        logger.error('Erro ao salvar usuário:', error);
        setErro(error.response?.data?.message || 'Erro ao salvar usuário');
      }
    }
  };

  const handleToggleStatus = async (id: number, nome: string, statusAtual: string) => {
    const novoStatus = statusAtual === 'Ativo' ? 'Inativo' : 'Ativo';
    const acao = novoStatus === 'Inativo' ? 'desativar' : 'ativar';
    
    if (!window.confirm(`Deseja realmente ${acao} o usuário ${nome}?`)) {
      return;
    }

    try {
      const dados: any = { status: novoStatus };
      
      if (novoStatus === 'Ativo') {
        dados.dt_inativacao = null;
      }
      
      await usuariosService.atualizar(id, dados);
      setSucesso(`Usuário ${acao === 'desativar' ? 'desativado' : 'ativado'} com sucesso`);
      carregarUsuarios();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error: any) {
      logger.error(`Erro ao ${acao} usuário:`, error);
      setErro(error.response?.data?.message || `Erro ao ${acao} usuário`);
    }
  };

  const handleDesbloquear = async (id: number, nome: string) => {
    if (!window.confirm(`Deseja desbloquear o usuário ${nome}?`)) {
      return;
    }

    try {
      await usuariosService.desbloquear(id);
      setSucesso('Usuário desbloqueado com sucesso');
      carregarUsuarios();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error: any) {
      logger.error('Erro ao desbloquear usuário:', error);
      setErro(error.response?.data?.message || 'Erro ao desbloquear usuário');
    }
  };

  const abrirModalNovo = async () => {
    setFormData({
      nome: '',
      email: '',
      cpf: '',
      senha: '',
      confirmarSenha: '',
      perfil: '',
      dt_nascimento: '',
      status: 'Ativo'
    });
    setEditingUsuario(null);
    setTabValue(0);
    setOpenModal(true);
  };

  const formatarCPF = (cpf: string) => {
    const numeros = cpf.replace(/\D/g, '');
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ptBR}>
      <Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h4" component="h1">
            Cadastro de Usuários
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={abrirModalNovo}
          >
            Novo Usuário
          </Button>
        </Box>

        {erro && (
          <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>
            {erro}
          </Alert>
        )}

        {sucesso && (
          <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2 }}>
            {sucesso}
          </Alert>
        )}

        {/* Filtros */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box sx={{ flex: 1 }}>
              <DatePicker
                label="Data Criação Início"
                value={filtroDataCriacaoInicio}
                onChange={setFiltroDataCriacaoInicio}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <DatePicker
                label="Data Criação Fim"
                value={filtroDataCriacaoFim}
                onChange={setFiltroDataCriacaoFim}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Box>
            <Box sx={{ flex: 2 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Buscar por nome, email ou CPF"
                value={filtroBusca}
                onChange={(e) => {
                  setFiltroBusca(e.target.value);
                  setPage(0);
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
          </Stack>
        </Paper>

        {loading ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : (
          <Box>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Nome</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>CPF</TableCell>
                    <TableCell>Perfil</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Último Login</TableCell>
                    <TableCell align="center">Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {usuarios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        Nenhum usuário cadastrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    usuarios.map((usuario) => (
                      <TableRow key={usuario.id}>
                        <TableCell>{usuario.nome}</TableCell>
                        <TableCell>{usuario.email}</TableCell>
                        <TableCell>{formatarCPF(usuario.cpf)}</TableCell>
                        <TableCell>{usuario.perfil}</TableCell>
                        <TableCell>
                          <Switch
                            checked={usuario.status === 'Ativo'}
                            onChange={() => handleToggleStatus(usuario.id, usuario.nome, usuario.status)}
                            color="success"
                            disabled={usuario.status === 'Bloqueado'}
                          />
                        </TableCell>
                        <TableCell>{usuario.ultimo_login || 'Nunca'}</TableCell>
                        <TableCell align="center">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenModal(usuario)}
                            color="primary"
                          >
                            <EditIcon />
                          </IconButton>
                          
                          {usuario.status === 'Bloqueado' && (
                            <IconButton
                              size="small"
                              onClick={() => handleDesbloquear(usuario.id, usuario.nome)}
                            >
                              <UnlockIcon />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <TablePagination
                component="div"
                count={totalRecords}
                page={page}
                onPageChange={(_, newPage) => setPage(newPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(event) => {
                  setRowsPerPage(parseInt(event.target.value, 10));
                  setPage(0);
                }}
                labelRowsPerPage="Registros por página"
                labelDisplayedRows={({ from, to, count }) =>
                  `${from}-${to} de ${count !== -1 ? count : `mais de ${to}`}`
                }
              />
            </TableContainer>
          </Box>
        )}

        {/* Modal */}
        <Dialog
          open={openModal}
          onClose={handleCloseModal}
          maxWidth="lg"
          fullWidth
          scroll="paper"
        >
          <DialogTitle align="center" fontSize={20}>
            {editingUsuario ? 'Editar Usuário' : 'Novo Usuário'}
          </DialogTitle>
          <DialogContent>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs
                value={tabValue}
                onChange={handleTabChange}
                aria-label="abas usuario"
              >
                <Tab label="Dados Pessoais" {...a11yProps(0)} />
                <Tab label="Acesso" {...a11yProps(1)} />
                {ehMedico && <Tab label="Dados Profissionais" {...a11yProps(2)} />}
                {ehMedico && <Tab label="Endereço" {...a11yProps(3)} />}
                {ehMedico && <Tab label="Parâmetros" {...a11yProps(4)} />}
                {ehMedico && <Tab label="Disponibilidade" {...a11yProps(5)} />}
                {ehMedico && <Tab label="Logos" {...a11yProps(6)} />}
              </Tabs>
            </Box>

            {/* Aba 1: Dados Pessoais */}
            <TabPanel value={tabValue} index={0}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Nome Completo"
                  value={formData.nome}
                  onChange={(e) => handleInputChange('nome', e.target.value)}
                  fullWidth
                  required
                />
                <TextField
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  fullWidth
                  required
                />
                <TextField
                  label="CPF"
                  value={formData.cpf}
                  onChange={(e) => handleInputChange('cpf', e.target.value)}
                  fullWidth
                  required
                  placeholder="000.000.000-00"
                />
                <FormControl fullWidth required>
                  <InputLabel>Perfil</InputLabel>
                  <Select
                    value={formData.perfil}
                    onChange={(e) => handleInputChange('perfil', e.target.value)}
                    label="Perfil"
                    disabled={loadingPerfis}
                  >
                    {perfis.map((perfil) => (
                      <MenuItem key={perfil.id} value={perfil.id}>
                        {perfil.perfil}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Data de Nascimento"
                  type="date"
                  value={formData.dt_nascimento}
                  onChange={(e) => handleInputChange('dt_nascimento', e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
                {editingUsuario && (
                  <FormControl fullWidth>
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={formData.status}
                      onChange={(e) => handleInputChange('status', e.target.value)}
                      label="Status"
                    >
                      <MenuItem value="Ativo">Ativo</MenuItem>
                      <MenuItem value="Inativo">Inativo</MenuItem>
                    </Select>
                  </FormControl>
                )}
              </Box>
            </TabPanel>

            {/* Aba 2: Acesso */}
            <TabPanel value={tabValue} index={1}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  type="password"
                  label={editingUsuario ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha'}
                  value={formData.senha}
                  onChange={(e) => handleInputChange('senha', e.target.value)}
                  fullWidth
                  required={!editingUsuario}
                />
                <TextField
                  type="password"
                  label={editingUsuario ? 'Confirmar Nova Senha' : 'Confirmar Senha'}
                  value={formData.confirmarSenha}
                  onChange={(e) => handleInputChange('confirmarSenha', e.target.value)}
                  fullWidth
                  required={!editingUsuario}
                />
                {formData.senha && (
                  <Box sx={{ mt: 2, mb: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Requisitos da senha:
                    </Typography>
                    <List dense disablePadding>
                      {requisitos.map((req) => {
                        const isSatisfeito = req.test(formData.senha);
                        return (
                          <ListItem key={req.id} disablePadding sx={{ py: 0.5 }}>
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              {isSatisfeito ? (
                                <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />
                              ) : (
                                <UncheckedIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
                              )}
                            </ListItemIcon>
                            <ListItemText
                              primary={req.label}
                              primaryTypographyProps={{
                                variant: 'body2',
                                color: isSatisfeito ? 'text.primary' : 'text.secondary'
                              }}
                            />
                          </ListItem>
                        );
                      })}
                    </List>
                  </Box>
                )}
              </Box>
            </TabPanel>

            {/* Aba 3: Dados Profissionais (apenas médicos) */}
            {ehMedico && (
              <TabPanel value={tabValue} index={2}>
                <Stack spacing={3}>
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
                </Stack>
              </TabPanel>
            )}

            {/* Aba 4: Endereço (apenas médicos) */}
            {ehMedico && (
              <TabPanel value={tabValue} index={3}>
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

            {/* Aba 5: Parâmetros (apenas médicos) */}
            {ehMedico && (
              <TabPanel value={tabValue} index={4}>
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

                  <Divider sx={{ my: 3 }} />
                  <Typography variant="h6" gutterBottom>Personalização do Calendário</Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    Personalize as cores dos agendamentos no calendário de acordo com o status
                  </Typography>

                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
                    {Object.entries({
                      cor_agendado: 'Agendado',
                      cor_confirmado: 'Confirmado',
                      cor_cancelado: 'Cancelado',
                      cor_realizado: 'Realizado',
                      cor_faltou: 'Faltou',
                      cor_reagendado: 'Reagendado'
                    }).map(([key, label]) => (
                      <Card key={key} variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>{label}</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                            <Box
                              sx={{
                                width: 40,
                                height: 40,
                                borderRadius: 1,
                                backgroundColor: cores[key as keyof typeof cores],
                                border: '1px solid',
                                borderColor: 'divider'
                              }}
                            />
                            <Typography variant="body2" color="text.secondary">
                              {cores[key as keyof typeof cores]}
                            </Typography>
                          </Box>
                          <ChromePicker
                            color={cores[key as keyof typeof cores]}
                            onChangeComplete={(color) => setCores(prev => ({ ...prev, [key]: color.hex }))}
                            disableAlpha
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </Box>

                  <Box sx={{ mt: 2 }}>
                    <Button
                      variant="outlined"
                      onClick={() => setCores(CORES_PADRAO)}
                    >
                      Restaurar Cores Padrão
                    </Button>
                  </Box>
                </Stack>
              </TabPanel>
            )}

            {/* Aba 6: Disponibilidade (apenas médicos) */}
            {ehMedico && (
              <TabPanel value={tabValue} index={5}>
                <Stack spacing={3}>
                  <Typography variant="h6">Horários de Atendimento</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Configure os dias e horários em que o profissional estará disponível para atendimentos
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

            {/* Aba 7: Logos (apenas médicos) */}
            {ehMedico && (
              <TabPanel value={tabValue} index={6}>
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

            {/* Botões de ação */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
              <Button onClick={handleCloseModal}>Cancelar</Button>
              <Button onClick={handleSalvar} variant="contained">
                {editingUsuario ? 'Atualizar' : 'Salvar'}
              </Button>
            </Box>
          </DialogContent>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default UsuariosPage;
