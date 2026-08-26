package store

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"zeno-backend/internal/model"
)

//go:embed schema.sql
var migrations embed.FS

type Postgres struct{ pool *pgxpool.Pool }

func New(ctx context.Context, databaseURL string) (*Postgres, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	schema, err := migrations.ReadFile("schema.sql")
	if err != nil {
		pool.Close()
		return nil, err
	}
	connection, err := pool.Acquire(ctx)
	if err != nil {
		pool.Close()
		return nil, err
	}
	const migrationLockID int64 = 905153015
	if _, err := connection.Exec(ctx, `SELECT pg_advisory_lock($1)`, migrationLockID); err != nil {
		connection.Release()
		pool.Close()
		return nil, err
	}
	if _, err := connection.Exec(ctx, string(schema)); err != nil {
		_, _ = connection.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, migrationLockID)
		connection.Release()
		pool.Close()
		return nil, err
	}
	_, _ = connection.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, migrationLockID)
	connection.Release()
	return &Postgres{pool: pool}, nil
}

func (p *Postgres) Close() { p.pool.Close() }

func (p *Postgres) Ping(ctx context.Context) error { return p.pool.Ping(ctx) }

func (p *Postgres) RegisterUser(ctx context.Context, user model.User, tokenHash string, expiresAt time.Time) (model.User, bool, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.User{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var existing model.User
	err = tx.QueryRow(ctx, `
		SELECT id::text, email, display_name, password_hash, role, email_verified_at, created_at, updated_at
		FROM users WHERE LOWER(email) = LOWER($1) FOR UPDATE`, user.Email,
	).Scan(&existing.ID, &existing.Email, &existing.DisplayName, &existing.PasswordHash, &existing.Role, &existing.EmailVerifiedAt, &existing.CreatedAt, &existing.UpdatedAt)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return model.User{}, false, err
	}
	shouldSend := true
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `
			INSERT INTO users (id, email, display_name, password_hash, role, created_at, updated_at)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, $6)
			RETURNING id::text, email, display_name, password_hash, role, email_verified_at, created_at, updated_at`,
			user.ID, user.Email, user.DisplayName, user.PasswordHash, user.Role, user.CreatedAt,
		).Scan(&user.ID, &user.Email, &user.DisplayName, &user.PasswordHash, &user.Role, &user.EmailVerifiedAt, &user.CreatedAt, &user.UpdatedAt)
		if err != nil {
			return model.User{}, false, err
		}
	} else if existing.EmailVerifiedAt != nil {
		user, shouldSend = existing, false
	} else {
		user = existing
	}
	if shouldSend {
		if _, err := tx.Exec(ctx, `DELETE FROM email_verification_tokens WHERE user_id = $1::uuid AND used_at IS NULL`, user.ID); err != nil {
			return model.User{}, false, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at) VALUES ($1, $2::uuid, $3)`, tokenHash, user.ID, expiresAt); err != nil {
			return model.User{}, false, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return model.User{}, false, err
	}
	return user, shouldSend, nil
}

func (p *Postgres) VerifyEmail(ctx context.Context, tokenHash string, now time.Time) (model.User, bool, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.User{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var user model.User
	err = tx.QueryRow(ctx, `
		SELECT u.id::text, u.email, u.display_name, u.password_hash, u.role, u.email_verified_at, u.created_at, u.updated_at
		FROM email_verification_tokens t
		JOIN users u ON u.id = t.user_id
		WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > $2
		FOR UPDATE OF t, u`, tokenHash, now,
	).Scan(&user.ID, &user.Email, &user.DisplayName, &user.PasswordHash, &user.Role, &user.EmailVerifiedAt, &user.CreatedAt, &user.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.User{}, false, nil
	}
	if err != nil {
		return model.User{}, false, err
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET email_verified_at = COALESCE(email_verified_at, $2), updated_at = $2 WHERE id = $1::uuid`, user.ID, now); err != nil {
		return model.User{}, false, err
	}
	if _, err := tx.Exec(ctx, `UPDATE email_verification_tokens SET used_at = $2 WHERE token_hash = $1`, tokenHash, now); err != nil {
		return model.User{}, false, err
	}
	user.EmailVerifiedAt = &now
	user.UpdatedAt = now
	if err := tx.Commit(ctx); err != nil {
		return model.User{}, false, err
	}
	return user, true, nil
}

func (p *Postgres) FindUserByEmail(ctx context.Context, email string) (model.User, bool, error) {
	var user model.User
	err := p.pool.QueryRow(ctx, `
		SELECT id::text, email, display_name, password_hash, role, email_verified_at, created_at, updated_at
		FROM users WHERE LOWER(email) = LOWER($1)`, email,
	).Scan(&user.ID, &user.Email, &user.DisplayName, &user.PasswordHash, &user.Role, &user.EmailVerifiedAt, &user.CreatedAt, &user.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.User{}, false, nil
	}
	return user, err == nil, err
}

func (p *Postgres) CreateSession(ctx context.Context, session model.Session) error {
	_, err := p.pool.Exec(ctx, `
		INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at, last_seen_at)
		VALUES ($1, $2::uuid, $3, $4, $5)`,
		session.TokenHash, session.UserID, session.ExpiresAt, session.CreatedAt, session.LastSeenAt,
	)
	return err
}

