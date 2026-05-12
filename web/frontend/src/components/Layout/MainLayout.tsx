import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Avatar,
  Menu,
  MenuItem,
  Chip
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Settings as SistemaIcon,
  ExpandLess,
  ExpandMore,
  Person as UsuariosIcon,
  Tune as ParametrosIcon,
  Logout as LogoutIcon,
  Lock as LockIcon,
  AccountCircle as AccountCircleIcon,
  EmailOutlined as EmailOutlinedIcon,
  HelpCenter as HelpCenterIcon,
  SupportAgent as SupportAgentIcon,
  MenuBook as MenuBookIcon,
  Assessment as AssessmentIcon,
  SupervisorAccount as SupervisorAccountIcon,
  SwitchAccount as SwitchAccountIcon,
  Build as BuildIcon,
  AccountBalance as AccountBalanceIcon,
  Receipt as ReceiptIcon,
  RequestQuote as RequestQuoteIcon,
  VerifiedUser as VerifiedUserIcon,
  Inbox as InboxIcon,
  BarChart as BarChartIcon,
  Gavel as GavelIcon,
  Business as BusinessIcon,
  AttachMoney as AttachMoneyIcon,
  MoneyOff as MoneyOffIcon,
  Description as DescriptionIcon,
  Calculate as CalculateIcon,
  CloudSync as CloudSyncIcon,
  SpaceDashboard as SpaceDashboardIcon,
  ManageAccounts as ManageAccountsIcon,
  Assignment as AssignmentIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import { manutencaoService } from '../../services/manutencaoService';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../utils/logger';
import { EmpresaAutocomplete } from '../EmpresaAutocomplete';

const drawerWidth = 264;

const S = {
  navy: '#00081D',
  navyMid: '#00081D',
  navyLight: '#123152',
  cyan: '#00BFD4',
  cyanDim: 'rgba(0, 191, 212, 0.12)',
  cyanBorder: 'rgba(0, 191, 212, 0.24)',
  emerald: '#2BCB9A',
  white: '#FFFFFF',
  white70: 'rgba(255, 255, 255, 0.70)',
  white40: 'rgba(255, 255, 255, 0.38)',
  white08: 'rgba(255, 255, 255, 0.08)',
  white05: 'rgba(255, 255, 255, 0.05)',
  dividerSide: 'rgba(255, 255, 255, 0.07)',
  appBarBg: '#FFFFFF',
  contentBg: '#F4F7FA',
  borderBase: 'rgba(15, 30, 60, 0.10)',
  textPrimary: '#17324D',
  textSecond: '#5E748A',
};

/** Logo PNG transparente — uso direto sem hacks */
const logoImageSx = {
  width: '100%',
  maxHeight: 120,
  objectFit: 'contain' as const,
  objectPosition: 'center' as const,
  display: 'block',
  transition: 'filter 320ms ease',
  '&:hover': {
    filter: 'brightness(1.08) saturate(1.1)',
  },
};

interface Props {
  children: React.ReactNode;
}

