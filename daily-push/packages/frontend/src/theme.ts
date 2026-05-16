import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
  initialColorMode: 'light',
  useSystemColorMode: false,
};

const theme = extendTheme({
  config,
  fonts: {
    heading: "'Manrope', 'Segoe UI', sans-serif",
    body: "'Manrope', 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'SFMono-Regular', monospace",
  },
  colors: {
    brand: {
      50: '#eff8ff',
      100: '#d8ecff',
      200: '#b9ddff',
      300: '#8ec8ff',
      400: '#59adff',
      500: '#2f8cff',
      600: '#1e6eff',
      700: '#1f57e0',
      800: '#2148b5',
      900: '#223f8f',
    },
    ink: {
      50: '#f8fafc',
      100: '#edf2f7',
      200: '#d8e0ea',
      300: '#b3c0d1',
      400: '#7c8ca3',
      500: '#58677d',
      600: '#3f4c61',
      700: '#2b3648',
      800: '#192231',
      900: '#0f1724',
    },
    accent: {
      50: '#fff6ec',
      100: '#ffe6c7',
      200: '#ffd199',
      300: '#ffb869',
      400: '#ff983a',
      500: '#ff7d14',
      600: '#ea6308',
      700: '#c24a09',
      800: '#9b390f',
      900: '#7d3010',
    },
  },
  radii: {
    xl: '20px',
    '2xl': '28px',
    '3xl': '36px',
  },
  shadows: {
    outline: '0 0 0 3px rgba(47, 140, 255, 0.22)',
    card: '0 18px 50px rgba(15, 23, 36, 0.08)',
    panel: '0 24px 60px rgba(16, 24, 40, 0.12)',
  },
  styles: {
    global: {
      body: {
        bg: '#f3f7fb',
        color: 'ink.900',
      },
      '#root': {
        minHeight: '100vh',
      },
      '::selection': {
        background: 'rgba(47, 140, 255, 0.18)',
      },
    },
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: '700',
        borderRadius: 'xl',
      },
      sizes: {
        md: {
          px: '20px',
          h: '44px',
          fontSize: 'sm',
        },
      },
      variants: {
        solid: {
          bg: 'brand.600',
          color: 'white',
          _hover: {
            bg: 'brand.700',
          },
          _active: {
            bg: 'brand.800',
          },
        },
        outline: {
          borderColor: 'ink.200',
          color: 'ink.700',
          bg: 'white',
          _hover: {
            borderColor: 'brand.200',
            color: 'brand.700',
            bg: 'brand.50',
          },
        },
        ghost: {
          color: 'ink.600',
          _hover: {
            bg: 'whiteAlpha.800',
            color: 'ink.900',
          },
        },
        subtle: {
          bg: 'whiteAlpha.800',
          color: 'ink.700',
          _hover: {
            bg: 'white',
            color: 'ink.900',
          },
        },
      },
      defaultProps: {
        variant: 'solid',
        colorScheme: 'brand',
      },
    },
    Input: {
      defaultProps: {
        focusBorderColor: 'brand.400',
      },
      variants: {
        outline: {
          field: {
            bg: 'white',
            borderColor: 'ink.200',
            borderRadius: 'xl',
            _hover: {
              borderColor: 'ink.300',
            },
          },
        },
      },
    },
    Textarea: {
      defaultProps: {
        focusBorderColor: 'brand.400',
      },
      variants: {
        outline: {
          borderColor: 'ink.200',
          borderRadius: '2xl',
          bg: 'white',
          _hover: {
            borderColor: 'ink.300',
          },
        },
      },
    },
    Tabs: {
      variants: {
        softRounded: {
          tablist: {
            bg: 'whiteAlpha.700',
            borderRadius: 'xl',
            p: 1,
            gap: 1,
          },
          tab: {
            borderRadius: 'lg',
            fontWeight: '700',
            color: 'ink.500',
            _selected: {
              bg: 'white',
              color: 'ink.900',
              boxShadow: 'sm',
            },
          },
        },
      },
    },
    Badge: {
      baseStyle: {
        px: 2.5,
        py: 1,
        borderRadius: 'full',
        textTransform: 'none',
        fontWeight: '700',
        letterSpacing: 'normal',
      },
    },
  },
});

export default theme;
