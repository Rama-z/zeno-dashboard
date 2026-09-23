package api_test

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"zeno-backend/internal/api"
	"zeno-backend/internal/model"
)

func TestWorkspaceRejectsInvalidInputsWithoutPersistence(t *testing.T) {
	s := &workspaceStore{}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	cases := map[string]string{
		"missing project":         strings.Replace(fullTask, `"project":"Zeno"`, `"project":""`, 1),
		"invalid duration":        strings.Replace(fullTask, `"maxMinutes":120`, `"maxMinutes":20`, 1),
		"duration above cap":      strings.Replace(fullTask, `"maxMinutes":120`, `"maxMinutes":241`, 1),
		"invalid due":             strings.Replace(fullTask, `"due":"2026-09-25"`, `"due":"2026-02-30"`, 1),
		"invalid planned":         strings.Replace(fullTask, `"plannedDate":null`, `"plannedDate":"2026-13-01"`, 1),
		"empty checklist":         strings.Replace(fullTask, `"definitionOfDone":[{"text":"API connected","done":false},{"text":"Error handling","done":true}]`, `"definitionOfDone":[]`, 1),
		"unknown status":          strings.Replace(fullTask, `"status":"Ready"`, `"status":"Unknown"`, 1),
		"injected duration label": strings.Replace(fullTask, `"minMinutes":60`, `"label":"spoof","minMinutes":60`, 1),
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			w := httptest.NewRecorder()
			h.ServeHTTP(w, workspaceRequest("POST", "/api/doing/tasks", body))
			if w.Code != 400 || len(s.rows) != 0 {
				t.Fatalf("invalid request persisted: %d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestWorkspaceChecklistReorderAndMetadataProtection(t *testing.T) {
	s := &workspaceStore{}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, workspaceRequest("POST", "/api/doing/tasks", fullTask))
	var created model.DoingTask
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	created.LegacyMetadata = map[string]any{"actualMinutes": 90, "goalOutcome": "Legacy original"}
	s.rows[created.ID] = created
	var input map[string]any
	_ = json.Unmarshal([]byte(fullTask), &input)
	input["title"] = "⚡ <script>alert(1)</script>"
	input["definitionOfDone"] = []map[string]any{{"id": created.DefinitionOfDone[1].ID, "text": "Error handling updated", "done": false}, {"text": "New criterion", "done": true}}
	body, _ := json.Marshal(input)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, workspaceRequest("PUT", "/api/doing/tasks/"+created.ID, string(body)))
	if w.Code != 200 {
		t.Fatalf("edit %d %s", w.Code, w.Body.String())
	}
	var updated model.DoingTask
	_ = json.Unmarshal(w.Body.Bytes(), &updated)
	if updated.Title != input["title"] || len(updated.DefinitionOfDone) != 2 || updated.DefinitionOfDone[0].ID != created.DefinitionOfDone[1].ID || updated.DefinitionOfDone[0].Done || updated.DefinitionOfDone[1].ID == "" || updated.DefinitionOfDone[1].ID == created.DefinitionOfDone[0].ID || updated.LegacyMetadata["goalOutcome"] != "Legacy original" || updated.Status != "Ready" {
		t.Fatalf("edit attributes %+v", updated)
	}
	// A foreign ID cannot be attached to this task; no partial write.
	input["definitionOfDone"] = []map[string]any{{"id": "ffffffff-ffff-4fff-8fff-ffffffffffff", "text": "Foreign", "done": true}}
	body, _ = json.Marshal(input)
	w = httptest.NewRecorder()
	h.ServeHTTP(w, workspaceRequest("PUT", "/api/doing/tasks/"+created.ID, string(body)))
	if w.Code != 400 || s.rows[created.ID].DefinitionOfDone[0].ID == "ffffffff-ffff-4fff-8fff-ffffffffffff" {
		t.Fatalf("foreign criterion accepted: %d", w.Code)
	}
}
