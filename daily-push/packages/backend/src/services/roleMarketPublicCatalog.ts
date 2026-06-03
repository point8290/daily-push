import {
  assertValidListRolesResponse,
  assertValidRoleMarketProfile,
  toRoleMarketCards,
  type ContractMeta,
  type ListRolesQuery,
  type ListRolesResponse,
  type RoleMarketProfile,
} from '@daily-push/shared';
import { config } from '../config';
import {
  getMarketProfileRegistry,
  type MarketProfileRegistry,
} from './marketProfileRegistry';

function buildMarketRouteMeta(profiles: RoleMarketProfile[] = []): ContractMeta {
  const warningsByKey = new Map<string, ContractMeta['warnings'][number]>();
  profiles.forEach((profile) => {
    profile.meta.warnings.forEach((warning) => {
      warningsByKey.set(`${warning.code}:${warning.message}`, warning);
    });
  });

  return {
    contractVersion: 'role-market.v1',
    generatedAt: new Date().toISOString(),
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: Array.from(warningsByKey.values()),
  };
}

function matchesSearch(profile: RoleMarketProfile, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const searchable = [
    profile.title,
    profile.category,
    profile.roleType,
    profile.aiImpact,
    profile.shortDescription,
    profile.marketSummary,
    ...profile.interviewTopics,
    ...profile.proofExpectations,
    ...profile.requirements.flatMap((requirement) => [
      requirement.label,
      requirement.description,
      ...requirement.keywords,
    ]),
  ]
    .join(' ')
    .toLowerCase();

  return searchable.includes(query);
}

export function buildPublicRoleMarketListResponse(
  profiles: RoleMarketProfile[],
  query: ListRolesQuery = {},
): ListRolesResponse {
  let filteredProfiles = profiles;

  if (query.category) {
    filteredProfiles = filteredProfiles.filter((profile) => profile.category === query.category);
  }

  if (query.roleType) {
    filteredProfiles = filteredProfiles.filter((profile) => profile.roleType === query.roleType);
  }

  if (query.aiImpact) {
    filteredProfiles = filteredProfiles.filter((profile) => profile.aiImpact === query.aiImpact);
  }

  if (query.q) {
    filteredProfiles = filteredProfiles.filter((profile) => matchesSearch(profile, query.q ?? ''));
  }

  const limit = Math.max(1, Math.min(query.limit ?? 50, 100));
  const visibleProfiles = filteredProfiles.slice(0, limit);
  const response: ListRolesResponse = {
    roles: toRoleMarketCards(visibleProfiles),
    meta: buildMarketRouteMeta(visibleProfiles),
  };

  assertValidListRolesResponse(response);
  return response;
}

export async function listPublicRoleMarketProfiles(
  query: ListRolesQuery = {},
  registry: MarketProfileRegistry = getMarketProfileRegistry(),
): Promise<ListRolesResponse> {
  const profiles = await registry.listProfiles({ region: query.region ?? null });
  return buildPublicRoleMarketListResponse(profiles, query);
}

export async function getPublicRoleMarketProfile(
  identifier: string,
  options: { region?: string | null } = {},
  registry: MarketProfileRegistry = getMarketProfileRegistry(),
): Promise<RoleMarketProfile> {
  const profile = await registry.getProfile(identifier, { region: options.region ?? null });
  assertValidRoleMarketProfile(profile);
  return profile;
}
