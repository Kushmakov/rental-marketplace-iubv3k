import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import { 
  Breadcrumbs as MuiBreadcrumbs, 
  Link, 
  Typography,
  useMediaQuery,
  useTheme 
} from '@mui/material';
import { styled } from '@mui/material/styles';

// Interface definitions
interface BreadcrumbsProps {
  className?: string;
  separator?: React.ReactNode;
  maxItems?: number;
  labelMap?: Record<string, string>;
  showTooltips?: boolean;
  onNavigate?: (path: string) => void;
  disableAnalytics?: boolean;
}

interface BreadcrumbItem {
  label: string;
  path: string;
  id: string;
  isCurrentPage: boolean;
  translations?: Record<string, string>;
}

// Styled component with comprehensive theme integration
const StyledBreadcrumbs = styled(MuiBreadcrumbs)(({ theme }) => ({
  padding: theme.spacing(1, 2),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[1],
  '& .MuiBreadcrumbs-separator': {
    marginLeft: theme.spacing(1),
    marginRight: theme.spacing(1),
    color: theme.palette.text.secondary,
  },
  '& .MuiBreadcrumbs-li': {
    display: 'flex',
    alignItems: 'center',
  },
  '& a': {
    color: theme.palette.primary.main,
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'underline',
      color: theme.palette.primary.dark,
    },
    '&:focus': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: '2px',
    },
  },
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(0.5, 1),
    '& .MuiBreadcrumbs-separator': {
      marginLeft: theme.spacing(0.5),
      marginRight: theme.spacing(0.5),
    },
  },
}));

// Cache for breadcrumb data
const breadcrumbCache = new Map<string, BreadcrumbItem[]>();

// Utility function to generate breadcrumbs with caching
const generateBreadcrumbs = (
  pathname: string,
  labelMap: Record<string, string> = {},
  locale: string
): BreadcrumbItem[] => {
  const cacheKey = `${pathname}-${locale}-${JSON.stringify(labelMap)}`;
  
  if (breadcrumbCache.has(cacheKey)) {
    return breadcrumbCache.get(cacheKey)!;
  }

  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment, index, array) => {
      const path = `/${array.slice(0, index + 1).join('/')}`;
      const rawLabel = segment.replace(/-/g, ' ');
      const label = labelMap[path] || labelMap[segment] || rawLabel;
      
      return {
        label,
        path,
        id: `breadcrumb-${index}`,
        isCurrentPage: index === array.length - 1,
        translations: {}, // Would be populated from i18n service
      };
    });

  breadcrumbCache.set(cacheKey, segments);
  return segments;
};

// Main Breadcrumbs component
export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  className,
  separator = '/',
  maxItems = 8,
  labelMap = {},
  showTooltips = true,
  onNavigate,
  disableAnalytics = false,
}) => {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Generate breadcrumbs with memoization
  const breadcrumbs = useMemo(() => 
    generateBreadcrumbs(router.asPath, labelMap, router.locale || 'en'),
    [router.asPath, labelMap, router.locale]
  );

  // Analytics tracking
  const handleClick = (path: string) => {
    if (!disableAnalytics) {
      // Analytics tracking would be implemented here
      console.debug('Breadcrumb navigation:', path);
    }
    onNavigate?.(path);
  };

  // Handle keyboard navigation
  const handleKeyPress = (event: React.KeyboardEvent, path: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick(path);
      router.push(path);
    }
  };

  // Responsive maxItems
  const responsiveMaxItems = isMobile ? Math.min(3, maxItems) : maxItems;

  return (
    <StyledBreadcrumbs
      className={className}
      separator={separator}
      maxItems={responsiveMaxItems}
      aria-label="Page navigation breadcrumb"
      data-testid="breadcrumb-navigation"
    >
      <Link
        href="/"
        onClick={() => handleClick('/')}
        onKeyPress={(e) => handleKeyPress(e, '/')}
        color="inherit"
        aria-label="Navigate to home page"
        tabIndex={0}
      >
        Home
      </Link>
      
      {breadcrumbs.map((item) => {
        const { label, path, id, isCurrentPage } = item;
        
        return isCurrentPage ? (
          <Typography
            key={id}
            color="text.primary"
            aria-current="page"
            sx={{ 
              fontWeight: 'medium',
              [theme.breakpoints.down('sm')]: {
                fontSize: '0.875rem',
              },
            }}
          >
            {label}
          </Typography>
        ) : (
          <Link
            key={id}
            href={path}
            onClick={() => handleClick(path)}
            onKeyPress={(e) => handleKeyPress(e, path)}
            color="inherit"
            title={showTooltips ? label : undefined}
            tabIndex={0}
            sx={{
              [theme.breakpoints.down('sm')]: {
                fontSize: '0.875rem',
              },
            }}
          >
            {label}
          </Link>
        );
      })}
    </StyledBreadcrumbs>
  );
};

export default Breadcrumbs;