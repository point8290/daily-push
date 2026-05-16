import { Box, Flex, Heading, HStack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <Flex
      align={{ base: 'flex-start', lg: 'center' }}
      justify="space-between"
      direction={{ base: 'column', lg: 'row' }}
      gap={4}
    >
      <Box maxW="3xl">
        {eyebrow && (
          <Text
            fontSize="xs"
            fontWeight="800"
            letterSpacing="0.18em"
            textTransform="uppercase"
            color="brand.700"
          >
            {eyebrow}
          </Text>
        )}
        <Heading
          mt={eyebrow ? 2 : 0}
          size="xl"
          color="ink.900"
          letterSpacing="-0.04em"
          lineHeight="1.02"
        >
          {title}
        </Heading>
        {description && (
          <Text mt={3} fontSize="sm" lineHeight="1.75" color="ink.500">
            {description}
          </Text>
        )}
      </Box>

      {actions ? (
        <HStack spacing={3} alignSelf={{ base: 'stretch', lg: 'center' }}>
          {actions}
        </HStack>
      ) : null}
    </Flex>
  );
}