func (p *Postgres) GetSessionUser(ctx context.Context, tokenHash string, now time.Time) (model.User, bool, error) {
	var user model.User
	err := p.pool.QueryRow(ctx, `
		UPDATE user_sessions s SET last_seen_at = $2
		FROM users u
		WHERE s.token_hash = $1 AND s.expires_at > $2 AND u.id = s.user_id AND u.email_verified_at IS NOT NULL
		RETURNING u.id::text, u.email, u.display_name, u.password_hash, u.role, u.email_verified_at, u.created_at, u.updated_at`, tokenHash, now,
	).Scan(&user.ID, &user.Email, &user.DisplayName, &user.PasswordHash, &user.Role, &user.EmailVerifiedAt, &user.CreatedAt, &user.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.User{}, false, nil
	}
	return user, err == nil, err
}

func (p *Postgres) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := p.pool.Exec(ctx, `DELETE FROM user_sessions WHERE token_hash = $1`, tokenHash)
	return err
}

func (p *Postgres) UpdateUserProfile(ctx context.Context, id, displayName string, now time.Time) (model.User, bool, error) {
	var user model.User
	err := p.pool.QueryRow(ctx, `
		UPDATE users SET display_name = $2, updated_at = $3 WHERE id = $1::uuid
		RETURNING id::text, email, display_name, password_hash, role, email_verified_at, created_at, updated_at`, id, displayName, now,
	).Scan(&user.ID, &user.Email, &user.DisplayName, &user.PasswordHash, &user.Role, &user.EmailVerifiedAt, &user.CreatedAt, &user.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.User{}, false, nil
	}
	return user, err == nil, err
}

func (p *Postgres) CreateActivity(ctx context.Context, event model.ActivityEvent) error {
	metadata, err := json.Marshal(event.Metadata)
	if err != nil {
		return err
	}
	_, err = p.pool.Exec(ctx, `
		INSERT INTO activity_events (id, user_id, subject_user_id, actor_name, actor_email, actor_role, action, entity_type, entity_id, description, metadata, created_at)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, NULLIF($3, '')::uuid, $4, $5, $6, $7, $8, NULLIF($9, ''), $10, $11::jsonb, $12)`,
		event.ID, event.UserID, event.SubjectUserID, event.ActorName, event.ActorEmail, event.ActorRole, event.Action, event.EntityType, event.EntityID, event.Description, metadata, event.CreatedAt,
	)
	return err
}

