import { createHash, randomUUID } from 'crypto';
import { setTimeout as delay } from 'timers/promises';
import type {
  ContractMeta,
  MarketRawDocument,
  MarketSource,
  MarketSourceFetchRequest,
  MarketSourceFetchResult,
  SourceReference,
} from '@daily-push/shared';
import { config } from '../config';
import type { MarketSourceAdapter } from './marketSourceAdapters';

interface AdzunaHeaders {
  get(name: string): string | null;
}

interface AdzunaFetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: AdzunaHeaders;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type AdzunaFetch = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<AdzunaFetchResponse>;

interface AdzunaJobPostAdapterOptions {
  appId: string;
  appKey: string;
  baseUrl?: string;
  defaultCountry?: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  requestTimeoutMs?: number;
  fetchImpl?: AdzunaFetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => string;
  idFactory?: () => string;
}

interface AdzunaSearchResponse {
  results?: AdzunaJobResult[];
}

interface AdzunaJobResult {
  id?: unknown;
  title?: unknown;
  redirect_url?: unknown;
  adref?: unknown;
  company?: {
    display_name?: unknown;
  } | null;
  location?: {
    display_name?: unknown;
    area?: unknown;
  } | null;
  created?: unknown;
  description?: unknown;
  category?: {
    label?: unknown;
    tag?: unknown;
  } | null;
  contract_type?: unknown;
  contract_time?: unknown;
  salary_min?: unknown;
  salary_max?: unknown;
}

const DEFAULT_RESULTS_PER_PAGE = 50;
const RAW_PAYLOAD_RESULT_TEXT_LIMIT = 12_000;
const EXTRACTED_TEXT_LIMIT = 19_500;

function buildMeta(now: string): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: now,
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stableChecksum(payload: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function safeSourceToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function normalizeCountry(value: string | null | undefined, fallback: string): string {
  const country = (value ?? fallback).trim().toLowerCase();
  return country || fallback;
}

function countryFromRegion(region: string | null | undefined): string | null {
  const normalized = (region ?? '').trim().toLowerCase();
  if (!normalized) return null;
  const map: Record<string, string> = {
    australia: 'au',
    au: 'au',
    canada: 'ca',
    ca: 'ca',
    france: 'fr',
    fr: 'fr',
    germany: 'de',
    de: 'de',
    india: 'in',
    in: 'in',
    italy: 'it',
    it: 'it',
    netherlands: 'nl',
    nl: 'nl',
    south_africa: 'za',
    'south africa': 'za',
    spain: 'es',
    es: 'es',
    uk: 'gb',
    gb: 'gb',
    'great britain': 'gb',
    'united kingdom': 'gb',
    us: 'us',
    usa: 'us',
    'united states': 'us',
    'united states of america': 'us',
  };
  return map[normalized] ?? null;
}

function boundedPositiveInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.trunc(value ?? fallback), max));
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function buildExtractedText(result: AdzunaJobResult): string {
  const parts = [
    asString(result.title),
    asString(result.company?.display_name),
    asString(result.location?.display_name),
    asString(result.category?.label),
    asString(result.contract_type),
    asString(result.contract_time),
    asNumber(result.salary_min) !== null || asNumber(result.salary_max) !== null
      ? `Salary range: ${asNumber(result.salary_min) ?? 'unknown'} - ${asNumber(result.salary_max) ?? 'unknown'}`
      : null,
    asString(result.description) ? stripHtml(asString(result.description) ?? '') : null,
  ];
  return truncateText(parts.filter(Boolean).join('\n'), EXTRACTED_TEXT_LIMIT);
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function sanitizeRawResult(result: AdzunaJobResult): Record<string, unknown> {
  return {
    id: asString(result.id),
    title: asString(result.title),
    redirect_url: asString(result.redirect_url),
    adref: asString(result.adref),
    company: result.company
      ? { display_name: asString(result.company.display_name) }
      : null,
    location: result.location
      ? {
          display_name: asString(result.location.display_name),
          area: Array.isArray(result.location.area)
            ? result.location.area.filter((item): item is string => typeof item === 'string')
            : [],
        }
      : null,
    created: asString(result.created),
    description: truncateText(stripHtml(asString(result.description) ?? ''), RAW_PAYLOAD_RESULT_TEXT_LIMIT),
    category: result.category
      ? {
          label: asString(result.category.label),
          tag: asString(result.category.tag),
        }
      : null,
    contract_type: asString(result.contract_type),
    contract_time: asString(result.contract_time),
    salary_min: asNumber(result.salary_min),
    salary_max: asNumber(result.salary_max),
  };
}

function responseErrorMessage(status: number, statusText: string | undefined, body: string): string {
  const safeBody = body
    .replace(/(app[_-]?key|app[_-]?id|api[_-]?key|token|secret|password)(=|:)\s*[^,\s;&]+/gi, '$1$2 [redacted]')
    .slice(0, 300);
  return `Adzuna request failed with ${status}${statusText ? ` ${statusText}` : ''}${safeBody ? `: ${safeBody}` : ''}`;
}

function markNonRetryable(error: Error): Error & { nonRetryable: true } {
  return Object.assign(error, { nonRetryable: true as const });
}

function isNonRetryable(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'nonRetryable' in error);
}

