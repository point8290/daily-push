CREATE TABLE IF NOT EXISTS role_taxonomy_roles (
  id                VARCHAR(160) PRIMARY KEY,
  slug              VARCHAR(200) UNIQUE NOT NULL,
  title             VARCHAR(500) NOT NULL,
  category          VARCHAR(40) NOT NULL,
  role_type         VARCHAR(24) NOT NULL
                      CHECK (role_type IN ('existing', 'emerging', 'evolving')),
  aliases           JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_role_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_refs       JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence        SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  contract_meta     JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_taxonomy_roles_category
  ON role_taxonomy_roles(category, role_type);

CREATE TABLE IF NOT EXISTS role_taxonomy_aliases (
  id                VARCHAR(200) PRIMARY KEY,
  role_id           VARCHAR(160) NOT NULL REFERENCES role_taxonomy_roles(id) ON DELETE CASCADE,
  alias             VARCHAR(500) NOT NULL,
  normalized_alias  VARCHAR(500) UNIQUE NOT NULL,
  source_type       VARCHAR(24) NOT NULL
                      CHECK (source_type IN ('curated_seed', 'operator', 'live_source')),
  confidence        SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  added_by          VARCHAR(240),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_taxonomy_aliases_role
  ON role_taxonomy_aliases(role_id);

CREATE TABLE IF NOT EXISTS skill_taxonomy_items (
  id                 VARCHAR(160) PRIMARY KEY,
  slug               VARCHAR(200) UNIQUE NOT NULL,
  canonical_label    VARCHAR(500) NOT NULL,
  categories         JSONB NOT NULL DEFAULT '[]'::jsonb,
  aliases            JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_skill_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_refs        JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence         SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  contract_meta      JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_taxonomy_items_label
  ON skill_taxonomy_items(canonical_label);

CREATE TABLE IF NOT EXISTS skill_taxonomy_aliases (
  id                VARCHAR(200) PRIMARY KEY,
  skill_id          VARCHAR(160) NOT NULL REFERENCES skill_taxonomy_items(id) ON DELETE CASCADE,
  alias             VARCHAR(500) NOT NULL,
  normalized_alias  VARCHAR(500) UNIQUE NOT NULL,
  source_type       VARCHAR(24) NOT NULL
                      CHECK (source_type IN ('curated_seed', 'operator', 'live_source')),
  confidence        SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  added_by          VARCHAR(240),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skill_taxonomy_aliases_skill
  ON skill_taxonomy_aliases(skill_id);
