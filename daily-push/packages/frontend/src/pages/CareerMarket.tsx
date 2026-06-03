import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  getMarketRoles,
  recommendMarketRoles,
  saveTargetRole,
  trackEvent,
  trackPublicEvent,
  type CandidateRoleInput,
  type RoleMarketCard,
  type RoleRecommendation,
  type RoleRecommendationResponse,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useEntitlements } from "../contexts/EntitlementsContext";
import RoleMarketPilotFeedback from "../components/RoleMarketPilotFeedback";
import SurfaceCard from "../components/ui/SurfaceCard";

type Direction = CandidateRoleInput["preferredDirections"][number];
type WorkStyle = CandidateRoleInput["workStyle"][number];
type MarketResultTab = "roles" | "gaps" | "proof" | "next";

const MARKET_DRAFT_STORAGE_KEY = "dp_career_market_latest";
const MARKET_SAVE_INTENT_KEY = "dp_career_market_save_intent";
const MARKET_SELECTED_ROLE_STORAGE_KEY = "dp_career_market_selected_role";
const roleRegionFilters = [
  { value: "", label: "Global" },
  { value: "India", label: "India" },
  { value: "United States", label: "United States" },
  { value: "Europe", label: "Europe" },
  { value: "Remote", label: "Remote" },
];

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
  { value: "backend", label: "Backend" },
  { value: "full_stack", label: "Full-stack" },
  { value: "ai", label: "AI products" },
  { value: "cloud", label: "Cloud" },
  { value: "platform", label: "Platform" },
  { value: "data", label: "Data" },
  { value: "security", label: "Security" },
  { value: "qa", label: "QA automation" },
  { value: "product_engineering", label: "Product engineering" },
  { value: "frontend", label: "Frontend" },
];

const workStyleOptions: Array<{ value: WorkStyle; label: string }> = [
  { value: "building_products", label: "Build products" },
  { value: "systems", label: "Own systems" },
  { value: "operations", label: "Improve operations" },
  { value: "customer_facing", label: "Work near users" },
  { value: "leadership", label: "Lead execution" },
  { value: "research", label: "Explore deeply" },
];

