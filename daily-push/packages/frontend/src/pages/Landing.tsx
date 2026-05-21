import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SurfaceCard from '../components/ui/SurfaceCard';

const featureCards = [
  {
    title: 'Career Market',
    label: 'Role direction',
    body: 'See which IT roles fit your current background and what proof would make you stronger.',
  },
  {
    title: 'Resume Fit',
    label: 'Free resume check',
    body: 'Compare your resume with a job description and see the gaps before you apply.',
  },
  {
    title: 'Career Goals',
    label: 'Direction',
    body: 'Turn a long-term outcome into a clear path with the next milestones laid out.',
  },
];

export default function Landing() {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to="/today" replace />;
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_12%_12%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_88%_4%,rgba(249,115,22,0.16),transparent_26%),linear-gradient(180deg,#f8fbff_0%,#edf5ff_100%)] text-slate-950">
      <header className="border-b border-white/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo-mark.svg" alt="Daily Push" className="h-11 w-11 rounded-2xl shadow-lg" />
            <div>
              <p className="font-display text-xl font-semibold tracking-[-0.03em]">
                Daily Push
              </p>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                Career progress system
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-full px-4 py-2 text-sm font-black text-slate-600 transition hover:bg-slate-100"
            >
              Sign in
            </Link>
            <Link
              to="/login?mode=register&next=/career-market"
              className="hidden rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800 sm:inline-flex"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-16">
        <section className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div>
            <div className="inline-flex rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-sky-700 shadow-sm">
              Start with free role direction
            </div>
            <h1 className="mt-6 max-w-5xl font-display text-5xl font-semibold leading-[0.92] tracking-[-0.065em] md:text-7xl">
              Know where the market is moving. Then build the proof to move with it.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-600">
              Daily Push helps career-focused builders choose a target role, understand the gaps,
              improve the resume, and turn the highest-value work into a focused sprint.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/resume"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-xl shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Check my resume fit
              </Link>
              <Link
                to="/career-market"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-6 py-4 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:text-sky-700"
              >
                Explore career market
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-2xl px-6 py-4 text-sm font-black text-slate-600 transition hover:bg-white/70"
              >
                Sign in
              </Link>
            </div>
          </div>

          <SurfaceCard
            p={{ base: 5, md: 6 }}
            bg="rgba(2,6,23,0.96)"
            color="white"
            borderColor="rgba(255,255,255,0.12)"
            className="relative overflow-hidden"
          >
            <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" />
            <div className="absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-orange-400/20 blur-3xl" />
            <div className="relative">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
                Your first 10 minutes
              </p>
              <div className="mt-6 space-y-4">
                {[
                  ['1', 'Check which role paths fit your current profile'],
                  ['2', 'Compare your resume to a real job when you are ready'],
                  ['3', 'Turn the most valuable gaps into a sprint'],
                ].map(([step, text]) => (
                  <div key={step} className="flex gap-4 rounded-3xl border border-white/10 bg-white/8 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-black text-slate-950">
                      {step}
                    </div>
                    <p className="pt-2 text-sm font-bold leading-6 text-white/82">
                      {text}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-3xl bg-white p-5 text-slate-950">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  Next step
                </p>
                <p className="mt-2 text-2xl font-black tracking-[-0.05em]">
                  Start with a clear answer.
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  See where your resume is strong, what the job still needs, and what to improve before you apply.
                </p>
              </div>
            </div>
          </SurfaceCard>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-3">
          {featureCards.map((card) => (
            <SurfaceCard key={card.title} p={5} className="bg-white/82">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                {card.label}
              </p>
              <h2 className="mt-3 text-xl font-black tracking-[-0.04em] text-slate-950">
                {card.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {card.body}
              </p>
            </SurfaceCard>
          ))}
        </section>
      </main>
    </div>
  );
}
