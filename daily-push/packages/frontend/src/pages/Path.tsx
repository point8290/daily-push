import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Spinner, Text } from '@chakra-ui/react';
import { buildTargetRolePlan } from '../api/client';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useActiveDirection } from '../contexts/DirectionContext';
import GoalDetail from './GoalDetail';
import Map from './Map';
import TargetRoleWorkspace from './TargetRoleWorkspace';

export default function Path() {
  const navigate = useNavigate();
  const direction = useActiveDirection();
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState('');

  if (direction.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-slate-500">
        <Spinner size="sm" />
        <Text fontSize="sm">Opening your path…</Text>
      </div>
    );
  }

  const draftPath = async () => {
    if (!direction.roleId) return;
    setDrafting(true);
    setDraftError('');
    try {
      const result = await buildTargetRolePlan(direction.roleId);
      direction.refresh();
      navigate(`/path?goal=${result.goalId}&role=${direction.roleId}`);
    } catch (err: any) {
      setDraftError(err?.response?.data?.error ?? 'Could not draft the path right now.');
    } finally {
      setDrafting(false);
    }
  };

  if (!direction.goalId && direction.roleId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Path"
          title={direction.roleTitle ?? 'Your direction'}
          description="This direction does not have a path yet. Drafting one turns it into concepts you can confirm."
        />
        <EmptyState
          title="Confirm a path for this direction"
          description="One next step: draft the path, then confirm the order before Today schedules a session."
          action={(
            <button
              type="button"
              onClick={draftPath}
              disabled={drafting}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {drafting ? 'Drafting the path…' : 'Draft the path'}
            </button>
          )}
        />
        {draftError ? <p className="text-sm text-red-600">{draftError}</p> : null}
      </div>
    );
  }

  if (!direction.goalId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Path"
          title="Choose a direction"
          description="A path is the order of work for one direction. Name it yourself, or start from a role you want to be known for."
        />
        <EmptyState
          title="No active direction yet"
          description="Choose a direction. The next screen is where you confirm the path."
          action={(
            <div className="flex flex-wrap gap-3">
              <Link
                to="/career-market"
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
              >
                Browse directions
              </Link>
              <Link
                to="/goals/new"
                className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700"
              >
                Name it yourself
              </Link>
            </div>
          )}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3 text-sm font-semibold">
        <Link to="/proof" className="text-sky-700 hover:underline">Proof</Link>
        <Link to="/voice" className="text-sky-700 hover:underline">Voice</Link>
        <Link to="/today" className="text-sky-700 hover:underline">Today’s session</Link>
      </div>
      {direction.roleId ? (
        <SurfaceCard p={5}>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Why this path</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {direction.roleTitle
              ? `Expectations for ${direction.roleTitle} set the order of this path.`
              : 'Role expectations set the order of this path.'}
          </p>
          <div className="mt-4">
            <TargetRoleWorkspace roleId={direction.roleId} surface="expectations" />
          </div>
        </SurfaceCard>
      ) : null}
      <GoalDetail goalId={direction.goalId} />
      <div id="path-map">
        <Map goalId={direction.goalId} />
      </div>
    </div>
  );
}
