import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  startGoalIntake,
  saveRawInput,
  getClarifyingQuestions,
  processIntake,
} from "../api/client";
import PipelineStatus from "../components/PipelineStatus";

interface Question {
  id: string;
  question: string;
  purpose: string;
  optional: boolean;
}

const QUICK_PICKS = [
  "Get a senior engineering job at a product company",
  "Build and ship an AI-powered product",
  "Get promoted to senior / staff engineer",
  "Transition from backend to full-stack",
  "Become an AI/LLM engineer",
];

type Step = "goal" | "clarify" | "processing" | "done";

export default function GoalSetup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("goal");
  const [goalText, setGoalText] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [currentGoalId, setCurrentGoalId] = useState<string | null>(null);

  // Initialize goal on mount
  useEffect(() => {
    (async () => {
      try {
        const { goalId } = await startGoalIntake();
        setCurrentGoalId(goalId);
      } catch (err: any) {
        setError(err?.response?.data?.error ?? "Failed to initialize goal");
      }
    })();
  }, []);

  // ── Step 1: user submits goal text ──
  const handleGoalSubmit = async () => {
    if (!goalText.trim() || !currentGoalId) return;
    setError("");
    setLoadingQuestions(true);
    try {
      await saveRawInput(currentGoalId, goalText.trim(), "goal_intake");
      const { questions: qs } = await getClarifyingQuestions(currentGoalId);
      setQuestions(qs);
      setStep("clarify");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Something went wrong");
    } finally {
      setLoadingQuestions(false);
    }
  };

  // ── Step 2: user answers clarifying questions ──
  const handleClarifySubmit = async () => {
    if (!currentGoalId) return;
    setError("");
    try {
      const answered = questions.filter((q) => answers[q.id]?.trim());
      for (const q of answered) {
        const content = `${q.question}\n${answers[q.id].trim()}`;
        await saveRawInput(currentGoalId, content, "clarification");
      }
      await runIntake();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Processing failed");
      setStep("clarify");
    }
  };

  const skipClarify = async () => {
    if (!currentGoalId) return;
    setError("");
    try {
      await runIntake();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Processing failed");
      setStep("clarify");
    }
  };

  const runIntake = async () => {
    if (!currentGoalId) return;
    setStep("processing");
    await processIntake(currentGoalId);
    // PipelineStatus mounts and polls; onComplete handles navigation
  };

  // ── Render ──
  if (step === "processing" || step === "done") {
    if (!currentGoalId) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
          <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Analysing your goal…</p>
          <p className="text-slate-400 text-sm">This takes 10–20 seconds</p>
        </div>
      );
    }

    if (step === "done") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
          <svg
            className="w-12 h-12 text-emerald-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-slate-700 font-semibold text-lg">
            Your plan is ready
          </p>
          <p className="text-slate-400 text-sm">Redirecting…</p>
        </div>
      );
    }

    return (
      <div className="max-w-xl mx-auto py-8">
        <div className="mb-6">
          <h2
            className="font-display text-xl text-slate-900"
            style={{ letterSpacing: "-0.01em" }}
          >
            Building your plan
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Analysing your goal and mapping what you need to learn.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-[var(--shadow-xs)]">
          <PipelineStatus
            goalId={currentGoalId}
            type="intake"
            onRetry={async () => {
              await processIntake(currentGoalId!);
            }}
            onComplete={(run) => {
              if (run.status === "failed" || run.status === "partial") return;
              setStep("done");
              setTimeout(() => navigate(`/goals/${currentGoalId}`), 1200);
            }}
          />
        </div>
        <button
          onClick={() => setStep("clarify")}
          className="mt-4 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← Start over
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {["goal", "clarify"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
              ${step === s ? "bg-sky-600 text-white" : i < ["goal", "clarify"].indexOf(step) ? "bg-green-500 text-white" : "bg-slate-200 text-slate-400"}`}
            >
              {i < ["goal", "clarify"].indexOf(step) ? "✓" : i + 1}
            </div>
            <span
              className={`text-xs font-medium ${step === s ? "text-slate-800" : "text-slate-400"}`}
            >
              {s === "goal" ? "Your goal" : "Clarify"}
            </span>
            {i < 1 && <div className="flex-1 h-px bg-slate-200 w-8" />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Goal input ── */}
      {step === "goal" && (
        <div className="space-y-5">
          <div>
            <h1
              className="font-display text-[26px] text-slate-900"
              style={{ letterSpacing: "-0.02em", lineHeight: 1.15 }}
            >
              What are you trying to achieve?
            </h1>
            <p className="text-slate-500 text-sm mt-1.5 leading-relaxed">
              Tell us your situation, where you are now, and what success looks
              like. Don't worry about being precise — just talk.
            </p>
          </div>

          <textarea
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            rows={5}
            placeholder="e.g. I'm a mid-level backend developer at a startup, been there 3 years. I want to move to a senior role at a bigger company. I've been passed over for promotion twice and I'm not sure what's missing. I have about 45 mins a day to study..."
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
          />

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
              Or pick a starting point
            </p>
            <div className="flex flex-col gap-2">
              {QUICK_PICKS.map((pick) => (
                <button
                  key={pick}
                  onClick={() => setGoalText(pick)}
                  className="text-left text-sm px-3 py-2 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50 text-slate-600 transition-colors"
                >
                  {pick}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleGoalSubmit}
            disabled={!goalText.trim() || loadingQuestions}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {loadingQuestions ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Reading your goal…
              </>
            ) : (
              "Continue →"
            )}
          </button>
        </div>
      )}

      {/* ── Step 2: Clarifying questions ── */}
      {step === "clarify" && (
        <div className="space-y-5">
          {questions.length === 0 ? (
            <div className="space-y-4">
              <p className="text-slate-600">
                We have enough to build your plan. Ready to go?
              </p>
              <button
                onClick={skipClarify}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
              >
                Build my plan →
              </button>
            </div>
          ) : (
            <>
              <div>
                <h2
                  className="font-display text-xl text-slate-900"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  A few quick questions
                </h2>
                <p className="text-slate-500 text-sm mt-1 leading-relaxed">
                  These help us build a better plan. Skip any you don't want to
                  answer.
                </p>
              </div>

              <div className="space-y-4">
                {questions.map((q) => (
                  <div key={q.id} className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">
                      {q.question}
                      {q.optional && (
                        <span className="ml-1.5 text-xs font-normal text-slate-400">
                          (optional)
                        </span>
                      )}
                    </label>
                    <textarea
                      value={answers[q.id] ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      rows={2}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
                    />
                  </div>
                ))}
              </div>

              {error && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleClarifySubmit}
                  className="flex-1 bg-sky-600 hover:bg-sky-700 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
                >
                  Build my plan →
                </button>
                <button
                  onClick={skipClarify}
                  className="px-4 py-3 rounded-xl text-sm text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 transition-colors"
                >
                  Skip
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
