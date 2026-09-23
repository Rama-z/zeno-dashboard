package store_test

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"testing"
	"time"
	"zeno-backend/internal/model"
	"zeno-backend/internal/store"
)

func TestDoingWorkspaceMigrationAndRoundTrip(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	raw, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	legacyID := "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	_, err = raw.Exec(ctx, `CREATE TABLE IF NOT EXISTS doing_entries (id uuid PRIMARY KEY, doing_date date NOT NULL, title varchar(160) NOT NULL, note varchar(2000) NOT NULL, category varchar(60) NOT NULL, completed boolean NOT NULL DEFAULT false, status varchar(16) NOT NULL DEFAULT 'done', actual_minutes integer NOT NULL DEFAULT 0, time_block_start varchar(5) NOT NULL DEFAULT '', time_block_end varchar(5) NOT NULL DEFAULT '', goal_outcome varchar(500) NOT NULL DEFAULT '', dependency varchar(500) NOT NULL DEFAULT '', blocked_by varchar(500) NOT NULL DEFAULT '', carry_over boolean NOT NULL DEFAULT false, energy_focus varchar(16) NOT NULL DEFAULT 'medium', created_at timestamptz NOT NULL DEFAULT now())`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = raw.Exec(ctx, `INSERT INTO doing_entries (id,doing_date,title,note,category,completed,status,actual_minutes,time_block_start,time_block_end,goal_outcome,dependency,blocked_by,carry_over,energy_focus) VALUES ($1,'2026-09-23','Legacy task',$2,'All Rounder',true,'done',17,'09:00','10:00','Legacy outcome','Old dependency','Old blocker',true,'deep') ON CONFLICT DO NOTHING`, legacyID, "line one\nline two")
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Exec(context.Background(), `DELETE FROM doing_entries WHERE id=$1`, legacyID)
	db, err := store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	rows, err := db.ListDoingTasks(ctx, "", true)
	if err != nil {
		t.Fatal(err)
	}
	var migrated model.DoingTask
	for _, row := range rows {
		if row.ID == legacyID {
			migrated = row
		}
	}
	if migrated.ID == "" || migrated.Status != "Done" || migrated.Area != "All Rounder" || migrated.Focus != "Deep" || migrated.LegacyMetadata["actualMinutes"] != float64(17) || migrated.LegacyMetadata["goalOutcome"] != "Legacy outcome" || migrated.LegacyMetadata["dependency"] != "Old dependency" || migrated.LegacyMetadata["blockedBy"] != "Old blocker" || migrated.LegacyMetadata["carryOver"] != true || migrated.PlannedDate == nil || *migrated.PlannedDate != "2026-09-23" || migrated.Due != nil || len(migrated.DefinitionOfDone) != 0 || migrated.Notes != "line one\nline two" || migrated.Energy != "" || migrated.NextAction != "" {
		t.Fatalf("migration %+v", migrated)
	}
	var actual int
	var start, end, dependency, blocked, goal, category, note string
	var carry bool
	if err := raw.QueryRow(ctx, `SELECT actual_minutes,time_block_start,time_block_end,dependency,blocked_by,goal_outcome,category,carry_over,note FROM doing_entries WHERE id=$1`, legacyID).Scan(&actual, &start, &end, &dependency, &blocked, &goal, &category, &carry, &note); err != nil {
		t.Fatal(err)
	}
	if actual != 17 || start != "09:00" || end != "10:00" || dependency != "Old dependency" || blocked != "Old blocker" || goal != "Legacy outcome" || category != "All Rounder" || !carry || note != "line one\nline two" {
		t.Fatalf("legacy columns changed: %d %q %q %q %q %q %q %v %q", actual, start, end, dependency, blocked, goal, category, carry, note)
	}
	migrated.Notes = "line one\nline two\nEdited workspace"
	_, found, err := db.UpdateDoingTask(ctx, migrated, "", true)
	if err != nil || !found {
		t.Fatalf("legacy workspace edit: %v %v", found, err)
	}
	if err := raw.QueryRow(ctx, `SELECT goal_outcome FROM doing_entries WHERE id=$1`, legacyID).Scan(&goal); err != nil || goal != "Legacy outcome" {
		t.Fatalf("workspace edit erased legacy goal outcome: %q %v", goal, err)
	}
	owner := "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	task := migrated
	task.ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	task.OwnerUserID = owner
	task.Due = nil
	task.PlannedDate = nil
	task.DefinitionOfDone = []model.DoingCriterion{{ID: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", Text: "Acceptance", Done: false}}
	defer raw.Exec(context.Background(), `DELETE FROM doing_entries WHERE id=$1`, task.ID)
	_, err = raw.Exec(ctx, `INSERT INTO users(id,email,display_name,password_hash,role) VALUES ($1::uuid,'workspace-test@example.test','Workspace Test','test','user') ON CONFLICT DO NOTHING`, owner)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, owner)
	createdTask, err := db.CreateDoingTask(ctx, task)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec(ctx, `UPDATE doing_entries SET workspace_data='{"duration":{"minMinutes":500,"maxMinutes":1},"definitionOfDone":"oops"}'::jsonb WHERE id=$1`, task.ID); err == nil {
		t.Fatal("database accepted malformed workspace data")
	}
	var initialCompletion time.Time
	if err := raw.QueryRow(ctx, `SELECT completed_at FROM doing_entries WHERE id=$1`, createdTask.ID).Scan(&initialCompletion); err != nil {
		t.Fatal(err)
	}
	rows, err = db.ListDoingTasks(ctx, owner, false)
	if err != nil || len(rows) != 1 || rows[0].ID != task.ID || rows[0].Due != nil || rows[0].PlannedDate != nil {
		t.Fatalf("list %+v %v", rows, err)
	}
	task.Notes = "first\n\nsecond"
	task.UpdatedAt = time.Now().UTC().Add(time.Hour)
	task.PlannedDate = new(string)
	*task.PlannedDate = "2026-09-24"
	updated, ok, err := db.UpdateDoingTask(ctx, task, owner, false)
	if err != nil || !ok || updated.Notes != task.Notes || updated.Due != nil || *updated.PlannedDate != "2026-09-24" {
		t.Fatalf("update %+v %v %v", updated, ok, err)
	}
	var afterCompletion time.Time
	if err := raw.QueryRow(ctx, `SELECT completed_at FROM doing_entries WHERE id=$1`, task.ID).Scan(&afterCompletion); err != nil {
		t.Fatal(err)
	}
	if !afterCompletion.Equal(initialCompletion) {
		t.Fatalf("completedAt changed %v -> %v", initialCompletion, afterCompletion)
	}
	legacyRows, err := db.ListDoing(ctx, "", owner, false)
	if err != nil || len(legacyRows) != 1 || legacyRows[0].ID != task.ID || legacyRows[0].Date != "2026-09-24" {
		t.Fatalf("Overview projection %+v %v", legacyRows, err)
	}
	legacy := legacyRows[0]
	legacy.Title = "Edited from Overview"
	legacy.Note = "Legacy note"
	legacy.EstimatedMinutes = 90
	_, ok, err = db.UpdateDoing(ctx, legacy, owner, false)
	if err != nil || !ok {
		t.Fatalf("legacy update %v %v", ok, err)
	}
	rows, err = db.ListDoingTasks(ctx, owner, false)
	if err != nil || len(rows) != 1 || rows[0].Title != "Edited from Overview" || rows[0].Notes != "Legacy note" || rows[0].Duration.MinMinutes != 90 || rows[0].Duration.MaxMinutes != 90 || rows[0].Duration.Label != "90–90 minutes" {
		t.Fatalf("workspace stale after Overview edit %+v %v", rows, err)
	}
	if _, ok, err = db.UpdateDoingTask(ctx, task, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", false); err != nil || ok {
		t.Fatalf("foreign update %v %v", ok, err)
	}
	if ok, err = db.DeleteDoingTask(ctx, task.ID, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", false); err != nil || ok {
		t.Fatalf("foreign delete %v %v", ok, err)
	}
	if ok, err = db.DeleteDoingTask(ctx, task.ID, owner, false); err != nil || !ok {
		t.Fatalf("delete %v %v", ok, err)
	}
	db.Close()
	db, err = store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	rows, err = db.ListDoingTasks(ctx, "", true)
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, row := range rows {
		if row.ID == legacyID {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("idempotent migration found %d copies", n)
	}
}
