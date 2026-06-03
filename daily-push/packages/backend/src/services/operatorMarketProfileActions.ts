import { randomUUID } from 'crypto';
import {
  assertValidOperatorMarketProfileActionResponse,
  type ContractMeta,
  type MarketReviewAction,
  type OperatorMarketProfileActionResponse,
  type RoleMarketProfileVersion,
} from '@daily-push/shared';
import { config } from '../config';
import {
  getRoleMarketProfileVersion,
  publishRoleMarketProfileVersion,
  rejectRoleMarketProfileVersion,
  rollbackRoleMarketProfileVersion,
} from './liveMarketProfileVersionStore';
import { getRoleMarketSignalAggregate } from './liveMarketSignalStore';
import { validateMarketProfileDraft } from './marketProfileDraftValidation';

interface OperatorMarketProfileActionDeps {
  getProfileVersion?: (profileVersionId: string) => Promise<RoleMarketProfileVersion | null>;
  getAggregate?: typeof getRoleMarketSignalAggregate;
  publishVersion?: typeof publishRoleMarketProfileVersion;
  rejectVersion?: typeof rejectRoleMarketProfileVersion;
  rollbackVersion?: typeof rollbackRoleMarketProfileVersion;
  idFactory?: () => string;
  now?: () => string;
}

export class OperatorMarketProfileActionError extends Error {
  statusCode = 400;

  code = 'operator_market_profile_action_error';
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

function buildAction(input: {
  profileVersion: RoleMarketProfileVersion;
  actorUserId: string;
  action: 'publish' | 'reject' | 'rollback';
  reason: string;
  generatedAt: string;
  idFactory: () => string;
}): MarketReviewAction {
  return {
    id: `market_review_${input.idFactory().replace(/[^a-zA-Z0-9_.:-]/g, '')}`,
    profileVersionId: input.profileVersion.id,
    action: input.action,
    actorUserId: input.actorUserId,
    reason: input.reason,
    beforeStatus: input.profileVersion.status,
    afterStatus: input.action === 'reject' ? 'rejected' : 'published',
    createdAt: input.generatedAt,
    meta: buildMeta(input.generatedAt),
  };
}

function assertReviewable(profileVersion: RoleMarketProfileVersion): void {
  if (profileVersion.status !== 'draft' && profileVersion.status !== 'in_review') {
    throw new OperatorMarketProfileActionError('Only draft or in-review profile versions can be reviewed.');
  }
}

function assertRollbackTarget(profileVersion: RoleMarketProfileVersion): void {
  if (profileVersion.status !== 'archived') {
    throw new OperatorMarketProfileActionError('Only archived profile versions can be rolled back.');
  }
  if (!profileVersion.validationResult?.canPublish) {
    throw new OperatorMarketProfileActionError('Only previously publishable profile versions can be rolled back.');
  }
}

function responseFor(
  profileVersion: RoleMarketProfileVersion,
  auditAction: MarketReviewAction,
  generatedAt: string,
): OperatorMarketProfileActionResponse {
  const response: OperatorMarketProfileActionResponse = {
    profileVersion,
    auditAction,
    meta: buildMeta(generatedAt),
  };
  assertValidOperatorMarketProfileActionResponse(response);
  return response;
}

export async function publishOperatorMarketProfileDraft(
  profileVersionId: string,
  actorUserId: string,
  reason: string,
  deps: OperatorMarketProfileActionDeps = {},
): Promise<OperatorMarketProfileActionResponse> {
  const generatedAt = deps.now?.() ?? new Date().toISOString();
  const getProfileVersion = deps.getProfileVersion ?? getRoleMarketProfileVersion;
  const getAggregate = deps.getAggregate ?? getRoleMarketSignalAggregate;
  const publishVersion = deps.publishVersion ?? publishRoleMarketProfileVersion;
  const idFactory = deps.idFactory ?? randomUUID;
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new OperatorMarketProfileActionError('Publish actions require a reason.');
  }

