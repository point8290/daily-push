import {
  assertValidOperatorMarketProfileDraftsResponse,
  type ContractMeta,
  type OperatorMarketProfileDraftItem,
  type OperatorMarketProfileDraftsResponse,
  type RoleMarketProfileVersion,
  type RoleMarketProfileVersionStatus,
} from '@daily-push/shared';
import { config } from '../config';
import {
  getPublishedRoleMarketProfileVersion,
  listRoleMarketProfileVersionsByStatus,
} from './liveMarketProfileVersionStore';

interface GetOperatorMarketProfileDraftsOptions {
  limit?: number;
  statuses?: RoleMarketProfileVersionStatus[];
}

interface OperatorMarketProfileDraftDeps {
  listVersionsByStatus?: (
    statuses: RoleMarketProfileVersionStatus[],
    limit: number,
  ) => Promise<RoleMarketProfileVersion[]>;
  getPublishedVersion?: (roleProfileId: string) => Promise<RoleMarketProfileVersion | null>;
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

function itemFromDraft(
  draftVersion: RoleMarketProfileVersion,
  currentPublishedVersion: RoleMarketProfileVersion | null,
): OperatorMarketProfileDraftItem {
  const validation = draftVersion.validationResult;
  const blockerCount = validation?.findings.filter((finding) => finding.severity === 'blocker').length ?? 0;
  const warningCount = validation?.findings.filter((finding) => finding.severity === 'warning').length ?? 0;

  return {
    roleProfileId: draftVersion.roleProfileId,
    roleTitle: draftVersion.profile.title,
    category: draftVersion.profile.category,
    draftVersion,
    currentPublishedVersion,
    validationStatus: validation?.status ?? null,
    canPublish: validation?.canPublish ?? false,
    blockerCount,
    warningCount,
    sourceRefCount: validation?.sourceIntegrity.sourceRefCount ?? draftVersion.sourceRefs.length,
    staleSourceRefCount: validation?.sourceIntegrity.staleSourceRefCount ?? 0,
    missingSourceRefCount: validation?.sourceIntegrity.missingSourceRefCount ?? 0,
    materiality: draftVersion.profileDiff?.materiality ?? null,
  };
}

export async function getOperatorMarketProfileDraftsResponse(
  options: GetOperatorMarketProfileDraftsOptions = {},
  deps: OperatorMarketProfileDraftDeps = {},
): Promise<OperatorMarketProfileDraftsResponse> {
  const generatedAt = deps.now?.() ?? new Date().toISOString();
  const statuses = options.statuses ?? ['draft', 'in_review'];
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  const listVersionsByStatus = deps.listVersionsByStatus ?? listRoleMarketProfileVersionsByStatus;
  const getPublishedVersion = deps.getPublishedVersion ?? getPublishedRoleMarketProfileVersion;
  const drafts = await listVersionsByStatus(statuses, limit);

  const currentPublishedByRoleId = new Map<string, RoleMarketProfileVersion | null>();
  for (const roleProfileId of [...new Set(drafts.map((draft) => draft.roleProfileId))]) {
    currentPublishedByRoleId.set(roleProfileId, await getPublishedVersion(roleProfileId));
  }

  const response: OperatorMarketProfileDraftsResponse = {
    drafts: drafts.map((draft) => itemFromDraft(draft, currentPublishedByRoleId.get(draft.roleProfileId) ?? null)),
    meta: buildMeta(generatedAt),
  };
  assertValidOperatorMarketProfileDraftsResponse(response);
  return response;
}
