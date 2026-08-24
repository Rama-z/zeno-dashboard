package store

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
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
		INSERT INTO workout_entries (id, owner_user_id, workout_date, exercise, category, sets, reps, duration_minutes, note, completed, created_at)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3::date, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id::text, COALESCE(owner_user_id::text, ''), workout_date::text, exercise, category, sets, reps, duration_minutes, note, completed, created_at`,
		entry.ID, entry.OwnerUserID, entry.Date, entry.Exercise, entry.Category, entry.Sets, entry.Reps, entry.DurationMinutes, entry.Note, entry.Completed, entry.CreatedAt,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Exercise, &entry.Category, &entry.Sets, &entry.Reps, &entry.DurationMinutes, &entry.Note, &entry.Completed, &entry.CreatedAt)
	return entry, err
}

func (p *Postgres) ListWorkouts(ctx context.Context, date string) ([]model.WorkoutEntry, error) {
	query := `SELECT id::text, COALESCE(owner_user_id::text, ''), workout_date::text, exercise, category, sets, reps, duration_minutes, note, completed, created_at FROM workout_entries`
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
		if err := rows.Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Exercise, &entry.Category, &entry.Sets, &entry.Reps, &entry.DurationMinutes, &entry.Note, &entry.Completed, &entry.CreatedAt); err != nil {
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
		RETURNING id::text, COALESCE(owner_user_id::text, ''), workout_date::text, exercise, category, sets, reps, duration_minutes, note, completed, created_at`,
		entry.ID, entry.Date, entry.Exercise, entry.Category, entry.Sets, entry.Reps, entry.DurationMinutes, entry.Note, entry.Completed,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Exercise, &entry.Category, &entry.Sets, &entry.Reps, &entry.DurationMinutes, &entry.Note, &entry.Completed, &entry.CreatedAt)
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

func (p *Postgres) CreateJournal(ctx context.Context, entry model.JournalEntry) (model.JournalEntry, error) {
	err := p.pool.QueryRow(ctx, `
		INSERT INTO journal_entries (id, owner_user_id, journal_date, title, content, mood, tags, created_at, updated_at)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3::date, $4, $5, $6, $7, $8, $9)
		RETURNING id::text, COALESCE(owner_user_id::text, ''), journal_date::text, title, content, mood, tags, created_at, updated_at`,
		entry.ID, entry.OwnerUserID, entry.Date, entry.Title, entry.Content, entry.Mood, entry.Tags, entry.CreatedAt, entry.UpdatedAt,
	).Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Title, &entry.Content, &entry.Mood, &entry.Tags, &entry.CreatedAt, &entry.UpdatedAt)
	return entry, err
}

func (p *Postgres) ListJournals(ctx context.Context, date string) ([]model.JournalEntry, error) {
	query := `SELECT id::text, COALESCE(owner_user_id::text, ''), journal_date::text, title, content, mood, tags, created_at, updated_at FROM journal_entries`
	args := []any{}
	if date != "" {
		query += ` WHERE journal_date = $1`
		args = append(args, date)
	}
	query += ` ORDER BY journal_date DESC, updated_at DESC`
	rows, err := p.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := make([]model.JournalEntry, 0)
	for rows.Next() {
		var entry model.JournalEntry
		if err := rows.Scan(&entry.ID, &entry.OwnerUserID, &entry.Date, &entry.Title, &entry.Content, &entry.Mood, &entry.Tags, &entry.CreatedAt, &entry.UpdatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}

func (p *Postgres) DeleteJournal(ctx context.Context, id string) (bool, error) {
	result, err := p.pool.Exec(ctx, `DELETE FROM journal_entries WHERE id = $1::uuid`, id)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() == 1, nil
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
