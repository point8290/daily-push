import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getMarketRole,
  trackEvent,
  type RoleMarketProfile,
} from '../api/client';
import SurfaceCard from '../components/ui/SurfaceCard';
import { CareerMarketHeader } from './CareerMarket';
import { useAuth } from '../contexts/AuthContext';

function formatLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High confidence';
  if (confidence >= 0.65) return 'Medium confidence';
  return 'Low confidence';
}

function DetailSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <SurfaceCard p={{ base: 5, md: 6 }}>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </SurfaceCard>
  );
}

export default function RoleMarketDetail() {
  const { roleId } = useParams();
  const { user } = useAuth();
  const [role, setRole] = useState<RoleMarketProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleSaveDirectionClick = () => {
    if (!role) return;
    sessionStorage.setItem('dp_career_market_selected_role', JSON.stringify({
      roleProfileId: role.id,
      slug: role.slug,
      title: role.title,
      createdAt: new Date().toISOString(),
    }));
    if (user) {
      void trackEvent({
        eventKey: 'target_role_save_clicked',
        properties: {
          source: 'role_detail',
          roleProfileId: role.id,
        },
      }).catch(() => {});
    } else {
      sessionStorage.setItem('dp_career_market_save_intent', JSON.stringify({
        source: 'role_detail',
        roleProfileId: role.id,
      }));
    }
  };

  useEffect(() => {
    if (!roleId) return;
    let cancelled = false;
    setLoading(true);
    getMarketRole(roleId)
      .then((profile) => {
        if (!cancelled) {
          setRole(profile);
          setError('');
        }
      })
      .catch(() => {
        if (!cancelled) setError('We could not load that role profile right now.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roleId]);

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(14,165,233,0.18),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(16,185,129,0.14),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#edf6ff_100%)] text-slate-950">
      <CareerMarketHeader />

      <main className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
        <Link to="/career-market" className="inline-flex rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-black text-slate-600 transition hover:border-sky-300 hover:text-sky-700">
          Back to Career Market
        </Link>

        {loading && (
          <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="h-80 animate-pulse rounded-[36px] bg-white/70" />
            <div className="h-80 animate-pulse rounded-[36px] bg-white/70" />
          </div>
        )}

        {error && (
          <SurfaceCard mt={8} p={6}>
            <h1 className="text-3xl font-black tracking-[-0.06em] text-slate-950">
              Role profile unavailable
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">{error}</p>
            <Link to="/career-market" className="mt-5 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
              Explore other roles
            </Link>
          </SurfaceCard>
        )}

        {role && (
          <>
            <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
              <SurfaceCard p={{ base: 6, md: 8 }} className="relative overflow-hidden">
                <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-sky-200/70 blur-3xl" />
                <div className="relative">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
                      {formatLabel(role.category)}
                    </span>
                    <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                      {formatLabel(role.roleType)}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                      AI impact: {formatLabel(role.aiImpact)}
                    </span>
                  </div>
                  <h1 className="mt-6 max-w-4xl font-display text-5xl font-semibold leading-[0.92] tracking-[-0.065em] md:text-7xl">
                    {role.title}
                  </h1>
                  <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-600">
                    {role.shortDescription}
                  </p>
                  <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-500">
                    {role.marketSummary}
                  </p>
                </div>
              </SurfaceCard>

              <SurfaceCard p={{ base: 6, md: 7 }} bg="rgba(2,6,23,0.96)" color="white" className="relative overflow-hidden">
                <div className="absolute -bottom-28 right-4 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
                <div className="relative">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
                    Readiness lens
                  </p>
                  <div className="mt-6 grid gap-3">
                    <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
                      <p className="text-sm font-black text-white">Last updated</p>
                      <p className="mt-1 text-sm text-white/65">{formatDate(role.lastUpdated)}</p>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
                      <p className="text-sm font-black text-white">Source confidence</p>
                      <p className="mt-1 text-sm text-white/65">{confidenceLabel(role.confidence)}</p>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
                      <p className="text-sm font-black text-white">Interview focus</p>
                      <p className="mt-1 text-sm text-white/65">
                        {role.interviewTopics.slice(0, 4).join(', ')}
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Link to="/career-market#analyzer" className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5">
                      Check my fit
                    </Link>
                    <Link
                      to={user ? '/resume' : '/login?mode=register&next=/career-market'}
                      onClick={handleSaveDirectionClick}
                      className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-sm font-black text-white/85 transition hover:bg-white/10 hover:text-white"
                    >
                      {user ? 'Compare resume' : 'Save this direction'}
                    </Link>
                  </div>
                </div>
              </SurfaceCard>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
              <DetailSection eyebrow="Must-have signals" title="What this role expects">
                <div className="space-y-4">
                  {role.requirements.map((requirement) => (
                    <div key={requirement.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-lg font-black tracking-[-0.04em] text-slate-950">
                          {requirement.label}
                        </h3>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">
                          {formatLabel(requirement.priority)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {requirement.description}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {requirement.keywords.slice(0, 7).map((keyword) => (
                          <span key={keyword} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">
                            {keyword}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 rounded-2xl bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                          Proof employers can believe
                        </p>
                        <p className="mt-2 text-sm leading-7 text-slate-600">
                          {requirement.proofExpected.join(' ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </DetailSection>

              <div className="space-y-6">
                <DetailSection eyebrow="Market shifts" title="How the role is changing">
                  <div className="space-y-4">
                    {role.trendSignals.map((signal) => (
                      <div key={signal.id} className="rounded-3xl bg-sky-50 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="text-base font-black text-slate-950">{signal.label}</h3>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-sky-700">
                            {formatLabel(signal.direction)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-7 text-slate-600">{signal.summary}</p>
                      </div>
                    ))}
                  </div>
                </DetailSection>

                <DetailSection eyebrow="Interview prep" title="Topics to be ready for">
                  <div className="flex flex-wrap gap-2">
                    {role.interviewTopics.map((topic) => (
                      <span key={topic} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
                        {topic}
                      </span>
                    ))}
                  </div>
                </DetailSection>
              </div>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <DetailSection eyebrow="Transition paths" title="Where candidates can move from">
                <div className="space-y-4">
                  {role.transitionPaths.map((path) => (
                    <div key={`${path.fromRole}-${path.fitLevel}`} className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-lg font-black tracking-[-0.04em] text-slate-950">
                          From {path.fromRole}
                        </h3>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">
                          {formatLabel(path.fitLevel)}
                        </span>
                      </div>
                      <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                        Transferable strengths
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {path.transferableSkills.join(', ')}
                      </p>
                      <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                        Likely gaps
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {path.likelyGaps.join(', ')}
                      </p>
                      <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                        Recommended proof
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {path.recommendedProof.join(' ')}
                      </p>
                    </div>
                  ))}
                </div>
              </DetailSection>

              <DetailSection eyebrow="Sources" title="Signals behind this profile">
                <div className="space-y-3">
                  {role.sourceRefs.map((source) => (
                    <a
                      key={source.id}
                      href={source.url ?? '#'}
                      target={source.url ? '_blank' : undefined}
                      rel={source.url ? 'noreferrer' : undefined}
                      className="block rounded-3xl border border-slate-100 bg-slate-50 p-5 transition hover:border-sky-200 hover:bg-white"
                    >
                      <p className="text-sm font-black text-slate-950">{source.title}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {source.publisher ?? 'Source'} - {source.region ?? 'Global'} - {confidenceLabel(source.confidence)}
                      </p>
                    </a>
                  ))}
                </div>
                <p className="mt-5 rounded-3xl bg-amber-50 p-4 text-sm leading-7 text-amber-800">
                  Treat this as a directional market profile. Real hiring expectations still vary by company, region, and seniority.
                </p>
              </DetailSection>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
