import { useState } from "react";
import { SUPPORTED_DOCUMENT_ACCEPT } from "../../utils/documentText";

interface DocumentDropzoneProps {
  label: string;
  filename: string | null;
  onFile: (file: File) => Promise<void>;
  title?: string;
  helperText?: string;
  minHeightClassName?: string;
}

export default function DocumentDropzone({
  label,
  filename,
  onFile,
  title = "Drop a PDF or choose a file",
  helperText = "Text-based PDF, TXT, Markdown, and RTF files work best.",
  minHeightClassName = "min-h-[168px]",
}: DocumentDropzoneProps) {
  const [dragActive, setDragActive] = useState(false);

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={async (event) => {
        event.preventDefault();
        setDragActive(false);
        const file = event.dataTransfer.files?.[0];
        if (file) await onFile(file);
      }}
      className={`flex ${minHeightClassName} cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-5 py-6 text-center transition ${
        dragActive
          ? "border-sky-400 bg-sky-50"
          : "border-slate-200 bg-slate-50/80 hover:border-slate-300"
      }`}
    >
      <input
        type="file"
        accept={SUPPORTED_DOCUMENT_ACCEPT}
        className="sr-only"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) await onFile(file);
        }}
      />
      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 shadow-sm">
        {label}
      </span>
      <p className="mt-4 text-base font-extrabold text-slate-900">
        {filename ?? title}
      </p>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
        {helperText}
      </p>
    </label>
  );
}
