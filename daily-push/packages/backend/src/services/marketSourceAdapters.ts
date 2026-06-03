import type {
  MarketSource,
  MarketSourceFetchRequest,
  MarketSourceFetchResult,
} from '@daily-push/shared';

export interface MarketSourceAdapter {
  readonly name: string;
  supports(source: MarketSource): boolean;
  fetch(request: MarketSourceFetchRequest): Promise<MarketSourceFetchResult>;
}

export class UnsupportedMarketSourceError extends Error {
  statusCode = 400;

  code = 'validation_error';

  constructor(adapterName: string, source: MarketSource) {
    super(`Adapter ${adapterName} does not support source ${source.id}.`);
  }
}
