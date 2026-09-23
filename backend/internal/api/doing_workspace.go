package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"
	"zeno-backend/internal/model"
)

type doingTaskStore interface {
	CreateDoingTask(context.Context, model.DoingTask) (model.DoingTask, error)
	ListDoingTasks(context.Context, string, bool) ([]model.DoingTask, error)
	UpdateDoingTask(context.Context, model.DoingTask, string, bool) (model.DoingTask, bool, error)
	DeleteDoingTask(context.Context, string, string, bool) (bool, error)
}

var doingUUID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func doingDurationLabel(v model.DoingDuration) string {
	switch {
	case v.MinMinutes == 15 && v.MaxMinutes == 30:
		return "15–30 minutes"
	case v.MinMinutes == 30 && v.MaxMinutes == 60:
		return "30–60 minutes"
	case v.MinMinutes == 60 && v.MaxMinutes == 120:
		return "1–2 hours"
	case v.MinMinutes == 120 && v.MaxMinutes == 240:
		return "2–4 hours"
	default:
		return fmt.Sprintf("%d–%d minutes", v.MinMinutes, v.MaxMinutes)
	}
}
func oneOf(v string, allowed ...string) bool {
	for _, x := range allowed {
		if v == x {
			return true
		}
	}
	return false
}

func legacyUnchanged(value string, previous *model.DoingTask, previousValue string) bool {
	return previous != nil && previous.LegacyMetadata != nil && value == previousValue
}
func previousField(previous *model.DoingTask, get func(model.DoingTask) string) string {
	if previous == nil {
		return ""
	}
	return get(*previous)
}

