import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getMarketRoles,
  recommendMarketRoles,
  saveTargetRole,
  trackEvent,
  type CandidateRoleInput,
  type RoleMarketCard,
  type RoleRecommendation,
  type RoleRecommendationResponse,
} from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import SurfaceCard from '../components/ui/SurfaceCard';

type Direction = CandidateRoleInput['preferredDirections'][number];
type WorkStyle = CandidateRoleInput['workStyle'][number];

const MARKET_DRAFT_STORAGE_KEY = 'dp_career_market_latest';
const MARKET_SAVE_INTENT_KEY = 'dp_career_market_save_intent';
const MARKET_SELECTED_ROLE_STORAGE_KEY = 'dp_career_market_selected_role';

interface StoredCareerMarketDraft {
  input: CandidateRoleInput;
  response: RoleRecommendationResponse | null;
  createdAt: string;
}

interface StoredSelectedRole {
  roleProfileId: string;
  slug: string;
  title: string;
  createdAt: string;
}

const directionOptions: Array<{ value: Direction; label: string }> = [
  { value: 'backend', label: 'Backend' },
  { value: 'full_stack', label: 'Full-stack' },
  { value: 'ai', label: 'AI products' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'platform', label: 'Platform' },
  { value: 'data', label: 'Data' },
  { value: 'security', label: 'Security' },
  { value: 'qa', label: 'QA automation' },
  { value: 'product_engineering', label: 'Product engineering' },
  { value: 'frontend', label: 'Frontend' },
];

const workStyleOptions: Array<{ value: WorkStyle; label: string }> = [
  { value: 'building_products', label: 'Build products' },
  { value: 'systems', label: 'Own systems' },
  { value: 'operations', label: 'Improve operations' },
  { value: 'customer_facing', label: 'Work near users' },
  { value: 'leadership', label: 'Lead execution' },
  { value: 'research', label: 'Explore deeply' },
];

const examples = [
  {
    label: '5-year full-stack engineer',
    input: {
      currentRole: 'Senior Full-stack Engineer',
      yearsExperience: 5,
      region: 'India',
      skills: ['Node.js', 'React', 'Angular', 'AWS', 'Docker', 'SQL', 'MongoDB'],
      strongestAreas: ['API performance', 'dashboard systems', 'auth and RBAC'],
      preferredDirections: ['backend', 'ai', 'full_stack'] as Direction[],
      avoidedDirections: ['pure research'],
      workStyle: ['building_products', 'systems'] as WorkStyle[],
      targetSeniority: 'senior' as const,
      freeTextContext: 'I want to move away from generic full-stack roles and become stronger for senior backend or AI product roles.',
    },
  },
  {
    label: 'Manual QA to automation',
    input: {
      currentRole: 'Manual QA Analyst',
      yearsExperience: 4,
      region: 'India',
      skills: ['Manual testing', 'Postman', 'SQL basics', 'Jira', 'Regression testing'],
      strongestAreas: ['API testing', 'release validation', 'test scenario design'],
      preferredDirections: ['qa', 'product_engineering'] as Direction[],
      avoidedDirections: ['data science', 'cloud infrastructure'],
      workStyle: ['building_products', 'operations'] as WorkStyle[],
      targetSeniority: 'mid' as const,
      freeTextContext: 'I want to become more technical while staying close to product quality.',
    },
  },
  {
    label: 'DevOps to AI platform',
    input: {
      currentRole: 'DevOps Engineer',
      yearsExperience: 5,
      region: 'India',
      skills: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins', 'Monitoring'],
      strongestAreas: ['CI/CD', 'cloud infrastructure', 'observability'],
      preferredDirections: ['platform', 'cloud', 'ai'] as Direction[],
      avoidedDirections: ['frontend-heavy roles'],
      workStyle: ['systems', 'operations'] as WorkStyle[],
      targetSeniority: 'senior' as const,
      freeTextContext: 'I want to move from deployment ownership into platform engineering and AI infrastructure enablement.',
    },
  },
];

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 18);
}

