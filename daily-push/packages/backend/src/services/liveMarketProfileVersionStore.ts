import {
  validateMarketReviewAction,
  validateRoleMarketProfileVersion,
  type ContractMeta,
  type MarketProfileDiff,
  type MarketProfileValidationResult,
  type MarketReviewAction,
  type RoleMarketProfile,
  type RoleMarketProfileVersion,
  type RoleMarketProfileVersionStatus,
  type SourceMode,
  type SourceReference,
} from '@daily-push/shared';
import { pool } from '../db/postgres';

type JsonObject = Record<string, unknown>;
type PublishValidationCallback = (profileVersion: RoleMarketProfileVersion) => MarketProfileValidationResult;

interface RoleMarketProfileVersionRow {
  id: string;
  role_profile_id: string;
  version: number;
  status: RoleMarketProfileVersionStatus;
  source_mode: SourceMode;
  profile_json: RoleMarketProfile;
  aggregate_id: string | null;
  previous_version_id: string | null;
  source_refs: SourceReference[];
  change_summary: string;
  profile_diff: MarketProfileDiff | null;
  validation_result: MarketProfileValidationResult | null;
  created_by: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  rollback_of_version_id: string | null;
  contract_meta: ContractMeta;
}

interface MarketReviewActionRow {
  id: string;
  profile_version_id: string;
  action: MarketReviewAction['action'];
  actor_user_id: string;
  reason: string;
  before_status: RoleMarketProfileVersionStatus;
  after_status: RoleMarketProfileVersionStatus;
  contract_meta: ContractMeta;
  created_at: string;
}

export class LiveMarketProfileVersionStoreError extends Error {
  statusCode = 400;

  code = 'validation_error';
}

function assertValidProfileVersion(profileVersion: RoleMarketProfileVersion): void {
  const validation = validateRoleMarketProfileVersion(profileVersion);
  if (!validation.valid) {
    throw new LiveMarketProfileVersionStoreError(validation.errors.join('; '));
  }

  if (profileVersion.status === 'published') {
    assertPublishable(profileVersion);
  }
}

function assertValidReviewAction(action: MarketReviewAction): void {
  const validation = validateMarketReviewAction(action);
  if (!validation.valid) {
    throw new LiveMarketProfileVersionStoreError(validation.errors.join('; '));
  }
}

function assertPublishable(profileVersion: RoleMarketProfileVersion): void {
  const validationResult = profileVersion.validationResult;
  if (!validationResult || !validationResult.canPublish || validationResult.status === 'blocked') {
    throw new LiveMarketProfileVersionStoreError(
      'Published role market profile versions require a passing validation result.',
    );
  }

  const blockers = validationResult.findings.filter((finding) => finding.severity === 'blocker');
  if (blockers.length > 0) {
    throw new LiveMarketProfileVersionStoreError(
      `Published role market profile versions cannot have blocker findings: ${blockers
        .map((finding) => finding.code)
        .join(', ')}`,
    );
  }
}

function mapProfileVersion(row: RoleMarketProfileVersionRow): RoleMarketProfileVersion {
  return {
    id: row.id,
    roleProfileId: row.role_profile_id,
    version: row.version,
    status: row.status,
    sourceMode: row.source_mode,
    profile: row.profile_json,
    aggregateId: row.aggregate_id,
    previousVersionId: row.previous_version_id,
    sourceRefs: row.source_refs,
    changeSummary: row.change_summary,
    profileDiff: row.profile_diff,
    validationResult: row.validation_result,
    createdBy: row.created_by,
    createdAt: row.created_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    rollbackOfVersionId: row.rollback_of_version_id,
    meta: row.contract_meta,
  };
}

function mapReviewAction(row: MarketReviewActionRow): MarketReviewAction {
  return {
    id: row.id,
    profileVersionId: row.profile_version_id,
    action: row.action,
    actorUserId: row.actor_user_id,
    reason: row.reason,
    beforeStatus: row.before_status,
    afterStatus: row.after_status,
    createdAt: row.created_at,
    meta: row.contract_meta,
  };
}

