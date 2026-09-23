package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"zeno-backend/internal/api"
	"zeno-backend/internal/model"
)

type workspaceStore struct {
	fakeStore
	rows map[string]model.DoingTask
}

func (s *workspaceStore) CreateDoingTask(_ context.Context, v model.DoingTask) (model.DoingTask, error) {
	if s.rows == nil {
		s.rows = map[string]model.DoingTask{}
	}
	s.rows[v.ID] = v
	return v, nil
}
func (s *workspaceStore) ListDoingTasks(_ context.Context, owner string, admin bool) ([]model.DoingTask, error) {
	out := []model.DoingTask{}
	for _, v := range s.rows {
		if admin || v.OwnerUserID == owner {
			out = append(out, v)
		}
	}
	return out, nil
}
func (s *workspaceStore) UpdateDoingTask(_ context.Context, v model.DoingTask, owner string, admin bool) (model.DoingTask, bool, error) {
	old, ok := s.rows[v.ID]
	if !ok || (!admin && old.OwnerUserID != owner) {
		return model.DoingTask{}, false, nil
	}
	v.OwnerUserID = old.OwnerUserID
	v.CreatedAt = old.CreatedAt
	s.rows[v.ID] = v
	return v, true, nil
}
func (s *workspaceStore) DeleteDoingTask(_ context.Context, id, owner string, admin bool) (bool, error) {
	v, ok := s.rows[id]
	if !ok || (!admin && v.OwnerUserID != owner) {
		return false, nil
	}
	delete(s.rows, id)
	return true, nil
}
func (s *workspaceStore) GetSessionUser(_ context.Context, _ string, now time.Time) (model.User, bool, error) {
	return model.User{ID: revisionTestUserID, Role: "user", EmailVerifiedAt: &now}, true, nil
}

func TestWorkspaceReadOnlyAndUnknownFieldsRejected(t *testing.T) {
	s := &workspaceStore{}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	for _, field := range []string{`"id":"ffffffff-ffff-4fff-8fff-ffffffffffff"`, `"ownerUserId":"ffffffff-ffff-4fff-8fff-ffffffffffff"`, `"legacyMetadata":{}`, `"surprise":true`} {
		body := strings.Replace(fullTask, `"title":`, `"title":`, 1)
		body = strings.TrimSuffix(body, "}") + "," + field + "}"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, workspaceRequest("POST", "/api/doing/tasks", body))
		if w.Code != 400 {
			t.Errorf("field %s accepted: %d %s", field, w.Code, w.Body.String())
		}
	}
}
func TestWorkspaceGetDetail(t *testing.T) {
	s := &workspaceStore{}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, workspaceRequest("POST", "/api/doing/tasks", fullTask))
	var task model.DoingTask
	_ = json.Unmarshal(w.Body.Bytes(), &task)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, workspaceRequest("GET", "/api/doing/tasks/"+task.ID, ""))
	if w.Code != 200 || !strings.Contains(w.Body.String(), task.ID) {
		t.Fatalf("detail %d %s", w.Code, w.Body.String())
	}
}

const fullTask = `{"title":"Integrate API","area":"Work","project":"Zeno","type":"Deep Work","status":"Ready","priority":"P1","urgency":"High","impact":"High","effort":"Medium","energy":"Low","focus":"Deep","duration":{"minMinutes":60,"maxMinutes":120},"context":"@computer","device":"Laptop","location":"Home","timePreference":"Morning","difficulty":"Medium","resistance":"Low","due":"2026-09-25","nextAction":"Inspect client","definitionOfDone":[{"text":"API connected","done":false},{"text":"Error handling","done":true}],"plannedDate":null,"notes":"Line one\n\nLine two"}`

func workspaceRequest(method, path, body string) *http.Request {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.AddCookie(&http.Cookie{Name: "zeno_session", Value: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"})
	r.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "csrf-value"})
	r.Header.Set("X-CSRF-Token", "csrf-value")
	r.Header.Set("Content-Type", "application/json")
	return r
}
func TestWorkspaceCreateRoundTripAndStableChecklistIDs(t *testing.T) {
	s := &workspaceStore{}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, workspaceRequest("POST", "/api/doing/tasks", fullTask))
	if w.Code != 201 {
		t.Fatalf("create %d %s", w.Code, w.Body.String())
	}
	var task model.DoingTask
	if err := json.Unmarshal(w.Body.Bytes(), &task); err != nil {
		t.Fatal(err)
	}
	if task.ID == "" || task.OwnerUserID != revisionTestUserID || task.PlannedDate != nil || task.Due == nil || task.Notes != "Line one\n\nLine two" || len(task.DefinitionOfDone) != 2 || task.DefinitionOfDone[0].ID == "" || task.DefinitionOfDone[0].ID == task.DefinitionOfDone[1].ID {
		t.Fatalf("roundtrip %+v", task)
	}
	w = httptest.NewRecorder()
	h.ServeHTTP(w, workspaceRequest("GET", "/api/doing/tasks", ""))
	if w.Code != 200 || !strings.Contains(w.Body.String(), task.DefinitionOfDone[0].ID) {
		t.Fatalf("list %d %s", w.Code, w.Body.String())
	}
	update := strings.Replace(fullTask, `"plannedDate":null`, `"plannedDate":"2026-09-23"`, 1)
	update = strings.Replace(update, `"due":"2026-09-25"`, `"due":null`, 1)
	update = strings.Replace(update, `{"text":"API connected"`, `{"id":"`+task.DefinitionOfDone[0].ID+`","text":"API connected"`, 1)
	update = strings.Replace(update, `{"text":"Error handling"`, `{"id":"`+task.DefinitionOfDone[1].ID+`","text":"Error handling"`, 1)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, workspaceRequest("PUT", "/api/doing/tasks/"+task.ID, update))
	if w.Code != 200 {
		t.Fatalf("update %d %s", w.Code, w.Body.String())
	}
	var changed model.DoingTask
	_ = json.Unmarshal(w.Body.Bytes(), &changed)
	if changed.Due != nil || changed.PlannedDate == nil || *changed.PlannedDate != "2026-09-23" || changed.DefinitionOfDone[0].ID != task.DefinitionOfDone[0].ID {
		t.Fatalf("update %+v", changed)
	}
}
