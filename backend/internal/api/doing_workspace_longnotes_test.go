package api_test

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"zeno-backend/internal/api"
	"zeno-backend/internal/model"
)

type longNotesDoingStore struct{ doingOwnershipStore }

func (s *longNotesDoingStore) ListDoing(_ context.Context, date, owner string, admin bool) ([]model.DoingEntry, error) {
	return []model.DoingEntry{{ID: "55555555-5555-4555-8555-555555555555", OwnerUserID: revisionTestUserID, Date: date, Title: "Long note", Status: "todo", Priority: "medium", EnergyFocus: "medium", Category: "Work", Note: strings.Repeat("x", 2001)}}, nil
}
func TestLegacyOverviewRejectsLongWorkspaceNotesWithoutTruncation(t *testing.T) {
	s := &longNotesDoingStore{}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	body := `{"date":"2026-08-23","title":"Long note updated","note":"short","category":"Work","status":"todo"}`
	w := httptest.NewRecorder()
	h.ServeHTTP(w, workspaceRequest("PUT", "/api/doing/55555555-5555-4555-8555-555555555555", body))
	if w.Code != 400 || !strings.Contains(w.Body.String(), "Complete Workspace") || s.updateCalls != 0 {
		t.Fatalf("legacy update lost long notes: %d %s calls=%d", w.Code, w.Body.String(), s.updateCalls)
	}
}