func (p *Postgres) ListActivities(ctx context.Context, userID string, isAdmin bool, limit int) ([]model.ActivityEvent, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT id::text, COALESCE(user_id::text, ''), COALESCE(subject_user_id::text, ''), actor_name, actor_email, actor_role, action, entity_type,
		       COALESCE(entity_id, ''), description, metadata, created_at
		FROM activity_events
		WHERE $2 OR user_id = $1::uuid OR subject_user_id = $1::uuid
		ORDER BY created_at DESC
		LIMIT $3`, userID, isAdmin, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]model.ActivityEvent, 0)
	for rows.Next() {
		var event model.ActivityEvent
		if err := rows.Scan(&event.ID, &event.UserID, &event.SubjectUserID, &event.ActorName, &event.ActorEmail, &event.ActorRole, &event.Action, &event.EntityType, &event.EntityID, &event.Description, &event.RawMetadata, &event.CreatedAt); err != nil {
			return nil, err
		}
		if len(event.RawMetadata) > 0 {
			_ = json.Unmarshal(event.RawMetadata, &event.Metadata)
		}
		if event.Metadata == nil {
			event.Metadata = map[string]any{}
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func (p *Postgres) GetSettings(ctx context.Context) (model.Settings, error) {
	var settings model.Settings
	err := p.pool.QueryRow(ctx, `SELECT workspace_name FROM app_settings WHERE singleton = TRUE`).Scan(&settings.WorkspaceName)
	return settings, err
}

func (p *Postgres) UpdateSettings(ctx context.Context, workspaceName string) (model.Settings, error) {
	var settings model.Settings
	err := p.pool.QueryRow(ctx, `
		INSERT INTO app_settings (singleton, workspace_name) VALUES (TRUE, $1)
		ON CONFLICT (singleton) DO UPDATE SET workspace_name = EXCLUDED.workspace_name
		RETURNING workspace_name`, workspaceName).Scan(&settings.WorkspaceName)
	return settings, err
}

func (p *Postgres) ListLearning(ctx context.Context, date string) ([]model.LearningEntry, error) {
	query := `SELECT id::text, COALESCE(owner_user_id::text, ''), learning_date::text, title, note, category, completed, created_at FROM learning_entries`
	args := []any{}
	if date != "" {
		query += ` WHERE learning_date = $1`
		args = append(args, date)
	}
	query += ` ORDER BY learning_date DESC, created_at DESC`
	rows, err := p.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]model.LearningEntry, 0)
	for rows.Next() {
		var entry model.LearningEntry
		if err := rows.Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Title, &entry.Note, &entry.Category, &entry.Completed, &entry.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func (p *Postgres) CreateLearning(ctx context.Context, entry model.LearningEntry) (model.LearningEntry, error) {
	err := p.pool.QueryRow(ctx, `
		INSERT INTO learning_entries (id, owner_user_id, learning_date, title, note, category, completed, created_at)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3::date, $4, $5, $6, $7, $8)
		RETURNING id::text, COALESCE(owner_user_id::text, ''), learning_date::text, title, note, category, completed, created_at`,
		entry.ID, entry.OwnerUserID, entry.Date, entry.Title, entry.Note, entry.Category, entry.Completed, entry.CreatedAt,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Title, &entry.Note, &entry.Category, &entry.Completed, &entry.CreatedAt)
	return entry, err
}

func (p *Postgres) UpdateLearning(ctx context.Context, entry model.LearningEntry) (model.LearningEntry, bool, error) {
	err := p.pool.QueryRow(ctx, `
		UPDATE learning_entries
		SET title = $3, note = $4, category = $5, completed = $6
		WHERE id = $1::uuid AND learning_date = $2::date
		RETURNING id::text, COALESCE(owner_user_id::text, ''), learning_date::text, title, note, category, completed, created_at`,
		entry.ID, entry.Date, entry.Title, entry.Note, entry.Category, entry.Completed,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Title, &entry.Note, &entry.Category, &entry.Completed, &entry.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.LearningEntry{}, false, nil
	}
	return entry, err == nil, err
}

func (p *Postgres) DeleteLearning(ctx context.Context, id, date string) (bool, error) {
	result, err := p.pool.Exec(ctx, `DELETE FROM learning_entries WHERE id = $1::uuid AND learning_date = $2::date`, id, date)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() == 1, nil
}

func (p *Postgres) SeedLearningMaterials(ctx context.Context, rows []model.LearningMaterialSeed) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	now := time.Now().UTC()
	for _, row := range rows {
		prerequisites, err := json.Marshal(row.Prerequisites)
		if err != nil {
			return err
		}
		revisits, err := json.Marshal(row.Revisits)
		if err != nil {
			return err
		}
		content := row.Content
		if len(content) == 0 {
			content = json.RawMessage(`{}`)
		}
		mastery := row.Mastery
		if len(mastery) == 0 {
			mastery = json.RawMessage(`{}`)
		}
		review := row.Review
		if len(review) == 0 {
			review = json.RawMessage(`{}`)
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO learning_materials (
				id, subject_id, subject_title, category_id, category_title, topic_id, topic_title, locale,
				cefr_level, coverage_mode, title, summary, sequence, position_within_topic, estimated_minutes,
				schema_version, content_version, prerequisites, revisits, content, mastery, review, published, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb, $23, $24, $24)
			ON CONFLICT (id) DO UPDATE SET
				subject_id = EXCLUDED.subject_id,
				subject_title = EXCLUDED.subject_title,
				category_id = EXCLUDED.category_id,
				category_title = EXCLUDED.category_title,
				topic_id = EXCLUDED.topic_id,
				topic_title = EXCLUDED.topic_title,
				locale = EXCLUDED.locale,
				cefr_level = EXCLUDED.cefr_level,
				coverage_mode = EXCLUDED.coverage_mode,
				title = EXCLUDED.title,
				summary = EXCLUDED.summary,
				sequence = EXCLUDED.sequence,
				position_within_topic = EXCLUDED.position_within_topic,
				estimated_minutes = EXCLUDED.estimated_minutes,
				schema_version = EXCLUDED.schema_version,
				content_version = EXCLUDED.content_version,
				prerequisites = EXCLUDED.prerequisites,
				revisits = EXCLUDED.revisits,
				content = EXCLUDED.content,
				mastery = EXCLUDED.mastery,
				review = EXCLUDED.review,
				published = EXCLUDED.published,
				updated_at = EXCLUDED.updated_at
			WHERE learning_materials.content_version < EXCLUDED.content_version`,
			row.ID, row.SubjectID, row.SubjectTitle, row.CategoryID, row.CategoryTitle, row.TopicID, row.TopicTitle, row.Locale,
			row.Level, row.CoverageMode, row.Title, row.Summary, row.Sequence, row.PositionWithinTopic, row.EstimatedMinutes,
			row.SchemaVersion, row.ContentVersion, prerequisites, revisits, content, mastery, review, row.Published, now,
		)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

type rowScanner interface{ Scan(...any) error }

func decodeStringArray(raw []byte) []string {
	var values []string
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &values)
	}
	return values
}

func learningProgressFromScan(owner, material, status sql.NullString, score sql.NullInt64, objectiveState []byte, attempts, version sql.NullInt64, last, next, created, updated sql.NullTime) *model.LearningMaterialProgress {
	if !material.Valid {
		return nil
	}
	progress := &model.LearningMaterialProgress{
		OwnerUserID: owner.String, MaterialID: material.String, Status: status.String,
		ObjectiveState: map[string]bool{}, AttemptCount: int(attempts.Int64), ContentVersion: int(version.Int64),
	}
	if score.Valid {
		value := int(score.Int64)
		progress.MasteryScore = &value
	}
	if len(objectiveState) > 0 {
		_ = json.Unmarshal(objectiveState, &progress.ObjectiveState)
	}
	if last.Valid {
		value := last.Time
		progress.LastReviewedAt = &value
	}
	if next.Valid {
		value := next.Time
		progress.NextReviewAt = &value
	}
	if created.Valid {
		progress.CreatedAt = created.Time
	}
	if updated.Valid {
		progress.UpdatedAt = updated.Time
	}
	return progress
}

