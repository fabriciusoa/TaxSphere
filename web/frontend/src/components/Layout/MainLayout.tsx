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

const drawerWidth = 280;

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

    const interval = setInterval(verificarManutencao, 15 * 60 * 1000); // 15 min
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

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

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

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

  const drawer = (
    <div>
      <Toolbar sx={{ backgroundColor: 'primary.main', color: 'white' }}>
        <Typography variant="h6" noWrap component="div">
          Mentis
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) =>
          item.submenu ? (
            <div key={item.text}>
              <ListItemButton onClick={() => handleMenuClick(item.text)}>
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
                {openMenus[item.text] ? <ExpandLess /> : <ExpandMore />}
              </ListItemButton>
              <Collapse in={openMenus[item.text]} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {item.submenu.map((subItem) => (
                    <ListItemButton
                      key={subItem.path}
                      sx={{ pl: 4 }}
                      selected={location.pathname === subItem.path}
                      onClick={() => handleNavigate(subItem.path)}
                    >
                      <ListItemIcon>{subItem.icon}</ListItemIcon>
                      <ListItemText primary={subItem.text} />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </div>
          ) : (
            <ListItemButton
              key={item.text}
              selected={location.pathname === item.path}
              onClick={() => handleNavigate(item.path!)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          )
        )}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` }
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Sistema de Gestão
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">{user?.nome}</Typography>
            <IconButton onClick={handleUserMenuOpen} size="small">
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {user?.nome?.charAt(0)}
              </Avatar>
            </IconButton>
          </Box>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleUserMenuClose}
          >
            {(user?.perfil === 'MEDICO' || user?.perfil === 'ADMIN') && (
              <MenuItem onClick={handleMeuPerfil}>
                <ListItemIcon>
                  <AccountCircleIcon fontSize="small" />
                </ListItemIcon>
                Meu Perfil
              </MenuItem>
            )}
            <MenuItem onClick={handleChangePassword}>
              <ListItemIcon>
                <LockIcon fontSize="small" />
              </ListItemIcon>
              Trocar a senha
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Sair
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth }
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth }
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: 8
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
