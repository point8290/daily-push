import {
  assertValidListRolesResponse,
  assertValidRoleMarketProfile,
  roleMarketProfileFixtures,
  toRoleMarketCards,
  type ContractMeta,
  type ListRolesQuery,
  type ListRolesResponse,
  type RoleMarketProfile,
} from '@daily-push/shared';
import { config } from '../config';
import { DependencyUnavailableError } from '../middleware/roleMarketFeature';

export class RoleMarketProfileNotFoundError extends Error {
  statusCode = 404;

  code = 'not_found';

  constructor(identifier: string) {
    super(`Role market profile '${identifier}' was not found.`);
  }
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

function getSeedProfiles(): RoleMarketProfile[] {
  if (roleMarketProfileFixtures.length === 0) {
    throw new DependencyUnavailableError('Role Market seed profiles are unavailable.');
  }

  return roleMarketProfileFixtures.map((profile) => ({
    ...profile,
    meta: buildMeta(),
  }));
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

export function listRoleMarketProfiles(query: ListRolesQuery = {}): ListRolesResponse {
  let profiles = getSeedProfiles();

  if (query.category) {
    profiles = profiles.filter((profile) => profile.category === query.category);
  }

  if (query.roleType) {
    profiles = profiles.filter((profile) => profile.roleType === query.roleType);
  }

  if (query.aiImpact) {
    profiles = profiles.filter((profile) => profile.aiImpact === query.aiImpact);
  }

  if (query.q) {
    profiles = profiles.filter((profile) => matchesSearch(profile, query.q ?? ''));
  }

  const limit = Math.max(1, Math.min(query.limit ?? 50, 100));
  const response: ListRolesResponse = {
    roles: toRoleMarketCards(profiles.slice(0, limit)),
    meta: buildMeta(),
  };

  assertValidListRolesResponse(response);
  return response;
}

export function getRoleMarketProfile(identifier: string): RoleMarketProfile {
  const profile = getSeedProfiles().find(
    (candidate) => candidate.id === identifier || candidate.slug === identifier,
  );

  if (!profile) {
    throw new RoleMarketProfileNotFoundError(identifier);
  }

  assertValidRoleMarketProfile(profile);
  return profile;
}
