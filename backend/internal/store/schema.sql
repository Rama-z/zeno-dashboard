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
    status VARCHAR(16) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'blocked', 'done')),
    priority VARCHAR(16) NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    time_block_start VARCHAR(5) NOT NULL DEFAULT '' CHECK (time_block_start = '' OR time_block_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    time_block_end VARCHAR(5) NOT NULL DEFAULT '' CHECK (time_block_end = '' OR time_block_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
    actual_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_minutes >= 0),
    note VARCHAR(2000) NOT NULL,
    category VARCHAR(60) NOT NULL,
    project VARCHAR(160) NOT NULL DEFAULT '',
    goal_outcome VARCHAR(500) NOT NULL DEFAULT '',
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    energy_focus VARCHAR(16) NOT NULL DEFAULT 'medium' CHECK (energy_focus IN ('deep', 'medium', 'light')),
    dependency VARCHAR(500) NOT NULL DEFAULT '',
    blocked_by VARCHAR(500) NOT NULL DEFAULT '',
    carry_over BOOLEAN NOT NULL DEFAULT FALSE,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS doing_entries_date_created_idx
ON doing_entries (doing_date, created_at DESC);

ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'blocked', 'done'));
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low'));
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS time_block_start VARCHAR(5) NOT NULL DEFAULT '' CHECK (time_block_start = '' OR time_block_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS time_block_end VARCHAR(5) NOT NULL DEFAULT '' CHECK (time_block_end = '' OR time_block_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0);
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS actual_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_minutes >= 0);
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS project VARCHAR(160) NOT NULL DEFAULT '';
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS goal_outcome VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100);
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS energy_focus VARCHAR(16) NOT NULL DEFAULT 'medium' CHECK (energy_focus IN ('deep', 'medium', 'light'));
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS dependency VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS blocked_by VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS carry_over BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
UPDATE doing_entries SET status = 'done' WHERE completed AND status <> 'done';
UPDATE doing_entries SET completed = (status = 'done');
UPDATE doing_entries SET completed_at = COALESCE(completed_at, created_at) WHERE status = 'done';
UPDATE doing_entries SET completed_at = NULL WHERE status <> 'done';
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'doing_entries_time_block_check'
          AND conrelid = 'doing_entries'::regclass
    ) THEN
        ALTER TABLE doing_entries ADD CONSTRAINT doing_entries_time_block_check
            CHECK ((time_block_start = '' AND time_block_end = '') OR (time_block_start <> '' AND time_block_end <> '' AND time_block_start < time_block_end));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'doing_entries_completion_status_check'
          AND conrelid = 'doing_entries'::regclass
    ) THEN
        ALTER TABLE doing_entries ADD CONSTRAINT doing_entries_completion_status_check
            CHECK (completed = (status = 'done'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS doing_entries_owner_date_idx ON doing_entries (owner_user_id, doing_date DESC);

-- Additive Complete Workspace projection on the SAME row used by legacy Overview.
-- Existing rows, IDs, owner, status, creation time and every old column remain intact.
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS workspace_data JSONB;
ALTER TABLE doing_entries ADD COLUMN IF NOT EXISTS workspace_updated_at TIMESTAMPTZ;
ALTER TABLE doing_entries ALTER COLUMN doing_date DROP NOT NULL;
ALTER TABLE doing_entries ALTER COLUMN note TYPE TEXT;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='doing_entries_note_length_check' AND conrelid='doing_entries'::regclass) THEN
        ALTER TABLE doing_entries ADD CONSTRAINT doing_entries_note_length_check CHECK (char_length(note) <= 20000);
    END IF;
END $$;
UPDATE doing_entries SET workspace_data = jsonb_build_object(
    'title', title, 'area', category,
    'project', project, 'type', '',
    'status', CASE status WHEN 'doing' THEN 'In progress' WHEN 'blocked' THEN 'Blocked' WHEN 'done' THEN 'Done' ELSE 'Ready' END,
    'priority', CASE priority WHEN 'high' THEN 'P1' WHEN 'low' THEN 'P3' ELSE 'P2' END,
    'urgency', '', 'impact', '', 'effort', '',
    'energy', '', 'focus', CASE energy_focus WHEN 'deep' THEN 'Deep' WHEN 'light' THEN 'Light' ELSE 'Moderate' END,
    'duration', jsonb_build_object('minMinutes', CASE WHEN estimated_minutes > 0 THEN LEAST(estimated_minutes,240) ELSE 15 END,
                                   'maxMinutes', CASE WHEN estimated_minutes > 0 THEN LEAST(estimated_minutes,240) ELSE 30 END,
                                   'label', CASE WHEN estimated_minutes > 0 THEN LEAST(estimated_minutes,240)::text || '–' || LEAST(estimated_minutes,240)::text || ' minutes' ELSE '15–30 minutes' END),
    'context', '', 'device', '', 'location', '', 'timePreference', '',
    'difficulty', '', 'resistance', '', 'due', NULL,
    'nextAction', '', 'definitionOfDone', '[]'::jsonb,
    'plannedDate', doing_date::text, 'notes',note, 'legacy',true,
    'legacyMetadata', jsonb_build_object('doingDate',doing_date::text,'category',category,'goalOutcome',goal_outcome,
        'actualMinutes',actual_minutes,'timeBlockStart',time_block_start,'timeBlockEnd',time_block_end,
        'dependency',dependency,'blockedBy',blocked_by,'carryOver',carry_over,'progress',progress,'completed',completed)
) WHERE workspace_data IS NULL;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='doing_entries_workspace_data_object_check' AND conrelid='doing_entries'::regclass) THEN
        ALTER TABLE doing_entries ADD CONSTRAINT doing_entries_workspace_data_object_check CHECK (workspace_data IS NULL OR jsonb_typeof(workspace_data) = 'object');
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='doing_entries_workspace_shape_check' AND conrelid='doing_entries'::regclass) THEN
        ALTER TABLE doing_entries ADD CONSTRAINT doing_entries_workspace_shape_check CHECK (
            workspace_data IS NULL OR (
                COALESCE(jsonb_typeof(workspace_data->'duration')='object',false)
                AND COALESCE(jsonb_typeof(workspace_data->'definitionOfDone')='array',false)
                AND COALESCE(jsonb_typeof(workspace_data->'notes')='string',false)
                AND COALESCE((workspace_data->'duration'->>'minMinutes') ~ '^[0-9]{1,3}$',false)
                AND COALESCE((workspace_data->'duration'->>'maxMinutes') ~ '^[0-9]{1,3}$',false)
                AND (workspace_data->'duration'->>'minMinutes')::integer BETWEEN 1 AND 240
                AND (workspace_data->'duration'->>'maxMinutes')::integer BETWEEN (workspace_data->'duration'->>'minMinutes')::integer AND 240
                AND COALESCE(jsonb_typeof(workspace_data->'due') IN ('null','string'),false)
                AND COALESCE(jsonb_typeof(workspace_data->'plannedDate') IN ('null','string'),false)
            ));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS workout_entries (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    workout_date DATE NOT NULL,
    material_id VARCHAR(120) NULL,
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
ALTER TABLE workout_entries ADD COLUMN IF NOT EXISTS material_id VARCHAR(120) NULL;
CREATE INDEX IF NOT EXISTS workout_entries_owner_date_idx ON workout_entries (owner_user_id, workout_date DESC);

CREATE TABLE IF NOT EXISTS workout_sessions (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    workout_date DATE NOT NULL,
    local_time TIME,
    timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Jakarta',
    status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'partial', 'skipped')),
    estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
    started_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    paused_seconds INTEGER NOT NULL DEFAULT 0 CHECK (paused_seconds >= 0),
    ended_at TIMESTAMPTZ,
    rest_timer_ends_at TIMESTAMPTZ,
    rest_timer_paused_remaining_seconds INTEGER CHECK (rest_timer_paused_remaining_seconds IS NULL OR rest_timer_paused_remaining_seconds >= 0),
    location VARCHAR(160) NOT NULL DEFAULT '',
    note VARCHAR(2000) NOT NULL DEFAULT '',
    template_id UUID,
    legacy_workout_entry_id UUID UNIQUE REFERENCES workout_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE workout_sessions ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_legacy_workout_entry_id_fkey;
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_legacy_workout_entry_id_fkey
FOREIGN KEY (legacy_workout_entry_id) REFERENCES workout_entries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS workout_sessions_owner_date_idx
ON workout_sessions (owner_user_id, workout_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS workout_movements (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    material_id VARCHAR(120),
    custom BOOLEAN NOT NULL DEFAULT TRUE,
    name VARCHAR(160) NOT NULL,
    exercise_type VARCHAR(20) NOT NULL CHECK (exercise_type IN ('strength', 'bodyweight', 'cardio', 'mobility', 'interval')),
    position INTEGER NOT NULL CHECK (position >= 1),
    equipment JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(equipment) = 'array'),
    muscle_groups JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(muscle_groups) = 'array'),
    target JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(target) = 'object'),
    rest_seconds INTEGER CHECK (rest_seconds IS NULL OR rest_seconds >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'skipped')),
    note VARCHAR(2000) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, position)
);

