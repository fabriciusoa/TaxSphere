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
  MenuItem
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
  CorporateFare as CorporateFareIcon,
  SensorOccupied as SensorOccupiedIcon,
  Build as BuildIcon
} from '@mui/icons-material';
import { manutencaoService } from '../../services/manutencaoService';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../utils/logger';

const drawerWidth = 264;

// Design tokens — Synchro
const S = {
  navy:          '#0a1628',
  navyMid:       '#0d1f3c',
  navyLight:     '#0f2347',
  cyan:          '#00c8f0',
  cyanDim:       'rgba(0, 200, 240, 0.10)',
  cyanBorder:    'rgba(0, 200, 240, 0.20)',
  white:         '#FFFFFF',
  white70:       'rgba(255, 255, 255, 0.70)',
  white40:       'rgba(255, 255, 255, 0.38)',
  white08:       'rgba(255, 255, 255, 0.08)',
  white05:       'rgba(255, 255, 255, 0.05)',
  dividerSide:   'rgba(255, 255, 255, 0.07)',
  appBarBg:      '#FFFFFF',
  contentBg:     '#F1F5F9',
  borderBase:    'rgba(15, 30, 60, 0.10)',
  textPrimary:   '#1a2332',
  textSecond:    '#64748b',
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

  const isAdmin = user?.perfil === 'ADMIN';

  // Polling a cada 15 minutos: força logout se manutenção entrar em execução
  useEffect(() => {
    if (isAdmin) return;

    const verificarManutencao = async () => {
      try {
        const ativas = await manutencaoService.ativas();
        const emExecucao = ativas.some(m => m.status === 'em_execucao');
        if (emExecucao) {
          await logout();
          navigate('/login?manutencao=true');
        }
      } catch(error: any) {
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
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => setAnchorEl(null);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleChangePassword = () => {
    handleUserMenuClose();
    navigate('/trocar-senha');
  };

  const handleMeuPerfil = () => {
    handleUserMenuClose();
    navigate('/meu-perfil');
  };

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
    {
      text: 'Suporte',
      icon: <HelpCenterIcon />,
      submenu: [
        { text: 'Chamado', icon: <SupportAgentIcon />, path: '/suporte/chamado' },
        { text: 'Manual', icon: <MenuBookIcon />, path: '/suporte/manual' },
      ]
    },
    {
      text: 'Configurações',
      icon: <SistemaIcon />,
      submenu: [
        { text: 'Meu Perfil', icon: <AccountCircleIcon />, path: '/meu-perfil' },
        { text: 'Trocar Senha', icon: <LockIcon />, path: '/trocar-senha' }
      ]
    },
    ...(isAdmin ? [
      {
        text: 'Administração',
        icon: <SupervisorAccountIcon />,
        submenu: [
          { text: 'Planos Sistema', icon: <CorporateFareIcon />, path: '/assinatura/planos' },
          { text: 'Assinaturas', icon: <SensorOccupiedIcon />, path: '/assinatura/assinaturas' },
          { text: 'Métricas Stripe', icon: <AssessmentIcon />, path: '/assinatura/metricas-stripe' },
          { text: 'Relatórios Chamados', icon: <AssessmentIcon />, path: '/suporte/relatorios' },
          { text: 'Notificações', icon: <EmailOutlinedIcon />, path: '/sistema/notificacoes' },
          { text: 'Usuários', icon: <UsuariosIcon />, path: '/sistema/usuarios' },
          { text: 'Parâmetros', icon: <ParametrosIcon />, path: '/sistema/parametros' },
          { text: 'Manutenção', icon: <BuildIcon />, path: '/sistema/manutencao' }
        ]
      }
    ] : [])
  ];

  // sx compartilhado para item de menu raiz
  const itemRootSx = (isSelected: boolean) => ({
    borderRadius: '8px',
    mx: 1,
    mb: 0.25,
    color: isSelected ? S.cyan : S.white70,
    boxShadow: isSelected ? 'inset 3px 0 0 ' + S.cyan : 'none',
    backgroundColor: isSelected ? S.cyanDim : 'transparent',
    '& .MuiListItemIcon-root': { color: isSelected ? S.cyan : S.white40, minWidth: 36 },
    '&:hover': {
      backgroundColor: isSelected ? S.cyanDim : S.white05,
      color: S.white,
      '& .MuiListItemIcon-root': { color: S.white70 },
    },
  });

  // sx para subitem
  const subItemSx = (isSelected: boolean) => ({
    pl: 5.5,
    borderRadius: '8px',
    mx: 1,
    mb: 0.25,
    color: isSelected ? S.cyan : S.white70,
    boxShadow: isSelected ? 'inset 3px 0 0 ' + S.cyan : 'none',
    backgroundColor: isSelected ? S.cyanDim : 'transparent',
    '& .MuiListItemIcon-root': { color: isSelected ? S.cyan : S.white40, minWidth: 32, fontSize: '0.85rem' },
    '&:hover': {
      backgroundColor: isSelected ? S.cyanDim : S.white05,
      color: S.white,
      '& .MuiListItemIcon-root': { color: S.white70 },
    },
  });

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: S.navy }}>

      {/* Logo / Brand */}
      <Box sx={{
        px: 3, py: 2.5,
        display: 'flex', alignItems: 'center', gap: 1.5,
        borderBottom: `1px solid ${S.dividerSide}`,
        minHeight: 64,
      }}>
        <Box sx={{
          width: 32, height: 32, borderRadius: '8px',
          backgroundColor: S.cyanDim,
          border: `1px solid ${S.cyanBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Box component="span" sx={{ color: S.cyan, fontSize: '0.9rem', fontWeight: 700, lineHeight: 1 }}>M</Box>
        </Box>
        <Typography sx={{
          fontFamily: '"Inter", system-ui, sans-serif',
          fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em',
          color: S.white, lineHeight: 1,
        }}>
          Mind<Box component="span" sx={{ color: S.cyan }}>Tax</Box>
        </Typography>
      </Box>

      {/* Menu principal */}
      <Box sx={{ flex: 1, overflowY: 'auto', pt: 1, pb: 2,
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': { background: S.white08, borderRadius: 2 },
      }}>
        <List disablePadding>
          {menuItems.map((item) =>
            item.submenu ? (
              <Box key={item.text}>
                <ListItemButton
                  onClick={() => handleMenuClick(item.text)}
                  sx={itemRootSx(false)}
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
                    {item.submenu.map((subItem) => (
                      <ListItemButton
                        key={subItem.path}
                        selected={location.pathname === subItem.path}
                        onClick={() => handleNavigate(subItem.path)}
                        sx={subItemSx(location.pathname === subItem.path)}
                      >
                        <ListItemIcon sx={{ fontSize: '1rem' }}>{subItem.icon}</ListItemIcon>
                        <ListItemText
                          primary={subItem.text}
                          primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: 400 }}
                        />
                      </ListItemButton>
                    ))}
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

      {/* Rodapé do sidebar — usuário */}
      <Box sx={{
        px: 2, py: 2,
        borderTop: `1px solid ${S.dividerSide}`,
        display: 'flex', alignItems: 'center', gap: 1.5,
      }}>
        <Avatar sx={{
          width: 32, height: 32, fontSize: '0.8125rem', fontWeight: 700,
          backgroundColor: S.cyan, color: S.navy, flexShrink: 0,
        }}>
          {user?.nome?.charAt(0)?.toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: S.white, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.nome}
          </Typography>
          <Typography sx={{ fontSize: '0.6875rem', color: S.white40, lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.perfil}
          </Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: S.contentBg }}>

      {/* AppBar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          backgroundColor: S.appBarBg,
          borderBottom: `1px solid ${S.borderBase}`,
          color: S.textPrimary,
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

          {/* Breadcrumb / título da página atual */}
          <Box sx={{ flex: 1 }}>
            <Typography sx={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: '0.9375rem', fontWeight: 600,
              color: S.textPrimary, letterSpacing: '-0.01em',
            }}>
              {getPageTitle(location.pathname)}
            </Typography>
          </Box>

          {/* Ações do usuário */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: S.textPrimary, lineHeight: 1.2 }}>
                {user?.nome}
              </Typography>
              <Typography sx={{ fontSize: '0.6875rem', color: S.textSecond, lineHeight: 1.4 }}>
                {user?.perfil}
              </Typography>
            </Box>
            <IconButton onClick={handleUserMenuOpen} size="small" sx={{ p: 0.5 }}>
              <Avatar sx={{
                width: 34, height: 34, fontSize: '0.875rem', fontWeight: 700,
                backgroundColor: S.cyan, color: S.navy,
              }}>
                {user?.nome?.charAt(0)?.toUpperCase()}
              </Avatar>
            </IconButton>
          </Box>

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
            {(user?.perfil === 'MEDICO' || user?.perfil === 'ADMIN') && (
              <MenuItem onClick={handleMeuPerfil} sx={{ fontSize: '0.875rem', gap: 1.5 }}>
                <AccountCircleIcon fontSize="small" sx={{ color: S.textSecond }} />
                Meu Perfil
              </MenuItem>
            )}
            <MenuItem onClick={handleChangePassword} sx={{ fontSize: '0.875rem', gap: 1.5 }}>
              <LockIcon fontSize="small" sx={{ color: S.textSecond }} />
              Trocar a senha
            </MenuItem>
            <Divider sx={{ my: 0.5, borderColor: S.borderBase }} />
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
              backgroundColor: S.navy,
              borderRight: `1px solid ${S.dividerSide}`,
            }
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Conteúdo principal */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: '64px',
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

// Título da página baseado na rota
function getPageTitle(pathname: string): string {
  const map: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/suporte/chamado': 'Chamados',
    '/suporte/manual': 'Manual',
    '/suporte/relatorios': 'Relatórios de Chamados',
    '/meu-perfil': 'Meu Perfil',
    '/trocar-senha': 'Trocar Senha',
    '/assinatura/planos': 'Planos do Sistema',
    '/assinatura/assinaturas': 'Assinaturas',
    '/assinatura/metricas-stripe': 'Métricas Stripe',
    '/sistema/notificacoes': 'Notificações',
    '/sistema/usuarios': 'Usuários',
    '/sistema/parametros': 'Parâmetros',
    '/sistema/manutencao': 'Manutenção',
  };
  return map[pathname] ?? 'MindTax';
}