func scanLearningMaterialSummary(scan rowScanner, includeContent bool) (model.LearningMaterial, error) {
	var material model.LearningMaterial
	var prerequisites, revisits []byte
	var content, mastery, review []byte
	var owner, progressMaterial, progressStatus sql.NullString
	var progressScore, progressAttempts, progressVersion sql.NullInt64
	var objectiveState []byte
	var lastReviewed, nextReview, progressCreated, progressUpdated sql.NullTime
	var reviewDue bool
	destinations := []any{
		&material.ID, &material.SubjectID, &material.SubjectTitle, &material.CategoryID, &material.CategoryTitle,
		&material.TopicID, &material.TopicTitle, &material.Locale, &material.Level, &material.CoverageMode,
		&material.Title, &material.Summary, &material.Sequence, &material.PositionWithinTopic, &material.EstimatedMinutes,
		&material.SchemaVersion, &material.ContentVersion, &prerequisites, &revisits, &material.Published,
	}
	if includeContent {
		destinations = append(destinations, &content, &mastery, &review)
	}
	destinations = append(destinations,
		&owner, &progressMaterial, &progressStatus, &progressScore, &objectiveState, &progressAttempts, &progressVersion,
		&lastReviewed, &nextReview, &progressCreated, &progressUpdated, &reviewDue,
	)
	if err := scan.Scan(destinations...); err != nil {
		return model.LearningMaterial{}, err
	}
	material.Prerequisites = decodeStringArray(prerequisites)
	material.Revisits = decodeStringArray(revisits)
	material.ReviewDue = reviewDue
	material.Progress = learningProgressFromScan(owner, progressMaterial, progressStatus, progressScore, objectiveState, progressAttempts, progressVersion, lastReviewed, nextReview, progressCreated, progressUpdated)
	if includeContent {
		material.Content, material.Mastery, material.Review = content, mastery, review
	}
	return material, nil
}

func learningMaterialSelect(includeContent bool) string {
	selectClause := `m.id, m.subject_id, m.subject_title, m.category_id, m.category_title, m.topic_id, m.topic_title, m.locale,
		m.cefr_level, m.coverage_mode, m.title, m.summary, m.sequence, m.position_within_topic, m.estimated_minutes,
		m.schema_version, m.content_version, m.prerequisites, m.revisits, m.published`
	if includeContent {
		selectClause += `, m.content, m.mastery, m.review`
	}
	return selectClause + `,
		p.owner_user_id::text, p.material_id, p.status, p.mastery_score, p.objective_state, p.attempt_count,
		p.content_version, p.last_reviewed_at, p.next_review_at, p.created_at, p.updated_at,
		CASE WHEN p.material_id IS NOT NULL AND (p.content_version < m.content_version OR (p.next_review_at IS NOT NULL AND p.next_review_at <= $2)) THEN TRUE ELSE FALSE END`
}

func (p *Postgres) ListLearningMaterials(ctx context.Context, ownerID, subjectID, categoryID, level string, now time.Time) ([]model.LearningMaterialSummary, error) {
	query := `SELECT ` + learningMaterialSelect(false) + `
		FROM learning_materials m
		LEFT JOIN learning_topic_progress p ON p.material_id = m.id AND p.owner_user_id = NULLIF($1, '')::uuid
		WHERE m.published = TRUE`
	args := []any{ownerID, now}
	filters := []string{}
	if strings.TrimSpace(subjectID) != "" {
		args = append(args, strings.TrimSpace(subjectID))
		filters = append(filters, `m.subject_id = $`+strconv.Itoa(len(args)))
	}
	if strings.TrimSpace(categoryID) != "" {
		args = append(args, strings.TrimSpace(categoryID))
		filters = append(filters, `m.category_id = $`+strconv.Itoa(len(args)))
	}
	if strings.TrimSpace(level) != "" {
		args = append(args, strings.TrimSpace(level))
		filters = append(filters, `m.cefr_level = $`+strconv.Itoa(len(args)))
	}
	if len(filters) > 0 {
		query += ` AND ` + strings.Join(filters, ` AND `)
	}
	query += ` ORDER BY m.sequence ASC`
	rows, err := p.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	materials := make([]model.LearningMaterialSummary, 0)
	for rows.Next() {
		material, err := scanLearningMaterialSummary(rows, false)
		if err != nil {
			return nil, err
		}
		materials = append(materials, material.LearningMaterialSummary)
	}
	return materials, rows.Err()
}

