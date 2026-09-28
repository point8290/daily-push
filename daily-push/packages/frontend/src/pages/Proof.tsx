import { Link } from 'react-router-dom';
import { Spinner, Text } from '@chakra-ui/react';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import { useActiveDirection } from '../contexts/DirectionContext';
import TargetRoleWorkspace from './TargetRoleWorkspace';

export default function Proof() {
  const direction = useActiveDirection();

  if (direction.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-slate-500">
        <Spinner size="sm" />
        <Text fontSize="sm">Opening your proof…</Text>
      </div>
    );
  }

  if (!direction.roleId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Proof"
          title="Proof follows a direction"
          description="Claims, readiness, and session artifacts belong to one direction."
        />
        <EmptyState
          title="Choose a direction first"
          description="Once a direction is saved, this page holds what you can already show."
          action={(
            <Link
              to="/career-market"
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
            >
              Browse directions
            </Link>
          )}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Proof"
        title={direction.roleTitle ?? 'Proof'}
        description="What you can already show for this direction, and what the path is building next. A finished session adds an artifact to this record."
        actions={(
          <Link
            to="/today"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Finish today’s session
          </Link>
        )}
      />
      <TargetRoleWorkspace roleId={direction.roleId} surface="proof" />
    </div>
  );
}
