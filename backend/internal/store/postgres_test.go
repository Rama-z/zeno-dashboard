package store_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"zeno-backend/internal/learningseed"
	"zeno-backend/internal/model"
	"zeno-backend/internal/store"
)

func TestPostgresSettingsAndLearningRoundTrip(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	settings, err := db.UpdateSettings(ctx, "Integration workspace")
	if err != nil || settings.WorkspaceName != "Integration workspace" {
		t.Fatalf("unexpected settings: %+v, %v", settings, err)
	}
	if _, err := db.UpdateSettings(ctx, "Default workspace"); err != nil {
		t.Fatal(err)
	}

	entry := model.LearningEntry{ID: "00000000-0000-4000-8000-000000000001", Date: "2099-12-31", Title: "Integration test", Note: "Temporary", Category: "Test", CreatedAt: time.Now().UTC()}
	created, err := db.CreateLearning(ctx, entry)
	if err != nil {
		t.Fatal(err)
	}
	created.Title = "Updated integration test"
	created.Completed = true
	updated, found, err := db.UpdateLearning(ctx, created)
	if err != nil || !found || updated.Title != created.Title || !updated.Completed {
		t.Fatalf("expected update success: %+v, %v, %v", updated, found, err)
	}
	entries, err := db.ListLearning(ctx, entry.Date)
	if err != nil || len(entries) == 0 {
		t.Fatalf("expected stored entry: %+v, %v", entries, err)
	}
	deleted, err := db.DeleteLearning(ctx, created.ID, entry.Date)
	if err != nil || !deleted {
		t.Fatalf("expected delete success: %v, %v", deleted, err)
	}
}