func (p *Postgres) GetLearningMaterial(ctx context.Context, id, ownerID string, now time.Time) (model.LearningMaterial, bool, error) {
	query := `SELECT ` + learningMaterialSelect(true) + `
		FROM learning_materials m
		LEFT JOIN learning_topic_progress p ON p.material_id = m.id AND p.owner_user_id = NULLIF($1, '')::uuid
		WHERE m.id = $3 AND m.published = TRUE`
	material, err := scanLearningMaterialSummary(p.pool.QueryRow(ctx, query, ownerID, now, id), true)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.LearningMaterial{}, false, nil
	}
	if err != nil {
		return model.LearningMaterial{}, false, err
	}
	return material, true, nil
}

func (p *Postgres) UpsertLearningMaterialProgress(ctx context.Context, ownerID string, input model.LearningMaterialProgressInput, now time.Time) (model.LearningMaterialProgress, bool, error) {
	var exists bool
	if err := p.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM learning_materials WHERE id = $1 AND published = TRUE)`, input.MaterialID).Scan(&exists); err != nil {
		return model.LearningMaterialProgress{}, false, err
	}
	if !exists {
		return model.LearningMaterialProgress{}, false, nil
	}
	objectiveState, err := json.Marshal(input.ObjectiveState)
	if err != nil {
		return model.LearningMaterialProgress{}, false, err
	}
	if len(objectiveState) == 0 || string(objectiveState) == "null" {
		objectiveState = []byte(`{}`)
	}
	var progress model.LearningMaterialProgress
	var score sql.NullInt64
	err = p.pool.QueryRow(ctx, `
		INSERT INTO learning_topic_progress (owner_user_id, material_id, status, mastery_score, objective_state, attempt_count, content_version, last_reviewed_at, next_review_at, created_at, updated_at)
		VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $10)
		ON CONFLICT (owner_user_id, material_id) DO UPDATE SET
			status = EXCLUDED.status, mastery_score = EXCLUDED.mastery_score, objective_state = EXCLUDED.objective_state,
			attempt_count = EXCLUDED.attempt_count, content_version = EXCLUDED.content_version,
			last_reviewed_at = EXCLUDED.last_reviewed_at, next_review_at = EXCLUDED.next_review_at, updated_at = EXCLUDED.updated_at
		RETURNING owner_user_id::text, material_id, status, mastery_score, objective_state, attempt_count, content_version, last_reviewed_at, next_review_at, created_at, updated_at`,
		ownerID, input.MaterialID, input.Status, input.MasteryScore, objectiveState, input.AttemptCount, input.ContentVersion, input.LastReviewedAt, input.NextReviewAt, now,
	).Scan(&progress.OwnerUserID, &progress.MaterialID, &progress.Status, &score, &objectiveState, &progress.AttemptCount, &progress.ContentVersion, &progress.LastReviewedAt, &progress.NextReviewAt, &progress.CreatedAt, &progress.UpdatedAt)
	if err != nil {
		return model.LearningMaterialProgress{}, false, err
	}
	progress.ObjectiveState = map[string]bool{}
	if score.Valid {
		value := int(score.Int64)
		progress.MasteryScore = &value
	}
	_ = json.Unmarshal(objectiveState, &progress.ObjectiveState)
	return progress, true, nil
}

func (p *Postgres) CreateDoing(ctx context.Context, entry model.DoingEntry) (model.DoingEntry, error) {
	err := p.pool.QueryRow(ctx, `
		INSERT INTO doing_entries (id, owner_user_id, doing_date, title, note, category, completed, created_at)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3::date, $4, $5, $6, $7, $8)
		RETURNING id::text, COALESCE(owner_user_id::text, ''), doing_date::text, title, note, category, completed, created_at`,
		entry.ID, entry.OwnerUserID, entry.Date, entry.Title, entry.Note, entry.Category, entry.Completed, entry.CreatedAt,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Title, &entry.Note, &entry.Category, &entry.Completed, &entry.CreatedAt)
	return entry, err
}

func (p *Postgres) ListDoing(ctx context.Context, date string) ([]model.DoingEntry, error) {
	query := `SELECT id::text, COALESCE(owner_user_id::text, ''), doing_date::text, title, note, category, completed, created_at FROM doing_entries`
	args := []any{}
	if date != "" {
		query += ` WHERE doing_date = $1`
		args = append(args, date)
	}
	query += ` ORDER BY doing_date DESC, created_at DESC`
	rows, err := p.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]model.DoingEntry, 0)
	for rows.Next() {
		var entry model.DoingEntry
		if err := rows.Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Title, &entry.Note, &entry.Category, &entry.Completed, &entry.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func (p *Postgres) UpdateDoing(ctx context.Context, entry model.DoingEntry) (model.DoingEntry, bool, error) {
	err := p.pool.QueryRow(ctx, `
		UPDATE doing_entries
		SET title = $3, note = $4, category = $5, completed = $6
		WHERE id = $1::uuid AND doing_date = $2::date
		RETURNING id::text, COALESCE(owner_user_id::text, ''), doing_date::text, title, note, category, completed, created_at`,
		entry.ID, entry.Date, entry.Title, entry.Note, entry.Category, entry.Completed,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Title, &entry.Note, &entry.Category, &entry.Completed, &entry.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.DoingEntry{}, false, nil
	}
	return entry, err == nil, err
}

func (p *Postgres) DeleteDoing(ctx context.Context, id, date string) (bool, error) {
	result, err := p.pool.Exec(ctx, `DELETE FROM doing_entries WHERE id = $1::uuid AND doing_date = $2::date`, id, date)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() == 1, nil
}

func (p *Postgres) CreateWorkout(ctx context.Context, entry model.WorkoutEntry) (model.WorkoutEntry, error) {
	err := p.pool.QueryRow(ctx, `
		INSERT INTO workout_entries (id, owner_user_id, workout_date, material_id, exercise, category, sets, reps, duration_minutes, note, completed, created_at)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3::date, NULLIF($4, ''), $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id::text, COALESCE(owner_user_id::text, ''), workout_date::text, COALESCE(material_id, ''), exercise, category, sets, reps, duration_minutes, note, completed, created_at`,
		entry.ID, entry.OwnerUserID, entry.Date, entry.MaterialID, entry.Exercise, entry.Category, entry.Sets, entry.Reps, entry.DurationMinutes, entry.Note, entry.Completed, entry.CreatedAt,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.MaterialID, &entry.Exercise, &entry.Category, &entry.Sets, &entry.Reps, &entry.DurationMinutes, &entry.Note, &entry.Completed, &entry.CreatedAt)
	return entry, err
}

func (p *Postgres) ListWorkouts(ctx context.Context, date string) ([]model.WorkoutEntry, error) {
	query := `SELECT id::text, COALESCE(owner_user_id::text, ''), workout_date::text, COALESCE(material_id, ''), exercise, category, sets, reps, duration_minutes, note, completed, created_at FROM workout_entries`
	args := []any{}
	if date != "" {
		query += ` WHERE workout_date = $1`
		args = append(args, date)
	}
	query += ` ORDER BY workout_date DESC, created_at DESC`
	rows, err := p.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]model.WorkoutEntry, 0)
	for rows.Next() {
		var entry model.WorkoutEntry
		if err := rows.Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.MaterialID, &entry.Exercise, &entry.Category, &entry.Sets, &entry.Reps, &entry.DurationMinutes, &entry.Note, &entry.Completed, &entry.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func (p *Postgres) UpdateWorkout(ctx context.Context, entry model.WorkoutEntry) (model.WorkoutEntry, bool, error) {
	err := p.pool.QueryRow(ctx, `
		UPDATE workout_entries
		SET exercise = $3, category = $4, sets = $5, reps = $6, duration_minutes = $7, note = $8, completed = $9
		WHERE id = $1::uuid AND workout_date = $2::date
		RETURNING id::text, COALESCE(owner_user_id::text, ''), workout_date::text, COALESCE(material_id, ''), exercise, category, sets, reps, duration_minutes, note, completed, created_at`,
		entry.ID, entry.Date, entry.Exercise, entry.Category, entry.Sets, entry.Reps, entry.DurationMinutes, entry.Note, entry.Completed,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.MaterialID, &entry.Exercise, &entry.Category, &entry.Sets, &entry.Reps, &entry.DurationMinutes, &entry.Note, &entry.Completed, &entry.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.WorkoutEntry{}, false, nil
	}
	return entry, err == nil, err
}

func (p *Postgres) DeleteWorkout(ctx context.Context, id, date string) (bool, error) {
	result, err := p.pool.Exec(ctx, `DELETE FROM workout_entries WHERE id = $1::uuid AND workout_date = $2::date`, id, date)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() == 1, nil
}

type scanFunc func(...any) error

func scanJournalEntry(scan scanFunc) (model.JournalEntry, error) {
	var entry model.JournalEntry
	var reason sql.NullString
	err := scan(
		&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Title, &entry.Content, &entry.Mood, &entry.Tags,
		&entry.CreatedAt, &entry.UpdatedAt, &entry.LatestRevisionNumber, &reason,
	)
	if err != nil {
		return model.JournalEntry{}, err
	}
	if reason.Valid {
		value := model.JournalEditReason(reason.String)
		entry.LatestEditReason = &value
	}
	return entry, nil
}

func scanJournalRevision(scan scanFunc) (model.JournalRevision, error) {
	var revision model.JournalRevision
	var reason sql.NullString
	err := scan(
		&revision.JournalID, &revision.RevisionNumber, &revision.Date, &revision.Title, &revision.Content,
		&revision.Mood, &revision.Tags, &reason, &revision.CreatedAt,
	)
	if err != nil {
		return model.JournalRevision{}, err
	}
	if reason.Valid {
		value := model.JournalEditReason(reason.String)
		revision.EditReason = &value
	}
	return revision, nil
}

func (p *Postgres) CreateJournal(ctx context.Context, entry model.JournalEntry) (model.JournalEntry, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.JournalEntry{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := tx.QueryRow(ctx, `
		INSERT INTO journal_entries (id, owner_user_id, journal_date, title, content, mood, tags, created_at, updated_at, latest_revision_number)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3::date, $4, $5, $6, $7, $8, $9, 1)
		RETURNING id::text, COALESCE(owner_user_id::text, ''), journal_date::text, title, content, mood, tags, created_at, updated_at, latest_revision_number`,
		entry.ID, entry.OwnerUserID, entry.Date, entry.Title, entry.Content, entry.Mood, entry.Tags, entry.CreatedAt, entry.UpdatedAt,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Title, &entry.Content, &entry.Mood, &entry.Tags, &entry.CreatedAt, &entry.UpdatedAt, &entry.LatestRevisionNumber); err != nil {
		return model.JournalEntry{}, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO journal_revisions (journal_entry_id, revision_number, journal_date, title, content, mood, tags, edit_reason, created_at)
		VALUES ($1::uuid, 1, $2::date, $3, $4, $5, $6, NULL, $7)`,
		entry.ID, entry.Date, entry.Title, entry.Content, entry.Mood, entry.Tags, entry.CreatedAt,
	); err != nil {
		return model.JournalEntry{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return model.JournalEntry{}, err
	}
	return entry, nil
}

