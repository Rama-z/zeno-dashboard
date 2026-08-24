CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    workspace_name VARCHAR(80) NOT NULL
);

INSERT INTO app_settings (singleton, workspace_name)
VALUES (TRUE, 'Default workspace')
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    display_name VARCHAR(80) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx
ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    token_hash CHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_expiry_idx
ON email_verification_tokens (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_sessions_user_expiry_idx
ON user_sessions (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS activity_events (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    subject_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(80) NOT NULL,
    actor_email TEXT NOT NULL,
    actor_role VARCHAR(20) NOT NULL,
    action VARCHAR(40) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(120),
    description VARCHAR(500) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_events_created_idx
ON activity_events (created_at DESC);

CREATE INDEX IF NOT EXISTS activity_events_user_created_idx
ON activity_events (user_id, created_at DESC);

ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS subject_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS activity_events_subject_created_idx ON activity_events (subject_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS learning_entries (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    learning_date DATE NOT NULL,
    title VARCHAR(160) NOT NULL,
    note VARCHAR(2000) NOT NULL,
    category VARCHAR(60) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE learning_entries
ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE learning_entries ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS learning_entries_owner_date_idx ON learning_entries (owner_user_id, learning_date DESC);

CREATE INDEX IF NOT EXISTS learning_entries_date_created_idx
ON learning_entries (learning_date, created_at DESC);

CREATE TABLE IF NOT EXISTS doing_entries (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    doing_date DATE NOT NULL,
    title VARCHAR(160) NOT NULL,
    note VARCHAR(2000) NOT NULL,
    category VARCHAR(60) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS doing_entries_date_created_idx
ON doing_entries (doing_date, created_at DESC);

ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS doing_entries_owner_date_idx ON doing_entries (owner_user_id, doing_date DESC);

CREATE TABLE IF NOT EXISTS workout_entries (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    workout_date DATE NOT NULL,
    exercise VARCHAR(160) NOT NULL,
    category VARCHAR(60) NOT NULL,
    sets INTEGER NOT NULL DEFAULT 0 CHECK (sets >= 0),
    reps INTEGER NOT NULL DEFAULT 0 CHECK (reps >= 0),
    duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
    note VARCHAR(2000) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workout_entries_date_created_idx
ON workout_entries (workout_date, created_at DESC);

ALTER TABLE workout_entries ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS workout_entries_owner_date_idx ON workout_entries (owner_user_id, workout_date DESC);

CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    journal_date DATE NOT NULL,
    title VARCHAR(160) NOT NULL,
    content TEXT NOT NULL,
    mood VARCHAR(30) NOT NULL,
    tags VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS journal_entries_date_updated_idx
ON journal_entries (journal_date DESC, updated_at DESC);

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS journal_entries_owner_date_idx ON journal_entries (owner_user_id, journal_date DESC);

CREATE TABLE IF NOT EXISTS spending_entries (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    spending_date DATE NOT NULL,
    description VARCHAR(160) NOT NULL,
    category VARCHAR(60) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(60) NOT NULL,
    note VARCHAR(2000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS spending_entries_date_created_idx
ON spending_entries (spending_date DESC, created_at DESC);

ALTER TABLE spending_entries ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS spending_entries_owner_date_idx ON spending_entries (owner_user_id, spending_date DESC);

CREATE TABLE IF NOT EXISTS change_log_entries (
    id VARCHAR(120) PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL,
    title VARCHAR(160) NOT NULL,
    description VARCHAR(2000) NOT NULL,
    category VARCHAR(60) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS change_log_entries_occurred_idx
ON change_log_entries (occurred_at DESC, id DESC);

INSERT INTO schema_migrations (version) VALUES (15)
ON CONFLICT (version) DO NOTHING;
