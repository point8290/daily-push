import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  const location = useLocation();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [mode, setMode] = useState<'login' | 'register'>(
    searchParams.get('mode') === 'register' ? 'register' : 'login',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const nextPath = searchParams.get('next');
  const isResumeFlow = nextPath === '/resume';
  const isMarketFlow = nextPath === '/career-market';

  useEffect(() => {
    setMode(searchParams.get('mode') === 'register' ? 'register' : 'login');
  }, [searchParams]);

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
      navigate(nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/today');
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
                Career progress system
              </Text>
              <Heading
                mt={4}
                className="font-display"
                fontSize={{ base: '4xl', md: '5xl' }}
                lineHeight="0.96"
                letterSpacing="-0.05em"
                color="ink.900"
              >
                {isResumeFlow
                  ? 'Save your resume fit report and keep improving.'
                  : isMarketFlow
                    ? 'Save your role direction and turn it into a plan.'
                  : 'Turn ambitious career goals into steady progress.'}
              </Heading>
              <Text mt={5} maxW="xl" fontSize="md" lineHeight="1.9" color="ink.500">
                {isResumeFlow
                  ? 'Your snapshot will continue after signup, so you can save the full report, tailor the resume, and decide whether to turn the gaps into a plan.'
                  : isMarketFlow
                    ? 'Keep your target role direction, compare it with real jobs, and build the proof that makes the move believable.'
                  : 'Daily Push turns fuzzy ambition into a mapped plan, focused sessions, proof-of-skill artifacts, and career-focused feedback you can act on.'}
              </Text>

              <Stack
                mt={8}
                spacing={4}
                direction={{ base: 'column', md: 'row' }}
              >
                <SurfaceCard flex="1" px={5} py={5}>
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.16em" textTransform="uppercase" color="brand.700">
                    {isResumeFlow ? 'Resume-first' : 'Career-focused'}
                  </Text>
                  <Text mt={2} fontSize="sm" lineHeight="1.7" color="ink.600">
                    {isResumeFlow
                      ? 'Pick up exactly where you left off after checking your resume against the job description.'
                      : isMarketFlow
                        ? 'Start from the market role you want, not from a random list of topics.'
                      : 'Tie every session to a target role, skill gap, and missing proof signal.'}
                  </Text>
                </SurfaceCard>
                <SurfaceCard flex="1" px={5} py={5}>
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.16em" textTransform="uppercase" color="accent.700">
                    {isResumeFlow ? 'Next steps' : 'Execution-first'}
                  </Text>
                  <Text mt={2} fontSize="sm" lineHeight="1.7" color="ink.600">
                    {isResumeFlow
                      ? 'Save the report, generate a tailored draft, or build a gap-closing sprint when you are ready.'
                      : isMarketFlow
                        ? 'Move from direction to resume checks, proof tasks, and focused upgrade sprints.'
                      : 'End each focused block with an artifact, a score, and a concrete next step.'}
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
                {isResumeFlow
                  ? mode === 'register'
                    ? 'Create account to save your report'
                    : 'Sign in to continue your report'
                  : 'Welcome back'}
              </Heading>
              <Text mt={2} fontSize="sm" color="ink.500">
                {isResumeFlow
                  ? 'Your resume snapshot will be waiting for you after this step.'
                  : 'Sign in to continue your next best career session.'}
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