func (p *Postgres) ListJournals(ctx context.Context, date string) ([]model.JournalEntry, error) {
	query := `SELECT e.id::text, COALESCE(e.owner_user_id::text, ''), e.journal_date::text, e.title, e.content, e.mood, e.tags, e.created_at, e.updated_at, e.latest_revision_number, r.edit_reason
		FROM journal_entries e
		LEFT JOIN journal_revisions r ON r.journal_entry_id = e.id AND r.revision_number = e.latest_revision_number`
	args := []any{}
	if date != "" {
		query += ` WHERE e.journal_date = $1`
		args = append(args, date)
	}
	query += ` ORDER BY e.journal_date DESC, e.updated_at DESC`
	rows, err := p.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]model.JournalEntry, 0)
	for rows.Next() {
		entry, err := scanJournalEntry(rows.Scan)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func (p *Postgres) GetJournal(ctx context.Context, id string) (model.JournalEntry, bool, error) {
	entry, err := scanJournalEntry(p.pool.QueryRow(ctx, `
		SELECT e.id::text, COALESCE(e.owner_user_id::text, ''), e.journal_date::text, e.title, e.content, e.mood, e.tags, e.created_at, e.updated_at, e.latest_revision_number, r.edit_reason
		FROM journal_entries e
		LEFT JOIN journal_revisions r ON r.journal_entry_id = e.id AND r.revision_number = e.latest_revision_number
		WHERE e.id = $1::uuid`, id).Scan)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.JournalEntry{}, false, nil
	}
	return entry, err == nil, err
}