export default function MainLayout({ children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<{ [key: string]: boolean }>({});
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const isAdminSystem = user?.adm_system === true;

  const userModulos = user?.user_modulos || [];

  // Verifica se o usuário tem acesso a uma funcionalidade específica dentro de um módulo
  const hasFuncionalidade = (moduloNome: string, funcionalidade: string) =>
    isAdminSystem ||
    userModulos
      .filter(m => m.modulo === moduloNome)
      .flatMap(m => m.user_funcionalidade ?? [])
      .some(f => f.funcionalidade === funcionalidade);

  // Verifica se o usuário tem acesso a um módulo
  const hasModulo = (moduloNome: string) =>
    isAdminSystem || userModulos.some(m => m.modulo === moduloNome);

  useEffect(() => {
    if (isAdminSystem) return;

    const verificarManutencao = async () => {
      try {
        const ativas = await manutencaoService.ativas();
        const emExecucao = ativas.some(m => m.status === 'em_execucao');
        if (emExecucao) {
          await logout();
          navigate('/login?manutencao=true');
        }
      } catch (error: any) {
        logger.error('Erro crítico ao verificarManutencao', error);
      }
    };

    const interval = setInterval(verificarManutencao, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  const handleMenuClick = (menu: string) => {
    setOpenMenus((prev) => ({ ...prev, [menu]: !prev[menu] }));
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => setAnchorEl(null);

  const handleLogout = async () => {
    handleUserMenuClose();
    await logout();
    navigate('/login');
  };

  const handleSwitchUser = async () => {
    handleUserMenuClose();
    await logout();
    navigate('/login?switch=1');
  };

  const handleChangePassword = () => {
    handleUserMenuClose();
    navigate('/trocar-senha');
  };

  const handleMeuPerfil = () => {
    handleUserMenuClose();
    navigate('/meu-perfil');
  };

  // Badge "Em breve" para módulos ainda não implementados
  const emBreve = (
    <Chip
      label="Em breve"
      size="small"
      sx={{
        ml: 'auto', height: 18, fontSize: '0.6rem', fontWeight: 600,
        backgroundColor: 'rgba(255,255,255,0.08)', color: S.white40,
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    />
  );

  const menuItems = [
    ...(hasModulo('Dashboard') ? [
      { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
    ] : []),
    // Módulos Fiscais — core do TaxSphere
    {
      text: 'Soluções Fiscais',
      icon: <AccountBalanceIcon />,
      submenu: [
        ...(hasModulo('PERD/Comp') ? [
          {
            text: 'PERD/Comp', icon: <RequestQuoteIcon />, path: '/fiscal/perdcomp',
            submenu: [
              ...(hasFuncionalidade('PERD/Comp', 'Painel') ? [
                { text: 'Painel', icon: <SpaceDashboardIcon />, path: '/fiscal/perdcomp' },
              ] : []),
              ...(hasFuncionalidade('PERD/Comp', 'Créditos') ? [
                { text: 'Créditos', icon: <AttachMoneyIcon />, path: '/fiscal/perdcomp/creditos' },
              ] : []),
              ...(hasFuncionalidade('PERD/Comp', 'Débitos') ? [
                { text: 'Débitos', icon: <MoneyOffIcon />, path: '/fiscal/perdcomp/debitos' },
              ] : []),
              ...(hasFuncionalidade('PERD/Comp', 'Documentos') ? [
                { text: 'Documentos PER/DCOMP', icon: <AssignmentIcon />, path: '/fiscal/perdcomp/documentos' },
              ] : []),
              ...(hasFuncionalidade('PERD/Comp', 'Simulador') ? [
                { text: 'Simulador', icon: <CalculateIcon />, path: '/fiscal/perdcomp/simulador' },
              ] : []),
              { text: 'Relatórios PER/DCOMP', icon: <AssessmentIcon />, path: '/fiscal/perdcomp/relatorios' },
            ],
          }
        ] : []),
        ...(hasModulo('Recuperação PIS/COFINS') ? [
          { text: 'Recuperação PIS/COFINS', icon: <ReceiptIcon />, path: '/fiscal/pis-cofins', badge: emBreve }
        ] : []),
        ...(hasModulo('MIT') ? [
          { text: 'MIT', icon: <GavelIcon />, path: '/fiscal/mit', badge: emBreve }
        ] : []),
        ...(hasModulo('DCTF Web') ? [
          {
            text: 'DCTF Web', icon: <BarChartIcon />, path: '/fiscal/dctf-web',
            submenu: [
              ...(hasFuncionalidade('DCTF Web', 'Painel') ? [
                { text: 'Painel', icon: <SpaceDashboardIcon />, path: '/fiscal/dctf-web' },
              ] : []),
              ...(hasFuncionalidade('DCTF Web', 'Declarações') ? [
                { text: 'Declarações', icon: <DescriptionIcon />, path: '/fiscal/dctf-web/declaracoes' },
              ] : []),
            ],
          }
        ] : []),
        ...(hasModulo('Gestão de CNDs') ? [
          { text: 'Gestão de CNDs', icon: <VerifiedUserIcon />, path: '/fiscal/cnds', badge: emBreve }
        ] : []),
        ...(hasModulo('Caixa Postal eCac') ? [
          { text: 'Caixa Postal eCac', icon: <InboxIcon />, path: '/fiscal/ecac', badge: emBreve }
        ] : []),
        ...(hasModulo('Classificação NCM') ? [
          {
            text: 'Classificação NCM',
            icon: <InboxIcon />,
            submenu: [
              ...(hasFuncionalidade('Classificação NCM', 'Tabela NCM') ? [
                { text: 'Tabela NCM', icon: <DescriptionIcon />, path: '/fiscal/ncm/tabela' },
              ] : []),
              ...(hasFuncionalidade('Classificação NCM', 'Manual') ? [
                { text: 'Manual', icon: <MenuBookIcon />, path: '/fiscal/ncm/manual' },
              ] : []),
            ]
          },
        ] : []),


      ]
    },
    // Suporte
    ...(hasModulo('Suporte') ? [
      {
        text: 'Suporte',
        icon: <HelpCenterIcon />,
        submenu: [
          ...(hasFuncionalidade('Suporte', 'Chamado') ? [
            { text: 'Chamado', icon: <SupportAgentIcon />, path: '/suporte/chamado' },
          ] : []),
          ...(hasFuncionalidade('Suporte', 'Manual') ? [
            { text: 'Manual', icon: <MenuBookIcon />, path: '/suporte/manual' },
          ] : []),
        ]
      },
    ] : []),

    // Configurações do usuário
    ...(hasModulo('Configurações') ? [
      {
        text: 'Configurações',
        icon: <SistemaIcon />,
        submenu: [
          ...(hasModulo('Empresas') ? [
            { text: 'Empresas', icon: <BusinessIcon />, path: '/configuracoes/empresas' },
          ] : []),
          ...(hasModulo('Perfis de Acesso') ? [
            { text: 'Perfis de Acesso', icon: <ManageAccountsIcon />, path: '/sistema/perfis' },
          ] : []),
          ...(hasModulo('Certificados Digitais') ? [
            { text: 'Certificados Digitais', icon: <SecurityIcon />, path: '/configuracoes/certificados' },
          ] : []),
          ...(hasModulo('Integração eCAC') ? [
            { text: 'Integração eCAC', icon: <CloudSyncIcon />, path: '/configuracoes/ecac' },
          ] : []),
          ...(hasModulo('Meu Perfil') ? [
            { text: 'Meu Perfil', icon: <AccountCircleIcon />, path: '/meu-perfil' },
          ] : []),
          ...(hasModulo('Trocar Senha') ? [
            { text: 'Trocar Senha', icon: <LockIcon />, path: '/trocar-senha' }
          ] : []),
        ]
      },
    ] : []),
    // Administração (apenas ADMIN)
    ...(isAdminSystem ? [
      {
        text: 'Administração',
        icon: <SupervisorAccountIcon />,
        submenu: [
          { text: 'Clientes', icon: <UsuariosIcon />, path: '/clientes' },
          { text: 'Perfis de Acesso', icon: <ManageAccountsIcon />, path: '/sistema/perfis' },
          { text: 'Relatórios Chamados', icon: <AssessmentIcon />, path: '/suporte/relatorios' },
          { text: 'Notificações', icon: <EmailOutlinedIcon />, path: '/sistema/notificacoes' },
          { text: 'Usuários', icon: <UsuariosIcon />, path: '/sistema/usuarios' },
          { text: 'Parâmetros', icon: <ParametrosIcon />, path: '/sistema/parametros' },
          { text: 'Manutenção', icon: <BuildIcon />, path: '/sistema/manutencao' }
        ]
      }
    ] : [])
  ];

  const itemRootSx = (isSelected: boolean) => ({
    position: 'relative' as const,
    borderRadius: '10px',
    mx: 1,
    mb: 0.5,
    py: 0.75,
    color: isSelected ? S.cyan : S.white70,
    background: isSelected
      ? `linear-gradient(90deg, rgba(0,191,212,0.18) 0%, rgba(43,203,154,0.08) 60%, rgba(43,203,154,0) 100%)`
      : 'transparent',
    transition: 'all 220ms cubic-bezier(0.4, 0, 0.2, 1)',
    overflow: 'hidden' as const,
    '&::before': {
      content: '""',
      position: 'absolute' as const,
      left: 0, top: 8, bottom: 8,
      width: isSelected ? 3 : 0,
      borderRadius: '0 3px 3px 0',
      background: `linear-gradient(180deg, ${S.cyan} 0%, ${S.emerald} 100%)`,
      boxShadow: isSelected ? `0 0 10px ${S.cyan}` : 'none',
      transition: 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)',
    },
    '& .MuiListItemIcon-root': {
      color: isSelected ? S.cyan : S.white40,
      minWidth: 36,
      transition: 'color 220ms ease, transform 220ms ease',
    },
    '&:hover': {
      backgroundColor: isSelected ? undefined : 'rgba(255,255,255,0.04)',
      color: S.white,
      transform: 'translateX(2px)',
      '& .MuiListItemIcon-root': {
        color: isSelected ? S.cyan : S.white70,
        transform: 'scale(1.08)',
      },
      '&::before': { width: 3 },
    },
  });

  const subItemSx = (isSelected: boolean) => ({
    position: 'relative' as const,
    pl: 5.5,
    borderRadius: '10px',
    mx: 1,
    mb: 0.25,
    py: 0.5,
    color: isSelected ? S.cyan : S.white70,
    background: isSelected
      ? `linear-gradient(90deg, rgba(0,191,212,0.14) 0%, rgba(0,191,212,0) 100%)`
      : 'transparent',
    transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
    '& .MuiListItemIcon-root': {
      color: isSelected ? S.cyan : S.white40,
      minWidth: 32, fontSize: '0.85rem',
      transition: 'color 180ms ease',
    },
    '&:hover': {
      backgroundColor: isSelected ? undefined : 'rgba(255,255,255,0.04)',
      color: S.white,
      transform: 'translateX(2px)',
      '& .MuiListItemIcon-root': { color: S.white70 },
    },
  });

  const isGroupActive = (submenu: any[]): boolean =>
    submenu.some((sub: any) =>
      location.pathname === sub.path || (sub.submenu && isGroupActive(sub.submenu))
    );

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: S.navy }}>

      {/* Logo / Brand — fundo idêntico ao drawer; realce nas cores do logo */}
      <Box
        sx={{
          flexShrink: 0,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: S.navy,
          px: 2,
          pt: 2.5,
          pb: 2,
          isolation: 'isolate',
        }}
      >
        <Box
          component="img"
          src="/TaxSphere_clean.png"
          alt="TaxSphere"
          sx={logoImageSx}
        />
      </Box>

      {/* Menu principal */}
      <Box sx={{
        flex: 1, overflowY: 'auto', pt: 1.5, pb: 2,
        '&::-webkit-scrollbar': { width: 6 },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': {
          background: `linear-gradient(180deg, ${S.cyan}, ${S.emerald})`,
          borderRadius: 4,
          opacity: 0.4,
        },
        '&::-webkit-scrollbar-thumb:hover': { opacity: 1 },
      }}>
        <List disablePadding>
          {menuItems.map((item) =>
            item.submenu ? (
              <Box key={item.text}>
                <ListItemButton
                  onClick={() => handleMenuClick(item.text)}
                  sx={itemRootSx(isGroupActive(item.submenu))}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }}
                  />
                  {openMenus[item.text]
                    ? <ExpandLess sx={{ color: S.white40, fontSize: 18 }} />
                    : <ExpandMore sx={{ color: S.white40, fontSize: 18 }} />}
                </ListItemButton>
                <Collapse in={openMenus[item.text]} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {item.submenu.map((subItem: any) =>
                      subItem.submenu ? (
                        <Box key={subItem.text}>
                          <ListItemButton
                            onClick={() => handleMenuClick(subItem.text)}
                            sx={subItemSx(isGroupActive(subItem.submenu))}
                          >
                            <ListItemIcon sx={{ fontSize: '1rem' }}>{subItem.icon}</ListItemIcon>
                            <ListItemText primary={subItem.text} primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: 500 }} />
                            {openMenus[subItem.text]
                              ? <ExpandLess sx={{ color: S.white40, fontSize: 16 }} />
                              : <ExpandMore sx={{ color: S.white40, fontSize: 16 }} />}
                          </ListItemButton>
                          <Collapse in={openMenus[subItem.text]} timeout="auto" unmountOnExit>
                            <List component="div" disablePadding>
                              {subItem.submenu.map((deepItem: any) => (
                                <ListItemButton
                                  key={deepItem.path}
                                  selected={location.pathname === deepItem.path}
                                  onClick={() => handleNavigate(deepItem.path)}
                                  sx={{ ...subItemSx(location.pathname === deepItem.path), pl: 8 }}
                                >
                                  <ListItemIcon sx={{ fontSize: '0.85rem', minWidth: 28 }}>{deepItem.icon}</ListItemIcon>
                                  <ListItemText primary={deepItem.text} primaryTypographyProps={{ fontSize: '0.75rem', fontWeight: 400 }} />
                                </ListItemButton>
                              ))}
                            </List>
                          </Collapse>
                        </Box>
                      ) : (
                        <ListItemButton
                          key={subItem.path}
                          selected={location.pathname === subItem.path}
                          onClick={() => handleNavigate(subItem.path)}
                          sx={subItemSx(location.pathname === subItem.path)}
                        >
                          <ListItemIcon sx={{ fontSize: '1rem' }}>{subItem.icon}</ListItemIcon>
                          <ListItemText primary={subItem.text} primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: 400 }} />
                          {subItem.badge && subItem.badge}
                        </ListItemButton>
                      )
                    )}
                  </List>
                </Collapse>
              </Box>
            ) : (
              <ListItemButton
                key={item.text}
                selected={location.pathname === item.path}
                onClick={() => handleNavigate(item.path!)}
                sx={itemRootSx(location.pathname === item.path!)}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }}
                />
              </ListItemButton>
            )
          )}
        </List>
      </Box>

      {/* Rodapé do sidebar — usuário (apenas display, sem interação) */}
      <Box sx={{
        px: 2, py: 2,
        borderTop: `1px solid ${S.dividerSide}`,
        display: 'flex', alignItems: 'center', gap: 1.5,
      }}>
        <Avatar sx={{
          width: 34, height: 34, fontSize: '0.8125rem', fontWeight: 700,
          background: `linear-gradient(135deg, ${S.cyan} 0%, ${S.emerald} 100%)`,
          color: S.navy, flexShrink: 0,
          boxShadow: `0 0 0 2px ${S.navy}, 0 0 12px rgba(0,191,212,0.45)`,
        }}>
          {user?.nome?.charAt(0)?.toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{
            fontSize: '0.8125rem', fontWeight: 600, color: S.white, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {user?.nome}
          </Typography>
          <Typography sx={{
            fontSize: '0.6875rem', color: S.white40, lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {user?.perfil}
          </Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: S.contentBg }}>

      {/* AppBar — glassmorphism moderno */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          backgroundColor: 'rgba(255,255,255,0.72)',
          backdropFilter: 'saturate(180%) blur(14px)',
          WebkitBackdropFilter: 'saturate(180%) blur(14px)',
          borderBottom: `1px solid ${S.borderBase}`,
          color: S.textPrimary,
          // Linha de acento gradiente cyan → esmeralda na base do AppBar
          '&::after': {
            content: '""',
            position: 'absolute',
            left: 0, right: 0, bottom: -1,
            height: 1,
            background: `linear-gradient(90deg, transparent 0%, ${S.cyan} 30%, ${S.emerald} 70%, transparent 100%)`,
            opacity: 0.55,
          },
        }}
      >
        <Toolbar sx={{ minHeight: '64px !important', px: { xs: 2, sm: 3 } }}>
          <IconButton
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' }, color: S.textPrimary }}
          >
            <MenuIcon />
          </IconButton>

          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography sx={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: '0.9375rem', fontWeight: 600,
              color: S.textPrimary, letterSpacing: '-0.01em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              flexShrink: 0,
            }}>
              {getPageTitle(location.pathname)}
            </Typography>
          </Box>

          {/* Seletor global de empresa — disponível em todas as páginas */}
          {user && !location.pathname.startsWith('/login') && (
            <Box sx={{
              mr: 2,
              display: { xs: 'none', md: 'block' },
              width: 720,
              maxWidth: '50vw',
              position: 'relative',
              zIndex: 10,
            }}>
              <EmpresaAutocomplete label="Empresa" minWidth={720}
                todasLabel="Todas as empresas"
              />
            </Box>
          )}

          {/* Sessão do usuário — botão HTML puro (sem dependência de MUI/Box) */}
          <button
            type="button"
            onClick={handleUserMenuOpen}
            aria-label="Menu do usuário"
            aria-haspopup="menu"
            aria-expanded={Boolean(anchorEl)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '4px 8px',
              borderRadius: 999,
              userSelect: 'none',
              font: 'inherit',
              color: 'inherit',
              pointerEvents: 'auto',
              zIndex: 9999,
              position: 'relative',
            }}
          >
            <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
              <Typography component="span" sx={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: S.textPrimary, lineHeight: 1.2 }}>
                {user?.nome}
              </Typography>
              <Typography component="span" sx={{ display: 'block', fontSize: '0.6875rem', color: S.textSecond, lineHeight: 1.4 }}>
                {user?.perfil}
              </Typography>
            </Box>
            <Avatar sx={{
              width: 36, height: 36, fontSize: '0.9rem', fontWeight: 700,
              background: `linear-gradient(135deg, ${S.cyan} 0%, ${S.emerald} 100%)`,
              color: S.navy,
              boxShadow: `0 0 0 2px ${S.cyan}, 0 0 0 4px rgba(0,191,212,0.18)`,
            }}>
              {user?.nome?.charAt(0)?.toUpperCase()}
            </Avatar>
          </button>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleUserMenuClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1, minWidth: 180,
                  borderRadius: '10px',
                  border: `1px solid ${S.borderBase}`,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                }
              }
            }}
          >
            <MenuItem onClick={handleMeuPerfil} sx={{ fontSize: '0.875rem', gap: 1.5 }}>
              <AccountCircleIcon fontSize="small" sx={{ color: S.textSecond }} />
              Meu Perfil
            </MenuItem>
            <MenuItem onClick={handleChangePassword} sx={{ fontSize: '0.875rem', gap: 1.5 }}>
              <LockIcon fontSize="small" sx={{ color: S.textSecond }} />
              Trocar a senha
            </MenuItem>
            <Divider sx={{ my: 0.5, borderColor: S.borderBase }} />
            <MenuItem onClick={handleSwitchUser} sx={{ fontSize: '0.875rem', gap: 1.5 }}>
              <SwitchAccountIcon fontSize="small" sx={{ color: S.cyan }} />
              Trocar de usuário
            </MenuItem>
            <MenuItem onClick={handleLogout} sx={{ fontSize: '0.875rem', gap: 1.5, color: '#D32F2F' }}>
              <LogoutIcon fontSize="small" sx={{ color: '#D32F2F' }} />
              Sair
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Sidebar — mobile */}
      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box', width: drawerWidth,
              backgroundColor: S.navy, border: 'none',
            }
          }}
        >
          {drawer}
        </Drawer>

        {/* Sidebar — desktop */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box', width: drawerWidth,
              border: 'none',
              backgroundColor: S.navy,
              boxShadow: '4px 0 24px -6px rgba(5, 15, 34, 0.35)',
            }
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Conteúdo principal — vinheta radial + marca d'água da esfera */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: '64px',
          minHeight: 'calc(100vh - 64px)',
          position: 'relative',
          backgroundColor: S.contentBg,
          backgroundImage: [
            `radial-gradient(1200px 600px at 100% 0%, rgba(0,191,212,0.06), transparent 60%)`,
            `radial-gradient(900px 500px at 0% 100%, rgba(43,203,154,0.05), transparent 60%)`,
          ].join(', '),
          // Marca d'água sutil da esfera, centralizada (75% da área)
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            backgroundImage: 'url(/TS_Sphere.png)',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            backgroundSize: 'min(75vh, 75%) auto',
            opacity: 0.06,
            pointerEvents: 'none',
            zIndex: 0,
          },
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

