import { Link, Navigate } from "react-router-dom";
import { HAS_DEMO } from "../lib/demo";
import { useAuth } from "../contexts/AuthContext";

const loopSteps = [
  {
    number: "01",
    label: "Direction",
    question: "Where do you want leverage?",
    body: "Name a craft or role. Daily Push turns it into an ordered path from the skills you already have.",
  },
  {
    number: "02",
    label: "Path",
    question: "What is the next high-leverage step?",
    body: "One session a day on the concept that unlocks the rest. You confirm the path before it starts scheduling.",
  },
  {
    number: "03",
    label: "Proof and voice",
    question: "What can you show, and how do you say it?",
    body: "Each session leaves an artifact. That record becomes the language you use on a resume or in an interview.",
  },
];

const previewItems = [
  {
    label: "Path",
    title: "The order is visible",
    body: "Judgment-heavy work, AI-assisted work, and foundations sit in one graph, with a reason for what comes next.",
  },
  {
    label: "Proof",
    title: "The work is on the record",
    body: "Explanations, designs, and small builds stay attached to the direction, so progress is something you can point to.",
  },
  {
    label: "Voice",
    title: "The words match the work",
    body: "Resume lines and interview answers cite the same proof, including when a specific role sharpens the story.",
  },
];

const guideSteps = [
  "Choose a direction",
  "Confirm the path",
  "Do one session",
  "Keep the proof",
  "Say it clearly",
];

export default function Landing() {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to="/today" replace />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f7fb] text-slate-950">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[620px] bg-[radial-gradient(circle_at_12%_8%,rgba(14,165,233,0.2),transparent_32%),radial-gradient(circle_at_82%_10%,rgba(251,146,60,0.16),transparent_30%),linear-gradient(180deg,#ffffff_0%,rgba(255,255,255,0)_82%)]" />
        <div className="absolute inset-0 opacity-[0.28] [background-image:linear-gradient(rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.05)_1px,transparent_1px)] [background-size:52px_52px]" />
      </div>

      <header className="relative z-10 border-b border-slate-200/70 bg-white/68 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/logo-mark.svg"
              alt="Daily Push"
              className="h-11 w-11 rounded-2xl shadow-lg shadow-sky-700/15"
            />
            <div>
              <p className="font-display text-xl font-semibold tracking-[-0.03em]">
                Daily Push
              </p>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                Daily clarity
              </p>
            </div>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-black text-slate-600 md:gap-5">
            <Link
              to="/career-market"
              className="hidden transition hover:text-slate-950 sm:inline-flex"
            >
              Directions
            </Link>
            <Link
              to="/resume"
              className="hidden transition hover:text-slate-950 sm:inline-flex"
            >
              Voice
            </Link>
            <Link to="/login" className="transition hover:text-slate-950">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-16 pt-10 md:px-6 md:pb-24 md:pt-16">
        <section className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center xl:gap-12">
          <div className="min-w-0 max-w-3xl lg:col-span-7">
            <h1 className="font-display text-4xl font-bold leading-[0.98] tracking-[-0.055em] text-slate-950 sm:text-6xl md:text-7xl xl:text-[80px]">
              <span className="block">Daily clarity</span>
              <span className="block">for the work you</span>
              <span className="block">want to own.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-slate-600 md:text-lg md:leading-9">
              The tech landscape is shifting faster than ever. Daily Push helps ambitious
              engineers map a high-leverage path, build proof of their skills, and describe
              that work with confidence.
            </p>
            {HAS_DEMO && (
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/login?demo=1"
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5"
                >
                  Try the demo
                </Link>
                <span className="text-sm text-slate-500">No sign-up. See a plan three weeks in.</span>
              </div>
            )}
            <div className="mt-8 flex flex-wrap gap-2 sm:gap-3">
              {["Path", "Proof", "Voice"].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-slate-200 bg-white/78 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 shadow-sm sm:px-4 sm:text-xs"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <aside className="min-w-0 rounded-[2.25rem] bg-slate-950 p-2 text-white shadow-[0_34px_90px_rgba(15,23,42,0.22)] lg:col-span-5">
            <div className="rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_85%_12%,rgba(56,189,248,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 md:p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-200/80">
                One loop
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em]">
                Direction, then a session, then a record.
              </h2>
              <div className="mt-6 space-y-3">
                {loopSteps.map((card) => (
                  <div
                    key={card.question}
                    className="rounded-[1.35rem] border border-white/10 bg-white/[0.065] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-200">
                        {card.number}
                      </span>
                      <span className="hidden text-[10px] font-black uppercase tracking-[0.18em] text-white/38 sm:inline">
                        {card.label}
                      </span>
                    </div>
                    <h3 className="mt-3 font-display text-lg font-semibold tracking-[-0.035em] text-white">
                      {card.question}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/58">
                      {card.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="mt-12 overflow-hidden rounded-[2.25rem] border border-white/75 bg-white/80 shadow-[0_24px_80px_rgba(15,23,42,0.1)] backdrop-blur">
          <div className="grid gap-0 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="border-b border-slate-200/70 p-6 md:p-8 lg:border-b-0 lg:border-r">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                The record
              </p>
              <h2 className="mt-4 max-w-lg text-3xl font-black tracking-[-0.055em] text-slate-950 md:text-5xl">
                One direction. Three things you can trust.
              </h2>
              <p className="mt-5 text-sm leading-8 text-slate-600">
                The path, the proof, and the words stay on the same direction, so a finished
                session is something you can show and explain.
              </p>
            </div>
            <div className="grid divide-y divide-slate-200/70">
              {previewItems.map((item, index) => (
                <div key={item.label} className="grid gap-4 p-6 md:grid-cols-[92px_1fr] md:p-7">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-700">
                      0{index + 1}
                    </p>
                    <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                      {item.label}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-[-0.045em] text-slate-950">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
          <div className="rounded-[2rem] border border-white/75 bg-white/78 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur md:p-7">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Directions
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.055em] text-slate-950">
              Start from the work you want to be known for.
            </h2>
            <p className="mt-4 text-sm leading-8 text-slate-600">
              Browse directions when you want a concrete craft to aim at. A job post can sharpen
              the same path later. It is not required to begin.
            </p>
            <Link
              to="/career-market"
              className="mt-6 inline-flex border-b border-sky-200 pb-1 text-sm font-black text-sky-700 transition hover:border-slate-950 hover:text-slate-950"
            >
              Browse directions {"->"}
            </Link>
          </div>

          <div className="rounded-[2rem] border border-slate-900/10 bg-white/78 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur md:p-7">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              How a week works
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {guideSteps.map((step, index) => (
                <div key={step} className="rounded-3xl border border-slate-100 bg-slate-50/92 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">
                      {index + 1}
                    </span>
                    <p className="text-sm font-black text-slate-950">
                      {step}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-8 text-slate-600">
              Today holds one session. Path, Proof, and Voice hold the rest of the record.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <div className="rounded-[2rem] border border-white/75 bg-white/76 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur md:p-7">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  Begin with a direction
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-slate-950">
                  Pick a craft, confirm the path, and let Today name the session.
                </h2>
              </div>
              <Link
                to="/career-market"
                className="inline-flex border-b border-sky-200 pb-1 text-sm font-black text-sky-700 transition hover:border-slate-950 hover:text-slate-950"
              >
                Browse directions {"->"}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
