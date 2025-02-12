import React, { useCallback, useEffect, useState } from 'react';
import { 
  AppBar as MuiAppBar, 
  Toolbar, 
  Typography, 
  IconButton, 
  Menu, 
  MenuItem, 
  Avatar, 
  Box, 
  useMediaQuery,
  Tooltip,
  Badge,
  Divider
} from '@mui/material'; // @version @mui/material@5.14.0
import {
  Menu as MenuIcon,
  AccountCircle,
  Notifications,
  Settings,
  ExitToApp,
  Home
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { User } from '../../types/auth';
import { LoadingButton } from './LoadingButton';

interface AppBarProps {
  elevated?: boolean;
  position?: 'fixed' | 'absolute' | 'sticky' | 'static' | 'relative';
  enableSessionSync?: boolean;
  menuConfig?: {
    showNotifications?: boolean;
    showSettings?: boolean;
    showHome?: boolean;
  };
}

const AppBar: React.FC<AppBarProps> = ({
  elevated = true,
  position = 'fixed',
  enableSessionSync = true,
  menuConfig = {
    showNotifications: true,
    showSettings: true,
    showHome: true
  }
}) => {
  // State for menu handling
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  // Hooks
  const isMobile = useMediaQuery('(max-width:600px)');
  const { user, isAuthenticated, logout, syncSession } = useAuth();

  // Enable session synchronization across tabs if enabled
  useEffect(() => {
    if (enableSessionSync && isAuthenticated) {
      return syncSession();
    }
  }, [enableSessionSync, isAuthenticated, syncSession]);

  // Menu handlers
  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  // Logout handler with loading state
  const handleLogout = useCallback(async () => {
    try {
      setIsLoggingOut(true);
      await logout();
    } finally {
      setIsLoggingOut(false);
      handleMenuClose();
    }
  }, [logout]);

  // User profile display
  const renderUserProfile = () => {
    if (!user) return null;

    return (
      <Box display="flex" alignItems="center">
        <Avatar 
          alt={`${user.firstName} ${user.lastName}`}
          src={`/api/users/${user.id}/avatar`}
          sx={{ width: 32, height: 32, marginRight: 1 }}
        />
        {!isMobile && (
          <Typography variant="body1" sx={{ marginRight: 1 }}>
            {user.firstName} {user.lastName}
          </Typography>
        )}
      </Box>
    );
  };

  // Menu items based on user role and permissions
  const renderMenuItems = (user: User) => {
    return (
      <>
        <MenuItem onClick={handleMenuClose} aria-label="View Profile">
          <AccountCircle sx={{ marginRight: 1 }} />
          Profile
        </MenuItem>

        {menuConfig.showSettings && (
          <MenuItem onClick={handleMenuClose} aria-label="Settings">
            <Settings sx={{ marginRight: 1 }} />
            Settings
          </MenuItem>
        )}

        <Divider />

        <MenuItem 
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-label="Logout"
        >
          <ExitToApp sx={{ marginRight: 1 }} />
          {isLoggingOut ? 'Logging out...' : 'Logout'}
        </MenuItem>
      </>
    );
  };

  return (
    <MuiAppBar 
      position={position} 
      elevation={elevated ? 4 : 0}
      sx={{
        backgroundColor: 'background.paper',
        color: 'text.primary'
      }}
    >
      <Toolbar>
        {isMobile && (
          <IconButton
            edge="start"
            color="inherit"
            aria-label="menu"
            sx={{ marginRight: 2 }}
          >
            <MenuIcon />
          </IconButton>
        )}

        {menuConfig.showHome && (
          <IconButton
            color="inherit"
            aria-label="home"
            sx={{ marginRight: 2 }}
          >
            <Home />
          </IconButton>
        )}

        <Typography 
          variant="h6" 
          component="div" 
          sx={{ flexGrow: 1 }}
        >
          Project X
        </Typography>

        {isAuthenticated ? (
          <Box display="flex" alignItems="center">
            {menuConfig.showNotifications && (
              <Tooltip title="Notifications">
                <IconButton color="inherit" aria-label="notifications">
                  <Badge badgeContent={notificationCount} color="error">
                    <Notifications />
                  </Badge>
                </IconButton>
              </Tooltip>
            )}

            <IconButton
              onClick={handleMenuOpen}
              color="inherit"
              aria-label="user menu"
              aria-controls="user-menu"
              aria-haspopup="true"
            >
              {renderUserProfile()}
            </IconButton>

            <Menu
              id="user-menu"
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              keepMounted
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              PaperProps={{
                elevation: 3,
                sx: { minWidth: 200 }
              }}
            >
              {user && renderMenuItems(user)}
            </Menu>
          </Box>
        ) : (
          <LoadingButton
            variant="contained"
            color="primary"
            onClick={() => {/* Handle login */}}
            aria-label="login"
          >
            Login
          </LoadingButton>
        )}
      </Toolbar>
    </MuiAppBar>
  );
};

export default AppBar;