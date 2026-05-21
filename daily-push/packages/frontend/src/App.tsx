import {
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Flex,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Spacer,
  Text,
} from '@chakra-ui/react';
import { useState, useEffect, type ReactNode } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { EntitlementsProvider } from './contexts/EntitlementsContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Today from './pages/Today';
import Goals from './pages/Goals';
import GoalSetup from './pages/GoalSetup';
import GoalDetail from './pages/GoalDetail';
import Map from './pages/Map';
import History from './pages/History';
import News from './pages/News';
import Resume from './pages/Resume';
import ResumeApplication from './pages/ResumeApplication';
import CareerMarket from './pages/CareerMarket';
import RoleMarketDetail from './pages/RoleMarketDetail';
import TargetRoles from './pages/TargetRoles';
import TargetRoleWorkspace from './pages/TargetRoleWorkspace';
import Settings from './pages/Settings';
import Pricing from './pages/Pricing';
import MockInterview from './pages/MockInterview';
import ProductMetrics from './pages/ProductMetrics';
import ReflectionModal from './components/ReflectionModal';
import { getPrimaryGoal, getReflectionPrompt, getStreak } from './api/client';

const navItems = [
  { to: '/today', label: 'Today', end: true },
  { to: '/map', label: 'Map' },
  { to: '/goals', label: 'Goals' },
  { to: '/career-market', label: 'Market' },
  { to: '/target-roles', label: 'Targets' },
  { to: '/resume', label: 'Resume' },
  { to: '/news', label: 'News' },
  { to: '/history', label: 'History' },
];

function FlameIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2C13 8 6 9 6 15a6 6 0 0 0 12 0c0-4-3-5-4-8Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function TopNav({ streak }: { streak: number }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const firstName = user?.name?.split(' ')[0] ?? 'You';

  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex={20}
      borderBottom="1px solid"
      borderColor="whiteAlpha.200"
      bg="rgba(15,23,36,0.86)"
      backdropFilter="blur(18px)"
    >
      <Container maxW="7xl" px={{ base: 4, md: 6 }}>
        <Flex
          minH={{ base: 'auto', md: '72px' }}
          py={{ base: 3, md: 0 }}
          align={{ base: 'stretch', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          gap={{ base: 3, md: 4 }}
        >
          <Flex align="center" gap={3} minW={{ base: 'auto', lg: '220px' }}>
            <HStack spacing={3}>
            <Box
              as="img"
              src="/logo-mark.svg"
              alt="Daily Push"
              boxSize="10"
              rounded="2xl"
              shadow="lg"
            />
            <Box>
              <Text
                className="font-display"
                fontSize="xl"
                color="white"
                letterSpacing="0"
              >
                Daily Push
              </Text>
              <Text fontSize="xs" color="whiteAlpha.700" letterSpacing="0.12em" textTransform="uppercase">
                Career progress system
              </Text>
            </Box>
            </HStack>
            <Spacer display={{ base: 'block', md: 'none' }} />
            <HStack spacing={2} display={{ base: 'flex', md: 'none' }}>
              <IconButton
                aria-label="Notifications"
                variant="ghost"
                color="whiteAlpha.800"
                _hover={{ bg: 'whiteAlpha.140', color: 'white' }}
                icon={<BellIcon />}
              />
              <Menu>
                <MenuButton
                  as={Button}
                  variant="subtle"
                  bg="whiteAlpha.140"
                  color="white"
                  _hover={{ bg: 'whiteAlpha.180' }}
                  _active={{ bg: 'whiteAlpha.220' }}
                  px={2}
                  h="auto"
                  minW="auto"
                >
                  <Avatar
                    size="sm"
                    name={user?.name}
                    bgGradient="linear(to-br, brand.400, accent.500)"
                    color="white"
                  />
                </MenuButton>
                <MenuList rounded="2xl" borderColor="blackAlpha.100" shadow="panel" py={2}>
                  <Box px={4} py={2}>
                    <Text fontSize="sm" fontWeight="700" color="ink.900">
                      {user?.name}
                    </Text>
                    <Text mt={1} fontSize="xs" color="ink.500">
                      {user?.email}
                    </Text>
                  </Box>
                  <MenuDivider />
                  <MenuItem onClick={() => navigate('/settings')}>Settings</MenuItem>
                  <MenuItem onClick={() => navigate('/pricing')}>Plans & billing</MenuItem>
                  <MenuDivider />
                  <MenuItem color="red.500" onClick={() => signOut()}>
                    Sign out
                  </MenuItem>
                </MenuList>
              </Menu>
            </HStack>
          </Flex>

          <HStack
            spacing={2}
            overflowX="auto"
            py={1}
            flex={{ base: 'none', md: '1' }}
            w={{ base: 'full', md: 'auto' }}
            sx={{ '&::-webkit-scrollbar': { display: 'none' } }}
          >
            {navItems.map((item) => {
              const isActive = item.end
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);

              return (
                <Button
                  key={item.to}
                  size="sm"
                  flexShrink={0}
                  variant={isActive ? 'solid' : 'ghost'}
                  bg={isActive ? 'whiteAlpha.240' : 'transparent'}
                  color={isActive ? 'white' : 'whiteAlpha.800'}
                  border="1px solid"
                  borderColor={isActive ? 'whiteAlpha.300' : 'transparent'}
                  _hover={{
                    bg: isActive ? 'whiteAlpha.280' : 'whiteAlpha.140',
                    color: 'white',
                  }}
                  onClick={() => navigate(item.to)}
                >
                  {item.label}
                </Button>
              );
            })}
          </HStack>

          <Spacer display={{ base: 'none', md: 'block' }} />

          <HStack spacing={3} display={{ base: 'none', md: 'flex' }}>
            {streak > 0 && (
              <Badge
                display={{ base: 'none', md: 'inline-flex' }}
                alignItems="center"
                gap={1.5}
                bg="rgba(255,153,58,0.18)"
                color="orange.200"
                border="1px solid rgba(255,153,58,0.28)"
                px={3}
                py={2}
                rounded="full"
                fontSize="xs"
              >
                <FlameIcon />
                <Text as="span" fontFamily="mono" fontWeight="700">
                  {streak}
                </Text>
              </Badge>
            )}

            <IconButton
              aria-label="Notifications"
              variant="ghost"
              color="whiteAlpha.800"
              _hover={{ bg: 'whiteAlpha.140', color: 'white' }}
              icon={<BellIcon />}
            />

            <Menu>
              <MenuButton
                as={Button}
                variant="subtle"
                bg="whiteAlpha.140"
                color="white"
                _hover={{ bg: 'whiteAlpha.180' }}
                _active={{ bg: 'whiteAlpha.220' }}
                px={2}
                h="auto"
              >
                <HStack spacing={3}>
                  <Avatar
                    size="sm"
                    name={user?.name}
                    bgGradient="linear(to-br, brand.400, accent.500)"
                    color="white"
                  />
                  <Box textAlign="left" display={{ base: 'none', md: 'block' }}>
                    <Text fontSize="sm" fontWeight="700" lineHeight="1.1">
                      {firstName}
                    </Text>
                    <Text fontSize="xs" color="whiteAlpha.700">
                      {user?.email}
                    </Text>
                  </Box>
                </HStack>
              </MenuButton>
              <MenuList rounded="2xl" borderColor="blackAlpha.100" shadow="panel" py={2}>
                <Box px={4} py={2}>
                  <Text fontSize="sm" fontWeight="700" color="ink.900">
                    {user?.name}
                  </Text>
                  <Text mt={1} fontSize="xs" color="ink.500">
                    {user?.email}
                  </Text>
                </Box>
                <MenuDivider />
                <MenuItem onClick={() => navigate('/settings')}>Settings</MenuItem>
                <MenuItem onClick={() => navigate('/pricing')}>Plans & billing</MenuItem>
                <MenuDivider />
                <MenuItem color="red.500" onClick={() => signOut()}>
                  Sign out
                </MenuItem>
              </MenuList>
            </Menu>
          </HStack>
        </Flex>
      </Container>
    </Box>
  );
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const [streak, setStreak] = useState(0);
  const [reflectionState, setReflectionState] = useState<{
    goalId: string;
    prompt: { question: string; context: string };
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    getStreak()
      .then((d) => setStreak(d.streak ?? 0))
      .catch(() => {});
    const timer = setTimeout(async () => {
      try {
        const goal = await getPrimaryGoal();
        if (!goal?._id) return;
        const goalId = goal._id.toString();
        const { due, prompt } = await getReflectionPrompt(goalId);
        if (due && prompt) {
          setReflectionState({ goalId, prompt });
        }
      } catch {
        // Non-critical prompt fetch.
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [user]);

  if (loading) {
    return (
      <Flex minH="100vh" align="center" justify="center" color="ink.400" fontSize="sm">
        Loading...
      </Flex>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Flex minH="100vh" direction="column">
      <TopNav streak={streak} />
      <MainContent />
      {reflectionState && (
        <ReflectionModal
          goalId={reflectionState.goalId}
          prompt={reflectionState.prompt}
          onDismiss={() => setReflectionState(null)}
        />
      )}
    </Flex>
  );
}

function MainContent() {
  const { pathname } = useLocation();
  const isMap = pathname === '/map';

  if (isMap) {
    return (
      <Box flex="1" minH={0} position="relative">
        <Box
          position="absolute"
          inset={0}
          pointerEvents="none"
          bgImage="radial-gradient(circle at top left, rgba(47,140,255,0.08), transparent 26%), radial-gradient(circle at right 18%, rgba(255,125,20,0.07), transparent 18%)"
        />
        <Container maxW="7xl" px={{ base: 4, md: 6 }} py={{ base: 6, md: 8 }} position="relative">
          <Routes>
            <Route path="/map" element={<Map />} />
          </Routes>
        </Container>
      </Box>
    );
  }

  return (
    <Box flex="1" position="relative">
      <Box
        position="absolute"
        inset={0}
        pointerEvents="none"
        bgImage="radial-gradient(circle at top left, rgba(47,140,255,0.08), transparent 26%), radial-gradient(circle at right 18%, rgba(255,125,20,0.07), transparent 18%)"
      />
      <Container maxW="7xl" px={{ base: 4, md: 6 }} py={{ base: 6, md: 8 }} position="relative">
        <Routes>
          <Route path="/today" element={<Today />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/goals/new" element={<GoalSetup />} />
          <Route path="/goals/:id" element={<GoalDetail />} />
          <Route path="/target-roles" element={<TargetRoles />} />
          <Route path="/target-roles/:id" element={<TargetRoleWorkspace />} />
          <Route path="/resume" element={<Resume />} />
          <Route path="/resume/applications/:applicationId" element={<ResumeApplication />} />
          <Route path="/news" element={<News />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/metrics" element={<ProductMetrics />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/mock" element={<MockInterview />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </Container>
    </Box>
  );
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/today" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <EntitlementsProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route
              path="/login"
              element={(
                <PublicRoute>
                  <Login />
                </PublicRoute>
              )}
            />
            <Route path="/career-market" element={<CareerMarket />} />
            <Route path="/career-market/roles/:roleId" element={<RoleMarketDetail />} />
            <Route path="/resume" element={<Resume />} />
            <Route path="/*" element={<ProtectedLayout />} />
          </Routes>
        </BrowserRouter>
      </EntitlementsProvider>
    </AuthProvider>
  );
}
