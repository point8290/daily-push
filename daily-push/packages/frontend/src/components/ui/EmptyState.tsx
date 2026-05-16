import { Box, Button, Heading, Text, VStack } from '@chakra-ui/react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  accent?: 'brand' | 'warning' | 'neutral';
}

const accentStyles = {
  brand: {
    bg: 'linear-gradient(135deg, rgba(47,140,255,0.14), rgba(34,63,143,0.08))',
    borderColor: 'brand.100',
  },
  warning: {
    bg: 'linear-gradient(135deg, rgba(255,153,58,0.14), rgba(255,125,20,0.08))',
    borderColor: 'orange.100',
  },
  neutral: {
    bg: 'linear-gradient(135deg, rgba(15,23,36,0.04), rgba(15,23,36,0.02))',
    borderColor: 'blackAlpha.100',
  },
};

export default function EmptyState({
  title,
  description,
  action,
  accent = 'brand',
}: EmptyStateProps) {
  return (
    <Box
      rounded="3xl"
      border="1px solid"
      px={{ base: 6, md: 8 }}
      py={{ base: 8, md: 10 }}
      textAlign="center"
      {...accentStyles[accent]}
    >
      <VStack spacing={3}>
        <Heading size="md" letterSpacing="-0.03em" color="ink.900">
          {title}
        </Heading>
        <Text maxW="lg" fontSize="sm" lineHeight="1.7" color="ink.500">
          {description}
        </Text>
        {action ? <Box pt={2}>{action}</Box> : null}
      </VStack>
    </Box>
  );
}
