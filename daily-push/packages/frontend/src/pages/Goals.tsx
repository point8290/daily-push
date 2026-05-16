import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  Button,
  HStack,
  SimpleGrid,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { getGoals, makePrimary, archiveGoal, deleteGoal } from '../api/client';
import { useEntitlements } from '../contexts/EntitlementsContext';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';
import EmptyState from '../components/ui/EmptyState';

interface GoalSummary {
  _id: string;
  raw: { input: string };
  structured: { title: string; goalType: string };
  status: string;
  isPrimary: boolean;
  createdAt: string;
}

const statusColor: Record<string, string> = {
  drafting: 'gray',
  assessing: 'orange',
  planning: 'blue',
  active: 'green',
  paused: 'purple',
  achieved: 'green',
  abandoned: 'red',
  archived: 'gray',
};

export default function Goals() {
  const { currentPlan, entitlements } = useEntitlements();
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<GoalSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  const loadGoals = () => {
    setLoading(true);
    setError('');
    getGoals()
      .then(setGoals)
      .catch(() => setError('Failed to load goals.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const handleMakePrimary = async (id: string) => {
    setBusy(id);
    try {
      await makePrimary(id);
      setGoals((prev) => prev.map((goal) => ({ ...goal, isPrimary: goal._id === id })));
      toast({
        title: 'Primary goal updated',
        status: 'success',
        duration: 2500,
        isClosable: true,
        position: 'top-right',
      });
    } catch {
      toast({
        title: 'Failed to update primary goal',
        status: 'error',
        duration: 3000,
        isClosable: true,
        position: 'top-right',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleArchive = async (id: string) => {
    setBusy(id);
    try {
      await archiveGoal(id);
      setGoals((prev) =>
        prev.map((goal) =>
          goal._id === id ? { ...goal, status: 'archived', isPrimary: false } : goal,
        ),
      );
      toast({
        title: 'Goal archived',
        status: 'info',
        duration: 2500,
        isClosable: true,
        position: 'top-right',
      });
    } catch {
      toast({
        title: 'Failed to archive goal',
        status: 'error',
        duration: 3000,
        isClosable: true,
        position: 'top-right',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(deleteTarget._id);
    try {
      await deleteGoal(deleteTarget._id);
      setGoals((prev) => prev.filter((goal) => goal._id !== deleteTarget._id));
      setDeleteTarget(null);
      toast({
        title: 'Goal deleted',
        status: 'success',
        duration: 2500,
        isClosable: true,
        position: 'top-right',
      });
    } catch {
      toast({
        title: 'Failed to delete goal',
        status: 'error',
        duration: 3000,
        isClosable: true,
        position: 'top-right',
      });
    } finally {
      setBusy(null);
    }
  };

  const activeGoalLimit = entitlements.find(
    (entry) => entry.featureKey === 'goals.active.max',
  )?.limitValue;

  return (
    <Stack spacing={8}>
      <PageHeader
        eyebrow="Workspace"
        title="Goals"
        description="Manage the outcomes you are actively pursuing, choose the primary path, and keep the workspace focused on the goals that matter now."
        actions={(
          <Button as={Link} to="/goals/new" width={{ base: 'full', lg: 'auto' }}>
            New goal
          </Button>
        )}
      />

      {currentPlan?.planKey === 'free' && (
        <SurfaceCard px={6} py={5}>
          <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexWrap="wrap" spacing={4}>
            <Box>
              <Text fontSize="sm" fontWeight="800" color="brand.700">
                Free workspace limits are active
              </Text>
              <Text mt={2} fontSize="sm" color="ink.500" lineHeight="1.8">
                You currently have {goals.length} goal{goals.length === 1 ? '' : 's'} in the workspace.
                Your plan allows {activeGoalLimit ?? 1} active goal.
              </Text>
            </Box>
            <Button as={Link} to="/pricing" variant="outline">
              Compare plans
            </Button>
          </HStack>
        </SurfaceCard>
      )}

      {loading ? (
        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}>
          {Array.from({ length: 4 }).map((_, index) => (
            <SurfaceCard key={index} px={6} py={6} minH="220px" />
          ))}
        </SimpleGrid>
      ) : error ? (
        <EmptyState
          title="We couldn’t load your goals"
          description={error}
          accent="warning"
          action={(
            <Button variant="outline" onClick={loadGoals}>
              Try again
            </Button>
          )}
        />
      ) : goals.length === 0 ? (
        <EmptyState
          title="No goals yet"
          description="Start with one focused outcome and let Daily Push shape the roadmap, the daily sessions, and the proof of progress around it."
          action={(
            <Button as={Link} to="/goals/new">
              Set your first goal
            </Button>
          )}
        />
      ) : (
        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={5}>
          {goals.map((goal) => {
            const isArchived = goal.status === 'archived';
            const isBusy = busy === goal._id;

            return (
              <SurfaceCard key={goal._id} overflow="hidden">
                <Box as={Link} to={`/goals/${goal._id}`} display="block" px={6} py={6}>
                  <HStack justify="space-between" align="flex-start" spacing={3}>
                    <Stack spacing={3} flex="1" minW={0}>
                      <HStack spacing={2} flexWrap="wrap">
                        {goal.isPrimary && <Badge colorScheme="blue">Primary</Badge>}
                        {isArchived && <Badge colorScheme="gray">Archived</Badge>}
                        <Badge colorScheme={statusColor[goal.status] ?? 'gray'}>
                          {goal.status}
                        </Badge>
                      </HStack>

                      <Box>
                        <Text
                          fontSize="lg"
                          fontWeight="800"
                          color="ink.900"
                          letterSpacing="-0.03em"
                          noOfLines={2}
                        >
                          {goal.structured?.title ?? goal.raw?.input}
                        </Text>
                        <Text mt={2} fontSize="sm" color="ink.500" textTransform="capitalize">
                          {goal.structured?.goalType ?? 'General learning goal'}
                        </Text>
                      </Box>

                      <Text fontSize="xs" color="ink.400">
                        Created {new Date(goal.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    </Stack>
                  </HStack>
                </Box>

                <HStack
                  px={5}
                  py={4}
                  borderTop="1px solid"
                  borderColor="blackAlpha.100"
                  bg="blackAlpha.50"
                  spacing={2}
                  flexWrap="wrap"
                >
                  {!goal.isPrimary && !isArchived && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMakePrimary(goal._id)}
                      isLoading={isBusy}
                    >
                      Make primary
                    </Button>
                  )}
                  {!isArchived && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleArchive(goal._id)}
                      isLoading={isBusy}
                    >
                      Archive
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    color="red.500"
                    _hover={{ bg: 'red.50', color: 'red.600' }}
                    onClick={() => setDeleteTarget(goal)}
                    ml="auto"
                  >
                    Delete
                  </Button>
                </HStack>
              </SurfaceCard>
            );
          })}
        </SimpleGrid>
      )}

      <AlertDialog
        isOpen={!!deleteTarget}
        leastDestructiveRef={cancelRef}
        onClose={() => setDeleteTarget(null)}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent borderRadius="2xl" mx={4}>
            <AlertDialogHeader fontSize="lg" fontWeight="800" pb={2}>
              Delete goal
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm" color="gray.600">
              <Text fontWeight="700" color="ink.900">
                {deleteTarget?.structured?.title ?? deleteTarget?.raw?.input}
              </Text>
              <Text mt={2}>
                This will permanently delete the goal along with its concept nodes, sessions,
                and progress history. This cannot be undone.
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter gap={3}>
              <Button ref={cancelRef} onClick={() => setDeleteTarget(null)} variant="outline">
                Cancel
              </Button>
              <Button
                colorScheme="red"
                onClick={handleDelete}
                isLoading={!!busy}
                loadingText="Deleting"
              >
                Delete permanently
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Stack>
  );
}