export async function upsertRoleMarketProfileVersion(
  profileVersion: RoleMarketProfileVersion,
  metadata: JsonObject = {},
): Promise<RoleMarketProfileVersion> {
  assertValidProfileVersion(profileVersion);

  const { rows } = await pool.query<RoleMarketProfileVersionRow>(
    `INSERT INTO role_market_profile_versions
       (id,
        role_profile_id,
        version,
        status,
        source_mode,
        profile_json,
        aggregate_id,
        previous_version_id,
        source_refs,
        change_summary,
        profile_diff,
        validation_result,
        created_by,
        created_at,
        reviewed_by,
        reviewed_at,
        published_at,
        rollback_of_version_id,
        contract_meta,
        metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, $18, $19::jsonb, $20::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       source_mode = EXCLUDED.source_mode,
       profile_json = EXCLUDED.profile_json,
       aggregate_id = EXCLUDED.aggregate_id,
       previous_version_id = EXCLUDED.previous_version_id,
       source_refs = EXCLUDED.source_refs,
       change_summary = EXCLUDED.change_summary,
       profile_diff = EXCLUDED.profile_diff,
       validation_result = EXCLUDED.validation_result,
       reviewed_by = EXCLUDED.reviewed_by,
       reviewed_at = EXCLUDED.reviewed_at,
       published_at = EXCLUDED.published_at,
       rollback_of_version_id = EXCLUDED.rollback_of_version_id,
       contract_meta = EXCLUDED.contract_meta,
       metadata = role_market_profile_versions.metadata || EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id,
               role_profile_id,
               version,
               status,
               source_mode,
               profile_json,
               aggregate_id,
               previous_version_id,
               source_refs,
               change_summary,
               profile_diff,
               validation_result,
               created_by,
               created_at::text,
               reviewed_by,
               reviewed_at::text,
               published_at::text,
               rollback_of_version_id,
               contract_meta`,
    [
      profileVersion.id,
      profileVersion.roleProfileId,
      profileVersion.version,
      profileVersion.status,
      profileVersion.sourceMode,
      JSON.stringify(profileVersion.profile),
      profileVersion.aggregateId,
      profileVersion.previousVersionId,
      JSON.stringify(profileVersion.sourceRefs),
      profileVersion.changeSummary,
      profileVersion.profileDiff === null ? null : JSON.stringify(profileVersion.profileDiff),
      profileVersion.validationResult === null
        ? null
        : JSON.stringify(profileVersion.validationResult),
      profileVersion.createdBy,
      profileVersion.createdAt,
      profileVersion.reviewedBy,
      profileVersion.reviewedAt,
      profileVersion.publishedAt,
      profileVersion.rollbackOfVersionId,
      JSON.stringify(profileVersion.meta),
      JSON.stringify(metadata),
    ],
  );

  if (!rows[0]) throw new Error('Role market profile version could not be saved.');
  const saved = mapProfileVersion(rows[0]);
  assertValidProfileVersion(saved);
  return saved;
}

export async function recordMarketReviewAction(
  action: MarketReviewAction,
  metadata: JsonObject = {},
): Promise<MarketReviewAction> {
  assertValidReviewAction(action);

  const { rows } = await pool.query<MarketReviewActionRow>(
    `INSERT INTO role_market_publish_audit
       (id,
        profile_version_id,
        action,
        actor_user_id,
        reason,
        before_status,
        after_status,
        contract_meta,
        metadata,
        created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
     RETURNING id,
               profile_version_id,
               action,
               actor_user_id,
               reason,
               before_status,
               after_status,
               contract_meta,
               created_at::text`,
    [
      action.id,
      action.profileVersionId,
      action.action,
      action.actorUserId,
      action.reason,
      action.beforeStatus,
      action.afterStatus,
      JSON.stringify(action.meta),
      JSON.stringify(metadata),
      action.createdAt,
    ],
  );

  if (!rows[0]) throw new Error('Market review action could not be recorded.');
  return mapReviewAction(rows[0]);
}

