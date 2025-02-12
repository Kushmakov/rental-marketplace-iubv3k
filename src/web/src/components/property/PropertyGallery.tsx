import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Grid, IconButton, Box, Typography, styled } from '@mui/material'; // @mui/material@5.14.0
import { useIntersectionObserver } from 'react-intersection-observer'; // react-intersection-observer@9.5.0
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { PropertyImage } from '../../types/property';
import Modal from '../common/Modal';

// Enhanced props interface with comprehensive options
interface PropertyGalleryProps {
  images: PropertyImage[];
  showThumbnails?: boolean;
  maxDisplayed?: number;
  enableTouchGestures?: boolean;
  lazyLoad?: boolean;
  onImageLoad?: (imageId: string) => void;
  onImageError?: (imageId: string, error: Error) => void;
}

// Styled components for enhanced visual presentation
const GalleryContainer = styled(Box)(({ theme }) => ({
  position: 'relative',
  width: '100%',
  borderRadius: theme.shape.borderRadius,
  overflow: 'hidden',
}));

const ImageContainer = styled(Box)(({ theme }) => ({
  position: 'relative',
  width: '100%',
  height: '100%',
  cursor: 'pointer',
  transition: 'transform 0.2s ease-in-out',
  '&:hover': {
    transform: 'scale(1.02)',
  },
  '&.loading': {
    backgroundColor: theme.palette.grey[200],
  },
}));

const StyledImage = styled('img')({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  transition: 'opacity 0.3s ease-in-out',
});

const NavigationButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  backgroundColor: 'rgba(255, 255, 255, 0.8)',
  '&:hover': {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  zIndex: 1,
  [theme.breakpoints.down('sm')]: {
    display: 'none',
  },
}));

const ThumbnailGrid = styled(Grid)(({ theme }) => ({
  marginTop: theme.spacing(1),
  gap: theme.spacing(1),
  [theme.breakpoints.down('sm')]: {
    gap: theme.spacing(0.5),
  },
}));

const PropertyGallery: React.FC<PropertyGalleryProps> = ({
  images,
  showThumbnails = true,
  maxDisplayed = 5,
  enableTouchGestures = true,
  lazyLoad = true,
  onImageLoad,
  onImageError,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  
  const containerRef = useRef<HTMLDivElement>(null);
  const { ref: observerRef, inView } = useIntersectionObserver({
    threshold: 0.1,
    triggerOnce: true,
  });

  // Preload adjacent images for smooth navigation
  useEffect(() => {
    if (!lazyLoad || !inView) return;

    const preloadIndices = [
      currentIndex,
      (currentIndex + 1) % images.length,
      (currentIndex - 1 + images.length) % images.length,
    ];

    preloadIndices.forEach((index) => {
      const img = new Image();
      img.src = images[index].url;
      img.onload = () => {
        setLoadedImages((prev) => new Set([...prev, images[index].id]));
        onImageLoad?.(images[index].id);
      };
      img.onerror = (error) => {
        onImageError?.(images[index].id, error as Error);
      };
    });
  }, [currentIndex, images, lazyLoad, inView]);

  // Touch gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enableTouchGestures) return;
    setTouchStart(e.touches[0].clientX);
  }, [enableTouchGestures]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enableTouchGestures || touchStart === null) return;

    const touchEnd = e.touches[0].clientX;
    const diff = touchStart - touchEnd;

    if (Math.abs(diff) > 50) {
      setCurrentIndex((prev) => {
        const next = diff > 0 
          ? (prev + 1) % images.length
          : (prev - 1 + images.length) % images.length;
        return next;
      });
      setTouchStart(null);
    }
  }, [enableTouchGestures, touchStart, images.length]);

  // Navigation handlers
  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (modalOpen) {
        switch (e.key) {
          case 'ArrowLeft':
            handlePrevious();
            break;
          case 'ArrowRight':
            handleNext();
            break;
          case 'Escape':
            setModalOpen(false);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, handlePrevious, handleNext]);

  return (
    <div ref={observerRef}>
      <GalleryContainer ref={containerRef}>
        <NavigationButton
          onClick={handlePrevious}
          sx={{ left: 8 }}
          aria-label="Previous image"
        >
          <ChevronLeftIcon />
        </NavigationButton>

        <NavigationButton
          onClick={handleNext}
          sx={{ right: 8 }}
          aria-label="Next image"
        >
          <ChevronRightIcon />
        </NavigationButton>

        <ImageContainer
          onClick={() => setModalOpen(true)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          className={!loadedImages.has(images[currentIndex].id) ? 'loading' : ''}
        >
          <StyledImage
            src={images[currentIndex].url}
            alt={images[currentIndex].alt || `Property image ${currentIndex + 1}`}
            loading={lazyLoad ? 'lazy' : 'eager'}
            style={{
              opacity: loadedImages.has(images[currentIndex].id) ? 1 : 0,
            }}
          />
        </ImageContainer>

        {showThumbnails && (
          <ThumbnailGrid container justifyContent="center">
            {images.slice(0, maxDisplayed).map((image, index) => (
              <Grid item key={image.id} xs={2} sm={2} md={2}>
                <ImageContainer
                  onClick={() => setCurrentIndex(index)}
                  sx={{
                    border: index === currentIndex ? '2px solid primary.main' : 'none',
                    opacity: index === currentIndex ? 1 : 0.7,
                  }}
                >
                  <StyledImage
                    src={image.url}
                    alt={`Thumbnail ${index + 1}`}
                    loading="lazy"
                  />
                </ImageContainer>
              </Grid>
            ))}
          </ThumbnailGrid>
        )}
      </GalleryContainer>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="lg"
        title="Property Gallery"
      >
        <Box sx={{ position: 'relative', width: '100%', height: '80vh' }}>
          <StyledImage
            src={images[currentIndex].url}
            alt={images[currentIndex].alt || `Property image ${currentIndex + 1}`}
            style={{ height: '100%' }}
          />
          <Typography variant="caption" sx={{ position: 'absolute', bottom: 16, right: 16 }}>
            {currentIndex + 1} / {images.length}
          </Typography>
        </Box>
      </Modal>
    </div>
  );
};

export default PropertyGallery;