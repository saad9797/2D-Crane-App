import Brightness4 from '@mui/icons-material/Brightness4';
import Brightness7 from '@mui/icons-material/Brightness7';
import Logout from '@mui/icons-material/Logout';
import ViewList from '@mui/icons-material/ViewList';
import { AppBar, Box, Button, IconButton, Toolbar, Tooltip, Typography } from '@mui/material';
import { Link as RouterLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useColorMode } from './ColorMode';
import { WakeBanner } from './WakeBanner';

export function Logo() {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Box component="img" src="/favicon.svg" alt="" sx={{ width: 26, height: 26 }} />
      <Typography component="span" sx={{ fontWeight: 700, letterSpacing: '0.02em' }}>
        Crane GA
      </Typography>
    </Box>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { mode, toggle } = useColorMode();
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <WakeBanner />
      <AppBar position="static" className="no-print" component="header">
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <Box component={RouterLink} to="/" sx={{ color: 'inherit', textDecoration: 'none', mr: 2 }} aria-label="Crane GA, designs">
            <Logo />
          </Box>
          <Button color="inherit" component={RouterLink} to="/" startIcon={<ViewList />} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
            My designs
          </Button>
          <Box sx={{ flex: 1 }} />
          <Typography variant="body2" sx={{ opacity: 0.85, display: { xs: 'none', md: 'block' } }}>
            {user?.displayName ?? user?.email}
          </Typography>
          <Tooltip title={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            <IconButton color="inherit" onClick={toggle} aria-label="Toggle colour theme">
              {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Sign out">
            <IconButton
              color="inherit"
              aria-label="Sign out"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              <Logout />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </Box>
    </Box>
  );
}