export async function publishRoleMarketProfileVersion(
  profileVersionId: string,
  action: MarketReviewAction,
  metadata: JsonObject = {},
  validateBeforePublish?: PublishValidationCallback,
): Promise<RoleMarketProfileVersion> {
  assertValidReviewAction(action);

  if (action.profileVersionId !== profileVersionId || action.action !== 'publish') {
    throw new LiveMarketProfileVersionStoreError(
      'Publish actions must target the requested profile version and use action=publish.',
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query<RoleMarketProfileVersionRow>(
      profileVersionSelectSql('WHERE id = $1 FOR UPDATE'),
      [profileVersionId],
    );

    if (!existingRows[0]) {
      throw new Error('Role market profile version was not found.');
    }

    const existing = mapProfileVersion(existingRows[0]);
    const validationResult = validateBeforePublish?.(existing) ?? existing.validationResult;
    assertPublishable({
      ...existing,
      validationResult,
      status: 'published',
      publishedAt: action.createdAt,
      reviewedBy: action.actorUserId,
      reviewedAt: action.createdAt,
    });

    if (action.beforeStatus !== existing.status || action.afterStatus !== 'published') {
      throw new LiveMarketProfileVersionStoreError(
        'Publish audit action status transition does not match the stored profile version.',
      );
    }
    if (existing.status !== 'draft' && existing.status !== 'in_review') {
      throw new LiveMarketProfileVersionStoreError('Only draft or in-review profile versions can be published.');
    }

    await client.query(
      `UPDATE role_market_profile_versions
          SET status = 'archived',
              updated_at = NOW()
        WHERE role_profile_id = $1
          AND status = 'published'
          AND id <> $2`,
      [existing.roleProfileId, profileVersionId],
    );

    const { rows: publishedRows } = await client.query<RoleMarketProfileVersionRow>(
      `UPDATE role_market_profile_versions
          SET status = 'published',
              reviewed_by = $2,
              reviewed_at = $3,
              published_at = $3,
              validation_result = $4::jsonb,
              updated_at = NOW()
        WHERE id = $1
      RETURNING id,
                role_profile_id,
                version,
                status,
                source_mode,
                profile_json,
                aggregate_id,
                previous_version_id,
                source_refs,
                change_summary,
                profile_diff,
                validation_result,
                created_by,
                created_at::text,
                reviewed_by,
                reviewed_at::text,
                published_at::text,
                rollback_of_version_id,
                contract_meta`,
      [profileVersionId, action.actorUserId, action.createdAt, JSON.stringify(validationResult)],
    );

    await client.query(
      `INSERT INTO role_market_publish_audit
         (id,
          profile_version_id,
          action,
          actor_user_id,
          reason,
          before_status,
          after_status,
          contract_meta,
          metadata,
          created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
      [
        action.id,
        action.profileVersionId,
        action.action,
        action.actorUserId,
        action.reason,
        action.beforeStatus,
        action.afterStatus,
        JSON.stringify(action.meta),
        JSON.stringify(metadata),
        action.createdAt,
      ],
    );

    await client.query('COMMIT');

    if (!publishedRows[0]) throw new Error('Role market profile version could not be published.');
    const published = mapProfileVersion(publishedRows[0]);
    assertValidProfileVersion(published);
    return published;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectRoleMarketProfileVersion(
  profileVersionId: string,
  action: MarketReviewAction,
  metadata: JsonObject = {},
): Promise<RoleMarketProfileVersion> {
  assertValidReviewAction(action);

  if (action.profileVersionId !== profileVersionId || action.action !== 'reject') {
    throw new LiveMarketProfileVersionStoreError(
      'Reject actions must target the requested profile version and use action=reject.',
    );
  }
  if (action.afterStatus !== 'rejected') {
    throw new LiveMarketProfileVersionStoreError('Reject actions must transition to rejected status.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query<RoleMarketProfileVersionRow>(
      profileVersionSelectSql('WHERE id = $1 FOR UPDATE'),
      [profileVersionId],
    );

    if (!existingRows[0]) {
      throw new Error('Role market profile version was not found.');
    }

    const existing = mapProfileVersion(existingRows[0]);
    if (action.beforeStatus !== existing.status) {
      throw new LiveMarketProfileVersionStoreError(
        'Reject audit action status transition does not match the stored profile version.',
      );
    }
    if (existing.status !== 'draft' && existing.status !== 'in_review') {
      throw new LiveMarketProfileVersionStoreError('Only draft or in-review profile versions can be rejected.');
    }
    if (!action.reason.trim()) {
      throw new LiveMarketProfileVersionStoreError('Reject actions require a reason.');
    }

    const { rows: rejectedRows } = await client.query<RoleMarketProfileVersionRow>(
      `UPDATE role_market_profile_versions
          SET status = 'rejected',
              reviewed_by = $2,
              reviewed_at = $3,
              published_at = NULL,
              updated_at = NOW()
        WHERE id = $1
      RETURNING id,
                role_profile_id,
                version,
                status,
                source_mode,
                profile_json,
                aggregate_id,
                previous_version_id,
                source_refs,
                change_summary,
                profile_diff,
                validation_result,
                created_by,
                created_at::text,
                reviewed_by,
                reviewed_at::text,
                published_at::text,
                rollback_of_version_id,
                contract_meta`,
      [profileVersionId, action.actorUserId, action.createdAt],
    );

    await client.query(
      `INSERT INTO role_market_publish_audit
         (id,
          profile_version_id,
          action,
          actor_user_id,
          reason,
          before_status,
          after_status,
          contract_meta,
          metadata,
          created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
      [
        action.id,
        action.profileVersionId,
        action.action,
        action.actorUserId,
        action.reason,
        action.beforeStatus,
        action.afterStatus,
        JSON.stringify(action.meta),
        JSON.stringify(metadata),
        action.createdAt,
      ],
    );

    await client.query('COMMIT');

    if (!rejectedRows[0]) throw new Error('Role market profile version could not be rejected.');
    const rejected = mapProfileVersion(rejectedRows[0]);
    assertValidProfileVersion(rejected);
    return rejected;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function rollbackRoleMarketProfileVersion(
  profileVersionId: string,
  action: MarketReviewAction,
  metadata: JsonObject = {},
): Promise<RoleMarketProfileVersion> {
  assertValidReviewAction(action);

  if (action.profileVersionId !== profileVersionId || action.action !== 'rollback') {
    throw new LiveMarketProfileVersionStoreError(
      'Rollback actions must target the requested profile version and use action=rollback.',
    );
  }
  if (action.afterStatus !== 'published') {
    throw new LiveMarketProfileVersionStoreError('Rollback actions must transition to published status.');
  }
  if (!action.reason.trim()) {
    throw new LiveMarketProfileVersionStoreError('Rollback actions require a reason.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: targetRows } = await client.query<RoleMarketProfileVersionRow>(
      profileVersionSelectSql('WHERE id = $1 FOR UPDATE'),
      [profileVersionId],
    );

    if (!targetRows[0]) {
      throw new Error('Role market profile version was not found.');
    }

    const target = mapProfileVersion(targetRows[0]);
    if (action.beforeStatus !== target.status) {
      throw new LiveMarketProfileVersionStoreError(
        'Rollback audit action status transition does not match the stored profile version.',
      );
    }
    if (target.status !== 'archived') {
      throw new LiveMarketProfileVersionStoreError('Only archived profile versions can be rolled back.');
    }
    assertPublishable({
      ...target,
      status: 'published',
      publishedAt: action.createdAt,
      reviewedBy: action.actorUserId,
      reviewedAt: action.createdAt,
    });

    const { rows: currentRows } = await client.query<RoleMarketProfileVersionRow>(
      profileVersionSelectSql(
        "WHERE role_profile_id = $1 AND status = 'published' AND id <> $2 ORDER BY published_at DESC LIMIT 1 FOR UPDATE",
      ),
      [target.roleProfileId, profileVersionId],
    );

    if (!currentRows[0]) {
      throw new LiveMarketProfileVersionStoreError(
        'Rollback requires a current published profile version to replace.',
      );
    }

    const currentPublished = mapProfileVersion(currentRows[0]);

    await client.query(
      `UPDATE role_market_profile_versions
          SET status = 'archived',
              updated_at = NOW()
        WHERE role_profile_id = $1
          AND status = 'published'
          AND id <> $2`,
      [target.roleProfileId, profileVersionId],
    );

    const { rows: rolledBackRows } = await client.query<RoleMarketProfileVersionRow>(
      `UPDATE role_market_profile_versions
          SET status = 'published',
              reviewed_by = $2,
              reviewed_at = $3,
              published_at = $3,
              rollback_of_version_id = $4,
              updated_at = NOW()
        WHERE id = $1
      RETURNING id,
                role_profile_id,
                version,
                status,
                source_mode,
                profile_json,
                aggregate_id,
                previous_version_id,
                source_refs,
                change_summary,
                profile_diff,
                validation_result,
                created_by,
                created_at::text,
                reviewed_by,
                reviewed_at::text,
                published_at::text,
                rollback_of_version_id,
                contract_meta`,
      [profileVersionId, action.actorUserId, action.createdAt, currentPublished.id],
    );

    await client.query(
      `INSERT INTO role_market_publish_audit
         (id,
          profile_version_id,
          action,
          actor_user_id,
          reason,
          before_status,
          after_status,
          contract_meta,
          metadata,
          created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
      [
        action.id,
        action.profileVersionId,
        action.action,
        action.actorUserId,
        action.reason,
        action.beforeStatus,
        action.afterStatus,
        JSON.stringify(action.meta),
        JSON.stringify({
          ...metadata,
          replacedProfileVersionId: currentPublished.id,
        }),
        action.createdAt,
      ],
    );

    await client.query('COMMIT');

    if (!rolledBackRows[0]) throw new Error('Role market profile version could not be rolled back.');
    const rolledBack = mapProfileVersion(rolledBackRows[0]);
    assertValidProfileVersion(rolledBack);
    return rolledBack;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getRoleMarketProfileVersion(
  profileVersionId: string,
): Promise<RoleMarketProfileVersion | null> {
  const { rows } = await pool.query<RoleMarketProfileVersionRow>(
    profileVersionSelectSql('WHERE id = $1'),
    [profileVersionId],
  );

  if (!rows[0]) return null;
  const profileVersion = mapProfileVersion(rows[0]);
  assertValidProfileVersion(profileVersion);
  return profileVersion;
}

export async function getPublishedRoleMarketProfileVersion(
  roleProfileId: string,
): Promise<RoleMarketProfileVersion | null> {
  const { rows } = await pool.query<RoleMarketProfileVersionRow>(
    profileVersionSelectSql("WHERE role_profile_id = $1 AND status = 'published' ORDER BY published_at DESC LIMIT 1"),
    [roleProfileId],
  );

  if (!rows[0]) return null;
  const profileVersion = mapProfileVersion(rows[0]);
  assertValidProfileVersion(profileVersion);
  return profileVersion;
}

export async function getLatestRoleMarketProfileVersionForRole(
  roleProfileId: string,
): Promise<RoleMarketProfileVersion | null> {
  const { rows } = await pool.query<RoleMarketProfileVersionRow>(
    profileVersionSelectSql('WHERE role_profile_id = $1 ORDER BY version DESC, created_at DESC LIMIT 1'),
    [roleProfileId],
  );

  if (!rows[0]) return null;
  const profileVersion = mapProfileVersion(rows[0]);
  assertValidProfileVersion(profileVersion);
  return profileVersion;
}

export async function listPublishedRoleMarketProfileVersions(): Promise<RoleMarketProfileVersion[]> {
  const { rows } = await pool.query<RoleMarketProfileVersionRow>(
    profileVersionSelectSql("WHERE status = 'published' ORDER BY published_at DESC"),
  );

  return rows.map((row) => {
    const profileVersion = mapProfileVersion(row);
    assertValidProfileVersion(profileVersion);
    return profileVersion;
  });
}

export async function listRoleMarketProfileVersionsByStatus(
  statuses: RoleMarketProfileVersionStatus[],
  limit = 50,
): Promise<RoleMarketProfileVersion[]> {
  if (statuses.length === 0) return [];

  const { rows } = await pool.query<RoleMarketProfileVersionRow>(
    profileVersionSelectSql('WHERE status = ANY($1::varchar[]) ORDER BY created_at DESC, version DESC LIMIT $2'),
    [statuses, Math.max(1, Math.min(200, limit))],
  );

  return rows.map((row) => {
    const profileVersion = mapProfileVersion(row);
    assertValidProfileVersion(profileVersion);
    return profileVersion;
  });
}

export async function listRoleMarketRollbackCandidateVersions(
  roleProfileId: string | null = null,
  limit = 50,
): Promise<RoleMarketProfileVersion[]> {
  const statuses: RoleMarketProfileVersionStatus[] = ['published', 'archived'];
  const boundedLimit = Math.max(1, Math.min(200, limit));
  const whereClause = roleProfileId
    ? 'WHERE role_profile_id = $1 AND status = ANY($2::varchar[])'
    : 'WHERE status = ANY($1::varchar[])';
  const values = roleProfileId ? [roleProfileId, statuses, boundedLimit] : [statuses, boundedLimit];
  const limitParam = roleProfileId ? '$3' : '$2';

  const { rows } = await pool.query<RoleMarketProfileVersionRow>(
    `${profileVersionSelectSql(whereClause)}
      ORDER BY role_profile_id,
               CASE WHEN status = 'published' THEN 0 ELSE 1 END,
               version DESC,
               published_at DESC NULLS LAST,
               created_at DESC
      LIMIT ${limitParam}`,
    values,
  );

  return rows.map((row) => {
    const profileVersion = mapProfileVersion(row);
    assertValidProfileVersion(profileVersion);
    return profileVersion;
  });
}

function profileVersionSelectSql(whereClause: string): string {
  return `
    SELECT id,
           role_profile_id,
           version,
           status,
           source_mode,
           profile_json,
           aggregate_id,
           previous_version_id,
           source_refs,
           change_summary,
           profile_diff,
           validation_result,
           created_by,
           created_at::text,
           reviewed_by,
           reviewed_at::text,
           published_at::text,
           rollback_of_version_id,
           contract_meta
      FROM role_market_profile_versions
      ${whereClause}
  `;
}
