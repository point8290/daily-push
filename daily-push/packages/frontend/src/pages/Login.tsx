import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Container,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Stack,
  Tab,
  TabList,
  Tabs,
  Text,
} from '@chakra-ui/react';
import { login, register } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import SurfaceCard from '../components/ui/SurfaceCard';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data =
        mode === 'login'
          ? await login({ email, password })
          : await register({ email, password, name });
      signIn(data.token, data.user);
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex
      minH="100vh"
      align="center"
      justify="center"
      px={{ base: 4, md: 6 }}
      py={{ base: 10, md: 14 }}
      bg="linear-gradient(180deg, rgba(248,251,255,0.9) 0%, rgba(238,245,255,0.72) 100%)"
    >
      <Container maxW="6xl" p={0}>
        <Flex
          direction={{ base: 'column', lg: 'row' }}
          gap={8}
          align="stretch"
        >
          <Box flex="1" px={{ base: 1, lg: 2 }} py={{ base: 2, lg: 10 }}>
            <Box maxW="2xl">
              <Text
                fontSize="xs"
                fontWeight="800"
                letterSpacing="0.18em"
                textTransform="uppercase"
                color="brand.700"
              >
                Personal learning cockpit
              </Text>
              <Heading
                mt={4}
                className="font-display"
                fontSize={{ base: '4xl', md: '5xl' }}
                lineHeight="0.96"
                letterSpacing="-0.05em"
                color="ink.900"
              >
                Turn ambitious career goals into a daily practice system.
              </Heading>
              <Text mt={5} maxW="xl" fontSize="md" lineHeight="1.9" color="ink.500">
                Daily Push turns fuzzy ambition into a mapped learning path, scheduled sessions,
                proof-of-skill artifacts, and career-focused feedback you can actually act on.
              </Text>

              <Stack
                mt={8}
                spacing={4}
                direction={{ base: 'column', md: 'row' }}
              >
                <SurfaceCard flex="1" px={5} py={5}>
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.16em" textTransform="uppercase" color="brand.700">
                    Career-focused
                  </Text>
                  <Text mt={2} fontSize="sm" lineHeight="1.7" color="ink.600">
                    Tie every session to a sprint, target role, and missing proof signals.
                  </Text>
                </SurfaceCard>
                <SurfaceCard flex="1" px={5} py={5}>
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.16em" textTransform="uppercase" color="accent.700">
                    Execution-first
                  </Text>
                  <Text mt={2} fontSize="sm" lineHeight="1.7" color="ink.600">
                    End each study block with an artifact, a score, and a concrete next step.
                  </Text>
                </SurfaceCard>
              </Stack>
            </Box>
          </Box>

          <SurfaceCard
            w={{ base: 'full', lg: '430px' }}
            px={{ base: 6, md: 8 }}
            py={{ base: 6, md: 7 }}
            alignSelf="center"
          >
            <Box textAlign="center">
              <Box
                as="img"
                src="/logo-mark.svg"
                alt="Daily Push"
                boxSize="14"
                mx="auto"
                mb={4}
              />
              <Heading size="lg" color="ink.900" letterSpacing="-0.04em">
                Welcome back
              </Heading>
              <Text mt={2} fontSize="sm" color="ink.500">
                Sign in to continue your next best learning session.
              </Text>
            </Box>

            <Tabs
              mt={6}
              index={mode === 'login' ? 0 : 1}
              onChange={(index) => setMode(index === 0 ? 'login' : 'register')}
              variant="softRounded"
              isFitted
            >
              <TabList>
                <Tab>Sign in</Tab>
                <Tab>Create account</Tab>
              </TabList>
            </Tabs>

            <Box as="form" mt={6} onSubmit={handleSubmit}>
              <Stack spacing={4}>
                {mode === 'register' && (
                  <FormControl isRequired>
                    <FormLabel fontSize="sm" fontWeight="700" color="ink.700">
                      Name
                    </FormLabel>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Your name"
                    />
                  </FormControl>
                )}

                <FormControl isRequired>
                  <FormLabel fontSize="sm" fontWeight="700" color="ink.700">
                    Email
                  </FormLabel>
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel fontSize="sm" fontWeight="700" color="ink.700">
                    Password
                  </FormLabel>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    placeholder="Minimum 8 characters"
                  />
                </FormControl>

                {error && (
                  <Alert status="error" rounded="xl" bg="red.50" border="1px solid" borderColor="red.100">
                    <AlertIcon />
                    <Text fontSize="sm">{error}</Text>
                  </Alert>
                )}

                <Button type="submit" isLoading={loading} loadingText={mode === 'login' ? 'Signing in' : 'Creating account'}>
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                </Button>
              </Stack>
            </Box>
          </SurfaceCard>
        </Flex>
      </Container>
    </Flex>
  );
}
