'use strict';

import React from 'react'; // ^18.2.0
import { CircularProgress, Box } from '@mui/material'; // ^5.14.0

const Loading: React.FC = () => {
  // Using React.memo to prevent unnecessary re-renders during transitions
  return React.memo(() => (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        // Ensure loading indicator appears above other content
        zIndex: (theme) => theme.zIndex.modal + 1,
        // Optimize GPU acceleration for smoother animations
        transform: 'translateZ(0)',
        // Support reduced motion preferences
        '@media (prefers-reduced-motion: reduce)': {
          '& .MuiCircularProgress-root': {
            animation: 'none',
          },
        },
      }}
      role="progressbar"
      aria-label="Loading content"
      // Ensure focus management for screen readers
      tabIndex={-1}
    >
      <CircularProgress
        size={40}
        thickness={4}
        // Use primary color from theme for consistent styling
        color="primary"
        // Improve animation performance
        sx={{
          willChange: 'transform',
        }}
        // Additional accessibility attributes
        aria-busy="true"
      />
    </Box>
  ));
};

// Default export for Next.js route segments
export default Loading;