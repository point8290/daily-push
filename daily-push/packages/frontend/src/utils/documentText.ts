import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

export type DocumentKind = "resume" | "jobDescription" | "profileEvidence";

export const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "rtf",
  "pdf",
]);

export const SUPPORTED_DOCUMENT_ACCEPT =
  ".txt,.md,.markdown,.rtf,.pdf,text/plain,text/markdown,application/rtf,application/pdf";

let pdfJsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

function stripRtfToPlainText(value: string): string {
  return value
    .replace(/\\par[d]?/gi, "\n")
    .replace(/\\tab/gi, " ")
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\[a-z]+-?\d* ?/gi, " ")
    .replace(/[{}]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function normalizeDocumentText(value: string): string {
  return value
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function getExtension(file: File): string {
  const parts = file.name.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await getPdfJs();
  const pdfData = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: pdfData });

  try {
    const document = await loadingTask.promise;
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = normalizeDocumentText(
        textContent.items
          .map((item) =>
            "str" in item && typeof item.str === "string" ? item.str : "",
          )
          .join(" "),
      );
      if (pageText) pageTexts.push(pageText);
    }
    return pageTexts.join("\n\n");
  } catch {
    throw new Error(
      "Could not read that PDF. If it is scanned or image-only, paste the text instead.",
    );
  } finally {
    await loadingTask.destroy();
  }
}

function kindLabel(kind: DocumentKind): string {
  if (kind === "jobDescription") return "job description";
  if (kind === "profileEvidence") return "profile evidence";
  return "resume";
}

function minimumLength(kind: DocumentKind): number {
  if (kind === "resume") return 10;
  if (kind === "jobDescription") return 20;
  return 20;
}

function maximumLength(kind: DocumentKind): number {
  if (kind === "jobDescription") return 50000;
  return 40000;
}

export async function readDocumentFile(
  file: File,
  kind: DocumentKind,
): Promise<string> {
  const extension = getExtension(file);
  const label = kindLabel(kind);
  if (!SUPPORTED_DOCUMENT_EXTENSIONS.has(extension)) {
    throw new Error(`Only PDF, TXT, MD, and RTF ${label} files are supported right now.`);
  }

  const text =
    extension === "pdf"
      ? await extractPdfText(file)
      : normalizeDocumentText(
          extension === "rtf"
            ? stripRtfToPlainText(await file.text())
            : await file.text(),
        );

  if (text.length < minimumLength(kind)) {
    throw new Error(`That ${label} file does not have enough readable text.`);
  }

  if (text.length > maximumLength(kind)) {
    throw new Error(`That ${label} file is too large for one import.`);
  }

  return text;
}