function saveCareerMarketDraft(draft: StoredCareerMarketDraft) {
  sessionStorage.setItem(MARKET_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function loadCareerMarketDraft(): StoredCareerMarketDraft | null {
  try {
    const raw = sessionStorage.getItem(MARKET_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredCareerMarketDraft : null;
  } catch {
    return null;
  }
}

function loadSelectedRole(): StoredSelectedRole | null {
  try {
    const raw = sessionStorage.getItem(MARKET_SELECTED_ROLE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredSelectedRole : null;
  } catch {
    return null;
  }
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function CareerMarketHeader() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-white/50 bg-white/82 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
        <Link to={user ? '/today' : '/'} className="flex items-center gap-3">
          <img src="/logo-mark.svg" alt="Daily Push" className="h-10 w-10 rounded-2xl shadow-lg" />
          <div>
            <p className="font-display text-lg font-semibold tracking-[-0.03em] text-slate-950">
              Daily Push
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Career market analyzer
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/resume" className="hidden rounded-full px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 sm:inline-flex">
            Resume Fit
          </Link>
          {user ? (
            <>
              <Link to="/today" className="rounded-full px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
                Dashboard
              </Link>
              <button
                type="button"
                onClick={signOut}
                className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:border-slate-300 md:inline-flex"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-full px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
                Sign in
              </Link>
              <Link to="/login?mode=register&next=/career-market" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-slate-900/15">
                Save my direction
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function ChipButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-sm font-extrabold transition ${
        active
          ? 'border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-900/10'
          : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700'
      }`}
    >
      {children}
    </button>
  );
}

function RoleCard({ role }: { role: RoleMarketCard }) {
  return (
    <Link
      to={`/career-market/roles/${role.slug}`}
      className="block rounded-3xl border border-white/70 bg-white/82 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            {formatLabel(role.category)}
          </p>
          <h3 className="mt-2 text-lg font-black tracking-[-0.04em] text-slate-950">
            {role.title}
          </h3>
        </div>
        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-sky-700">
          {formatLabel(role.aiImpact)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-600">
        {role.shortDescription}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {role.topRequirements.slice(0, 3).map((requirement) => (
          <span key={requirement} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            {requirement}
          </span>
        ))}
      </div>
    </Link>
  );
}

function RecommendationCard({
  recommendation,
  index,
  saveLabel,
  saving,
  onSave,
}: {
  recommendation: RoleRecommendation;
  index: number;
  saveLabel: string;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <SurfaceCard p={{ base: 5, md: 6 }} className="overflow-hidden">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
              #{index + 1} target role
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
              {formatLabel(recommendation.transitionDifficulty)} transition
            </span>
          </div>
          <h3 className="mt-4 text-2xl font-black tracking-[-0.05em] text-slate-950">
            {recommendation.title}
          </h3>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            {recommendation.fitReasons[0] ?? 'This role has a meaningful overlap with your current background.'}
          </p>
        </div>
        <div className="rounded-3xl bg-slate-950 p-5 text-white lg:w-36">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
            Fit score
          </p>
          <p className="mt-2 text-4xl font-black tracking-[-0.08em]">
            {recommendation.fitScore}
          </p>
          <p className="mt-1 text-xs font-bold text-white/60">
            directional
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl bg-sky-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">
            Why it fits
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            {recommendation.fitReasons.slice(0, 3).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl bg-amber-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">
            What to upgrade
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            {recommendation.likelyGaps.slice(0, 4).map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl bg-emerald-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
            Proof to build
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            {recommendation.proofToBuild.slice(0, 3).map((proof) => (
              <li key={proof}>{proof}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 p-4">
        <p className="text-sm leading-7 text-slate-600">
          {recommendation.whyNow[0]}
        </p>
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-5 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? 'Saving...' : saveLabel}
      </button>
    </SurfaceCard>
  );
}

export default function CareerMarket() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [roles, setRoles] = useState<RoleMarketCard[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [region, setRegion] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [strongestText, setStrongestText] = useState('');
  const [preferredDirections, setPreferredDirections] = useState<Direction[]>(['backend', 'ai']);
  const [avoidedText, setAvoidedText] = useState('');
  const [workStyle, setWorkStyle] = useState<WorkStyle[]>(['building_products', 'systems']);
  const [targetSeniority, setTargetSeniority] = useState<CandidateRoleInput['targetSeniority']>('senior');
  const [freeTextContext, setFreeTextContext] = useState('');
  const [recommendationResponse, setRecommendationResponse] = useState<RoleRecommendationResponse | null>(null);
  const [recommendationError, setRecommendationError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<StoredSelectedRole | null>(null);

  const populateFromInput = (input: CandidateRoleInput) => {
    setCurrentRole(input.currentRole ?? '');
    setYearsExperience(input.yearsExperience === null ? '' : String(input.yearsExperience));
    setRegion(input.region ?? '');
    setSkillsText(input.skills.join(', '));
    setStrongestText(input.strongestAreas.join(', '));
    setPreferredDirections(input.preferredDirections);
    setAvoidedText(input.avoidedDirections.join(', '));
    setWorkStyle(input.workStyle);
    setTargetSeniority(input.targetSeniority);
    setFreeTextContext(input.freeTextContext ?? '');
  };

  useEffect(() => {
    const draft = loadCareerMarketDraft();
    setSelectedRole(loadSelectedRole());
    if (!draft) return;
    populateFromInput(draft.input);
    if (draft.response) setRecommendationResponse(draft.response);
  }, []);

  useEffect(() => {
    if (!user) return;
    const rawIntent = sessionStorage.getItem(MARKET_SAVE_INTENT_KEY);
    if (!rawIntent) return;
    sessionStorage.removeItem(MARKET_SAVE_INTENT_KEY);
    void trackEvent({
      eventKey: 'target_role_save_clicked',
      properties: {
        source: 'career_market',
        continuation: 'after_login',
      },
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    setRolesLoading(true);
    getMarketRoles({ limit: 9 })
      .then((response) => {
        if (!cancelled) {
          setRoles(response.roles);
          setRolesError('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRolesError('The market analyzer is temporarily unavailable. Resume Fit is still available while we refresh this page.');
        }
      })
      .finally(() => {
        if (!cancelled) setRolesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasEnoughInput = useMemo(
    () => currentRole.trim().length > 1 || splitList(skillsText).length > 0 || freeTextContext.trim().length > 12,
    [currentRole, freeTextContext, skillsText],
  );

  const buildInput = (): CandidateRoleInput => ({
    currentRole: currentRole.trim() || null,
    yearsExperience: yearsExperience.trim() ? Number(yearsExperience) : null,
    region: region.trim() || null,
    skills: splitList(skillsText),
    strongestAreas: splitList(strongestText),
    preferredDirections,
    avoidedDirections: splitList(avoidedText),
    workStyle,
    targetSeniority,
    freeTextContext: freeTextContext.trim() || null,
  });

  const applyExample = (input: CandidateRoleInput) => {
    populateFromInput(input);
    setRecommendationResponse(null);
    setRecommendationError('');
  };

  const toggleDirection = (direction: Direction) => {
    setPreferredDirections((current) =>
      current.includes(direction)
        ? current.filter((item) => item !== direction)
        : [...current, direction],
    );
  };

  const toggleWorkStyle = (style: WorkStyle) => {
    setWorkStyle((current) =>
      current.includes(style)
        ? current.filter((item) => item !== style)
        : [...current, style],
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasEnoughInput) {
      setRecommendationError('Add your current role, a few skills, or a short career note first.');
      return;
    }

    setSubmitting(true);
    setRecommendationError('');
    try {
      const response = await recommendMarketRoles({ input: buildInput(), limit: 3 });
      setRecommendationResponse(response);
      saveCareerMarketDraft({
        input: response.interpretedInput,
        response,
        createdAt: new Date().toISOString(),
      });
    } catch (error: any) {
      const status = error?.response?.status;
      setRecommendationError(
        status === 429
          ? 'Too many checks in a short time. Give it a minute and try again.'
          : 'Could not generate recommendations right now. Try again in a moment.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDirectionClick = () => {
    saveCareerMarketDraft({
      input: recommendationResponse?.interpretedInput ?? buildInput(),
      response: recommendationResponse,
      createdAt: new Date().toISOString(),
    });
    if (user) {
      void trackEvent({
        eventKey: 'target_role_save_clicked',
        properties: {
          source: 'career_market',
          continuation: 'same_session',
          recommendationCount: recommendationResponse?.recommendations.length ?? 0,
        },
      }).catch(() => {});
    } else {
      sessionStorage.setItem(MARKET_SAVE_INTENT_KEY, JSON.stringify({
        source: 'career_market',
        recommendationCount: recommendationResponse?.recommendations.length ?? 0,
      }));
    }
  };

  const handleSaveRecommendation = async (recommendation: RoleRecommendation) => {
    const draftInput = recommendationResponse?.interpretedInput ?? buildInput();
    saveCareerMarketDraft({
      input: draftInput,
      response: recommendationResponse,
      createdAt: new Date().toISOString(),
    });

    if (!user) {
      sessionStorage.setItem(MARKET_SAVE_INTENT_KEY, JSON.stringify({
        source: 'career_market_recommendation',
        roleProfileId: recommendation.roleProfileId,
      }));
      navigate('/login?mode=register&next=/career-market');
      return;
    }

    setSavingRoleId(recommendation.roleProfileId);
    setRecommendationError('');
    try {
      const response = await saveTargetRole({
        roleProfileId: recommendation.roleProfileId,
        candidateInput: draftInput,
        recommendationSnapshot: recommendation,
        clientDraftId: `career-market-${recommendation.roleProfileId}`,
      });
      navigate(`/target-roles/${response.targetRole.id}`);
    } catch (error: any) {
      const status = error?.response?.status;
      setRecommendationError(
        status === 402
          ? 'You have reached the saved Target Role limit for your current plan.'
          : status === 404
            ? 'Saving Target Roles is not enabled in this environment yet.'
            : 'Could not save that Target Role right now.',
      );
    } finally {
      setSavingRoleId(null);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(14,165,233,0.20),transparent_30%),radial-gradient(circle_at_84%_0%,rgba(16,185,129,0.14),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] text-slate-950">
      <CareerMarketHeader />

      <main className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex rounded-full border border-sky-200 bg-white/75 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-sky-700 shadow-sm">
              No job description needed
            </div>
            <h1 className="mt-6 max-w-4xl font-display text-5xl font-semibold leading-[0.92] tracking-[-0.065em] md:text-7xl">
              Find the IT roles worth preparing for next.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-600">
              Tell Daily Push where you are today. Get a directional view of target roles,
              what is changing, what you already have, and what proof you should build next.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#analyzer" className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-xl shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800">
                Check my role direction
              </a>
              <Link to="/resume" className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-6 py-4 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:text-sky-700">
                Compare resume to a job
              </Link>
            </div>
          </div>

          <SurfaceCard p={{ base: 5, md: 6 }} bg="rgba(2,6,23,0.96)" color="white" className="relative overflow-hidden">
            <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" />
            <div className="absolute -bottom-28 left-8 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
            <div className="relative">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
                Candidate journey
              </p>
              <div className="mt-6 grid gap-3">
                {[
                  ['1', 'What is my current status?'],
                  ['2', 'Which roles should I prepare for?'],
                  ['3', 'What proof should I build to improve?'],
                  ['4', 'How do I know I am getting closer?'],
                ].map(([step, text]) => (
                  <div key={step} className="flex gap-4 rounded-3xl border border-white/10 bg-white/8 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-black text-slate-950">
                      {step}
                    </div>
                    <p className="pt-2 text-sm font-bold leading-6 text-white/82">{text}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-3xl bg-white p-5 text-slate-950">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  Output
                </p>
                <p className="mt-2 text-2xl font-black tracking-[-0.05em]">
                  Role direction, gaps, and proof plan.
                </p>
              </div>
            </div>
          </SurfaceCard>
        </section>

        <section className="mt-12">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Role signals
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-950">
                Browse roles people are asking about
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-slate-500">
              These role profiles are directional. Use them to choose where to prepare, then validate with real job posts and interviews.
            </p>
          </div>

          {rolesError && (
            <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              {rolesError}
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rolesLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-56 animate-pulse rounded-3xl bg-white/70" />
              ))
              : roles.map((role) => <RoleCard key={role.id} role={role} />)}
          </div>
        </section>

        <section id="analyzer" className="mt-14 grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <SurfaceCard p={{ base: 5, md: 6 }} className="lg:sticky lg:top-24">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
              Career market analyzer
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-950">
              Tell us where you are today.
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              You do not need a job description. Add enough context for a useful first direction check.
            </p>

            {selectedRole && (
              <div className="mt-5 rounded-3xl border border-sky-100 bg-sky-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                  Saved role direction
                </p>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-700">
                  You were looking at {selectedRole.title}. Add your profile below to check whether this role fits you now.
                </p>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {examples.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => applyExample(example.input)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:border-sky-300 hover:text-sky-700"
                >
                  {example.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-extrabold text-slate-700">Current role</span>
                  <input
                    value={currentRole}
                    onChange={(event) => setCurrentRole(event.target.value)}
                    placeholder="Full-stack Engineer"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-extrabold text-slate-700">Years of experience</span>
                  <input
                    value={yearsExperience}
                    onChange={(event) => setYearsExperience(event.target.value.replace(/[^\d.]/g, ''))}
                    placeholder="5"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-extrabold text-slate-700">Region</span>
                <input
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  placeholder="India, US, Europe, remote"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <label className="block">
                <span className="text-sm font-extrabold text-slate-700">Skills</span>
                <textarea
                  value={skillsText}
                  onChange={(event) => setSkillsText(event.target.value)}
                  placeholder="Node.js, React, AWS, Docker, SQL"
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <label className="block">
                <span className="text-sm font-extrabold text-slate-700">Strongest evidence</span>
                <textarea
                  value={strongestText}
                  onChange={(event) => setStrongestText(event.target.value)}
                  placeholder="API performance, dashboard systems, auth/RBAC, cloud deployments"
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <div>
                <span className="text-sm font-extrabold text-slate-700">Directions you are considering</span>
                <div className="mt-3 flex flex-wrap gap-2">
                  {directionOptions.map((option) => (
                    <ChipButton
                      key={option.value}
                      active={preferredDirections.includes(option.value)}
                      onClick={() => toggleDirection(option.value)}
                    >
                      {option.label}
                    </ChipButton>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-sm font-extrabold text-slate-700">Work you enjoy</span>
                <div className="mt-3 flex flex-wrap gap-2">
                  {workStyleOptions.map((option) => (
                    <ChipButton
                      key={option.value}
                      active={workStyle.includes(option.value)}
                      onClick={() => toggleWorkStyle(option.value)}
                    >
                      {option.label}
                    </ChipButton>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-extrabold text-slate-700">Target seniority</span>
                  <select
                    value={targetSeniority ?? ''}
                    onChange={(event) =>
                      setTargetSeniority((event.target.value || null) as CandidateRoleInput['targetSeniority'])
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  >
                    <option value="">Not sure</option>
                    <option value="junior">Junior</option>
                    <option value="mid">Mid</option>
                    <option value="senior">Senior</option>
                    <option value="staff">Staff</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-extrabold text-slate-700">Avoiding</span>
                  <input
                    value={avoidedText}
                    onChange={(event) => setAvoidedText(event.target.value)}
                    placeholder="Pure research, frontend-heavy roles"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-extrabold text-slate-700">Anything else we should know?</span>
                <textarea
                  value={freeTextContext}
                  onChange={(event) => setFreeTextContext(event.target.value)}
                  placeholder="I want to switch jobs in the next 3 months and understand which role path gives me the best leverage."
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              {recommendationError && (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700">
                  {recommendationError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-xl shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Checking direction...' : 'Get my target role recommendations'}
              </button>
            </form>
          </SurfaceCard>

          <div className="space-y-5">
            {recommendationResponse ? (
              <>
                <SurfaceCard p={{ base: 5, md: 6 }} className="bg-slate-950 text-white">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
                    Your role direction snapshot
                  </p>
                  <h2 className="mt-3 text-3xl font-black tracking-[-0.06em]">
                    Start with these target roles.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70">
                    {recommendationResponse.marketCaveat}
                  </p>
                </SurfaceCard>
                {recommendationResponse.recommendations.map((recommendation, index) => (
                  <RecommendationCard
                    key={recommendation.roleProfileId}
                    recommendation={recommendation}
                    index={index}
                    saveLabel={user ? 'Save as Target Role' : 'Create account to save'}
                    saving={savingRoleId === recommendation.roleProfileId}
                    onSave={() => handleSaveRecommendation(recommendation)}
                  />
                ))}
                <SurfaceCard p={{ base: 5, md: 6 }} className="bg-white/90">
                  <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                        Next step
                      </p>
                      <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
                        Turn this direction into a saved plan.
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        Save the role direction, compare your resume to specific jobs, and turn the highest-value gaps into a focused sprint.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                      <Link
                        to={user ? '/resume' : '/login?mode=register&next=/career-market'}
                        onClick={handleSaveDirectionClick}
                        className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5"
                      >
                        {user ? 'Check resume fit' : 'Create free account'}
                      </Link>
                      <Link
                        to="/resume"
                        className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
                      >
                        Compare with a job
                      </Link>
                    </div>
                  </div>
                </SurfaceCard>
              </>
            ) : (
              <SurfaceCard p={{ base: 6, md: 8 }} className="min-h-[520px] bg-white/82">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  What you will get
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-950">
                  A career upgrade snapshot, not a generic chat answer.
                </h2>
                <div className="mt-7 grid gap-4">
                  {[
                    ['Target roles', 'The role paths that best match your current evidence and preferred direction.'],
                    ['Upgrade gaps', 'The missing capabilities that could weaken your applications or interviews.'],
                    ['Proof to build', 'Concrete artifacts and stories that make your profile more believable.'],
                    ['Next move', 'Where resume tailoring, a saved goal, or a sprint fits into the journey.'],
                  ].map(([title, body]) => (
                    <div key={title} className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                      <h3 className="text-lg font-black tracking-[-0.04em] text-slate-950">{title}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{body}</p>
                    </div>
                  ))}
                </div>
              </SurfaceCard>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
