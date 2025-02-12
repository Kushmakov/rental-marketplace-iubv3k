import React, { memo, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAnalytics } from '@analytics/react';
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Collapse,
  Box,
  useTheme,
  useMediaQuery,
  Divider,
  Typography,
  IconButton,
} from '@mui/material';
import {
  Home as HomeIcon,
  Search as SearchIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Description as DescriptionIcon,
  Payment as PaymentIcon,
  Message as MessageIcon,
  Settings as SettingsIcon,
  ExpandLess,
  ExpandMore,
  ChevronLeft,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { UserRole } from '../../types/auth';

// Interface definitions
interface SidebarProps {
  open: boolean;
  onClose: () => void;
  permanent?: boolean;
  enableNestedNavigation?: boolean;
  customStyles?: React.CSSProperties;
}

interface NavItem {
  label: string;
  path: string;
  roles?: UserRole[];
  permissions?: string[];
  icon: React.ReactNode;
  children?: NavItem[];
  requiresAuth?: boolean;
  onBeforeNavigate?: () => Promise<boolean>;
}

// Enhanced sidebar component with role-based navigation
const Sidebar: React.FC<SidebarProps> = memo(({
  open,
  onClose,
  permanent = false,
  enableNestedNavigation = true,
  customStyles
}) => {
  const router = useRouter();
  const theme = useTheme();
  const analytics = useAnalytics();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user, isAuthenticated, checkPermission } = useAuth();

  // Navigation items with role-based access
  const navigationItems = useMemo(() => {
    const items: NavItem[] = [
      {
        label: 'Home',
        path: '/',
        icon: <HomeIcon />,
        requiresAuth: false
      },
      {
        label: 'Search Properties',
        path: '/search',
        icon: <SearchIcon />,
        requiresAuth: false
      },
      {
        label: 'My Profile',
        path: '/profile',
        icon: <PersonIcon />,
        requiresAuth: true
      }
    ];

    // Role-specific navigation items
    if (isAuthenticated && user) {
      if (user.role === UserRole.PROPERTY_MANAGER) {
        items.push(
          {
            label: 'My Properties',
            path: '/properties',
            icon: <BusinessIcon />,
            roles: [UserRole.PROPERTY_MANAGER],
            children: [
              {
                label: 'Active Listings',
                path: '/properties/active',
                icon: <BusinessIcon />
              },
              {
                label: 'Applications',
                path: '/properties/applications',
                icon: <DescriptionIcon />
              }
            ]
          }
        );
      }

      if (user.role === UserRole.RENTER) {
        items.push(
          {
            label: 'My Applications',
            path: '/applications',
            icon: <DescriptionIcon />,
            roles: [UserRole.RENTER]
          }
        );
      }

      // Common authenticated user items
      items.push(
        {
          label: 'Payments',
          path: '/payments',
          icon: <PaymentIcon />,
          requiresAuth: true
        },
        {
          label: 'Messages',
          path: '/messages',
          icon: <MessageIcon />,
          requiresAuth: true
        },
        {
          label: 'Settings',
          path: '/settings',
          icon: <SettingsIcon />,
          requiresAuth: true
        }
      );
    }

    return items;
  }, [user, isAuthenticated]);

  // Track navigation events
  const trackNavigation = useCallback((path: string, label: string) => {
    analytics.track('navigation_click', {
      path,
      label,
      userRole: user?.role,
      timestamp: new Date().toISOString()
    });
  }, [analytics, user]);

  // Enhanced navigation handler with security checks
  const handleNavigation = useCallback(async (path: string, item: NavItem) => {
    if (item.requiresAuth && !isAuthenticated) {
      router.push('/login');
      return;
    }

    if (item.roles && user && !item.roles.includes(user.role)) {
      return;
    }

    if (item.permissions && !item.permissions.every(permission => checkPermission(permission))) {
      return;
    }

    if (item.onBeforeNavigate) {
      const canNavigate = await item.onBeforeNavigate();
      if (!canNavigate) return;
    }

    trackNavigation(path, item.label);
    router.push(path);
    
    if (isMobile) {
      onClose();
    }
  }, [router, isAuthenticated, user, checkPermission, isMobile, onClose, trackNavigation]);

  // Nested navigation state
  const [openNestedItems, setOpenNestedItems] = React.useState<string[]>([]);

  const toggleNestedNav = (path: string) => {
    setOpenNestedItems(prev => 
      prev.includes(path) 
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  };

  // Render navigation items recursively
  const renderNavItems = (items: NavItem[], level = 0) => {
    return items.map((item) => {
      const isNested = item.children && item.children.length > 0;
      const isOpen = openNestedItems.includes(item.path);
      const isActive = router.pathname === item.path;

      return (
        <React.Fragment key={item.path}>
          <ListItem
            button
            onClick={() => isNested && enableNestedNavigation 
              ? toggleNestedNav(item.path)
              : handleNavigation(item.path, item)
            }
            sx={{
              pl: level * 2 + 2,
              bgcolor: isActive ? 'action.selected' : 'transparent',
              '&:hover': {
                bgcolor: 'action.hover'
              }
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText 
              primary={item.label}
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: isActive ? 'bold' : 'normal'
              }}
            />
            {isNested && enableNestedNavigation && (
              isOpen ? <ExpandLess /> : <ExpandMore />
            )}
          </ListItem>
          {isNested && enableNestedNavigation && (
            <Collapse in={isOpen} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                {renderNavItems(item.children, level + 1)}
              </List>
            </Collapse>
          )}
        </React.Fragment>
      );
    });
  };

  return (
    <Drawer
      variant={permanent ? 'permanent' : 'temporary'}
      open={open}
      onClose={onClose}
      sx={{
        width: 280,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 280,
          boxSizing: 'border-box',
          ...customStyles
        }
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" noWrap component="div">
          Project X
        </Typography>
        {!permanent && (
          <IconButton onClick={onClose}>
            <ChevronLeft />
          </IconButton>
        )}
      </Box>
      <Divider />
      <List component="nav">
        {renderNavItems(navigationItems)}
      </List>
    </Drawer>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;