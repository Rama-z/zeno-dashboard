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

func TestManualLearningOwnerScopedRoundTrip(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := store.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	raw, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer raw.Close()
	const a = "00000000-0000-4000-8000-000000009111"
	const b = "00000000-0000-4000-8000-000000009112"
	for _, u := range []struct{ id, email string }{{a, "manual-learn-a@example.test"}, {b, "manual-learn-b@example.test"}} {
		_, err = raw.Exec(ctx, `INSERT INTO users (id,email,display_name,password_hash) VALUES ($1,$2,'Test','hash') ON CONFLICT (id) DO NOTHING`, u.id, u.email)
		if err != nil {
			t.Fatal(err)
		}
	}
	defer func() {
		cleanup := context.Background()
		_, _ = raw.Exec(cleanup, `DELETE FROM users WHERE id IN ($1,$2)`, a, b)
	}()
	mod := model.LearningModule{ID: "00000000-0000-4000-8000-000000009113", OwnerUserID: a, Title: "Manual study", Category: "Science", Materials: []model.ModuleMaterial{}, CreatedAt: time.Now().UTC()}
	_, err = db.CreateLearningModule(ctx, mod)
	if err != nil {
		t.Fatal(err)
	}
	modules, err := db.ListLearningModules(ctx, model.LearningScope{OwnerUserID: b})
	if err != nil || len(modules) != 0 {
		t.Fatalf("foreign list %+v %v", modules, err)
	}
	_, found, err := db.GetLearningModule(ctx, mod.ID, model.LearningScope{OwnerUserID: b})
	if err != nil || found {
		t.Fatalf("foreign detail found=%v err=%v", found, err)
	}
	material := model.ModuleMaterial{ID: "00000000-0000-4000-8000-000000009114", Type: "pdf", Title: "PDF", FileName: "notes.pdf", MimeType: "application/pdf", ByteSize: 8}
	_, found, err = db.CreateModuleMaterial(ctx, mod.ID, model.LearningScope{OwnerUserID: a}, material, []byte("%PDF-1.7"))
	if err != nil || !found {
		t.Fatalf("material %v %v", found, err)
	}
	_, found, err = db.PutModuleFile(ctx, mod.ID, material.ID, model.LearningScope{OwnerUserID: b}, "pdf:foreign.pdf", []byte("%PDF-1.7 foreign"))
	if err != nil || found {
		t.Fatalf("foreign file replacement %v %v", found, err)
	}
	updatedFile, found, err := db.PutModuleFile(ctx, mod.ID, material.ID, model.LearningScope{OwnerUserID: a}, "pdf:owned.pdf", []byte("%PDF-1.7 owned"))
	if err != nil || !found || updatedFile.FileName != "owned.pdf" {
		t.Fatalf("owned file replacement %+v %v %v", updatedFile, found, err)
	}
	_, found, err = db.PutModuleFile(ctx, mod.ID, material.ID, model.LearningScope{OwnerUserID: a}, "video:wrong.mp4", []byte("xxxxftyp"))
	if err != nil || found {
		t.Fatalf("type mismatch replacement %v %v", found, err)
	}
	_, _, found, err = db.GetModuleFile(ctx, mod.ID, material.ID, model.LearningScope{OwnerUserID: b})
	if err != nil || found {
		t.Fatalf("foreign file %v %v", found, err)
	}
	_, bytes, found, err := db.GetModuleFile(ctx, mod.ID, material.ID, model.LearningScope{OwnerUserID: a})
	if err != nil || !found || string(bytes) != "%PDF-1.7 owned" {
		t.Fatalf("file readback %v %v %s", found, err, bytes)
	}
	session := model.LearningSession{ID: "00000000-0000-4000-8000-000000009115", OwnerUserID: a, ModuleID: mod.ID, Date: "2099-12-31", Title: "Practice", Status: "completed", Reflection: "I understood it", PlannedItems: []model.LearningPortion{{MaterialID: material.ID, StartPage: 1, EndPage: 3}}, ActualItems: []model.LearningPortion{}, CreatedAt: time.Now().UTC()}
	_, found, err = db.CreateLearningSession(ctx, session, model.LearningScope{OwnerUserID: a})
	if err != nil || !found {
		t.Fatalf("create session %v %v", found, err)
	}
	invalid := session
	invalid.Reflection = " "
	invalid.Status = "completed"
	_, found, err = db.UpdateLearningSession(ctx, invalid, model.LearningScope{OwnerUserID: a})
	if err != nil || found {
		t.Fatalf("blank completed reflection was accepted %v %v", found, err)
	}
	sessions, err := db.ListLearningSessions(ctx, model.LearningScope{OwnerUserID: a})
	if err != nil {
		t.Fatal(err)
	}
	match := false
	for _, s := range sessions {
		if s.ID == session.ID {
			match = s.Date == session.Date && s.Reflection == session.Reflection && len(s.PlannedItems) == 1
		}
	}
	if !match {
		t.Fatalf("session readback missing: %+v", sessions)
	}
	_, found, err = db.GetLearningSession(ctx, session.ID, model.LearningScope{OwnerUserID: b})
	if err != nil || found {
		t.Fatalf("foreign session %v %v", found, err)
	}
	foreign := session
	foreign.ID = "00000000-0000-4000-8000-000000009116"
	foreign.OwnerUserID = b
	_, found, err = db.CreateLearningSession(ctx, foreign, model.LearningScope{OwnerUserID: b})
	if err != nil || found {
		t.Fatalf("foreign module linkage %v %v", found, err)
	}
	// Even when the module is owned, a portion from another module cannot be linked.
	other := mod
	other.ID = "00000000-0000-4000-8000-000000009117"
	_, err = db.CreateLearningModule(ctx, other)
	if err != nil {
		t.Fatal(err)
	}
	foreign = session
	foreign.ID = "00000000-0000-4000-8000-000000009118"
	foreign.ModuleID = other.ID
	_, found, err = db.CreateLearningSession(ctx, foreign, model.LearningScope{OwnerUserID: a})
	if err != nil || found {
		t.Fatalf("foreign material linkage %v %v", found, err)
	}
	found, err = db.DeleteLearningModule(ctx, mod.ID, model.LearningScope{OwnerUserID: b})
	if err != nil || found {
		t.Fatalf("foreign delete %v %v", found, err)
	}
	found, err = db.DeleteLearningModule(ctx, mod.ID, model.LearningScope{OwnerUserID: a})
	if err != nil || !found {
		t.Fatalf("delete %v %v", found, err)
	}
}