func TestPostgresChangeLogRoundTrip(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	id := fmt.Sprintf("integration-change-log-%d", time.Now().UnixNano())
	entry := model.ChangeLogEntry{ID: id, OccurredAt: time.Now().UTC(), Title: "Integration change log", Description: "Temporary", Category: "Test"}
	created, err := db.CreateChangeLog(ctx, entry)
	if err != nil || created.ID != id || created.CreatedAt.IsZero() {
		t.Fatalf("unexpected create result: %+v, %v", created, err)
	}
	entry.Title = "Updated integration change log"
	upserted, err := db.CreateChangeLog(ctx, entry)
	if err != nil || upserted.Title != entry.Title {
		t.Fatalf("expected idempotent upsert: %+v, %v", upserted, err)
	}
	entries, err := db.ListChangeLogs(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, candidate := range entries {
		if candidate.ID == id {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("created change log %q was not listed", id)
	}
	deleted, err := db.DeleteChangeLog(ctx, id)
	if err != nil || !deleted {
		t.Fatalf("expected cleanup success: %v, %v", deleted, err)
	}
}

func TestPostgresJournalCreatesImmutableOriginalRevision(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	const journalID = "00000000-0000-4000-8000-000000000050"
	raw, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	_, _ = raw.Exec(ctx, `DELETE FROM journal_entries WHERE id = $1::uuid`, journalID)
	defer func() {
		_, _ = raw.Exec(context.Background(), `DELETE FROM journal_entries WHERE id = $1::uuid`, journalID)
	}()

	db, err := store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	createdAt := time.Date(2099, 12, 28, 10, 0, 0, 0, time.UTC)
	entry, err := db.CreateJournal(ctx, model.JournalEntry{
		ID: journalID, Date: "2099-12-28", Title: "Original revision", Content: "Byte-for-byte original", Mood: "Focused", Tags: "test", CreatedAt: createdAt, UpdatedAt: createdAt,
	})
	if err != nil {
		t.Fatal(err)
	}
	if entry.ID != journalID {
		t.Fatalf("unexpected created journal: %+v", entry)
	}

	var latest, revisionCount int
	if err := raw.QueryRow(ctx, `SELECT latest_revision_number FROM journal_entries WHERE id = $1::uuid`, journalID).Scan(&latest); err != nil {
		t.Fatal(err)
	}
	if err := raw.QueryRow(ctx, `SELECT COUNT(*) FROM journal_revisions WHERE journal_entry_id = $1::uuid`, journalID).Scan(&revisionCount); err != nil {
		t.Fatal(err)
	}
	if latest != 1 || revisionCount != 1 {
		t.Fatalf("expected one immutable original revision, latest=%d count=%d", latest, revisionCount)
	}
}

func TestPostgresJournalRevisionRoundTripAndCascade(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	const journalID = "00000000-0000-4000-8000-000000000051"
	raw, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	_, _ = raw.Exec(ctx, `DELETE FROM journal_entries WHERE id = $1::uuid`, journalID)
	defer func() {
		_, _ = raw.Exec(context.Background(), `DELETE FROM journal_entries WHERE id = $1::uuid`, journalID)
	}()

	db, err := store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	createdAt := time.Date(2099, 12, 27, 10, 0, 0, 0, time.UTC)
	if _, err := db.CreateJournal(ctx, model.JournalEntry{ID: journalID, Date: "2099-12-27", Title: "Original", Content: "Original body", Mood: "Calm", Tags: "one", CreatedAt: createdAt, UpdatedAt: createdAt}); err != nil {
		t.Fatal(err)
	}
	updatedAt := createdAt.Add(5 * time.Minute)
	latest, revision, found, conflict, noop, err := db.AppendJournalRevision(ctx, journalID, "", true, model.JournalRevisionInput{BaseRevisionNumber: 1, Date: "2099-12-28", Title: "Edited", Content: "Edited body", Mood: "Focused", Tags: "two", EditReason: model.JournalEditReasonClarify}, updatedAt)
	if err != nil || !found || conflict || noop {
		t.Fatalf("append failed: entry=%+v revision=%+v found=%v conflict=%v noop=%v err=%v", latest, revision, found, conflict, noop, err)
	}
	if latest.LatestRevisionNumber != 2 || !latest.CreatedAt.Equal(createdAt) || !latest.UpdatedAt.Equal(updatedAt) || latest.Content != "Edited body" || latest.LatestEditReason == nil || *latest.LatestEditReason != model.JournalEditReasonClarify {
		t.Fatalf("unexpected latest snapshot: %+v", latest)
	}

	revisions, err := db.ListJournalRevisions(ctx, journalID)
	if err != nil || len(revisions) != 2 {
		t.Fatalf("unexpected revision list: %+v, %v", revisions, err)
	}
	if revisions[0].RevisionNumber != 2 || revisions[1].RevisionNumber != 1 || revisions[1].Content != "Original body" || revisions[1].EditReason != nil {
		t.Fatalf("unexpected revision ordering or immutability: %+v", revisions)
	}
	if _, err := raw.Exec(ctx, `UPDATE journal_revisions SET content = $2 WHERE journal_entry_id = $1::uuid AND revision_number = 1`, journalID, "tampered"); err == nil {
		t.Fatal("expected direct revision UPDATE to be rejected")
	}
	if _, err := raw.Exec(ctx, `DELETE FROM journal_revisions WHERE journal_entry_id = $1::uuid AND revision_number = 1`, journalID); err == nil {
		t.Fatal("expected direct revision DELETE to be rejected")
	}
	_, _, found, conflict, noop, err = db.AppendJournalRevision(ctx, journalID, "", true, model.JournalRevisionInput{BaseRevisionNumber: 1, Date: "2099-12-29", Title: "Stale", Content: "Stale body", Mood: "Focused", Tags: "stale", EditReason: model.JournalEditReasonTypo}, updatedAt.Add(time.Minute))
	if err != nil || !found || !conflict || noop {
		t.Fatalf("expected stale conflict: found=%v conflict=%v noop=%v err=%v", found, conflict, noop, err)
	}
	check, err := db.ListJournalRevisions(ctx, journalID)
	if err != nil || len(check) != 2 {
		t.Fatalf("stale append mutated revisions: %+v, %v", check, err)
	}
	deleted, deletedFound, err := db.DeleteJournal(ctx, journalID, "", true)
	if err != nil || !deletedFound || deleted.ID != journalID {
		t.Fatalf("delete failed: %+v found=%v err=%v", deleted, deletedFound, err)
	}
	var remaining int
	if err := raw.QueryRow(ctx, `SELECT COUNT(*) FROM journal_revisions WHERE journal_entry_id = $1::uuid`, journalID).Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 0 {
		t.Fatalf("expected cascade to remove revisions, found %d", remaining)
	}
}

func TestPostgresJournalBackfillIsIdempotent(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	const journalID = "00000000-0000-4000-8000-000000000052"
	raw, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	_, _ = raw.Exec(ctx, `DELETE FROM journal_entries WHERE id = $1::uuid`, journalID)
	defer func() {
		_, _ = raw.Exec(context.Background(), `DELETE FROM journal_entries WHERE id = $1::uuid`, journalID)
	}()

	db, err := store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	createdAt := time.Date(2099, 12, 26, 10, 0, 0, 0, time.UTC)
	if _, err := raw.Exec(ctx, `INSERT INTO journal_entries (id, journal_date, title, content, mood, tags, created_at, updated_at, latest_revision_number) VALUES ($1::uuid, $2::date, $3, $4, $5, $6, $7, $7, 1)`, journalID, "2099-12-26", "Legacy", "Legacy body", "Neutral", "legacy", createdAt); err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec(ctx, `DELETE FROM journal_revisions WHERE journal_entry_id = $1::uuid`, journalID); err != nil {
		t.Fatal(err)
	}
	db, err = store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var count int
	if err := raw.QueryRow(ctx, `SELECT COUNT(*) FROM journal_revisions WHERE journal_entry_id = $1::uuid`, journalID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("expected one backfilled revision, got %d", count)
	}
	db.Close()
	if db, err = store.New(ctx, dsn); err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := raw.QueryRow(ctx, `SELECT COUNT(*) FROM journal_revisions WHERE journal_entry_id = $1::uuid`, journalID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("schema rerun duplicated backfill revisions: %d", count)
	}
}

func TestPostgresDoingRoundTrip(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	entry := model.DoingEntry{ID: "00000000-0000-4000-8000-000000000002", Date: "2099-12-30", Title: "Doing integration test", Note: "Temporary", Category: "Test", CreatedAt: time.Now().UTC()}
	created, err := db.CreateDoing(ctx, entry)
	if err != nil {
		t.Fatal(err)
	}
	created.Title = "Updated doing integration test"
	created.Completed = true
	updated, found, err := db.UpdateDoing(ctx, created)
	if err != nil || !found || updated.Title != created.Title || !updated.Completed {
		t.Fatalf("expected doing update success: %+v, %v, %v", updated, found, err)
	}
	entries, err := db.ListDoing(ctx, entry.Date)
	if err != nil || len(entries) != 1 || entries[0].ID != entry.ID {
		t.Fatalf("expected stored doing entry: %+v, %v", entries, err)
	}
	deleted, err := db.DeleteDoing(ctx, created.ID, entry.Date)
	if err != nil || !deleted {
		t.Fatalf("expected doing cleanup success: %v, %v", deleted, err)
	}
}

func TestPostgresWorkoutMaterialRoundTripAndLegacyNull(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	const materialID = "00000000-0000-4000-8000-000000000060"
	const legacyID = "00000000-0000-4000-8000-000000000061"
	raw, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	_, _ = raw.Exec(ctx, `DELETE FROM workout_entries WHERE id IN ($1::uuid, $2::uuid)`, materialID, legacyID)
	defer func() {
		_, _ = raw.Exec(context.Background(), `DELETE FROM workout_entries WHERE id IN ($1::uuid, $2::uuid)`, materialID, legacyID)
	}()

	db, err := store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	createdAt := time.Date(2099, 12, 31, 10, 0, 0, 0, time.UTC)
	created, err := db.CreateWorkout(ctx, model.WorkoutEntry{ID: materialID, Date: "2099-12-31", MaterialID: "90-90-hip-switch", Exercise: "90/90 Hip Switch", Category: "Mobility", Sets: 2, Reps: 8, Note: "Catalog snapshot", CreatedAt: createdAt})
	if err != nil || created.MaterialID != "90-90-hip-switch" {
		t.Fatalf("material workout create failed: %+v %v", created, err)
	}
	if _, err := raw.Exec(ctx, `INSERT INTO workout_entries (id, workout_date, exercise, category, note, material_id, created_at) VALUES ($1::uuid, $2::date, $3, $4, $5, NULL, $6)`, legacyID, "2099-12-31", "Legacy manual workout", "General", "Legacy row", createdAt); err != nil {
		t.Fatal(err)
	}
	entries, err := db.ListWorkouts(ctx, "2099-12-31")
	if err != nil {
		t.Fatal(err)
	}
	var foundMaterial, foundLegacy bool
	for _, entry := range entries {
		if entry.ID == materialID {
			foundMaterial = entry.MaterialID == "90-90-hip-switch"
		}
		if entry.ID == legacyID {
			foundLegacy = entry.MaterialID == ""
		}
	}
	if !foundMaterial || !foundLegacy {
		t.Fatalf("unexpected material/legacy list: %+v", entries)
	}
	created.Exercise = "90/90 Hip Switch — edited"
	updated, found, err := db.UpdateWorkout(ctx, created)
	if err != nil || !found || updated.MaterialID != "90-90-hip-switch" {
		t.Fatalf("material provenance was not preserved on update: %+v found=%v err=%v", updated, found, err)
	}
	deleted, err := db.DeleteWorkout(ctx, materialID, "2099-12-31")
	if err != nil || !deleted {
		t.Fatalf("expected material workout cleanup success: %v, %v", deleted, err)
	}
	deleted, err = db.DeleteWorkout(ctx, legacyID, "2099-12-31")
	if err != nil || !deleted {
		t.Fatalf("expected legacy workout cleanup success: %v, %v", deleted, err)
	}
}

func TestPostgresLearningMaterialSeedAndProgressRoundTrip(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	const ownerID = "00000000-0000-4000-8000-000000000070"
	const otherID = "00000000-0000-4000-8000-000000000071"
	raw, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	_, _ = raw.Exec(ctx, `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`, ownerID, otherID)
	defer func() {
		_, _ = raw.Exec(context.Background(), `DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`, ownerID, otherID)
	}()
	now := time.Now().UTC()
	for _, user := range []struct{ id, email string }{{ownerID, "learning-seed-owner@example.test"}, {otherID, "learning-seed-other@example.test"}} {
		if _, err := raw.Exec(ctx, `INSERT INTO users (id, email, display_name, password_hash, role, email_verified_at, created_at, updated_at) VALUES ($1::uuid, $2, $3, $4, 'user', $5, $5, $5)`, user.id, user.email, "Seed Test", "test-hash", now); err != nil {
			t.Fatal(err)
		}
	}
	db, err := store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	seed, err := learningseed.Load()
	if err != nil {
		t.Fatal(err)
	}
	if err := db.SeedLearningMaterials(ctx, seed); err != nil {
		t.Fatal(err)
	}
	if err := db.SeedLearningMaterials(ctx, seed); err != nil {
		t.Fatal(err)
	}
	var total, published int
	if err := raw.QueryRow(ctx, `SELECT COUNT(*), COUNT(*) FILTER (WHERE published) FROM learning_materials`).Scan(&total, &published); err != nil {
		t.Fatal(err)
	}
	if total != 102 || published != 99 {
		t.Fatalf("unexpected seeded counts: total=%d published=%d", total, published)
	}
	materials, err := db.ListLearningMaterials(ctx, ownerID, "english", "grammar", "A1", now)
	if err != nil || len(materials) != 19 {
		t.Fatalf("unexpected A1 catalogue: count=%d err=%v", len(materials), err)
	}
	var selected model.LearningMaterialSummary
	for _, candidate := range materials {
		if candidate.ID == "tenses-a1-be-and-present-simple" {
			selected = candidate
		}
	}
	if selected.ID == "" {
		t.Fatal("published A1 seed lesson was not listed")
	}
	detail, found, err := db.GetLearningMaterial(ctx, selected.ID, ownerID, now)
	if err != nil || !found || len(detail.Content) == 0 {
		t.Fatalf("unexpected material detail: found=%v content=%d err=%v", found, len(detail.Content), err)
	}
	progress, found, err := db.UpsertLearningMaterialProgress(ctx, ownerID, model.LearningMaterialProgressInput{MaterialID: selected.ID, ContentVersion: selected.ContentVersion, Status: "in_progress", ObjectiveState: map[string]bool{"0": true}, AttemptCount: 1}, now)
	if err != nil || !found || progress.OwnerUserID != ownerID || !progress.ObjectiveState["0"] {
		t.Fatalf("unexpected progress upsert: %+v found=%v err=%v", progress, found, err)
	}
	otherMaterials, err := db.ListLearningMaterials(ctx, otherID, "english", "grammar", "A1", now)
	if err != nil || len(otherMaterials) != 19 {
		t.Fatalf("unexpected other-user catalogue: count=%d err=%v", len(otherMaterials), err)
	}
	for _, candidate := range otherMaterials {
		if candidate.ID == selected.ID && candidate.Progress != nil {
			t.Fatalf("progress leaked across owners: %+v", candidate.Progress)
		}
	}
	if err := db.SeedLearningMaterials(ctx, seed); err != nil {
		t.Fatal(err)
	}
	check, found, err := db.GetLearningMaterial(ctx, selected.ID, ownerID, now)
	if err != nil || !found || check.Progress == nil || check.Progress.AttemptCount != 1 {
		t.Fatalf("progress was lost during idempotent reseed: %+v found=%v err=%v", check.Progress, found, err)
	}
}

func TestPostgresAuthOwnershipAndActivityRoundTrip(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	raw, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	userID := "00000000-0000-4000-8000-000000000099"
	eventID := "00000000-0000-4000-8000-000000000098"
	spendingID := "00000000-0000-4000-8000-000000000097"
	_, _ = raw.Exec(ctx, `DELETE FROM activity_events WHERE id = $1::uuid OR user_id = $2::uuid`, eventID, userID)
	_, _ = raw.Exec(ctx, `DELETE FROM spending_entries WHERE id = $1::uuid`, spendingID)
	_, _ = raw.Exec(ctx, `DELETE FROM users WHERE id = $1::uuid OR LOWER(email) = LOWER($2)`, userID, "auth-integration@example.test")
	defer func() {
		_, _ = raw.Exec(context.Background(), `DELETE FROM activity_events WHERE id = $1::uuid OR user_id = $2::uuid`, eventID, userID)
		_, _ = raw.Exec(context.Background(), `DELETE FROM spending_entries WHERE id = $1::uuid`, spendingID)
		_, _ = raw.Exec(context.Background(), `DELETE FROM users WHERE id = $1::uuid OR LOWER(email) = LOWER($2)`, userID, "auth-integration@example.test")
	}()
	db, err := store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	now := time.Now().UTC().Truncate(time.Microsecond)
	token := sha256.Sum256([]byte("verification-token"))
	user := model.User{ID: userID, Email: "auth-integration@example.test", DisplayName: "Auth Test", PasswordHash: "hash", Role: "user", CreatedAt: now, UpdatedAt: now}
	registered, shouldSend, err := db.RegisterUser(ctx, user, hex.EncodeToString(token[:]), now.Add(time.Hour))
	if err != nil || !shouldSend || registered.ID != userID {
		t.Fatalf("registration failed: %+v %v %v", registered, shouldSend, err)
	}
	rotatedToken := sha256.Sum256([]byte("rotated-verification-token"))
	duplicate := user
	duplicate.PasswordHash = "attacker-replacement-hash"
	repeated, shouldSend, err := db.RegisterUser(ctx, duplicate, hex.EncodeToString(rotatedToken[:]), now.Add(time.Hour))
	if err != nil || !shouldSend || repeated.PasswordHash != "hash" {
		t.Fatalf("duplicate registration changed password or failed rotation: %+v %v %v", repeated, shouldSend, err)
	}
	verified, found, err := db.VerifyEmail(ctx, hex.EncodeToString(rotatedToken[:]), now.Add(time.Minute))
	if err != nil || !found || verified.EmailVerifiedAt == nil {
		t.Fatalf("verification failed: %+v %v %v", verified, found, err)
	}
	sessionHash := strings.Repeat("a", 64)
	if err := db.CreateSession(ctx, model.Session{TokenHash: sessionHash, UserID: userID, ExpiresAt: now.Add(time.Hour), CreatedAt: now, LastSeenAt: now}); err != nil {
		t.Fatal(err)
	}
	sessionUser, found, err := db.GetSessionUser(ctx, sessionHash, now.Add(2*time.Minute))
	if err != nil || !found || sessionUser.ID != userID {
		t.Fatalf("session lookup failed: %+v %v %v", sessionUser, found, err)
	}
	updated, found, err := db.UpdateUserProfile(ctx, userID, "Updated Auth Test", now.Add(3*time.Minute))
	if err != nil || !found || updated.DisplayName != "Updated Auth Test" {
		t.Fatalf("profile update failed: %+v %v %v", updated, found, err)
	}
	spending, err := db.CreateSpending(ctx, model.SpendingEntry{ID: spendingID, OwnerUserID: userID, Date: "2099-12-29", Description: "Owned expense", Category: "Test", Amount: 1, PaymentMethod: "Test", Note: "Temporary", CreatedAt: now})
	if err != nil || spending.OwnerUserID != userID {
		t.Fatalf("ownership persistence failed: %+v %v", spending, err)
	}
	event := model.ActivityEvent{ID: eventID, UserID: userID, ActorName: updated.DisplayName, ActorEmail: updated.Email, ActorRole: updated.Role, Action: "create", EntityType: "spending", EntityID: spendingID, Description: "Created owned expense", Metadata: map[string]any{"amount": 1}, CreatedAt: now}
	if err := db.CreateActivity(ctx, event); err != nil {
		t.Fatal(err)
	}
	events, err := db.ListActivities(ctx, userID, false, 10)
	if err != nil || len(events) != 1 || events[0].ActorEmail != user.Email {
		t.Fatalf("activity lookup failed: %+v %v", events, err)
	}
}
