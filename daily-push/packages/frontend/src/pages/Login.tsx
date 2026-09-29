import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DEMO_EMAIL, DEMO_PASSWORD, HAS_DEMO } from "../lib/demo";
import { useLocation, useNavigate } from "react-router-dom";
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
  Text,
} from "@chakra-ui/react";
import { login, register } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import SurfaceCard from "../components/ui/SurfaceCard";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const [mode, setMode] = useState<"login" | "register">(
    searchParams.get("mode") === "register" ? "register" : "login",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nextPath = searchParams.get("next");
  const isResumeFlow = nextPath === "/resume";
  const isRoleDiscoveryFlow = nextPath?.startsWith("/career-market") ?? false;

  useEffect(() => {
    setMode(searchParams.get("mode") === "register" ? "register" : "login");
  }, [searchParams]);

  const signInAsDemo = async () => {
    setMode("login");
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError("");
    setLoading(true);
    try {
      const data = await login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
      signIn(data.token, data.user);
      navigate("/today");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "The demo is waking up. Try again in a few seconds.");
    } finally {
      setLoading(false);
    }
  };

  // /login?demo=1 (from "Try the demo" on the landing page) signs straight in.
  useEffect(() => {
    if (HAS_DEMO && searchParams.get("demo") === "1") void signInAsDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data =
        mode === "login"
          ? await login({ email, password })
          : await register({ email, password, name });
      signIn(data.token, data.user);
      navigate(
        nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
          ? nextPath
          : "/today",
      );
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Something went wrong");
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
        <Flex direction={{ base: "column", lg: "row" }} gap={8} align="stretch">
          <Box flex="1" px={{ base: 1, lg: 2 }} py={{ base: 2, lg: 10 }}>
            <Box maxW="2xl">
              <Text
                fontSize="xs"
                fontWeight="800"
                letterSpacing="0.18em"
                textTransform="uppercase"
                color="brand.700"
              >
                Daily clarity
              </Text>
              <Heading
                mt={4}
                className="font-display"
                fontSize={{ base: "4xl", md: "5xl" }}
                lineHeight="1.08"
                letterSpacing="-0.03em"
                color="ink.900"
              >
                {isResumeFlow
                  ? "Save your resume audit report and keep improving."
                  : isRoleDiscoveryFlow
                    ? "Save this direction and confirm the path."
                    : "Practice one missing skill for your role, every day."}
              </Heading>
              <Text
                mt={5}
                maxW="xl"
                fontSize="md"
                lineHeight="1.9"
                color="ink.500"
              >
                {isResumeFlow
                  ? "Your snapshot will continue after signup, so you can save the full report, tailor the resume, and decide whether to turn the gaps into a plan."
                  : isRoleDiscoveryFlow
                    ? "Keep your target role direction, compare it with real jobs, and build the proof that makes the move believable."
                    : "You name the role you are building toward. Daily Push orders the concepts between your current skills and that role. Each day you study the next concept and write a short note. The note is kept as proof of the skill, then rewritten as a resume bullet and an interview answer."}
              </Text>

              <Stack
                mt={8}
                spacing={4}
                direction={{ base: "column", md: "row" }}
              >
                <SurfaceCard flex="1" px={5} py={5}>
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    letterSpacing="0.16em"
                    textTransform="uppercase"
                    color="brand.700"
                  >
                    {isResumeFlow ? "Resume-first" : "One session"}
                  </Text>
                  <Text mt={2} fontSize="sm" lineHeight="1.7" color="ink.600">
                    {isResumeFlow
                      ? "Pick up exactly where you left off after checking your resume against the job description."
                      : isRoleDiscoveryFlow
                        ? "Start from the role direction that fits, not from a random list of topics."
                        : "Open the next concept, see why it comes before the others, and write the note for that session. Then you stop."}
                  </Text>
                </SurfaceCard>
                <SurfaceCard flex="1" px={5} py={5}>
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    letterSpacing="0.16em"
                    textTransform="uppercase"
                    color="accent.700"
                  >
                    {isResumeFlow ? "Next steps" : "What you keep"}
                  </Text>
                  <Text mt={2} fontSize="sm" lineHeight="1.7" color="ink.600">
                    {isResumeFlow
                      ? "Save the report, generate a tailored draft, or build a gap-closing sprint when you are ready."
                      : isRoleDiscoveryFlow
                        ? "Move from direction to resume checks, proof tasks, and focused upgrade sprints."
                        : "The note stays attached to the skill. The same note becomes the resume bullet and the interview answer."}
                  </Text>
                </SurfaceCard>
              </Stack>
            </Box>
          </Box>

          <SurfaceCard
            w={{ base: "full", lg: "430px" }}
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
                  ? mode === "register"
                    ? "Create account to save your report"
                    : "Sign in to continue your report"
                  : "Welcome back"}
              </Heading>
              <Text mt={2} fontSize="sm" color="ink.500">
                {isResumeFlow
                  ? "Your resume snapshot will be waiting for you after this step."
                  : "Sign in to pick up your next session."}
              </Text>
            </Box>

            <Box
              mt={6}
              role="tablist"
              aria-label="Account"
              display="grid"
              gridTemplateColumns="1fr 1fr"
              gap="4px"
              p="4px"
              bg="ink.100"
              borderRadius="xl"
            >
              {([
                ["login", "Sign in"],
                ["register", "Create account"],
              ] as const).map(([value, label]) => {
                const selected = mode === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setMode(value)}
                    variant="ghost"
                    w="full"
                    h="40px"
                    minH="40px"
                    px={4}
                    borderRadius="16px"
                    fontSize="sm"
                    fontWeight="700"
                    lineHeight="1"
                    color={selected ? "ink.900" : "ink.500"}
                    bg={selected ? "white" : "transparent"}
                    boxShadow={selected ? "sm" : "none"}
                    _hover={{
                      bg: selected ? "white" : "whiteAlpha.700",
                      color: "ink.900",
                    }}
                    _active={{ bg: selected ? "white" : "ink.200" }}
                  >
                    {label}
                  </Button>
                );
              })}
            </Box>

            {HAS_DEMO && (
              <Box mt={6} p={4} rounded="xl" bg="blue.50" border="1px solid" borderColor="blue.100">
                <Text fontSize="sm" fontWeight="700" color="ink.900">
                  Just looking around?
                </Text>
                <Text mt={1} fontSize="sm" color="ink.600">
                  Use the demo account: a full-stack engineer three weeks into their plan. It resets every night.
                </Text>
                <Text mt={2} fontSize="xs" color="ink.500" fontFamily="mono">
                  {DEMO_EMAIL} · {DEMO_PASSWORD}
                </Text>
                <Button mt={3} size="sm" colorScheme="blue" onClick={signInAsDemo} isLoading={loading}>
                  Use demo account
                </Button>
              </Box>
            )}

            <Box as="form" mt={6} onSubmit={handleSubmit}>
              <Stack spacing={4}>
                {mode === "register" && (
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
                  <Alert
                    status="error"
                    rounded="xl"
                    bg="red.50"
                    border="1px solid"
                    borderColor="red.100"
                  >
                    <AlertIcon />
                    <Text fontSize="sm">{error}</Text>
                  </Alert>
                )}

                <Button
                  type="submit"
                  isLoading={loading}
                  loadingText={
                    mode === "login" ? "Signing in" : "Creating account"
                  }
                >
                  {mode === "login" ? "Sign in" : "Create account"}
                </Button>
              </Stack>
            </Box>
          </SurfaceCard>
        </Flex>
      </Container>
    </Flex>
  );
}
