package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"time"
	"zeno-backend/internal/model"
)

func legacyDoingProjection(entry model.DoingEntry) ([]byte, error) {
	status := map[string]string{"todo": "Ready", "doing": "In progress", "blocked": "Blocked", "done": "Done"}[entry.Status]
	priority := map[string]string{"high": "P1", "medium": "P2", "low": "P3"}[entry.Priority]
	focus := map[string]string{"deep": "Deep", "medium": "Moderate", "light": "Light"}[entry.EnergyFocus]
	min, max := 15, 30
	if entry.EstimatedMinutes > 0 {
		min = entry.EstimatedMinutes
		if min > 240 {
			min = 240
		}
		max = min
	}
	label := fmt.Sprintf("%d–%d minutes", min, max)
	if min == 15 && max == 30 {
		label = "15–30 minutes"
	}
	v := model.DoingTask{Title: entry.Title, Area: entry.Category, Project: entry.Project, Status: status, Priority: priority, Focus: focus,
		Duration: model.DoingDuration{MinMinutes: min, MaxMinutes: max, Label: label}, Notes: entry.Note, DefinitionOfDone: []model.DoingCriterion{},
		LegacyMetadata: map[string]any{"doingDate": entry.Date, "category": entry.Category, "goalOutcome": entry.GoalOutcome,
			"actualMinutes": entry.ActualMinutes, "timeBlockStart": entry.TimeBlockStart, "timeBlockEnd": entry.TimeBlockEnd,
			"dependency": entry.Dependency, "blockedBy": entry.BlockedBy, "carryOver": entry.CarryOver, "progress": entry.Progress, "completed": entry.Completed}}
	if entry.Date != "" {
		v.PlannedDate = &entry.Date
	}
	return json.Marshal(v)
}

// The workspace projection and legacy Overview fields are stored atomically in one row.
func workspaceLegacy(v model.DoingTask) (date *string, status, priority, focus string, completed bool, completedAt *time.Time) {
	date = v.PlannedDate
	switch v.Status {
	case "In progress":
		status = "doing"
	case "Blocked":
		status = "blocked"
	case "Done":
		status = "done"
	default:
		status = "todo"
	}
	switch v.Priority {
	case "P0", "P1":
		priority = "high"
	case "P3":
		priority = "low"
	default:
		priority = "medium"
	}
	switch v.Focus {
	case "Deep":
		focus = "deep"
	case "Light":
		focus = "light"
	default:
		focus = "medium"
	}
	completed = status == "done"
	if completed {
		t := v.UpdatedAt
		if t.IsZero() {
			t = time.Now().UTC()
		}
		completedAt = &t
	}
	return
}
func taskPayload(v model.DoingTask) ([]byte, error) { return json.Marshal(v) }
func scanTask(scan scanFunc) (model.DoingTask, error) {
	var v model.DoingTask
	var raw []byte
	var id, owner string
	var created, updated time.Time
	err := scan(&id, &owner, &raw, &created, &updated)
	if err != nil {
		return v, err
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return v, err
	}
	v.ID = id
	v.OwnerUserID = owner
	v.CreatedAt = created
	v.UpdatedAt = updated
	return v, nil
}

const taskColumns = `id::text, COALESCE(owner_user_id::text,''), workspace_data, created_at, COALESCE(workspace_updated_at,created_at)`

func (p *Postgres) CreateDoingTask(ctx context.Context, v model.DoingTask) (model.DoingTask, error) {
	date, status, priority, focus, completed, completedAt := workspaceLegacy(v)
	raw, err := taskPayload(v)
	if err != nil {
		return v, err
	}
	return scanTask(p.pool.QueryRow(ctx, `INSERT INTO doing_entries (id,owner_user_id,doing_date,title,status,priority,estimated_minutes,note,category,project,goal_outcome,energy_focus,completed,completed_at,created_at,workspace_updated_at,workspace_data) VALUES ($1::uuid,$2::uuid,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb) RETURNING `+taskColumns, v.ID, v.OwnerUserID, date, v.Title, status, priority, v.Duration.MaxMinutes, v.Notes, v.Area, v.Project, "", focus, completed, completedAt, v.CreatedAt, v.UpdatedAt, raw).Scan)
}
func (p *Postgres) ListDoingTasks(ctx context.Context, owner string, admin bool) ([]model.DoingTask, error) {
	query := `SELECT ` + taskColumns + ` FROM doing_entries WHERE workspace_data IS NOT NULL`
	args := []any{}
	if !admin {
		query += ` AND owner_user_id=NULLIF($1,'')::uuid`
		args = append(args, owner)
	}
	query += ` ORDER BY created_at DESC,id DESC`
	rows, err := p.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]model.DoingTask, 0)
	for rows.Next() {
		v, err := scanTask(rows.Scan)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func (p *Postgres) UpdateDoingTask(ctx context.Context, v model.DoingTask, owner string, admin bool) (model.DoingTask, bool, error) {
	date, status, priority, focus, completed, completedAt := workspaceLegacy(v)
	raw, err := taskPayload(v)
	if err != nil {
		return model.DoingTask{}, false, err
	}
	query := `UPDATE doing_entries SET doing_date=$2::date,title=$3,status=$4,priority=$5,estimated_minutes=$6,note=$7,category=$8,project=$9,goal_outcome=COALESCE($10::text,goal_outcome),energy_focus=$11,completed=$12,completed_at=CASE WHEN $12 THEN COALESCE(completed_at,$13) ELSE NULL END,workspace_updated_at=$14,workspace_data=$15::jsonb WHERE id=$1::uuid`
	args := []any{v.ID, date, v.Title, status, priority, v.Duration.MaxMinutes, v.Notes, v.Area, v.Project, nil, focus, completed, completedAt, v.UpdatedAt, raw}
	if !admin {
		query += ` AND owner_user_id=NULLIF($16,'')::uuid`
		args = append(args, owner)
	}
	query += ` RETURNING ` + taskColumns
	updated, err := scanTask(p.pool.QueryRow(ctx, query, args...).Scan)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.DoingTask{}, false, nil
	}
	return updated, err == nil, err
}
func (p *Postgres) DeleteDoingTask(ctx context.Context, id, owner string, admin bool) (bool, error) {
	query := `DELETE FROM doing_entries WHERE id=$1::uuid`
	args := []any{id}
	if !admin {
		query += ` AND owner_user_id=NULLIF($2,'')::uuid`
		args = append(args, owner)
	}
	result, err := p.pool.Exec(ctx, query, args...)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() == 1, nil
}
