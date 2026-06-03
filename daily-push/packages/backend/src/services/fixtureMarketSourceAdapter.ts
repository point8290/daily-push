import {
  liveMarketRawDocumentFixture,
  type MarketRawDocument,
  type MarketSource,
  type MarketSourceFetchRequest,
  type MarketSourceFetchResult,
} from '@daily-push/shared';
import type { MarketSourceAdapter } from './marketSourceAdapters';

export interface FixtureMarketSourceAdapterOptions {
  name?: string;
  documents?: MarketRawDocument[];
  warnings?: string[];
  failWith?: Error;
}

export class FixtureMarketSourceAdapter implements MarketSourceAdapter {
  readonly name: string;

  private readonly documents: MarketRawDocument[];

  private readonly warnings: string[];

  private readonly failWith: Error | null;

  constructor(options: FixtureMarketSourceAdapterOptions = {}) {
    this.name = options.name ?? 'fixture-job-board-adapter';
    this.documents = options.documents ?? [liveMarketRawDocumentFixture];
    this.warnings = options.warnings ?? [];
    this.failWith = options.failWith ?? null;
  }

  supports(source: MarketSource): boolean {
    return source.type === 'job_board' || source.type === 'curated_seed';
  }

  async fetch(request: MarketSourceFetchRequest): Promise<MarketSourceFetchResult> {
    if (this.failWith) throw this.failWith;

    const documents = this.documents.slice(0, request.limit).map((document) => ({
      ...document,
      sourceId: request.source.id,
      ingestionRunId: request.runId,
      region: document.region ?? request.source.region,
      sourceRef: {
        ...document.sourceRef,
        sourceType: request.source.sourceRefType,
        region: document.sourceRef.region ?? document.region ?? request.source.region,
      },
    }));

    return {
      sourceId: request.source.id,
      runId: request.runId,
      documents,
      health: {
        sourceId: request.source.id,
        status: 'healthy',
        checkedAt: request.source.meta.generatedAt,
        latestRunId: request.runId,
        latestRunStatus: 'succeeded',
        lastSuccessfulRunAt: request.source.meta.generatedAt,
        consecutiveFailures: 0,
        freshnessAgeHours: 0,
        documentsLastRun: documents.length,
        signalsLastRun: 0,
        errorSummary: null,
        meta: request.source.meta,
      },
      warnings: this.warnings,
    };
  }
}