func normalizeDoingTask(v *model.DoingTask, previous *model.DoingTask) error {
	v.Title = strings.TrimSpace(v.Title)
	v.Project = strings.TrimSpace(v.Project)
	v.NextAction = strings.TrimSpace(v.NextAction)
	// Notes are intentionally not trimmed: paragraph breaks and indentation are user content.
	if v.Title == "" || (v.Project == "" && !legacyUnchanged(v.Project, previous, previousField(previous, func(x model.DoingTask) string { return x.Project }))) || (v.NextAction == "" && !legacyUnchanged(v.NextAction, previous, previousField(previous, func(x model.DoingTask) string { return x.NextAction }))) || utf8.RuneCountInString(v.Title) > 160 || utf8.RuneCountInString(v.Project) > 160 || utf8.RuneCountInString(v.NextAction) > 500 || utf8.RuneCountInString(v.Notes) > 20000 {
		return errors.New("title, project, nextAction wajib diisi dan panjangnya dibatasi")
	}
	for _, date := range []*string{v.Due, v.PlannedDate} {
		if date != nil && !validDate(*date) {
			return errors.New("due dan plannedDate harus YYYY-MM-DD atau null")
		}
	}
	if v.Duration.MinMinutes < 1 || v.Duration.MaxMinutes < v.Duration.MinMinutes || v.Duration.MaxMinutes > 240 {
		return errors.New("duration harus 1-240 menit dengan min <= max")
	}
	v.Duration.Label = doingDurationLabel(v.Duration)
	options := []struct {
		value, old string
		allowed    []string
	}{
		{v.Area, previousField(previous, func(x model.DoingTask) string { return x.Area }), []string{"💻 Personal Project", "Work", "Personal"}},
		{v.Type, previousField(previous, func(x model.DoingTask) string { return x.Type }), []string{"Deep Work", "Admin", "Creative", "Communication"}},
		{v.Status, previousField(previous, func(x model.DoingTask) string { return x.Status }), []string{"Ready", "In progress", "Blocked", "Done"}},
		{v.Priority, previousField(previous, func(x model.DoingTask) string { return x.Priority }), []string{"P0", "P1", "P2", "P3"}},
		{v.Urgency, previousField(previous, func(x model.DoingTask) string { return x.Urgency }), []string{"Low", "Normal", "High"}},
		{v.Impact, previousField(previous, func(x model.DoingTask) string { return x.Impact }), []string{"Low", "Medium", "High"}},
		{v.Effort, previousField(previous, func(x model.DoingTask) string { return x.Effort }), []string{"Low", "Medium", "High"}},
		{v.Energy, previousField(previous, func(x model.DoingTask) string { return x.Energy }), []string{"Low", "Medium", "High"}},
		{v.Focus, previousField(previous, func(x model.DoingTask) string { return x.Focus }), []string{"Light", "Moderate", "Deep"}},
		{v.Context, previousField(previous, func(x model.DoingTask) string { return x.Context }), []string{"@computer", "@home", "@office", "@errands"}},
		{v.Device, previousField(previous, func(x model.DoingTask) string { return x.Device }), []string{"Laptop", "Phone", "Tablet", "Any device"}},
		{v.Location, previousField(previous, func(x model.DoingTask) string { return x.Location }), []string{"Anywhere", "Home", "Office", "Library"}},
		{v.TimePreference, previousField(previous, func(x model.DoingTask) string { return x.TimePreference }), []string{"Morning", "Afternoon", "Evening", "Anytime"}},
		{v.Difficulty, previousField(previous, func(x model.DoingTask) string { return x.Difficulty }), []string{"Low", "Medium", "High"}},
		{v.Resistance, previousField(previous, func(x model.DoingTask) string { return x.Resistance }), []string{"Low", "Medium", "High"}},
	}
	for _, opt := range options {
		if !oneOf(opt.value, opt.allowed...) && !legacyUnchanged(opt.value, previous, opt.old) {
			return errors.New("atribut workspace tidak valid")
		}
	}
	if (len(v.DefinitionOfDone) < 1 && !(previous != nil && previous.LegacyMetadata != nil && len(previous.DefinitionOfDone) == 0)) || len(v.DefinitionOfDone) > 100 {
		return errors.New("definitionOfDone harus berisi 1-100 kriteria")
	}
	existing := map[string]bool{}
	if previous != nil {
		for _, c := range previous.DefinitionOfDone {
			existing[c.ID] = true
		}
	}
	seen := map[string]bool{}
	for i := range v.DefinitionOfDone {
		c := &v.DefinitionOfDone[i]
		c.Text = strings.TrimSpace(c.Text)
		if c.Text == "" || utf8.RuneCountInString(c.Text) > 500 {
			return errors.New("teks kriteria tidak valid")
		}
		if c.ID == "" {
			c.ID = newUUID()
		} else if !doingUUID.MatchString(c.ID) || previous == nil || !existing[c.ID] {
			return errors.New("id kriteria bukan milik task")
		}
		if seen[c.ID] {
			return errors.New("id kriteria duplikat")
		}
		seen[c.ID] = true
	}
	return nil
}

func decodeDoingTask(r *http.Request, v *model.DoingTask) error {
	var fields map[string]json.RawMessage
	if err := decodeJSON(r, &fields); err != nil {
		return err
	}
	allowed := map[string]bool{}
	for _, k := range []string{"title", "area", "project", "type", "status", "priority", "urgency", "impact", "effort", "energy", "focus", "duration", "context", "device", "location", "timePreference", "difficulty", "resistance", "due", "nextAction", "definitionOfDone", "plannedDate", "notes"} {
		allowed[k] = true
	}
	for k := range fields {
		if !allowed[k] {
			return errors.New("field tidak dikenal atau read-only: " + k)
		}
	}
	if raw, ok := fields["duration"]; ok {
		var duration map[string]json.RawMessage
		if json.Unmarshal(raw, &duration) != nil {
			return errors.New("duration tidak valid")
		}
		for k := range duration {
			if k != "minMinutes" && k != "maxMinutes" {
				return errors.New("duration hanya menerima minMinutes dan maxMinutes")
			}
		}
	}
	if raw, ok := fields["definitionOfDone"]; ok {
		var items []map[string]json.RawMessage
		if json.Unmarshal(raw, &items) != nil {
			return errors.New("definitionOfDone tidak valid")
		}
		for _, item := range items {
			for k := range item {
				if k != "id" && k != "text" && k != "done" {
					return errors.New("field kriteria tidak dikenal")
				}
			}
		}
	}
	raw, err := json.Marshal(fields)
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	return decoder.Decode(v)
}