function looksLikeAdzunaSource(source: MarketSource): boolean {
  const haystack = [source.id, source.name, source.baseUrl ?? '']
    .join(' ')
    .toLowerCase();
  return source.type === 'job_board' && haystack.includes('adzuna');
}

export class AdzunaJobPostAdapter implements MarketSourceAdapter {
  readonly name = 'adzuna-job-post-adapter';

  private readonly appId: string;

  private readonly appKey: string;

  private readonly baseUrl: string;

  private readonly defaultCountry: string;

  private readonly maxRetries: number;

  private readonly retryBaseDelayMs: number;

  private readonly requestTimeoutMs: number;

  private readonly fetchImpl: AdzunaFetch;

  private readonly sleep: (ms: number) => Promise<void>;

  private readonly now: () => string;

  private readonly idFactory: () => string;

  constructor(options: AdzunaJobPostAdapterOptions) {
    this.appId = options.appId;
    this.appKey = options.appKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.adzuna.com').replace(/\/+$/g, '');
    this.defaultCountry = normalizeCountry(options.defaultCountry, 'in');
    this.maxRetries = Math.max(0, Math.trunc(options.maxRetries ?? 2));
    this.retryBaseDelayMs = Math.max(1, Math.trunc(options.retryBaseDelayMs ?? 500));
    this.requestTimeoutMs = Math.max(1, Math.trunc(options.requestTimeoutMs ?? 10_000));
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch as unknown as AdzunaFetch;
    this.sleep = options.sleep ?? delay;
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  supports(source: MarketSource): boolean {
    return looksLikeAdzunaSource(source);
  }

  async fetch(request: MarketSourceFetchRequest): Promise<MarketSourceFetchResult> {
    if (!this.appId.trim() || !this.appKey.trim()) {
      throw new Error('Adzuna adapter requires configured app credentials.');
    }

    const query = asString(request.query);
    if (!query) {
      throw new Error('Adzuna adapter requires a role query.');
    }

    const capturedAt = this.now();
    const country = normalizeCountry(
      request.country ?? countryFromRegion(request.region ?? request.source.region),
      this.defaultCountry,
    );
    const pageStart = boundedPositiveInteger(request.page, 1, 1_000);
    const pageLimit = boundedPositiveInteger(request.pageLimit, 1, 50);
    const resultLimit = boundedPositiveInteger(request.limit, 25, 100);
    const documents: MarketRawDocument[] = [];
    const warnings: string[] = [];

    for (let offset = 0; offset < pageLimit && documents.length < resultLimit; offset += 1) {
      const page = pageStart + offset;
      const remaining = resultLimit - documents.length;
      const response = await this.fetchSearchPage({
        country,
        page,
        query,
        where: request.region,
        resultsPerPage: Math.min(DEFAULT_RESULTS_PER_PAGE, remaining),
      });

      if (response.results.length === 0) {
        if (offset === 0) warnings.push(`Adzuna returned no jobs for "${query}" in ${country}.`);
        break;
      }

      documents.push(
        ...response.results
          .map((result) => this.toRawDocument(result, request, country, query, capturedAt))
          .filter((document): document is MarketRawDocument => Boolean(document)),
      );
    }

    return {
      sourceId: request.source.id,
      runId: request.runId,
      documents: documents.slice(0, resultLimit),
      health: {
        sourceId: request.source.id,
        status: 'healthy',
        checkedAt: capturedAt,
        latestRunId: request.runId,
        latestRunStatus: 'succeeded',
        lastSuccessfulRunAt: capturedAt,
        consecutiveFailures: 0,
        freshnessAgeHours: 0,
        documentsLastRun: documents.length,
        signalsLastRun: 0,
        errorSummary: null,
        meta: buildMeta(capturedAt),
      },
      warnings,
    };
  }

  private async fetchSearchPage({
    country,
    page,
    query,
    where,
    resultsPerPage,
  }: {
    country: string;
    page: number;
    query: string;
    where?: string | null;
    resultsPerPage: number;
  }): Promise<{ results: AdzunaJobResult[] }> {
    const url = new URL(`${this.baseUrl}/v1/api/jobs/${encodeURIComponent(country)}/search/${page}`);
    url.searchParams.set('app_id', this.appId);
    url.searchParams.set('app_key', this.appKey);
    url.searchParams.set('results_per_page', String(resultsPerPage));
    url.searchParams.set('what', query);
    url.searchParams.set('content-type', 'application/json');
    if (asString(where)) url.searchParams.set('where', asString(where) ?? '');

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      try {
        const response = await this.fetchImpl(url.toString(), {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (response.ok) {
          const body = await response.json();
          return {
            results: Array.isArray((body as AdzunaSearchResponse).results)
              ? ((body as AdzunaSearchResponse).results ?? [])
              : [],
          };
        }

        const bodyText = await response.text();
        if (![429, 500, 502, 503, 504].includes(response.status)) {
          throw markNonRetryable(
            new Error(responseErrorMessage(response.status, response.statusText, bodyText)),
          );
        }
        if (attempt >= this.maxRetries) {
          throw new Error(responseErrorMessage(response.status, response.statusText, bodyText));
        }

        const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
        await this.sleep(retryAfterMs ?? this.retryBaseDelayMs * 2 ** attempt);
      } catch (error) {
        if (isNonRetryable(error) || attempt >= this.maxRetries) throw error;
        await this.sleep(this.retryBaseDelayMs * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
      }
    }

    return { results: [] };
  }

  private toRawDocument(
    result: AdzunaJobResult,
    request: MarketSourceFetchRequest,
    country: string,
    query: string,
    capturedAt: string,
  ): MarketRawDocument | null {
    const sourceDocumentIdRaw = asString(result.id);
    const titleRaw = asString(result.title);
    if (!sourceDocumentIdRaw || !titleRaw) return null;

    const sourceDocumentId = truncateText(sourceDocumentIdRaw, 160);
    const title = truncateText(titleRaw, 500);

    const sourceRefId = `adzuna_${safeSourceToken(country)}_${safeSourceToken(sourceDocumentId)}`;
    const url = truncateText(asString(result.redirect_url) ?? asString(result.adref) ?? '', 2_000) || null;
    const publisher = truncateText(asString(result.company?.display_name) ?? 'Adzuna', 240);
    const region = truncateText(
      asString(result.location?.display_name) ?? request.region ?? request.source.region ?? '',
      240,
    ) || null;
    const created = asString(result.created);
    const publishedAt = created && !Number.isNaN(Date.parse(created))
      ? new Date(created).toISOString()
      : null;
    const extractedText = buildExtractedText(result);
    if (!extractedText) return null;

    const sourceRef: SourceReference = {
      id: sourceRefId,
      title,
      url,
      publisher,
      sourceType: 'job_post',
      region,
      publishedAt,
      capturedAt,
      confidence: 0.74,
    };
    const rawPayload = {
      provider: 'adzuna',
      query,
      country,
      roleProfileId: request.roleProfileId ?? null,
      result: sanitizeRawResult(result),
    };
    const checksumPayload = {
      sourceDocumentId,
      title,
      url,
      publisher,
      region,
      publishedAt,
      extractedText,
    };

    return {
      id: `market_raw_adzuna_${this.idFactory()}`,
      sourceId: request.source.id,
      ingestionRunId: request.runId,
      sourceDocumentId,
      documentType: 'job_post',
      title,
      url,
      publisher,
      region,
      publishedAt,
      capturedAt,
      dedupeKey: `adzuna:${safeSourceToken(country)}:${safeSourceToken(sourceDocumentId)}`,
      checksum: stableChecksum(checksumPayload),
      extractedText,
      rawPayload,
      sourceRef,
      meta: buildMeta(capturedAt),
    };
  }
}

export function createConfiguredAdzunaJobPostAdapter(): AdzunaJobPostAdapter {
  if (!config.roleMarket.featureLiveIngestion) {
    throw new Error('Adzuna adapter is disabled because FEATURE_ROLE_MARKET_LIVE_INGESTION is not enabled.');
  }
  return new AdzunaJobPostAdapter({
    appId: config.roleMarket.sourceCredentials.adzunaAppId,
    appKey: config.roleMarket.sourceCredentials.adzunaAppKey,
    baseUrl: config.roleMarket.adzunaBaseUrl,
    defaultCountry: config.roleMarket.adzunaDefaultCountry,
    maxRetries: config.roleMarket.adzunaMaxRetries,
    retryBaseDelayMs: config.roleMarket.adzunaRetryBaseDelayMs,
    requestTimeoutMs: config.roleMarket.adzunaRequestTimeoutMs,
  });
}
