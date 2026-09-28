import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Flex, Spinner, Text } from '@chakra-ui/react';
import { getPrimaryGoal, getTargetRoles } from '../api/client';

function Loading({ label }: { label: string }) {
  return (
    <Flex minH="40vh" align="center" justify="center" gap={3} color="ink.500">
      <Spinner size="sm" />
      <Text fontSize="sm">{label}</Text>
    </Flex>
  );
}

/** "Plan" in the nav: the main goal's page, or goal setup if there is none. */
export function PlanRedirect() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPrimaryGoal()
      .then((goal) => {
        if (cancelled) return;
        setTarget(goal?._id ? `/goals/${String(goal._id)}` : '/goals/new');
      })
      .catch(() => {
        if (!cancelled) setTarget('/goals/new');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!target) return <Loading label="Opening your path…" />;
  return <Navigate to={target} replace />;
}

/**
 * "Role" in the nav: the role your main plan prepares for, else your most
 * recently saved role, else role suggestions.
 */
export function RoleRedirect() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [goal, roles] = await Promise.all([
        getPrimaryGoal().catch(() => null),
        getTargetRoles().catch(() => []),
      ]);
      if (cancelled) return;
      const goalId = goal?._id ? String(goal._id) : null;
      const fromGoal =
        goal?.sprint?.targetRoleId ??
        goal?.raw?.targetRoleId ??
        roles.find((role) => goalId && role.linkedGoalId === goalId)?.id ??
        null;
      const active = roles.filter((role) => role.status !== 'archived');
      const id = fromGoal ?? active[0]?.id ?? null;
      setTarget(id ? `/target-roles/${id}` : '/career-market/find-direction');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!target) return <Loading label="Opening your proof…" />;
  return <Navigate to={target} replace />;
}
