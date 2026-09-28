import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPrimaryGoal, getTargetRoles } from '../api/client';
import { useAuth } from './AuthContext';
import type { TargetRole } from '@daily-push/shared';

interface DirectionGoal {
  _id?: string;
  structured?: { title?: string };
  raw?: { targetRoleId?: string; targetRoleTitle?: string };
  sprint?: { targetRoleId?: string | null } | null;
}

export interface ActiveDirection {
  loading: boolean;
  goalId: string | null;
  goalTitle: string | null;
  roleId: string | null;
  roleTitle: string | null;
  roles: TargetRole[];
  refresh: () => void;
}

const DirectionContext = createContext<ActiveDirection | null>(null);

function goalIdOf(goal: DirectionGoal | null): string | null {
  return goal?._id ? String(goal._id) : null;
}

export function DirectionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [search] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState<DirectionGoal | null>(null);
  const [roles, setRoles] = useState<TargetRole[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    if (!user) {
      setGoal(null);
      setRoles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    Promise.all([
      getPrimaryGoal().catch(() => null),
      getTargetRoles().catch(() => [] as TargetRole[]),
    ]).then(([nextGoal, nextRoles]) => {
      if (cancelled) return;
      setGoal(nextGoal as DirectionGoal | null);
      setRoles(Array.isArray(nextRoles) ? nextRoles : []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user, refreshKey]);

  const value = useMemo<ActiveDirection>(() => {
    const activeRoles = roles.filter((role) => role.status !== 'archived');
    const primaryGoalId = goalIdOf(goal);
    const roleFromQuery = search.get('role');
    const goalFromQuery = search.get('goal');
    const roleFromGoal =
      goal?.sprint?.targetRoleId
      ?? goal?.raw?.targetRoleId
      ?? activeRoles.find((role) => primaryGoalId && role.linkedGoalId === primaryGoalId)?.id
      ?? null;
    const roleId = roleFromQuery ?? roleFromGoal ?? activeRoles[0]?.id ?? null;
    const role = roles.find((item) => item.id === roleId) ?? null;
    const goalId = goalFromQuery ?? (roleFromQuery ? role?.linkedGoalId ?? null : null) ?? primaryGoalId;

    return {
      loading,
      goalId,
      goalTitle: goal?.structured?.title ?? goal?.raw?.targetRoleTitle ?? null,
      roleId,
      roleTitle: role?.title ?? goal?.raw?.targetRoleTitle ?? null,
      roles: activeRoles,
      refresh,
    };
  }, [goal, loading, refresh, roles, search]);

  return <DirectionContext.Provider value={value}>{children}</DirectionContext.Provider>;
}

export function useActiveDirection(): ActiveDirection {
  const value = useContext(DirectionContext);
  if (!value) {
    throw new Error('useActiveDirection must be used within DirectionProvider');
  }
  return value;
}
