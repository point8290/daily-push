import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTargetRoles, type TargetRole } from "../api/client";
import SurfaceCard from "../components/ui/SurfaceCard";

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function nextActionLabel(role: TargetRole): string {
  if (role.latestAssessmentId) return "Review readiness";
  if (role.linkedSprintId) return "Open path";
  if (role.linkedGoalId) return "Review path";
  return "Generate readiness";
}

export default function TargetRoles() {
  const [roles, setRoles] = useState<TargetRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTargetRoles()
      .then((data) => {
        if (!cancelled) {
          setRoles(data);
          setError("");
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          const status = err?.response?.status;
          setError(
            status === 404
              ? "Target Roles are not enabled yet in this environment."
              : "Could not load your directions right now.",
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
          <p className="text-sm font-semibold text-slate-400">
            Library
          </p>
          <h1 className="mt-2 font-display text-5xl font-semibold leading-none tracking-[-0.06em] text-slate-950">
            Directions
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
            Each direction has one path, one proof record, and one way of talking about the work.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/goals"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700"
          >
            All plans
          </Link>
          <Link
            to="/career-market"
            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5"
          >
            Browse directions
          </Link>
        </div>
      </div>

      {error && (
        <SurfaceCard p={5} className="border-amber-100 bg-amber-50">
          <p className="text-sm font-bold text-amber-800">{error}</p>
        </SurfaceCard>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-64 animate-pulse rounded-[32px] bg-white/70"
            />
          ))}
        </div>
      ) : roles.length === 0 && !error ? (
        <SurfaceCard p={{ base: 6, md: 8 }} className="overflow-hidden">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-sky-700">
                No direction yet
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
                Choose the work you want to be known for.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                Browse directions or name one yourself. Saving one opens the path you confirm before Today schedules a session.
              </p>
              <Link
                to="/career-market/find-direction"
                className="mt-6 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5"
              >
                Browse directions
              </Link>
            </div>
            <div className="rounded-[32px] bg-slate-950 p-6 text-white">
              <p className="text-sm font-semibold text-white/45">
                How it fits together
              </p>
              <div className="mt-5 space-y-3">
                {[
                  "Direction: the work you are building toward",
                  "Path: the order you confirm",
                  "Proof and voice: what you can show and say",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/8 p-4 text-sm font-bold text-white/82"
                  >
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
              to={role.linkedGoalId ? `/path?goal=${role.linkedGoalId}&role=${role.id}` : `/path?role=${role.id}`}
              className="block rounded-[32px] border border-white/70 bg-white/88 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-400">
                    {formatLabel(role.createdFrom)}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                    {role.title}
                  </h2>
                </div>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  {formatLabel(role.status)}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-400">
                    Saved
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-700">
                    {formatDate(role.createdAt)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-400">
                    Next
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-700">
                    {nextActionLabel(role)}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-sm font-semibold text-sky-700">
                Open path
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
