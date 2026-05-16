CREATE TABLE IF NOT EXISTS billing_customers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider              VARCHAR(32) NOT NULL DEFAULT 'manual'
                          CHECK (provider IN ('manual', 'stripe')),
  provider_customer_id  VARCHAR(255),
  email                 VARCHAR(255),
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_customers_provider_customer
  ON billing_customers(provider, provider_customer_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  billing_customer_id       UUID REFERENCES billing_customers(id) ON DELETE SET NULL,
  provider                  VARCHAR(32) NOT NULL DEFAULT 'manual'
                              CHECK (provider IN ('manual', 'stripe')),
  provider_subscription_id  VARCHAR(255),
  plan_key                  VARCHAR(64) NOT NULL,
  status                    VARCHAR(32) NOT NULL
                              CHECK (status IN (
                                'trialing',
                                'active',
                                'past_due',
                                'canceled',
                                'incomplete',
                                'incomplete_expired',
                                'unpaid'
                              )),
  interval_key              VARCHAR(16) NOT NULL DEFAULT 'month'
                              CHECK (interval_key IN ('month', 'year', 'lifetime')),
  current_period_start      TIMESTAMPTZ,
  current_period_end        TIMESTAMPTZ,
  cancel_at_period_end      BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at               TIMESTAMPTZ,
  trial_ends_at             TIMESTAMPTZ,
  metadata                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_subscription
  ON subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON subscriptions(user_id, status, current_period_end DESC);

CREATE TABLE IF NOT EXISTS usage_events (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id  UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  feature_key      VARCHAR(120) NOT NULL,
  quantity         INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  source           VARCHAR(80) NOT NULL DEFAULT 'app',
  period_key       VARCHAR(32),
  properties       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_feature_created
  ON usage_events(user_id, feature_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_subscription_id
  ON usage_events(subscription_id);

CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  billing_customer_id   UUID REFERENCES billing_customers(id) ON DELETE SET NULL,
  provider              VARCHAR(32) NOT NULL DEFAULT 'manual'
                          CHECK (provider IN ('manual', 'stripe')),
  provider_session_id   VARCHAR(255),
  plan_key              VARCHAR(64) NOT NULL,
  interval_key          VARCHAR(16) NOT NULL DEFAULT 'month'
                          CHECK (interval_key IN ('month', 'year', 'lifetime')),
  status                VARCHAR(32) NOT NULL DEFAULT 'created'
                          CHECK (status IN ('created', 'completed', 'expired', 'canceled')),
  checkout_url          TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_checkout_provider_session
  ON billing_checkout_sessions(provider, provider_session_id)
  WHERE provider_session_id IS NOT NULL;
