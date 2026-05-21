import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getTargetRoles,
  type TargetRole,
} from '../api/client';
import SurfaceCard from '../components/ui/SurfaceCard';

function formatLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function nextActionLabel(role: TargetRole): string {
  if (role.latestAssessmentId) return 'Review readiness';
  if (role.linkedSprintId) return 'Open sprint';
  if (role.linkedGoalId) return 'Review goal';
  return 'Generate readiness';
}

export default function TargetRoles() {
  const [roles, setRoles] = useState<TargetRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTargetRoles()
      .then((data) => {
        if (!cancelled) {
          setRoles(data);
          setError('');
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          const status = err?.response?.status;
          setError(
            status === 404
              ? 'Target Roles are not enabled yet in this environment.'
              : 'Could not load your Target Roles right now.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            Target Roles
          </p>
          <h1 className="mt-2 font-display text-5xl font-semibold leading-none tracking-[-0.06em] text-slate-950">
            Roles you are preparing for.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
            Target Role is your career direction. Applications are company-specific. Sprints are the focused execution plan that closes the gaps.
          </p>
        </div>
        <Link
          to="/career-market"
          className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5"
        >
          Explore career market
        </Link>
      </div>

      {error && (
        <SurfaceCard p={5} className="border-amber-100 bg-amber-50">
          <p className="text-sm font-bold text-amber-800">{error}</p>
        </SurfaceCard>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-[32px] bg-white/70" />
          ))}
        </div>
      ) : roles.length === 0 && !error ? (
        <SurfaceCard p={{ base: 6, md: 8 }} className="overflow-hidden">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
                Empty workspace
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-950">
                Choose a role before choosing a sprint.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                Start with the Career Market analyzer. Save one target role, then use this workspace to connect readiness, applications, and upgrade work without mixing them together.
              </p>
              <Link
                to="/career-market"
                className="mt-6 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5"
              >
                Find my target role
              </Link>
            </div>
            <div className="rounded-[32px] bg-slate-950 p-6 text-white">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
                Workspace model
              </p>
              <div className="mt-5 space-y-3">
                {['Target Role = direction', 'Application = company/job', 'Sprint = execution plan'].map((item) => (
                  <div key={item} className="rounded-3xl border border-white/10 bg-white/8 p-4 text-sm font-bold text-white/82">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SurfaceCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <Link
              key={role.id}
              to={`/target-roles/${role.id}`}
              className="block rounded-[32px] border border-white/70 bg-white/88 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    {formatLabel(role.createdFrom)}
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
                    {role.title}
                  </h2>
                </div>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                  {formatLabel(role.status)}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Saved
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-700">{formatDate(role.createdAt)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Next
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-700">{nextActionLabel(role)}</p>
                </div>
              </div>
              <p className="mt-5 text-sm font-black text-sky-700">
                Open workspace
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
