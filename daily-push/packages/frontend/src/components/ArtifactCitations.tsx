import type { ArtifactCitation } from '../api/client';

export default function ArtifactCitations({ citations }: { citations: ArtifactCitation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-3 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">What you can say</p>
        <p className="mt-0.5 text-sm text-slate-500">
          Each sentence cites the session note it comes from.
        </p>
      </div>
      <div className="space-y-3">
        {citations.map((citation) => (
          <div key={citation.artifactId} className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {citation.nodeTitle}
            </p>
            <p className="mt-1 text-sm leading-7 text-slate-700">{citation.voiceLine}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
