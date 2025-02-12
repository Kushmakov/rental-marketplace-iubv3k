import React from 'react'; // react@^18.2.0
import { Box, Container, Grid, Typography, Link, useTheme, useMediaQuery } from '@mui/material'; // @mui/material@^5.14.0
import { lightTheme } from '../../styles/theme';

// Interface for custom link configuration
interface CustomLink {
  text: string;
  url: string;
  analytics_id: string;
}

// Props interface for the Footer component
interface FooterProps {
  elevated?: boolean;
  condensed?: boolean;
  customLinks?: {
    properties?: CustomLink[];
    renters?: CustomLink[];
    landlords?: CustomLink[];
  };
  analytics?: {
    trackEvent?: (id: string) => void;
  };
}

const Footer: React.FC<FooterProps> = ({
  elevated = false,
  condensed = false,
  customLinks,
  analytics
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  // Track link clicks if analytics is provided
  const handleLinkClick = (analyticsId: string) => {
    analytics?.trackEvent?.(analyticsId);
  };

  // Default navigation links merged with custom links
  const navigationLinks = {
    properties: [
      { text: 'Search Properties', url: '/search', analytics_id: 'footer_search' },
      { text: 'Featured Listings', url: '/featured', analytics_id: 'footer_featured' },
      { text: 'Neighborhoods', url: '/neighborhoods', analytics_id: 'footer_neighborhoods' },
      ...(customLinks?.properties || [])
    ],
    renters: [
      { text: 'How It Works', url: '/how-it-works', analytics_id: 'footer_how_it_works' },
      { text: 'Apply Now', url: '/apply', analytics_id: 'footer_apply' },
      { text: 'Renter Guide', url: '/renter-guide', analytics_id: 'footer_renter_guide' },
      ...(customLinks?.renters || [])
    ],
    landlords: [
      { text: 'List Property', url: '/list-property', analytics_id: 'footer_list_property' },
      { text: 'Landlord Tools', url: '/landlord-tools', analytics_id: 'footer_landlord_tools' },
      { text: 'Owner Guide', url: '/owner-guide', analytics_id: 'footer_owner_guide' },
      ...(customLinks?.landlords || [])
    ]
  };

  // Legal links
  const legalLinks = [
    { text: 'Privacy Policy', url: '/privacy', analytics_id: 'footer_privacy' },
    { text: 'Terms of Service', url: '/terms', analytics_id: 'footer_terms' },
    { text: 'Cookie Policy', url: '/cookies', analytics_id: 'footer_cookies' },
    { text: 'Accessibility', url: '/accessibility', analytics_id: 'footer_accessibility' }
  ];

  return (
    <Box
      component="footer"
      sx={{
        backgroundColor: 'background.paper',
        paddingTop: condensed ? 4 : 6,
        paddingBottom: condensed ? 4 : 6,
        boxShadow: elevated ? '0px -2px 4px rgba(0, 0, 0, 0.1)' : 'none',
      }}
      role="contentinfo"
    >
      <Container maxWidth="lg">
        <Grid container spacing={isMobile ? 4 : 8}>
          {/* Company Information */}
          <Grid item xs={12} md={4}>
            <Box mb={3}>
              <img
                src="/images/logo.svg"
                alt="Project X Rental Marketplace"
                width={120}
                height={40}
              />
            </Box>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Comprehensive rental marketplace platform transforming the apartment leasing process
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {['LinkedIn', 'Twitter', 'Facebook'].map((platform) => (
                <Link
                  key={platform}
                  href={`/${platform.toLowerCase()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleLinkClick(`footer_${platform.toLowerCase()}`)}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': { color: 'primary.main' },
                  }}
                  aria-label={platform}
                >
                  <Box
                    component="span"
                    sx={{
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {/* Social media icons would be imported and rendered here */}
                  </Box>
                </Link>
              ))}
            </Box>
          </Grid>

          {/* Navigation Links */}
          <Grid item xs={12} md={8}>
            <Grid container spacing={4}>
              {Object.entries(navigationLinks).map(([section, links]) => (
                <Grid item xs={12} sm={4} key={section}>
                  <Typography
                    variant="h6"
                    color="text.primary"
                    gutterBottom
                    sx={{ textTransform: 'capitalize' }}
                  >
                    {section}
                  </Typography>
                  <nav aria-label={`${section} navigation`}>
                    {links.map((link) => (
                      <Link
                        key={link.analytics_id}
                        href={link.url}
                        onClick={() => handleLinkClick(link.analytics_id)}
                        sx={{
                          display: 'block',
                          color: 'text.secondary',
                          textDecoration: 'none',
                          mb: 1,
                          '&:hover': {
                            color: 'primary.main',
                            textDecoration: 'underline',
                          },
                        }}
                      >
                        {link.text}
                      </Link>
                    ))}
                  </nav>
                </Grid>
              ))}
            </Grid>
          </Grid>

          {/* Legal Section */}
          <Grid item xs={12}>
            <Box
              sx={{
                borderTop: 1,
                borderColor: 'divider',
                pt: 3,
                mt: condensed ? 2 : 4,
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'flex-start' : 'center',
                gap: 2,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                © {new Date().getFullYear()} Project X. All rights reserved.
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 3,
                }}
              >
                {legalLinks.map((link) => (
                  <Link
                    key={link.analytics_id}
                    href={link.url}
                    onClick={() => handleLinkClick(link.analytics_id)}
                    sx={{
                      color: 'text.secondary',
                      textDecoration: 'none',
                      '&:hover': {
                        color: 'primary.main',
                        textDecoration: 'underline',
                      },
                    }}
                  >
                    {link.text}
                  </Link>
                ))}
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default Footer;