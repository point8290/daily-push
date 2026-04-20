import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter,
  AlertDialogHeader, AlertDialogOverlay, Button, useToast,
} from '@chakra-ui/react';
import { getGoals, makePrimary, archiveGoal, deleteGoal } from '../api/client';

interface GoalSummary {
  _id: string;
  raw: { input: string };
  structured: { title: string; goalType: string };
  status: string;
  isPrimary: boolean;
  createdAt: string;
}

const statusColor: Record<string, string> = {
  drafting: 'text-slate-400',
  assessing: 'text-amber-600',
  planning: 'text-sky-600',
  active: 'text-green-600',
  paused: 'text-slate-500',
  achieved: 'text-emerald-600',
  abandoned: 'text-red-400',
  archived: 'text-slate-400',
};

export default function Goals() {
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

  useEffect(() => { loadGoals(); }, []);

  const handleMakePrimary = async (id: string) => {
    setBusy(id);
    try {
      await makePrimary(id);
      setGoals(prev => prev.map(g => ({ ...g, isPrimary: g._id === id })));
      toast({ title: 'Primary goal updated', status: 'success', duration: 2500, isClosable: true, position: 'top-right' });
    } catch {
      toast({ title: 'Failed to update primary goal', status: 'error', duration: 3000, isClosable: true, position: 'top-right' });
    } finally { setBusy(null); }
  };

  const handleArchive = async (id: string) => {
    setBusy(id);
    try {
      await archiveGoal(id);
      setGoals(prev => prev.map(g => g._id === id ? { ...g, status: 'archived', isPrimary: false } : g));
      toast({ title: 'Goal archived', status: 'info', duration: 2500, isClosable: true, position: 'top-right' });
    } catch {
      toast({ title: 'Failed to archive goal', status: 'error', duration: 3000, isClosable: true, position: 'top-right' });
    } finally { setBusy(null); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(deleteTarget._id);
    try {
      await deleteGoal(deleteTarget._id);
      setGoals(prev => prev.filter(g => g._id !== deleteTarget._id));
      setDeleteTarget(null);
      toast({ title: 'Goal deleted', status: 'success', duration: 2500, isClosable: true, position: 'top-right' });
    } catch {
      toast({ title: 'Failed to delete goal', status: 'error', duration: 3000, isClosable: true, position: 'top-right' });
    } finally { setBusy(null); }
  };

  if (loading) return <div className="text-slate-400 text-sm py-8 text-center">Loading...</div>;

  if (error) return (
    <div className="text-center py-16 space-y-3">
      <p className="text-red-500 text-sm">{error}</p>
      <button onClick={loadGoals} className="text-sm text-sky-600 hover:underline">Try again</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Goals</h1>
        <Link
          to="/goals/new"
          className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          + New Goal
        </Link>
      </div>

      {goals.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <p className="text-slate-400 text-lg">No goals yet.</p>
          <p className="text-slate-400 text-sm">Tell us what you want to achieve and we'll build your learning path.</p>
          <Link
            to="/goals/new"
            className="inline-block mt-2 bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold"
          >
            Set your first goal →
          </Link>
        </div>
      )}

      {goals.map(goal => {
        const isArchived = goal.status === 'archived';
        const isBusy = busy === goal._id;

        return (
          <div key={goal._id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-sky-200 hover:shadow-sm transition-all">
            <Link to={`/goals/${goal._id}`} className="block p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {goal.isPrimary && (
                      <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-semibold">
                        Primary
                      </span>
                    )}
                    {isArchived && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-semibold">
                        Archived
                      </span>
                    )}
                    <span className="text-xs text-slate-400 capitalize">{goal.structured?.goalType}</span>
                  </div>
                  <h2 className="font-semibold text-slate-900 truncate">
                    {goal.structured?.title ?? goal.raw?.input}
                  </h2>
                </div>
                <span className={`text-xs font-semibold capitalize shrink-0 ${statusColor[goal.status] ?? 'text-slate-400'}`}>
                  {goal.status}
                </span>
              </div>
            </Link>

            <div className="border-t border-slate-100 flex items-center gap-1 px-3 py-1.5 bg-slate-50/50">
              {!goal.isPrimary && !isArchived && (
                <button
                  onClick={() => handleMakePrimary(goal._id)}
                  disabled={isBusy}
                  className="text-xs font-medium text-sky-600 hover:text-sky-800 px-2 py-1 rounded hover:bg-sky-50 transition-colors disabled:opacity-50"
                >
                  {isBusy ? 'Updating…' : 'Make primary'}
                </button>
              )}
              {!isArchived && (
                <button
                  onClick={() => handleArchive(goal._id)}
                  disabled={isBusy}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  Archive
                </button>
              )}
              <button
                onClick={() => setDeleteTarget(goal)}
                className="text-xs font-medium text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors ml-auto"
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}

      {/* Chakra AlertDialog for delete confirmation */}
      <AlertDialog
        isOpen={!!deleteTarget}
        leastDestructiveRef={cancelRef}
        onClose={() => setDeleteTarget(null)}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent borderRadius="xl" mx={4}>
            <AlertDialogHeader fontSize="lg" fontWeight="bold" pb={2}>
              Delete goal
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm" color="gray.600">
              <p>
                <strong className="text-slate-800">{deleteTarget?.structured?.title ?? deleteTarget?.raw?.input}</strong>
              </p>
              <p className="mt-2">This will permanently delete this goal along with all its concept nodes, sessions, and progress. This cannot be undone.</p>
            </AlertDialogBody>
            <AlertDialogFooter gap={3}>
              <Button ref={cancelRef} onClick={() => setDeleteTarget(null)} size="sm" variant="outline">
                Cancel
              </Button>
              <Button
                colorScheme="red"
                onClick={handleDelete}
                isLoading={!!busy}
                loadingText="Deleting…"
                size="sm"
              >
                Delete permanently
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </div>
  );
}