function getPageTitle(pathname: string): string {
  const map: Record<string, string> = {
    '/dashboard': 'Dashboard',

    // Soluções Fiscais
    '/fiscal/classificacao-ncm': 'Classificação NCM',
    '/fiscal/perdcomp': 'PERD/Comp - Painel',
    '/fiscal/perdcomp/creditos': 'PERD/Comp - Créditos',
    '/fiscal/perdcomp/debitos': 'PERD/Comp - Débitos',
    '/fiscal/perdcomp/documentos': 'PER/DCOMP - Documentos',
    '/fiscal/perdcomp/documentos/novo': 'PER/DCOMP - Novo Documento',
    '/fiscal/perdcomp/simulador': 'PER/DCOMP - Simulador',
    '/fiscal/perdcomp/relatorios': 'PER/DCOMP - Relatórios',
    '/configuracoes/certificados': 'Certificados Digitais',
    '/configuracoes/ecac': 'Integração eCAC',
    '/fiscal/pis-cofins': 'Recuperação PIS/COFINS',
    '/fiscal/mit': 'MIT',
    '/fiscal/dctf-web': 'DCTF Web - Painel',
    '/fiscal/dctf-web/declaracoes': 'DCTF Web - Declarações',
    '/fiscal/cnds': 'Gestão de CNDs',
    '/fiscal/ecac': 'Caixa Postal eCac',
    //NCM
    '/fiscal/ncm/tabela': 'Classificação NCM - Tabela',
    '/fiscal/ncm/manual': 'Classificação NCM - Manual',
    // Suporte
    '/suporte/chamado': 'Chamados',
    '/suporte/manual': 'Manual',
    '/suporte/relatorios': 'Relatórios de Chamados',

    // Configurações
    '/configuracoes/empresas': 'Gestão de Empresas',
    '/meu-perfil': 'Meu Perfil',
    '/trocar-senha': 'Trocar Senha',

    // Administração
    '/sistema/notificacoes': 'Notificações',
    '/sistema/usuarios': 'Usuários',
    '/sistema/parametros': 'Parâmetros',
    '/sistema/manutencao': 'Manutenção',
  };
  return map[pathname] ?? 'TaxSphere';
}