const examples = [
  {
    label: "5-year full-stack engineer",
    input: {
      currentRole: "Senior Full-stack Engineer",
      yearsExperience: 5,
      region: "India",
      skills: [
        "Node.js",
        "React",
        "Angular",
        "AWS",
        "Docker",
        "SQL",
        "MongoDB",
      ],
      strongestAreas: ["API performance", "dashboard systems", "auth and RBAC"],
      preferredDirections: ["backend", "ai", "full_stack"] as Direction[],
      avoidedDirections: ["pure research"],
      workStyle: ["building_products", "systems"] as WorkStyle[],
      targetSeniority: "senior" as const,
      freeTextContext:
        "I want to move away from generic full-stack roles and become stronger for senior backend or AI product roles.",
    },
  },
  {
    label: "Manual QA to automation",
    input: {
      currentRole: "Manual QA Analyst",
      yearsExperience: 4,
      region: "India",
      skills: [
        "Manual testing",
        "Postman",
        "SQL basics",
        "Jira",
        "Regression testing",
      ],
      strongestAreas: [
        "API testing",
        "release validation",
        "test scenario design",
      ],
      preferredDirections: ["qa", "product_engineering"] as Direction[],
      avoidedDirections: ["data science", "cloud infrastructure"],
      workStyle: ["building_products", "operations"] as WorkStyle[],
      targetSeniority: "mid" as const,
      freeTextContext:
        "I want to become more technical while staying close to product quality.",
    },
  },
  {
    label: "DevOps to AI platform",
    input: {
      currentRole: "DevOps Engineer",
      yearsExperience: 5,
      region: "India",
      skills: [
        "AWS",
        "Docker",
        "Kubernetes",
        "Terraform",
        "Jenkins",
        "Monitoring",
      ],
      strongestAreas: ["CI/CD", "cloud infrastructure", "observability"],
      preferredDirections: ["platform", "cloud", "ai"] as Direction[],
      avoidedDirections: ["frontend-heavy roles"],
      workStyle: ["systems", "operations"] as WorkStyle[],
      targetSeniority: "senior" as const,
      freeTextContext:
        "I want to move from deployment ownership into platform engineering and AI infrastructure enablement.",
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
    return raw ? (JSON.parse(raw) as StoredCareerMarketDraft) : null;
  } catch {
    return null;
  }
}

function loadSelectedRole(): StoredSelectedRole | null {
  try {
    const raw = sessionStorage.getItem(MARKET_SELECTED_ROLE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSelectedRole) : null;
  } catch {
    return null;
  }
}

function saveSelectedRole(role: Pick<RoleMarketCard, "id" | "slug" | "title">): StoredSelectedRole {
  const selectedRole = {
    roleProfileId: role.id,
    slug: role.slug,
    title: role.title,
    createdAt: new Date().toISOString(),
  };
  sessionStorage.setItem(
    MARKET_SELECTED_ROLE_STORAGE_KEY,
    JSON.stringify(selectedRole),
  );
  return selectedRole;
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatFreshness(hours: number | null | undefined): string | null {
  if (hours === null || hours === undefined) return null;
  if (hours < 24) return `${Math.max(1, Math.round(hours))}h old`;
  return `${Math.round(hours / 24)}d old`;
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return "High confidence";
  if (confidence >= 0.65) return "Medium confidence";
  return "Low confidence";
}

function roleSignalLabel(role: RoleMarketCard): string {
  if (role.meta?.profileVersion)
    return `Reviewed signals v${role.meta.profileVersion.version}`;
  if (role.meta?.sourceMode === "hybrid") return "Curated baseline";
  if (role.meta?.sourceMode === "live") return "Reviewed signals";
  return "Curated baseline";
}

function roleSampleLabel(role: RoleMarketCard): string | null {
  const summary = role.meta?.sourceSummary;
  if (!summary) return null;
  if (summary.sampleSize !== null) {
    return `${summary.sampleSize} market ${summary.sampleSize === 1 ? "signal" : "signals"}`;
  }
  if (summary.sourceCount !== null) {
    return `${summary.sourceCount} ${summary.sourceCount === 1 ? "source" : "sources"}`;
  }
  return null;
}

function roleSourceNote(role: RoleMarketCard): string {
  const summary = role.meta?.sourceSummary;
  const freshness = formatFreshness(summary?.freshnessHours);
  const region = summary?.region ? `${summary.region} signals` : null;
  if (role.meta?.profileVersion) {
    const sample = roleSampleLabel(role);
    return (
      [region, sample, freshness].filter(Boolean).join(" / ") ||
      "Reviewed source-backed profile"
    );
  }
  if (role.meta?.sourceMode === "hybrid")
    return "Curated baseline while reviewed signals are prepared";
  return "Curated directional baseline";
}

function recommendationSignalLabel(recommendation: RoleRecommendation): string {
  if (recommendation.marketSignal.profileVersionId) {
    return "Reviewed market profile";
  }
  if (recommendation.marketSignal.sourceMode === "live") {
    return "Live reviewed signals";
  }
  if (recommendation.marketSignal.sourceMode === "hybrid") {
    return "Hybrid market baseline";
  }
  return "Curated baseline";
}

function recommendationSignalNote(recommendation: RoleRecommendation): string {
  const signal = recommendation.marketSignal;
  const parts = [
    signal.region ? signal.region : null,
    signal.sampleSize !== null ? `${signal.sampleSize} samples` : null,
    signal.sourceCount !== null ? `${signal.sourceCount} sources` : null,
    formatFreshness(signal.freshnessHours),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "Directional profile signals";
}

export function CareerMarketHeader() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-white/50 bg-white/82 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
        <Link to={user ? "/today" : "/"} className="flex items-center gap-3">
          <img
            src="/logo-mark.svg"
            alt="Daily Push"
            className="h-10 w-10 rounded-2xl shadow-lg"
          />
          <div>
            <p className="font-display text-lg font-semibold tracking-[-0.03em] text-slate-950">
              Daily Push
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Career progress system
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/resume"
            className="hidden rounded-full px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 sm:inline-flex"
          >
            Resume Audit
          </Link>
          {user ? (
            <>
              <Link
                to="/today"
                className="rounded-full px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Today
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
              <Link
                to="/login"
                className="rounded-full px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Sign in
              </Link>
              <Link
                to="/login?mode=register&next=/career-market/find-direction"
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-slate-900/15"
              >
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
          ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-900/10"
          : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700"
      }`}
    >
      {children}
    </button>
  );
}

function RoleCard({
  role,
  selectedRegion,
  onCheckFit,
}: {
  role: RoleMarketCard;
  selectedRegion: string;
  onCheckFit: (role: Pick<RoleMarketCard, "id" | "slug" | "title">) => void;
}) {
  const detailPath = `/career-market/roles/${role.slug}${selectedRegion ? `?region=${encodeURIComponent(selectedRegion)}` : ""}`;

  return (
    <div className="rounded-3xl border border-white/70 bg-white/82 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
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
          <span
            key={requirement}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600"
          >
            {requirement}
          </span>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
        <span>Updated {formatDate(role.lastUpdated)}</span>
        <span className="h-1 w-1 rounded-full bg-slate-300" />
        <span>{confidenceLabel(role.confidence)}</span>
        <span className="h-1 w-1 rounded-full bg-slate-300" />
        <span>{roleSignalLabel(role)}</span>
        <span className="h-1 w-1 rounded-full bg-slate-300" />
        <span>{roleSourceNote(role)}</span>
      </div>
      {role.meta?.profileVersion?.changeSummary ? (
        <p className="mt-3 rounded-2xl bg-sky-50 p-3 text-xs font-bold leading-5 text-sky-800">
          Recent reviewed change: {role.meta.profileVersion.changeSummary}
        </p>
      ) : role.meta?.warnings?.[0] ? (
        <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
          {role.meta.warnings[0].message}
        </p>
      ) : null}
      <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
        <Link
          to={detailPath}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
        >
          Review role
        </Link>
        <Link
          to="/career-market/find-direction"
          onClick={() => onCheckFit(role)}
          className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-slate-900/10 transition hover:-translate-y-0.5 hover:bg-slate-800"
        >
          Check fit
        </Link>
      </div>
    </div>
  );
}

function RecommendationSummaryCard({
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
    <SurfaceCard
      p={5}
      className="bg-white/92"
      data-testid={`role-recommendation-card-${index}`}
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
              #{index + 1}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
              {formatLabel(recommendation.transitionDifficulty)} transition
            </span>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
              {recommendationSignalLabel(recommendation)}
            </span>
          </div>
          <h3 className="mt-4 text-2xl font-black tracking-[-0.05em] text-slate-950">
            <span data-testid={`role-recommendation-title-${index}`}>
              {recommendation.title}
            </span>
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
            {recommendation.fitReasons[0] ??
              "This role has a meaningful overlap with your current background."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
            <span>{recommendationSignalNote(recommendation)}</span>
            <span className="hidden sm:inline">/</span>
            <span>
              {recommendation.scoreBreakdown.matchedRequirements.length} matched
              requirements
            </span>
            {recommendation.scoreBreakdown.missingRequirements.length > 0 && (
              <>
                <span className="hidden sm:inline">/</span>
                <span>
                  {recommendation.scoreBreakdown.missingRequirements.length} gaps
                  to close
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="rounded-3xl bg-slate-950 px-5 py-4 text-center text-white">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
              Fit
            </p>
            <p className="mt-1 text-4xl font-black tracking-[-0.08em]">
              {recommendation.fitScore}
            </p>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : saveLabel}
          </button>
        </div>
      </div>
    </SurfaceCard>
  );
}

export default function CareerMarket() {
  const { user, loading: authLoading } = useAuth();
  const { entitlements, refreshEntitlements } = useEntitlements();
  const navigate = useNavigate();
  const location = useLocation();
  const landingTrackedRef = useRef(false);
  const [roles, setRoles] = useState<RoleMarketCard[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState("");
  const [roleRegion, setRoleRegion] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [region, setRegion] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [strongestText, setStrongestText] = useState("");
  const [preferredDirections, setPreferredDirections] = useState<Direction[]>([
    "backend",
    "ai",
  ]);
  const [avoidedText, setAvoidedText] = useState("");
  const [workStyle, setWorkStyle] = useState<WorkStyle[]>([
    "building_products",
    "systems",
  ]);
  const [targetSeniority, setTargetSeniority] =
    useState<CandidateRoleInput["targetSeniority"]>("senior");
  const [freeTextContext, setFreeTextContext] = useState("");
  const [recommendationResponse, setRecommendationResponse] =
    useState<RoleRecommendationResponse | null>(null);
  const [recommendationError, setRecommendationError] = useState("");
  const [recommendationUpgradePlan, setRecommendationUpgradePlan] = useState<
    string | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<StoredSelectedRole | null>(
    null,
  );
  const [marketResultTab, setMarketResultTab] =
    useState<MarketResultTab>("roles");
  const isAppShell = Boolean(user);
  const isFindDirectionPage = location.pathname.endsWith("/find-direction");

  const populateFromInput = (input: CandidateRoleInput) => {
    setCurrentRole(input.currentRole ?? "");
    setYearsExperience(
      input.yearsExperience === null ? "" : String(input.yearsExperience),
    );
    setRegion(input.region ?? "");
    setSkillsText(input.skills.join(", "));
    setStrongestText(input.strongestAreas.join(", "));
    setPreferredDirections(input.preferredDirections);
    setAvoidedText(input.avoidedDirections.join(", "));
    setWorkStyle(input.workStyle);
    setTargetSeniority(input.targetSeniority);
    setFreeTextContext(input.freeTextContext ?? "");
  };

  useEffect(() => {
    const draft = loadCareerMarketDraft();
    setSelectedRole(loadSelectedRole());
    if (!draft) return;
    populateFromInput(draft.input);
    if (draft.response) {
      setRecommendationResponse(draft.response);
    }
  }, []);

  useEffect(() => {
    if (location.hash === "#analyzer") {
      navigate("/career-market/find-direction", { replace: true });
    }
  }, [location.hash, navigate]);

  useEffect(() => {
    if (authLoading || landingTrackedRef.current) return;
    landingTrackedRef.current = true;
    void trackPublicEvent({
      eventKey: "career_market_landing_viewed",
      properties: {
        source: "career_market",
        ctaLocation: "page_load",
        authenticated: Boolean(user),
      },
    }).catch(() => {});
  }, [authLoading, user]);

  useEffect(() => {
    if (!user) return;
    const rawIntent = sessionStorage.getItem(MARKET_SAVE_INTENT_KEY);
    if (!rawIntent) return;
    sessionStorage.removeItem(MARKET_SAVE_INTENT_KEY);
    let intent: Record<string, unknown> = {};
    try {
      intent = JSON.parse(rawIntent) as Record<string, unknown>;
    } catch {
      intent = {};
    }
    void trackEvent({
      eventKey: "target_role_save_clicked",
      properties: {
        source:
          typeof intent.source === "string" ? intent.source : "career_market",
        ctaLocation:
          typeof intent.roleProfileId === "string"
            ? "recommendation_card_after_login"
            : "next_step_after_login",
        continuation: "after_login",
        ...(typeof intent.roleProfileId === "string"
          ? { roleProfileId: intent.roleProfileId }
          : {}),
      },
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    setRolesLoading(true);
    getMarketRoles({
      limit: 9,
      ...(roleRegion ? { region: roleRegion } : {}),
    })
      .then((response) => {
        if (!cancelled) {
          setRoles(response.roles);
          setRolesError("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRolesError(
            "Role Discovery is temporarily unavailable. Resume Audit is still available while we refresh this page.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setRolesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roleRegion]);

  const hasEnoughInput = useMemo(
    () =>
      currentRole.trim().length > 1 ||
      splitList(skillsText).length > 0 ||
      freeTextContext.trim().length > 12,
    [currentRole, freeTextContext, skillsText],
  );
  const marketRecommendationQuota = useMemo(
    () =>
      entitlements.find(
        (entry) => entry.featureKey === "market_recommendations.daily",
      ),
    [entitlements],
  );
  const recommendationGaps = useMemo(
    () =>
      recommendationResponse?.recommendations.flatMap((recommendation) =>
        recommendation.likelyGaps.slice(0, 4).map((gap) => ({
          role: recommendation.title,
          text: gap,
        })),
      ) ?? [],
    [recommendationResponse],
  );
  const recommendationProof = useMemo(
    () =>
      recommendationResponse?.recommendations.flatMap((recommendation) =>
        recommendation.proofToBuild.slice(0, 3).map((proof) => ({
          role: recommendation.title,
          text: proof,
        })),
      ) ?? [],
    [recommendationResponse],
  );
  const marketResultTabs: Array<{
    key: MarketResultTab;
    label: string;
    helper: string;
  }> = [
    {
      key: "roles",
      label: "Roles",
      helper: `${recommendationResponse?.recommendations.length ?? 0} paths`,
    },
    {
      key: "gaps",
      label: "Gaps",
      helper: `${recommendationGaps.length} upgrades`,
    },
    {
      key: "proof",
      label: "Proof",
      helper: `${recommendationProof.length} artifacts`,
    },
    { key: "next", label: "Next step", helper: "Save or compare" },
  ];

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

  const handleCheckFitRole = (
    role: Pick<RoleMarketCard, "id" | "slug" | "title">,
  ) => {
    setSelectedRole(saveSelectedRole(role));
    setRecommendationResponse(null);
    setRecommendationError("");
    setRecommendationUpgradePlan(null);
    setMarketResultTab("roles");
  };

  const applyExample = (input: CandidateRoleInput) => {
    populateFromInput(input);
    setRecommendationResponse(null);
    setRecommendationError("");
    setRecommendationUpgradePlan(null);
    setMarketResultTab("roles");
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
      setRecommendationError(
        "Add your current role, a few skills, or a short career note first.",
      );
      return;
    }

    setSubmitting(true);
    setRecommendationError("");
    setRecommendationUpgradePlan(null);
    try {
      const targetRoleProfileId = selectedRole?.roleProfileId ?? null;
      const response = await recommendMarketRoles({
        input: buildInput(),
        limit: 3,
        mode: targetRoleProfileId ? "target_fit" : "discovery",
        targetRoleProfileId,
      });
      setRecommendationResponse(response);
      setMarketResultTab("roles");
      saveCareerMarketDraft({
        input: response.interpretedInput,
        response,
        createdAt: new Date().toISOString(),
      });
      if (user) {
        void refreshEntitlements().catch(() => {});
      } else {
        void trackPublicEvent({
          eventKey: "role_recommendation_generated",
          properties: {
            source: "career_market",
            ctaLocation: "analyzer_form",
            recommendationCount: response.recommendations.length,
            topRoleProfileId:
              response.recommendations[0]?.roleProfileId ?? null,
            targetSeniority,
            skillCount: splitList(skillsText).length,
            preferredDirectionCount: preferredDirections.length,
            workStyleCount: workStyle.length,
          },
        }).catch(() => {});
      }
    } catch (error: any) {
      const status = error?.response?.status;
      setRecommendationUpgradePlan(error?.response?.data?.upgradePlan ?? null);
      setRecommendationError(
        status === 402
          ? "You have used today's role direction checks on your current plan."
          : status === 429
            ? "Too many checks in a short time. Give it a minute and try again."
            : "Could not generate recommendations right now. Try again in a moment.",
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
        eventKey: "target_role_save_clicked",
        properties: {
          source: "career_market",
          ctaLocation: "next_step_card",
          continuation: "same_session",
          recommendationCount:
            recommendationResponse?.recommendations.length ?? 0,
        },
      }).catch(() => {});
    } else {
      sessionStorage.setItem(
        MARKET_SAVE_INTENT_KEY,
        JSON.stringify({
          source: "career_market",
          recommendationCount:
            recommendationResponse?.recommendations.length ?? 0,
        }),
      );
      void trackPublicEvent({
        eventKey: "target_role_save_clicked",
        properties: {
          source: "career_market",
          ctaLocation: "next_step_card",
          continuation: "signup_required",
          recommendationCount:
            recommendationResponse?.recommendations.length ?? 0,
        },
      }).catch(() => {});
    }
  };

  const handleSaveRecommendation = async (
    recommendation: RoleRecommendation,
  ) => {
    const draftInput = recommendationResponse?.interpretedInput ?? buildInput();
    saveCareerMarketDraft({
      input: draftInput,
      response: recommendationResponse,
      createdAt: new Date().toISOString(),
    });

    if (!user) {
      sessionStorage.setItem(
        MARKET_SAVE_INTENT_KEY,
        JSON.stringify({
          source: "career_market_recommendation",
          roleProfileId: recommendation.roleProfileId,
        }),
      );
      void trackPublicEvent({
        eventKey: "target_role_save_clicked",
        properties: {
          source: "career_market",
          ctaLocation: "recommendation_card",
          continuation: "signup_required",
          roleProfileId: recommendation.roleProfileId,
        },
      }).catch(() => {});
      navigate("/login?mode=register&next=/career-market/find-direction");
      return;
    }

    void trackEvent({
      eventKey: "target_role_save_clicked",
      properties: {
        source: "career_market",
        ctaLocation: "recommendation_card",
        roleProfileId: recommendation.roleProfileId,
      },
    }).catch(() => {});

    setSavingRoleId(recommendation.roleProfileId);
    setRecommendationError("");
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
          ? "You have reached the saved Target Role limit for your current plan."
          : status === 404
            ? "Saving Target Roles is not enabled in this environment yet."
            : "Could not save that Target Role right now.",
      );
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleMarketUpgradeClick = (ctaLocation: string) => {
    const payload = {
      source: "career_market",
      ctaLocation,
      upgradePlan: recommendationUpgradePlan,
    };
    if (user) {
      void trackEvent({
        eventKey: "market_upgrade_clicked",
        properties: payload,
      }).catch(() => {});
    } else {
      void trackPublicEvent({
        eventKey: "market_upgrade_clicked",
        properties: payload,
      }).catch(() => {});
    }
  };

  return (
    <div
      className={
        isAppShell
          ? "overflow-hidden text-slate-950"
          : "min-h-screen overflow-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(14,165,233,0.20),transparent_30%),radial-gradient(circle_at_84%_0%,rgba(16,185,129,0.14),transparent_24%),linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] text-slate-950"
      }
    >
      {!isAppShell && <CareerMarketHeader />}

      <main
        className={
          isAppShell
            ? "space-y-8"
            : "mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12"
        }
      >
        <section className="rounded-[2rem] border border-white/70 bg-white/78 p-5 shadow-sm backdrop-blur md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-sky-200 bg-white/75 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-sky-700 shadow-sm">
                {isFindDirectionPage ? "Find Direction" : "Role Discovery"}
              </div>
              <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-[0.96] tracking-[-0.06em] text-slate-950 md:text-6xl">
                {isFindDirectionPage
                  ? "Find role directions that match current evidence."
                  : "Browse role expectations before choosing what to prepare."}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
                {isFindDirectionPage
                  ? "Answer a few focused questions and turn current skills, strongest evidence, and preferred work style into role recommendations."
                  : "Explore changing role signals, proof expectations, interview focus areas, and regional context without entering personal data first."}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
              <Link
                to={isFindDirectionPage ? "/career-market" : "/career-market/find-direction"}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                {isFindDirectionPage ? "Browse roles" : "Find direction"}
              </Link>
              {!isFindDirectionPage && (
                <Link
                  to="/resume"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/90 px-5 py-3 text-sm font-black text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
                >
                  Compare resume
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className={!isFindDirectionPage ? "space-y-5" : "hidden"}>
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
              Choose a region lens when reviewed signals exist. If regional
              coverage is not ready, we show the global curated baseline clearly
              instead of inventing local claims.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Region lens
            </span>
            {roleRegionFilters.map((filter) => (
              <button
                key={filter.value || "global"}
                type="button"
                onClick={() => setRoleRegion(filter.value)}
                className={`rounded-full px-3 py-2 text-xs font-black transition ${
                  roleRegion === filter.value
                    ? "bg-slate-950 text-white shadow-lg shadow-slate-900/10"
                    : "border border-slate-200 bg-white/80 text-slate-600 hover:border-sky-300 hover:text-sky-700"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {rolesError && (
            <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              {rolesError}
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rolesLoading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-56 animate-pulse rounded-3xl bg-white/70"
                  />
                ))
              : roles.map((role) => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    selectedRegion={roleRegion}
                    onCheckFit={handleCheckFitRole}
                  />
                ))}
          </div>
          <SurfaceCard p={{ base: 5, md: 6 }} className="bg-white/86">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  Not sure which role fits?
                </p>
                <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
                  Use Find Direction to compare roles against current evidence.
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                  Answer a few profile questions and get target-role recommendations,
                  upgrade gaps, and proof ideas without uploading a job description.
                </p>
              </div>
              <Link
                to="/career-market/find-direction"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Find direction
              </Link>
            </div>
          </SurfaceCard>
        </section>

        <section
          id="analyzer"
          className={
            isFindDirectionPage
              ? "grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start"
              : "hidden"
          }
        >
          <SurfaceCard p={{ base: 5, md: 6 }} className="lg:sticky lg:top-24">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
              Discover new roles
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-950">
              Tell us where you are today.
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              You do not need a job description. Add enough context for a useful
              first direction check.
            </p>

            {user && marketRecommendationQuota && (
              <div className="mt-4 rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  Daily direction checks
                </p>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-700">
                  {marketRecommendationQuota.limitValue === null
                    ? "Unlimited checks are available on your plan."
                    : `${marketRecommendationQuota.remaining ?? 0} of ${marketRecommendationQuota.limitValue} checks left today.`}
                </p>
              </div>
            )}

            {selectedRole && (
              <div className="mt-5 rounded-3xl border border-sky-100 bg-sky-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                  Saved role direction
                </p>
                <p className="mt-2 text-sm font-bold leading-7 text-slate-700">
                  You were looking at {selectedRole.title}. Add your profile
                  below to check whether this role fits you now.
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
                  <span className="text-sm font-extrabold text-slate-700">
                    Current role
                  </span>
                  <input
                    value={currentRole}
                    onChange={(event) => setCurrentRole(event.target.value)}
                    placeholder="Full-stack Engineer"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-extrabold text-slate-700">
                    Years of experience
                  </span>
                  <input
                    value={yearsExperience}
                    onChange={(event) =>
                      setYearsExperience(
                        event.target.value.replace(/[^\d.]/g, ""),
                      )
                    }
                    placeholder="5"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-extrabold text-slate-700">
                  Region
                </span>
                <input
                  value={region}
                  onChange={(event) => setRegion(event.target.value)}
                  placeholder="India, US, Europe, remote"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <label className="block">
                <span className="text-sm font-extrabold text-slate-700">
                  Skills
                </span>
                <textarea
                  value={skillsText}
                  onChange={(event) => setSkillsText(event.target.value)}
                  placeholder="Node.js, React, AWS, Docker, SQL"
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <label className="block">
                <span className="text-sm font-extrabold text-slate-700">
                  Strongest evidence
                </span>
                <textarea
                  value={strongestText}
                  onChange={(event) => setStrongestText(event.target.value)}
                  placeholder="API performance, dashboard systems, auth/RBAC, cloud deployments"
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <div>
                <span className="text-sm font-extrabold text-slate-700">
                  Directions you are considering
                </span>
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
                <span className="text-sm font-extrabold text-slate-700">
                  Work you enjoy
                </span>
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
                  <span className="text-sm font-extrabold text-slate-700">
                    Target seniority
                  </span>
                  <select
                    value={targetSeniority ?? ""}
                    onChange={(event) =>
                      setTargetSeniority(
                        (event.target.value ||
                          null) as CandidateRoleInput["targetSeniority"],
                      )
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
                  <span className="text-sm font-extrabold text-slate-700">
                    Avoiding
                  </span>
                  <input
                    value={avoidedText}
                    onChange={(event) => setAvoidedText(event.target.value)}
                    placeholder="Pure research, frontend-heavy roles"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-extrabold text-slate-700">
                  Anything else we should know?
                </span>
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
                  {recommendationUpgradePlan && (
                    <Link
                      to="/pricing?source=career-market-recommendation"
                      onClick={() =>
                        handleMarketUpgradeClick("recommendation_quota_error")
                      }
                      className="ml-2 underline"
                    >
                      Upgrade to {recommendationUpgradePlan}
                    </Link>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-xl shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting
                  ? "Checking direction..."
                  : selectedRole
                    ? "Check fit for selected role"
                    : "Get target role recommendations"}
              </button>
            </form>
          </SurfaceCard>

          <div className="space-y-5">
            {recommendationResponse ? (
              <>
                <SurfaceCard
                  p={{ base: 5, md: 6 }}
                  bg="#020617"
                  color="white"
                  borderColor="rgba(255,255,255,0.12)"
                >
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
                    {recommendationResponse.recommendationMode === "target_fit"
                      ? "Selected role fit snapshot"
                      : "Your role direction snapshot"}
                  </p>
                  <h2 className="mt-3 text-3xl font-black tracking-[-0.06em]">
                    {recommendationResponse.recommendationMode === "target_fit"
                      ? "Start with this role fit, then compare adjacent paths."
                      : "Start with these target roles."}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70">
                    {recommendationResponse.marketCaveat}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/50">
                    <span>
                      Updated{" "}
                      {formatDate(recommendationResponse.meta.generatedAt)}
                    </span>
                    <span className="hidden sm:inline">/</span>
                    <span>
                      {formatLabel(recommendationResponse.meta.sourceMode)}{" "}
                      signals
                    </span>
                    {recommendationResponse.meta.sourceSummary?.region && (
                      <>
                        <span className="hidden sm:inline">/</span>
                        <span>{recommendationResponse.meta.sourceSummary.region}</span>
                      </>
                    )}
                  </div>
                  {recommendationResponse.quota && (
                    <p className="mt-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/70">
                      {recommendationResponse.quota.limitValue === null
                        ? "Unlimited direction checks"
                        : `${recommendationResponse.quota.remaining ?? 0} checks left today`}
                    </p>
                  )}
                </SurfaceCard>
                <SurfaceCard
                  id="career-market-results-tabs"
                  p={3}
                  className="bg-white/80"
                >
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {marketResultTabs.map((tab) => {
                      const active = marketResultTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setMarketResultTab(tab.key)}
                          className={`rounded-2xl px-4 py-3 text-left transition ${
                            active
                              ? "bg-slate-950 text-white shadow-xl shadow-slate-900/15"
                              : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          <span className="block text-sm font-black">
                            {tab.label}
                          </span>
                          <span
                            className={`mt-1 block text-[11px] font-bold ${active ? "text-white/60" : "text-slate-400"}`}
                          >
                            {tab.helper}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </SurfaceCard>

                {marketResultTab === "roles" && (
                  <div className="space-y-4">
                    {recommendationResponse.recommendations.map(
                      (recommendation, index) => (
                        <RecommendationSummaryCard
                          key={recommendation.roleProfileId}
                          recommendation={recommendation}
                          index={index}
                          saveLabel={
                            user
                              ? "Save as Target Role"
                              : "Create account to save"
                          }
                          saving={savingRoleId === recommendation.roleProfileId}
                          onSave={() =>
                            handleSaveRecommendation(recommendation)
                          }
                        />
                      ),
                    )}
                  </div>
                )}

                {marketResultTab === "gaps" && (
                  <SurfaceCard p={{ base: 5, md: 6 }} className="bg-white/92">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">
                      Upgrade gaps
                    </p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
                      What could weaken your switch right now
                    </h3>
                    <div className="mt-5 grid gap-3">
                      {recommendationGaps.map((gap) => (
                        <div
                          key={`${gap.role}-${gap.text}`}
                          className="rounded-3xl border border-amber-100 bg-amber-50 p-4"
                        >
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">
                            {gap.role}
                          </p>
                          <p className="mt-2 text-sm font-bold leading-7 text-slate-700">
                            {gap.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </SurfaceCard>
                )}

                {marketResultTab === "proof" && (
                  <SurfaceCard p={{ base: 5, md: 6 }} className="bg-white/92">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
                      Proof to build
                    </p>
                    <h3 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
                      Evidence that makes the role believable
                    </h3>
                    <div className="mt-5 grid gap-3">
                      {recommendationProof.map((proof) => (
                        <div
                          key={`${proof.role}-${proof.text}`}
                          className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4"
                        >
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
                            {proof.role}
                          </p>
                          <p className="mt-2 text-sm font-bold leading-7 text-slate-700">
                            {proof.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </SurfaceCard>
                )}

                {marketResultTab === "next" && (
                  <div className="space-y-5">
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
                            Save the role direction, compare your resume to
                            specific jobs, and turn the highest-value gaps into
                            a focused sprint.
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                          <Link
                            to={
                              user
                                ? "/resume"
                                : "/login?mode=register&next=/career-market/find-direction"
                            }
                            onClick={handleSaveDirectionClick}
                            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5"
                          >
                            {user ? "Audit Your Resume" : "Create free account"}
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
                    <RoleMarketPilotFeedback
                      source="career_market_recommendations"
                      ctaLocation="recommendation_results"
                      roleProfileId={
                        recommendationResponse.recommendations[0]
                          ?.roleProfileId ?? null
                      }
                    />
                  </div>
                )}
              </>
            ) : (
              <SurfaceCard
                p={{ base: 6, md: 8 }}
                className="min-h-[520px] bg-white/82"
              >
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  What you will get
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-slate-950">
                  A career upgrade snapshot, not a generic chat answer.
                </h2>
                <div className="mt-7 grid gap-4">
                  {[
                    [
                      "Target roles",
                      "The role paths that best match your current evidence and preferred direction.",
                    ],
                    [
                      "Upgrade gaps",
                      "The missing capabilities that could weaken your applications or interviews.",
                    ],
                    [
                      "Proof to build",
                      "Concrete artifacts and stories that make your profile more believable.",
                    ],
                    [
                    "Next move",
                      "Where resume tailoring, a saved goal, or a sprint fits into the journey.",
                    ],
                  ].map(([title, body]) => (
                    <div
                      key={title}
                      className="rounded-3xl border border-slate-100 bg-slate-50 p-5"
                    >
                      <h3 className="text-lg font-black tracking-[-0.04em] text-slate-950">
                        {title}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">
                        {body}
                      </p>
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
