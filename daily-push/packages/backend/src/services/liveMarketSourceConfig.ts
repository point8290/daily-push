import type { ContractMeta, MarketSource } from '@daily-push/shared';
import { config } from '../config';
import { upsertMarketSource } from './liveMarketIngestionStore';

function buildMeta(now: string): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: now,
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function adzunaSourceRegion(): string {
  const country = config.roleMarket.adzunaDefaultCountry.trim().toLowerCase();
  const labels: Record<string, string> = {
    au: 'Australia',
    ca: 'Canada',
    de: 'Germany',
    es: 'Spain',
    fr: 'France',
    gb: 'United Kingdom',
    in: 'India',
    it: 'Italy',
    nl: 'Netherlands',
    us: 'United States',
    za: 'South Africa',
  };
  return labels[country] ?? country.toUpperCase();
}

export function getConfiguredLiveMarketSources(now = new Date().toISOString()): MarketSource[] {
  if (!config.roleMarket.featureLiveIngestion) return [];
  if (
    !config.roleMarket.sourceCredentials.adzunaAppId.trim() ||
    !config.roleMarket.sourceCredentials.adzunaAppKey.trim()
  ) {
    return [];
  }

  return [
    {
      id: 'market_source_adzuna_jobs',
      name: 'Adzuna Job Posts',
      type: 'job_board',
      status: 'enabled',
      sourceRefType: 'job_post',
      baseUrl: config.roleMarket.adzunaBaseUrl,
      region: adzunaSourceRegion(),
      authMode: 'api_key',
      piiRiskLevel: 'low',
      freshnessSlaHours: config.roleMarket.liveSourceStaleAfterHours,
      owner: 'market-ops',
      notes: 'Official Adzuna job search API source for bounded role-market ingestion samples.',
      createdAt: now,
      updatedAt: now,
      meta: buildMeta(now),
    },
  ];
}

export async function upsertConfiguredLiveMarketSources(): Promise<MarketSource[]> {
  const sources = getConfiguredLiveMarketSources();
  const saved: MarketSource[] = [];
  for (const source of sources) {
    saved.push(await upsertMarketSource(source));
  }
  return saved;
}