CREATE INDEX IF NOT EXISTS workout_movements_session_position_idx
ON workout_movements (session_id, position);
CREATE INDEX IF NOT EXISTS workout_movements_material_idx
ON workout_movements (material_id) WHERE material_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS workout_sets (
    id UUID PRIMARY KEY,
    movement_id UUID NOT NULL REFERENCES workout_movements(id) ON DELETE CASCADE,
    set_number INTEGER NOT NULL CHECK (set_number >= 1),
    target JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(target) = 'object'),
    actual JSONB CHECK (actual IS NULL OR jsonb_typeof(actual) = 'object'),
    status VARCHAR(20) NOT NULL DEFAULT 'unrecorded' CHECK (status IN ('unrecorded', 'completed', 'skipped')),
    recorded_at TIMESTAMPTZ,
    rpe NUMERIC(3,1) CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),
    UNIQUE (movement_id, set_number)
);

CREATE INDEX IF NOT EXISTS workout_sets_movement_number_idx
ON workout_sets (movement_id, set_number);

CREATE TABLE IF NOT EXISTS workout_templates (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    movements JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(movements) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE workout_templates ALTER COLUMN owner_user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS workout_templates_owner_updated_idx
ON workout_templates (owner_user_id, updated_at DESC);

-- Legacy mapping: one old row represented one movement, so it becomes one
-- session with one movement. Planned targets are snapshotted; actual stays NULL.
INSERT INTO workout_sessions (
    id, owner_user_id, name, workout_date, timezone, status, estimated_minutes,
    location, note, legacy_workout_entry_id, created_at, updated_at
)
SELECT id, owner_user_id, exercise, workout_date, 'Asia/Jakarta',
       CASE WHEN completed THEN 'completed' ELSE 'planned' END,
       duration_minutes, '', note, id, created_at, created_at
FROM workout_entries
ON CONFLICT (id) DO NOTHING;

INSERT INTO workout_movements (
    id, session_id, material_id, custom, name, exercise_type, position,
    equipment, muscle_groups, target, rest_seconds, status, note, created_at
)
SELECT id, id, material_id, material_id IS NULL, exercise,
       CASE LOWER(category)
           WHEN 'strength' THEN 'strength'
           WHEN 'cardio' THEN 'cardio'
           WHEN 'mobility' THEN 'mobility'
           WHEN 'recovery' THEN 'mobility'
           ELSE 'bodyweight'
       END,
       1, '[]'::jsonb, '[]'::jsonb,
       jsonb_strip_nulls(jsonb_build_object(
           'setCount', NULLIF(sets, 0),
           'reps', NULLIF(reps, 0),
           'durationMinutes', NULLIF(duration_minutes, 0)
       )),
       NULL, CASE WHEN completed THEN 'completed' ELSE 'planned' END, note, created_at
FROM workout_entries
ON CONFLICT (id) DO NOTHING;

INSERT INTO workout_sets (id, movement_id, set_number, target, actual, status, recorded_at, rpe)
SELECT md5(w.id::text || ':set:' || generated.set_number::text)::uuid,
       w.id, generated.set_number,
       jsonb_strip_nulls(jsonb_build_object('reps', NULLIF(w.reps, 0))),
       NULL, 'unrecorded', NULL, NULL
FROM workout_entries w
CROSS JOIN LATERAL generate_series(1, w.sets) AS generated(set_number)
ON CONFLICT (movement_id, set_number) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES (18)
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY,
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    journal_date DATE NOT NULL,
    title VARCHAR(160) NOT NULL,
    content TEXT NOT NULL,
    mood VARCHAR(30) NOT NULL,
    tags VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latest_revision_number INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT journal_entries_latest_revision_number_check CHECK (latest_revision_number >= 1)
);

