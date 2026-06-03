import {
  assertValidOperatorMarketProfileVersionsResponse,
  type ContractMeta,
  type OperatorMarketProfileVersionItem,
  type OperatorMarketProfileVersionsResponse,
  type RoleMarketProfileVersion,
} from '@daily-push/shared';
import { config } from '../config';
import { listRoleMarketRollbackCandidateVersions } from './liveMarketProfileVersionStore';

interface GetOperatorMarketProfileVersionsOptions {
  roleProfileId?: string | null;
  limit?: number;
}

interface OperatorMarketProfileVersionsDeps {
  listVersions?: (
    roleProfileId: string | null,
    limit: number,
  ) => Promise<RoleMarketProfileVersion[]>;
  now?: () => string;
}

function buildMeta(generatedAt: string): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt,
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function canRollback(profileVersion: RoleMarketProfileVersion, currentPublishedVersion: RoleMarketProfileVersion | null): boolean {
  return profileVersion.status === 'archived'
    && currentPublishedVersion !== null
    && currentPublishedVersion.id !== profileVersion.id
    && profileVersion.validationResult?.canPublish === true;
}

function itemFromVersion(
  profileVersion: RoleMarketProfileVersion,
  currentPublishedVersion: RoleMarketProfileVersion | null,
): OperatorMarketProfileVersionItem {
  return {
    roleProfileId: profileVersion.roleProfileId,
    roleTitle: profileVersion.profile.title,
    category: profileVersion.profile.category,
    profileVersion,
    currentPublishedVersion,
    isCurrentPublished: profileVersion.status === 'published',
    canRollback: canRollback(profileVersion, currentPublishedVersion),
  };
}

export async function getOperatorMarketProfileVersionsResponse(
  options: GetOperatorMarketProfileVersionsOptions = {},
  deps: OperatorMarketProfileVersionsDeps = {},
): Promise<OperatorMarketProfileVersionsResponse> {
  const generatedAt = deps.now?.() ?? new Date().toISOString();
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  const roleProfileId = options.roleProfileId?.trim() || null;
  const listVersions = deps.listVersions ?? listRoleMarketRollbackCandidateVersions;
  const versions = await listVersions(roleProfileId, limit);
  const publishedByRoleId = new Map<string, RoleMarketProfileVersion>();

  for (const version of versions) {
    if (version.status === 'published') {
      publishedByRoleId.set(version.roleProfileId, version);
    }
  }

  const response: OperatorMarketProfileVersionsResponse = {
    versions: versions.map((version) => itemFromVersion(
      version,
      publishedByRoleId.get(version.roleProfileId) ?? null,
    )),
    meta: buildMeta(generatedAt),
  };
  assertValidOperatorMarketProfileVersionsResponse(response);
  return response;
}
