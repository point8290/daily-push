import { Link } from 'react-router-dom';
import { Spinner, Text } from '@chakra-ui/react';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import { useActiveDirection } from '../contexts/DirectionContext';
import Resume from './Resume';
import TargetRoleWorkspace from './TargetRoleWorkspace';

export default function Voice() {
  const direction = useActiveDirection();
  const practiceHref = direction.goalId ? `/mock?goalId=${direction.goalId}` : '/mock';

  if (direction.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-slate-500">
        <Spinner size="sm" />
        <Text fontSize="sm">Opening voice…</Text>
      </div>
    );
  }

  if (!direction.roleId && !direction.goalId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Voice"
          title="Say the work you can show"
          description="Resume lines, applications, and interview practice use the same direction as the path."
        />
        <EmptyState
          title="Choose a direction first"
          description="Voice is the language for one direction. Pick it, then write from the proof you have."
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="Voice"
        title={direction.roleTitle ?? direction.goalTitle ?? 'Voice'}
        description="Resume narrative, company applications, and interview practice for this direction. A sentence here should cite proof you can point to."
        actions={(
          <Link
            to={practiceHref}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Practice an interview
          </Link>
        )}
      />
      {direction.roleId ? (
        <TargetRoleWorkspace roleId={direction.roleId} surface="applications" />
      ) : null}
      <Resume targetRoleId={direction.roleId} />
    </div>
  );
}
