import {
  assertValidRoleMarketProfile,
  roleMarketProfileFixtures,
  type ContractMeta,
  type ContractWarning,
  type RoleMarketProfile,
  type RoleMarketProfileVersionMeta,
  type RoleMarketProfileVersion,
  type RoleMarketSignalAggregate,
  type RoleMarketSourceSummary,
  type SourceMode,
} from '@daily-push/shared';
import { config } from '../config';
import { DependencyUnavailableError } from '../middleware/roleMarketFeature';
import {
  getPublishedRoleMarketProfileVersion,
  listPublishedRoleMarketProfileVersions,
} from './liveMarketProfileVersionStore';
import { getRoleMarketSignalAggregate } from './liveMarketSignalStore';
import { RoleMarketProfileNotFoundError } from './roleMarketCatalog';

export interface MarketProfileRegistry {
  listProfiles(options?: MarketProfileRegistryOptions): Promise<RoleMarketProfile[]>;
  getProfile(identifier: string, options?: MarketProfileRegistryOptions): Promise<RoleMarketProfile>;
  getPublishedProfileVersion(roleProfileId: string): Promise<RoleMarketProfileVersion | null>;
}

export interface MarketProfileRegistryOptions {
  region?: string | null;
}

interface RegistryMetaOptions {
  warnings?: ContractWarning[];
  profileVersion?: RoleMarketProfileVersionMeta | null;
  sourceSummary?: RoleMarketSourceSummary | null;
}

function buildRegistryMeta(
  sourceMode: SourceMode,
  options: RegistryMetaOptions = {},
): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: new Date().toISOString(),
    sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: options.warnings ?? [],
    profileVersion: options.profileVersion ?? null,
    sourceSummary: options.sourceSummary ?? null,
  };
}

function buildCuratedSourceSummary(profile: RoleMarketProfile): RoleMarketSourceSummary {
  return {
    sourceMode: 'curated',
    region: null,
    sourceCount: profile.sourceRefs.length,
    sampleSize: null,
    freshnessHours: null,
    windowStart: null,
    windowEnd: null,
  };
}

function buildCuratedProfile(
  profile: RoleMarketProfile,
  sourceMode: SourceMode = 'curated',
  warnings: ContractWarning[] = [],
): RoleMarketProfile {
  const nextProfile = {
    ...profile,
    meta: buildRegistryMeta(sourceMode, {
      warnings,
      sourceSummary: buildCuratedSourceSummary(profile),
    }),
  };
  assertValidRoleMarketProfile(nextProfile);
  return nextProfile;
}

function curatedProfiles(sourceMode: SourceMode = 'curated'): RoleMarketProfile[] {
  if (roleMarketProfileFixtures.length === 0) {
    throw new DependencyUnavailableError('Role Market seed profiles are unavailable.');
  }

  return roleMarketProfileFixtures.map((profile) => buildCuratedProfile(profile, sourceMode));
}

function findCuratedProfile(identifier: string, sourceMode: SourceMode = 'curated'): RoleMarketProfile | null {
  const profile = roleMarketProfileFixtures.find(
    (candidate) => candidate.id === identifier || candidate.slug === identifier,
  );
  return profile ? buildCuratedProfile(profile, sourceMode) : null;
}

function isFreshPublishedVersion(profileVersion: RoleMarketProfileVersion): boolean {
  if (!profileVersion.publishedAt) return false;
  const publishedAt = new Date(profileVersion.publishedAt).getTime();
  if (!Number.isFinite(publishedAt)) return false;
  const ageHours = (Date.now() - publishedAt) / (60 * 60 * 1000);
  return ageHours <= config.roleMarket.liveProfileFreshnessMaxHours;
}

function buildHybridFallbackWarning(reason: 'missing' | 'stale'): ContractWarning {
  if (reason === 'stale') {
    return {
      code: 'source_stale',
      message:
        'This role uses the curated market baseline because the newest reviewed source-backed profile is older than our freshness window.',
    };
  }

  return {
    code: 'dependency_unavailable',
    message:
      'This role uses the curated market baseline while a reviewed source-backed profile is being prepared.',
  };
}

function buildRegionUnavailableWarning(region: string): ContractWarning {
  return {
    code: 'region_unavailable',
    message:
      `Reviewed source-backed signals are not available for ${region} yet, so this role is shown with the curated global baseline.`,
  };
}

