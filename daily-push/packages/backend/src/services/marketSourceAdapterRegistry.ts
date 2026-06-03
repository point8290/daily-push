import type { MarketSource } from '@daily-push/shared';
import { createConfiguredAdzunaJobPostAdapter } from './adzunaJobPostAdapter';
import type { MarketSourceAdapter } from './marketSourceAdapters';
import { UnsupportedMarketSourceError } from './marketSourceAdapters';

export function getConfiguredMarketSourceAdapter(source: MarketSource): MarketSourceAdapter {
  const adzunaAdapter = createConfiguredAdzunaJobPostAdapter();
  if (adzunaAdapter.supports(source)) return adzunaAdapter;

  throw new UnsupportedMarketSourceError('configured-market-source-adapter-registry', source);
}
