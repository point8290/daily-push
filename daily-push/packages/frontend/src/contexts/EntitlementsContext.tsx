import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  createBillingPortalSession,
  createCheckoutSession,
  getMyEntitlements,
  type CurrentPlanState,
  type EntitlementSummary,
} from '../api/client';
import { useAuth } from './AuthContext';

interface EntitlementsContextValue {
  currentPlan: CurrentPlanState | null;
  entitlements: EntitlementSummary[];
  loading: boolean;
  refreshEntitlements: () => Promise<void>;
  startCheckout: (
    planKey: "pro" | "sprint",
    intervalKey?: "month" | "year",
  ) => Promise<{ mode: "manual" | "external"; url: string }>;
  openBillingPortal: () => Promise<{ url: string; mode: "manual" | "external" }>;
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [currentPlan, setCurrentPlan] = useState<CurrentPlanState | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshEntitlements = async () => {
    if (!user) {
      setCurrentPlan(null);
      setEntitlements([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await getMyEntitlements();
      setCurrentPlan(result.currentPlan);
      setEntitlements(result.entitlements);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    void refreshEntitlements();
  }, [user, authLoading]);

  const startCheckout = async (
    planKey: "pro" | "sprint",
    intervalKey: "month" | "year" = "month",
  ) => {
    const result = await createCheckoutSession(planKey, intervalKey);
    if (result.mode === 'manual') {
      await refreshEntitlements();
    }
    return { mode: result.mode, url: result.url };
  };

  const openBillingPortal = async () => {
    const result = await createBillingPortalSession();
    return { url: result.url, mode: result.mode };
  };

  return (
    <EntitlementsContext.Provider
      value={{
        currentPlan,
        entitlements,
        loading,
        refreshEntitlements,
        startCheckout,
        openBillingPortal,
      }}
    >
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlements() {
  const value = useContext(EntitlementsContext);
  if (!value) {
    throw new Error('useEntitlements must be used within EntitlementsProvider');
  }
  return value;
}
