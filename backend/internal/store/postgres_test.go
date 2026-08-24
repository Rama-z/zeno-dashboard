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