function withWarnings(
  profile: RoleMarketProfile,
  warnings: ContractWarning[],
): RoleMarketProfile {
  const nextProfile = {
    ...profile,
    meta: {
      ...profile.meta,
      generatedAt: new Date().toISOString(),
      warnings: [...profile.meta.warnings, ...warnings],
    },
  };
  assertValidRoleMarketProfile(nextProfile);
  return nextProfile;
}

function buildProfileVersionMeta(
  profileVersion: RoleMarketProfileVersion,
): RoleMarketProfileVersionMeta {
  return {
    profileVersionId: profileVersion.id,
    roleProfileId: profileVersion.roleProfileId,
    version: profileVersion.version,
    status: profileVersion.status,
    publishedAt: profileVersion.publishedAt,
    aggregateId: profileVersion.aggregateId,
    changeSummary: profileVersion.changeSummary || null,
    diffMateriality: profileVersion.profileDiff?.materiality ?? null,
  };
}

function buildSourceSummary(
  profileVersion: RoleMarketProfileVersion,
  aggregate: RoleMarketSignalAggregate | null,
): RoleMarketSourceSummary {
  return {
    sourceMode: profileVersion.sourceMode,
    region: aggregate?.region ?? null,
    sourceCount:
      aggregate?.sourceCount ??
      profileVersion.validationResult?.sourceIntegrity.sourceRefCount ??
      profileVersion.sourceRefs.length,
    sampleSize: aggregate?.sampleSize ?? null,
    freshnessHours:
      aggregate?.freshnessHours ??
      profileVersion.validationResult?.freshnessHours ??
      null,
    windowStart: aggregate?.windowStart ?? null,
    windowEnd: aggregate?.windowEnd ?? null,
  };
}

function normalizeRequestedRegion(region: string | null | undefined): string | null {
  const trimmed = region?.trim();
  if (!trimmed || /^global$/i.test(trimmed) || /^all$/i.test(trimmed)) return null;
  return trimmed;
}

function regionMatches(aggregate: RoleMarketSignalAggregate | null, requestedRegion: string | null): boolean {
  if (!requestedRegion) return true;
  return Boolean(aggregate?.region && aggregate.region.trim().toLowerCase() === requestedRegion.toLowerCase());
}

async function aggregateForVersion(profileVersion: RoleMarketProfileVersion): Promise<RoleMarketSignalAggregate | null> {
  return profileVersion.aggregateId
    ? getRoleMarketSignalAggregate(profileVersion.aggregateId)
    : null;
}

async function profileFromVersion(
  profileVersion: RoleMarketProfileVersion,
  aggregateOverride?: RoleMarketSignalAggregate | null,
): Promise<RoleMarketProfile> {
  const aggregate = aggregateOverride === undefined
    ? await aggregateForVersion(profileVersion)
    : aggregateOverride;
  const profile = {
    ...profileVersion.profile,
    sourceRefs:
      profileVersion.sourceRefs.length > 0
        ? profileVersion.sourceRefs
        : profileVersion.profile.sourceRefs,
    lastUpdated: profileVersion.publishedAt ?? profileVersion.profile.lastUpdated,
    confidence:
      profileVersion.validationResult?.confidence ?? profileVersion.profile.confidence,
    meta: buildRegistryMeta(profileVersion.sourceMode, {
      profileVersion: buildProfileVersionMeta(profileVersion),
      sourceSummary: buildSourceSummary(profileVersion, aggregate),
    }),
  };
  assertValidRoleMarketProfile(profile);
  return profile;
}

async function listFreshPublishedProfiles(
  options: MarketProfileRegistryOptions = {},
): Promise<RoleMarketProfile[]> {
  const requestedRegion = normalizeRequestedRegion(options.region);
  const profileVersions = await listPublishedRoleMarketProfileVersions();
  const profiles: RoleMarketProfile[] = [];
  for (const profileVersion of profileVersions.filter(isFreshPublishedVersion)) {
    const aggregate = await aggregateForVersion(profileVersion);
    if (!regionMatches(aggregate, requestedRegion)) continue;
    profiles.push(await profileFromVersion(profileVersion, aggregate));
  }
  return profiles;
}

class CuratedMarketProfileRegistry implements MarketProfileRegistry {
  async listProfiles(): Promise<RoleMarketProfile[]> {
    return curatedProfiles();
  }

  async getProfile(identifier: string): Promise<RoleMarketProfile> {
    const profile = findCuratedProfile(identifier);
    if (!profile) throw new RoleMarketProfileNotFoundError(identifier);
    assertValidRoleMarketProfile(profile);
    return profile;
  }