  const profileVersion = await getProfileVersion(profileVersionId);
  if (!profileVersion) {
    throw new OperatorMarketProfileActionError('Profile draft was not found.');
  }
  assertReviewable(profileVersion);
  if (!profileVersion.aggregateId) {
    throw new OperatorMarketProfileActionError('Profile drafts require an aggregate before publishing.');
  }

  const aggregate = await getAggregate(profileVersion.aggregateId);
  if (!aggregate) {
    throw new OperatorMarketProfileActionError('Source aggregate for this profile draft was not found.');
  }

  const validationResult = validateMarketProfileDraft({
    profileVersionId: profileVersion.id,
    profile: profileVersion.profile,
    aggregate,
    generatedAt,
    sourceMode: profileVersion.sourceMode,
  });
  if (!validationResult.canPublish) {
    throw new OperatorMarketProfileActionError(
      `Profile draft cannot be published until validation blockers are resolved: ${validationResult.findings
        .filter((finding) => finding.severity === 'blocker')
        .map((finding) => finding.code)
        .join(', ') || 'unknown blocker'}.`,
    );
  }

  const action = buildAction({
    profileVersion,
    actorUserId,
    action: 'publish',
    reason: trimmedReason,
    generatedAt,
    idFactory,
  });
  const published = await publishVersion(
    profileVersion.id,
    action,
    {
      triggeredFrom: 'operator_market_profile_review',
      validationCheckedAt: validationResult.checkedAt,
    },
    () => validationResult,
  );

  return responseFor(published, action, generatedAt);
}

export async function rejectOperatorMarketProfileDraft(
  profileVersionId: string,
  actorUserId: string,
  reason: string,
  deps: OperatorMarketProfileActionDeps = {},
): Promise<OperatorMarketProfileActionResponse> {
  const generatedAt = deps.now?.() ?? new Date().toISOString();
  const getProfileVersion = deps.getProfileVersion ?? getRoleMarketProfileVersion;
  const rejectVersion = deps.rejectVersion ?? rejectRoleMarketProfileVersion;
  const idFactory = deps.idFactory ?? randomUUID;
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new OperatorMarketProfileActionError('Reject actions require a reason.');
  }

  const profileVersion = await getProfileVersion(profileVersionId);
  if (!profileVersion) {
    throw new OperatorMarketProfileActionError('Profile draft was not found.');
  }
  assertReviewable(profileVersion);

  const action = buildAction({
    profileVersion,
    actorUserId,
    action: 'reject',
    reason: trimmedReason,
    generatedAt,
    idFactory,
  });
  const rejected = await rejectVersion(profileVersion.id, action, {
    triggeredFrom: 'operator_market_profile_review',
  });

  return responseFor(rejected, action, generatedAt);
}

export async function rollbackOperatorMarketProfileVersion(
  profileVersionId: string,
  actorUserId: string,
  reason: string,
  deps: OperatorMarketProfileActionDeps = {},
): Promise<OperatorMarketProfileActionResponse> {
  const generatedAt = deps.now?.() ?? new Date().toISOString();
  const getProfileVersion = deps.getProfileVersion ?? getRoleMarketProfileVersion;
  const rollbackVersion = deps.rollbackVersion ?? rollbackRoleMarketProfileVersion;
  const idFactory = deps.idFactory ?? randomUUID;
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new OperatorMarketProfileActionError('Rollback actions require a reason.');
  }

  const profileVersion = await getProfileVersion(profileVersionId);
  if (!profileVersion) {
    throw new OperatorMarketProfileActionError('Profile version was not found.');
  }
  assertRollbackTarget(profileVersion);

  const action = buildAction({
    profileVersion,
    actorUserId,
    action: 'rollback',
    reason: trimmedReason,
    generatedAt,
    idFactory,
  });
  const rolledBack = await rollbackVersion(profileVersion.id, action, {
    triggeredFrom: 'operator_market_profile_rollback',
  });

  return responseFor(rolledBack, action, generatedAt);
}
