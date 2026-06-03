import {
  assertValidOperatorMarketAggregatesResponse,
  roleMarketProfileFixtures,
  type ContractMeta,
  type OperatorMarketAggregatesResponse,
  type RoleMarketProfile,
  type RoleMarketSignalAggregate,
} from '@daily-push/shared';
import { config } from '../config';
import { listLatestRoleMarketSignalAggregates } from './liveMarketSignalStore';

interface GetOperatorMarketAggregatesOptions {
  region?: string | null;
  limit?: number;
}

function buildMeta(): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: new Date().toISOString(),
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function profilesById(profiles: RoleMarketProfile[]): Map<string, RoleMarketProfile> {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

export async function getOperatorMarketAggregatesResponse(
  options: GetOperatorMarketAggregatesOptions = {},
): Promise<OperatorMarketAggregatesResponse> {
  const profiles = roleMarketProfileFixtures;
  const profileIds = profiles.map((profile) => profile.id);
  const profileMap = profilesById(profiles);
  const latestAggregates = await listLatestRoleMarketSignalAggregates({
    roleProfileIds: profileIds,
    region: options.region ?? null,
    limit: Math.max(profileIds.length, Math.min(200, options.limit ?? profileIds.length)),
  });
  const aggregateByRoleId = new Map<string, RoleMarketSignalAggregate>(
    latestAggregates.map((aggregate) => [aggregate.roleProfileId, aggregate]),
  );

  const items = profiles
    .map((profile) => ({
      roleProfileId: profile.id,
      roleTitle: profile.title,
      category: profile.category,
      latestAggregate: aggregateByRoleId.get(profile.id) ?? null,
    }))
    .concat(
      latestAggregates
        .filter((aggregate) => !profileMap.has(aggregate.roleProfileId))
        .map((aggregate) => ({
          roleProfileId: aggregate.roleProfileId,
          roleTitle: aggregate.roleTitle,
          category: aggregate.category,
          latestAggregate: aggregate,
        })),
    )
    .sort((a, b) => {
      const aTime = a.latestAggregate?.generatedAt ?? '';
      const bTime = b.latestAggregate?.generatedAt ?? '';
      if (aTime !== bTime) return bTime.localeCompare(aTime);
      return a.roleTitle.localeCompare(b.roleTitle);
    })
    .slice(0, Math.max(1, Math.min(200, options.limit ?? 50)));

  const response: OperatorMarketAggregatesResponse = {
    aggregates: items,
    meta: buildMeta(),
  };
  assertValidOperatorMarketAggregatesResponse(response);
  return response;
}