func (h *handler) taskStore() doingTaskStore { s, _ := h.store.(doingTaskStore); return s }
func (h *handler) createDoingTask(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var v model.DoingTask
	if err := decodeDoingTask(r, &v); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if err := normalizeDoingTask(&v, nil); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	v.ID = newUUID()
	v.OwnerUserID = actor.ID
	v.CreatedAt = h.auth.Now()
	v.UpdatedAt = v.CreatedAt
	created, err := h.taskStore().CreateDoingTask(r.Context(), v)
	if err != nil {
		writeError(w, 500, "task tidak dapat disimpan")
		return
	}
	h.audit(r.Context(), actor, "create", "doing_task", created.ID, "Menambahkan task Doing: "+created.Title, nil)
	writeJSON(w, 201, created)
}
func (h *handler) getDoingTask(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !doingUUID.MatchString(id) {
		writeError(w, 400, "id tidak valid")
		return
	}
	rows, err := h.taskStore().ListDoingTasks(r.Context(), actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, 500, "task tidak dapat dibaca")
		return
	}
	v, found := findOwned(rows, id, actor, func(x model.DoingTask) string { return x.ID }, func(x model.DoingTask) string { return x.OwnerUserID })
	if !found {
		writeError(w, 404, "task tidak ditemukan")
		return
	}
	writeJSON(w, 200, v)
}
func (h *handler) listDoingTasks(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	rows, err := h.taskStore().ListDoingTasks(r.Context(), actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, 500, "task tidak dapat dibaca")
		return
	}
	writeJSON(w, 200, map[string]any{"entries": rows})
}
func (h *handler) updateDoingTask(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !doingUUID.MatchString(id) {
		writeError(w, 400, "id tidak valid")
		return
	}
	var v model.DoingTask
	if err := decodeDoingTask(r, &v); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	rows, err := h.taskStore().ListDoingTasks(r.Context(), actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, 500, "task tidak dapat dibaca")
		return
	}
	old, found := findOwned(rows, id, actor, func(x model.DoingTask) string { return x.ID }, func(x model.DoingTask) string { return x.OwnerUserID })
	if !found {
		writeError(w, 404, "task tidak ditemukan")
		return
	}
	if err := normalizeDoingTask(&v, &old); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	v.ID = id
	v.OwnerUserID = old.OwnerUserID
	v.CreatedAt = old.CreatedAt
	v.LegacyMetadata = old.LegacyMetadata
	v.UpdatedAt = h.auth.Now()
	updated, found, err := h.taskStore().UpdateDoingTask(r.Context(), v, actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, 500, "task tidak dapat diperbarui")
		return
	}
	if !found {
		writeError(w, 404, "task tidak ditemukan")
		return
	}
	h.auditSubject(r.Context(), actor, updated.OwnerUserID, "update", "doing_task", id, "Memperbarui task Doing: "+updated.Title, nil)
	writeJSON(w, 200, updated)
}
func (h *handler) deleteDoingTask(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !doingUUID.MatchString(id) {
		writeError(w, 400, "id tidak valid")
		return
	}
	removed, err := h.taskStore().DeleteDoingTask(r.Context(), id, actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, 500, "task tidak dapat dihapus")
		return
	}
	if !removed {
		writeError(w, 404, "task tidak ditemukan")
		return
	}
	h.audit(r.Context(), actor, "delete", "doing_task", id, "Menghapus task Doing", nil)
	writeJSON(w, 200, map[string]string{"deleted": id})
}