CREATE INDEX IF NOT EXISTS journal_entries_date_updated_idx
ON journal_entries (journal_date DESC, updated_at DESC);

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS journal_entries_owner_date_idx ON journal_entries (owner_user_id, journal_date DESC);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS latest_revision_number INTEGER NOT NULL DEFAULT 1;
UPDATE journal_entries SET latest_revision_number = 1 WHERE latest_revision_number IS NULL;
ALTER TABLE journal_entries ALTER COLUMN latest_revision_number SET DEFAULT 1;
ALTER TABLE journal_entries ALTER COLUMN latest_revision_number SET NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'journal_entries_latest_revision_number_check'
          AND conrelid = 'journal_entries'::regclass
    ) THEN
        ALTER TABLE journal_entries
            ADD CONSTRAINT journal_entries_latest_revision_number_check CHECK (latest_revision_number >= 1);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS journal_revisions (
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL,
    journal_date DATE NOT NULL,
    title VARCHAR(160) NOT NULL,
    content TEXT NOT NULL,
    mood VARCHAR(30) NOT NULL,
    tags VARCHAR(500) NOT NULL,
    edit_reason VARCHAR(40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (journal_entry_id, revision_number),
    CONSTRAINT journal_revisions_number_check CHECK (revision_number >= 1),
    CONSTRAINT journal_revisions_reason_check CHECK (edit_reason IS NULL OR edit_reason IN ('typo', 'clarify', 'incorrect_information', 'changed_my_mind')),
    CONSTRAINT journal_revisions_original_reason_check CHECK ((revision_number = 1 AND edit_reason IS NULL) OR (revision_number > 1 AND edit_reason IS NOT NULL))
);

CREATE OR REPLACE FUNCTION prevent_journal_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- PostgreSQL's ON DELETE CASCADE invokes child triggers at a deeper depth;
    -- allow that intentional purge while rejecting direct row mutation.
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'journal revisions are immutable';
END;
$$;

DROP TRIGGER IF EXISTS journal_revisions_immutable_trigger ON journal_revisions;
CREATE TRIGGER journal_revisions_immutable_trigger
BEFORE UPDATE OR DELETE ON journal_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_journal_revision_mutation();

INSERT INTO journal_revisions (journal_entry_id, revision_number, journal_date, title, content, mood, tags, edit_reason, created_at)
SELECT id, 1, journal_date, title, content, mood, tags, NULL, created_at
FROM journal_entries
ON CONFLICT (journal_entry_id, revision_number) DO NOTHING;

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

CREATE TABLE IF NOT EXISTS learning_materials (
    id VARCHAR(120) PRIMARY KEY,
    subject_id VARCHAR(120) NOT NULL,
    subject_title VARCHAR(160) NOT NULL,
    category_id VARCHAR(120) NOT NULL,
    category_title VARCHAR(160) NOT NULL,
    topic_id VARCHAR(120) NOT NULL,
    topic_title VARCHAR(160) NOT NULL,
    locale VARCHAR(20) NOT NULL,
    cefr_level VARCHAR(2) NOT NULL CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1')),
    coverage_mode VARCHAR(20) NOT NULL CHECK (coverage_mode IN ('lesson', 'awareness', 'planned')),
    title VARCHAR(200) NOT NULL,
    summary VARCHAR(2000) NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence >= 1),
    position_within_topic INTEGER NOT NULL CHECK (position_within_topic >= 1),
    estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes >= 1),
    schema_version VARCHAR(30) NOT NULL,
    content_version INTEGER NOT NULL CHECK (content_version >= 1),
    prerequisites JSONB NOT NULL DEFAULT '[]'::jsonb,
    revisits JSONB NOT NULL DEFAULT '[]'::jsonb,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    mastery JSONB NOT NULL DEFAULT '{}'::jsonb,
    review JSONB NOT NULL DEFAULT '{}'::jsonb,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT learning_materials_published_planned_check CHECK (NOT published OR coverage_mode <> 'planned'),
    CONSTRAINT learning_materials_prerequisites_array_check CHECK (jsonb_typeof(prerequisites) = 'array'),
    CONSTRAINT learning_materials_revisits_array_check CHECK (jsonb_typeof(revisits) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS learning_materials_subject_category_sequence_idx
ON learning_materials (subject_id, category_id, sequence);

CREATE UNIQUE INDEX IF NOT EXISTS learning_materials_topic_level_position_idx
ON learning_materials (topic_id, cefr_level, position_within_topic);

CREATE INDEX IF NOT EXISTS learning_materials_published_catalogue_idx
ON learning_materials (subject_id, category_id, published, cefr_level, sequence);

CREATE TABLE IF NOT EXISTS learning_topic_progress (
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_id VARCHAR(120) NOT NULL REFERENCES learning_materials(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('in_progress', 'mastered')),
    mastery_score INTEGER CHECK (mastery_score IS NULL OR (mastery_score >= 0 AND mastery_score <= 100)),
    objective_state JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(objective_state) = 'object'),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    content_version INTEGER NOT NULL CHECK (content_version >= 1),
    last_reviewed_at TIMESTAMPTZ,
    next_review_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_user_id, material_id)
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'learning_topic_progress_material_id_fkey'
          AND conrelid = 'learning_topic_progress'::regclass
    ) THEN
        ALTER TABLE learning_topic_progress
            DROP CONSTRAINT learning_topic_progress_material_id_fkey;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'learning_topic_progress_material_fk'
          AND conrelid = 'learning_topic_progress'::regclass
    ) THEN
        ALTER TABLE learning_topic_progress
            ADD CONSTRAINT learning_topic_progress_material_fk
            FOREIGN KEY (material_id) REFERENCES learning_materials(id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS learning_topic_progress_owner_review_idx
ON learning_topic_progress (owner_user_id, next_review_at);

CREATE INDEX IF NOT EXISTS learning_topic_progress_material_idx
ON learning_topic_progress (material_id);

INSERT INTO schema_migrations (version) VALUES (15)
ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES (16)
ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES (17)
ON CONFLICT (version) DO NOTHING;