  async getPublishedProfileVersion(): Promise<RoleMarketProfileVersion | null> {
    return null;
  }
}

class HybridMarketProfileRegistry implements MarketProfileRegistry {
  async listProfiles(options: MarketProfileRegistryOptions = {}): Promise<RoleMarketProfile[]> {
    const requestedRegion = normalizeRequestedRegion(options.region);
    const curated = curatedProfiles('hybrid');
    const profiles = await Promise.all(
      curated.map(async (profile) => {
        const published = await getPublishedRoleMarketProfileVersion(profile.id);
        if (!published) {
          return withWarnings(profile, [
            requestedRegion
              ? buildRegionUnavailableWarning(requestedRegion)
              : buildHybridFallbackWarning('missing'),
          ]);
        }
        if (!isFreshPublishedVersion(published)) {
          return withWarnings(profile, [
            requestedRegion
              ? buildRegionUnavailableWarning(requestedRegion)
              : buildHybridFallbackWarning('stale'),
          ]);
        }
        const aggregate = await aggregateForVersion(published);
        if (!regionMatches(aggregate, requestedRegion)) {
          return withWarnings(profile, [
            requestedRegion
              ? buildRegionUnavailableWarning(requestedRegion)
              : buildHybridFallbackWarning('missing'),
          ]);
        }
        return profileFromVersion(published, aggregate);
      }),
    );
    return profiles;
  }

  async getProfile(
    identifier: string,
    options: MarketProfileRegistryOptions = {},
  ): Promise<RoleMarketProfile> {
    const requestedRegion = normalizeRequestedRegion(options.region);
    const curated = findCuratedProfile(identifier, 'hybrid');
    if (curated) {
      const published = await getPublishedRoleMarketProfileVersion(curated.id);
      if (published && isFreshPublishedVersion(published)) {
        const aggregate = await aggregateForVersion(published);
        if (regionMatches(aggregate, requestedRegion)) {
          return profileFromVersion(published, aggregate);
        }
      }
      return withWarnings(curated, [
        requestedRegion
          ? buildRegionUnavailableWarning(requestedRegion)
          : buildHybridFallbackWarning(published ? 'stale' : 'missing'),
      ]);
    }

    const publishedProfiles = await listFreshPublishedProfiles({ region: requestedRegion });
    const profile = publishedProfiles.find(
      (candidate) => candidate.id === identifier || candidate.slug === identifier,
    );
    if (!profile) throw new RoleMarketProfileNotFoundError(identifier);
    return profile;
  }

  async getPublishedProfileVersion(
    roleProfileId: string,
  ): Promise<RoleMarketProfileVersion | null> {
    return getPublishedRoleMarketProfileVersion(roleProfileId);
  }
}

class LiveMarketProfileRegistry implements MarketProfileRegistry {
  async listProfiles(options: MarketProfileRegistryOptions = {}): Promise<RoleMarketProfile[]> {
    const profiles = await listFreshPublishedProfiles(options);
    if (profiles.length === 0) {
      throw new DependencyUnavailableError(
        'Published role market profiles are unavailable or stale.',
      );
    }
    return profiles;
  }

  async getProfile(
    identifier: string,
    options: MarketProfileRegistryOptions = {},
  ): Promise<RoleMarketProfile> {
    const profiles = await this.listProfiles(options);
    const profile = profiles.find(
      (candidate) => candidate.id === identifier || candidate.slug === identifier,
    );
    if (!profile) {
      throw new DependencyUnavailableError(
        `Published role market profile '${identifier}' is unavailable or stale.`,
      );
    }
    return profile;
  }

  async getPublishedProfileVersion(
    roleProfileId: string,
  ): Promise<RoleMarketProfileVersion | null> {
    const profileVersion = await getPublishedRoleMarketProfileVersion(roleProfileId);
    if (!profileVersion || !isFreshPublishedVersion(profileVersion)) return null;
    return profileVersion;
  }
}

export function createMarketProfileRegistry(sourceMode: SourceMode): MarketProfileRegistry {
  if (sourceMode === 'live') {
    return new LiveMarketProfileRegistry();
  }
  if (sourceMode === 'hybrid') {
    return new HybridMarketProfileRegistry();
  }
  return new CuratedMarketProfileRegistry();
}

export function getMarketProfileRegistry(): MarketProfileRegistry {
  return createMarketProfileRegistry(config.roleMarket.sourceMode);
}
