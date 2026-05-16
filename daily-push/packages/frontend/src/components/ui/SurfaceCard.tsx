import { Box, type BoxProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';

interface SurfaceCardProps extends BoxProps {
  children?: ReactNode;
}

export default function SurfaceCard({
  children,
  ...props
}: SurfaceCardProps) {
  return (
    <Box
      bg="rgba(255,255,255,0.92)"
      border="1px solid"
      borderColor="whiteAlpha.700"
      borderRadius="2xl"
      boxShadow="card"
      backdropFilter="blur(16px)"
      {...props}
    >
      {children}
    </Box>
  );
}