func (p *Postgres) ListJournalRevisions(ctx context.Context, journalID string) ([]model.JournalRevision, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT journal_entry_id::text, revision_number, journal_date::text, title, content, mood, tags, edit_reason, created_at
		FROM journal_revisions
		WHERE journal_entry_id = $1::uuid
		ORDER BY revision_number DESC`, journalID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	revisions := make([]model.JournalRevision, 0)
	for rows.Next() {
		revision, err := scanJournalRevision(rows.Scan)
		if err != nil {
			return nil, err
		}
		revisions = append(revisions, revision)
	}
	return revisions, rows.Err()
}

func (p *Postgres) AppendJournalRevision(ctx context.Context, journalID, actorID string, isAdmin bool, input model.JournalRevisionInput, now time.Time) (model.JournalEntry, model.JournalRevision, bool, bool, bool, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.JournalEntry{}, model.JournalRevision{}, false, false, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var current model.JournalEntry
	err = tx.QueryRow(ctx, `
		SELECT id::text, COALESCE(owner_user_id::text, ''), journal_date::text, title, content, mood, tags, created_at, updated_at, latest_revision_number
		FROM journal_entries
		WHERE id = $1::uuid AND ($3 OR owner_user_id = NULLIF($2, '')::uuid)
		FOR UPDATE`, journalID, actorID, isAdmin,
	).Scan(&current.ID, &current.OwnerUserID, &current.Date, &current.Title, &current.Content, &current.Mood, &current.Tags, &current.CreatedAt, &current.UpdatedAt, &current.LatestRevisionNumber)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.JournalEntry{}, model.JournalRevision{}, false, false, false, nil
	}
	if err != nil {
		return model.JournalEntry{}, model.JournalRevision{}, false, false, false, err
	}
	if input.BaseRevisionNumber != current.LatestRevisionNumber {
		return model.JournalEntry{}, model.JournalRevision{}, true, true, false, nil
	}
	if input.Date == current.Date && input.Title == current.Title && input.Content == current.Content && input.Mood == current.Mood && input.Tags == current.Tags {
		return model.JournalEntry{}, model.JournalRevision{}, true, false, true, nil
	}

	nextRevisionNumber := current.LatestRevisionNumber + 1
	if _, err := tx.Exec(ctx, `
		INSERT INTO journal_revisions (journal_entry_id, revision_number, journal_date, title, content, mood, tags, edit_reason, created_at)
		VALUES ($1::uuid, $2, $3::date, $4, $5, $6, $7, $8, $9)`,
		journalID, nextRevisionNumber, input.Date, input.Title, input.Content, input.Mood, input.Tags, input.EditReason, now,
	); err != nil {
		return model.JournalEntry{}, model.JournalRevision{}, false, false, false, err
	}

	var entry model.JournalEntry
	if err := tx.QueryRow(ctx, `
		UPDATE journal_entries
		SET journal_date = $2::date, title = $3, content = $4, mood = $5, tags = $6, updated_at = $7, latest_revision_number = $8
		WHERE id = $1::uuid
		RETURNING id::text, COALESCE(owner_user_id::text, ''), journal_date::text, title, content, mood, tags, created_at, updated_at, latest_revision_number`,
		journalID, input.Date, input.Title, input.Content, input.Mood, input.Tags, now, nextRevisionNumber,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Title, &entry.Content, &entry.Mood, &entry.Tags, &entry.CreatedAt, &entry.UpdatedAt, &entry.LatestRevisionNumber); err != nil {
		return model.JournalEntry{}, model.JournalRevision{}, false, false, false, err
	}
	reasonValue := input.EditReason
	entry.LatestEditReason = &reasonValue
	revision := model.JournalRevision{JournalID: journalID, RevisionNumber: nextRevisionNumber, Date: input.Date, Title: input.Title, Content: input.Content, Mood: input.Mood, Tags: input.Tags, EditReason: &reasonValue, CreatedAt: now}
	if err := tx.Commit(ctx); err != nil {
		return model.JournalEntry{}, model.JournalRevision{}, false, false, false, err
	}
	return entry, revision, true, false, false, nil
}

func (p *Postgres) DeleteJournal(ctx context.Context, id, actorID string, isAdmin bool) (model.JournalEntry, bool, error) {
	var entry model.JournalEntry
	err := p.pool.QueryRow(ctx, `
		DELETE FROM journal_entries
		WHERE id = $1::uuid AND ($3 OR owner_user_id = NULLIF($2, '')::uuid)
		RETURNING id::text, COALESCE(owner_user_id::text, ''), journal_date::text, title, content, mood, tags, created_at, updated_at, latest_revision_number`, id, actorID, isAdmin,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Title, &entry.Content, &entry.Mood, &entry.Tags, &entry.CreatedAt, &entry.UpdatedAt, &entry.LatestRevisionNumber)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.JournalEntry{}, false, nil
	}
	return entry, err == nil, err
}

func (p *Postgres) CreateSpending(ctx context.Context, entry model.SpendingEntry) (model.SpendingEntry, error) {
	err := p.pool.QueryRow(ctx, `
		INSERT INTO spending_entries (id, owner_user_id, spending_date, description, category, amount, payment_method, note, created_at)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3::date, $4, $5, $6, $7, $8, $9)
		RETURNING id::text, COALESCE(owner_user_id::text, ''), spending_date::text, description, category, amount, payment_method, note, created_at`,
		entry.ID, entry.OwnerUserID, entry.Date, entry.Description, entry.Category, entry.Amount, entry.PaymentMethod, entry.Note, entry.CreatedAt,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Description, &entry.Category, &entry.Amount, &entry.PaymentMethod, &entry.Note, &entry.CreatedAt)
	return entry, err
}

func (p *Postgres) ListSpending(ctx context.Context, date string) ([]model.SpendingEntry, error) {
	query := `SELECT id::text, COALESCE(owner_user_id::text, ''), spending_date::text, description, category, amount, payment_method, note, created_at FROM spending_entries`
	args := []any{}
	if date != "" {
		query += ` WHERE spending_date = $1`
		args = append(args, date)
	}
	query += ` ORDER BY spending_date DESC, created_at DESC`
	rows, err := p.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]model.SpendingEntry, 0)
	for rows.Next() {
		var entry model.SpendingEntry
		if err := rows.Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Description, &entry.Category, &entry.Amount, &entry.PaymentMethod, &entry.Note, &entry.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func (p *Postgres) DeleteSpending(ctx context.Context, id string) (bool, error) {
	result, err := p.pool.Exec(ctx, `DELETE FROM spending_entries WHERE id = $1::uuid`, id)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() == 1, nil
}

func (p *Postgres) CreateChangeLog(ctx context.Context, entry model.ChangeLogEntry) (model.ChangeLogEntry, error) {
	err := p.pool.QueryRow(ctx, `
		INSERT INTO change_log_entries (id, occurred_at, title, description, category)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (id) DO UPDATE SET
			occurred_at = EXCLUDED.occurred_at,
			title = EXCLUDED.title,
			description = EXCLUDED.description,
			category = EXCLUDED.category
		RETURNING id, occurred_at, title, description, category, created_at`,
		entry.ID, entry.OccurredAt, entry.Title, entry.Description, entry.Category,
	).Scan(&entry.ID, &entry.OccurredAt, &entry.Title, &entry.Description, &entry.Category, &entry.CreatedAt)
	return entry, err
}

func (p *Postgres) ListChangeLogs(ctx context.Context) ([]model.ChangeLogEntry, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT id, occurred_at, title, description, category, created_at
		FROM change_log_entries
		ORDER BY occurred_at DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]model.ChangeLogEntry, 0)
	for rows.Next() {
		var entry model.ChangeLogEntry
		if err := rows.Scan(&entry.ID, &entry.OccurredAt, &entry.Title, &entry.Description, &entry.Category, &entry.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func (p *Postgres) DeleteChangeLog(ctx context.Context, id string) (bool, error) {
	result, err := p.pool.Exec(ctx, `DELETE FROM change_log_entries WHERE id = $1`, id)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() == 1, nil
}
