package api_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
	"zeno-backend/internal/api"
	"zeno-backend/internal/model"
)

func TestWorkspaceLegacyNotesEditPreservesUnknownAttributes(t *testing.T) {
	id := "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	var old model.DoingTask
	_ = json.Unmarshal([]byte(fullTask), &old)
	old.ID = id
	old.OwnerUserID = revisionTestUserID
	old.Area = "All Rounder"
	old.Project = ""
	old.Type = ""
	old.Urgency = ""
	old.Impact = ""
	old.Effort = ""
	old.Energy = ""
	old.Context = ""
	old.Device = ""
	old.Location = ""
	old.TimePreference = ""
	old.Difficulty = ""
	old.Resistance = ""
	old.NextAction = ""
	old.DefinitionOfDone = []model.DoingCriterion{}
	old.LegacyMetadata = map[string]any{"category": "All Rounder", "goalOutcome": "Original legacy data"}
	s := &workspaceStore{rows: map[string]model.DoingTask{id: old}}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	var payload map[string]any
	_ = json.Unmarshal([]byte(fullTask), &payload)
	payload["area"] = "All Rounder"
	payload["project"] = ""
	for _, key := range []string{"type", "urgency", "impact", "effort", "energy", "context", "device", "location", "timePreference", "difficulty", "resistance", "nextAction"} {
		payload[key] = ""
	}
	payload["definitionOfDone"] = []any{}
	payload["notes"] = "New note\n\nSecond paragraph"
	body, _ := json.Marshal(payload)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, workspaceRequest("PUT", "/api/doing/tasks/"+id, string(body)))
	if w.Code != 200 {
		t.Fatalf("legacy edit %d %s", w.Code, w.Body.String())
	}
	var changed model.DoingTask
	_ = json.Unmarshal(w.Body.Bytes(), &changed)
	if changed.Area != "All Rounder" || changed.NextAction != "" || len(changed.DefinitionOfDone) != 0 || changed.Notes != "New note\n\nSecond paragraph" || changed.LegacyMetadata["goalOutcome"] != "Original legacy data" {
		t.Fatalf("legacy changed %+v", changed)
	}
	payload["area"] = "Made Up"
	body, _ = json.Marshal(payload)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, workspaceRequest("PUT", "/api/doing/tasks/"+id, string(body)))
	if w.Code != 400 {
		t.Fatalf("new invalid area accepted: %d", w.Code)
	}
}
