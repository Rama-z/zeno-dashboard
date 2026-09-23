package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"
	"zeno-backend/internal/model"
)

type manualLearningStore interface {
	CreateLearningModule(context.Context, model.LearningModule) (model.LearningModule, error)
	ListLearningModules(context.Context, model.LearningScope) ([]model.LearningModule, error)
	GetLearningModule(context.Context, string, model.LearningScope) (model.LearningModule, bool, error)
	UpdateLearningModule(context.Context, model.LearningModule, model.LearningScope) (model.LearningModule, bool, error)
	DeleteLearningModule(context.Context, string, model.LearningScope) (bool, error)
	CreateModuleMaterial(context.Context, string, model.LearningScope, model.ModuleMaterial, []byte) (model.ModuleMaterial, bool, error)
	UpdateModuleMaterial(context.Context, string, string, model.LearningScope, model.ModuleMaterial) (model.ModuleMaterial, bool, bool, error)
	DeleteModuleMaterial(context.Context, string, string, model.LearningScope) (bool, bool, error)
	GetModuleFile(context.Context, string, string, model.LearningScope) (model.ModuleMaterial, []byte, bool, error)
	CreateLearningSession(context.Context, model.LearningSession, model.LearningScope) (model.LearningSession, bool, error)
	ListLearningSessions(context.Context, model.LearningScope) ([]model.LearningSession, error)
	GetLearningSession(context.Context, string, model.LearningScope) (model.LearningSession, bool, error)
	UpdateLearningSession(context.Context, model.LearningSession, model.LearningScope) (model.LearningSession, bool, error)
}

func manualScope(actor model.User) model.LearningScope {
	return model.LearningScope{OwnerUserID: actor.ID, AllOwners: actor.Role == "admin" && actor.ID != ""}
}

func (h *handler) manualStore() manualLearningStore { s, _ := h.store.(manualLearningStore); return s }
func manualID(w http.ResponseWriter, id string) bool {
	if !doingUUID.MatchString(id) {
		writeError(w, 400, "id tidak valid")
		return false
	}
	return true
}
func moduleValid(v *model.LearningModule) error {
	v.Title = strings.TrimSpace(v.Title)
	v.Category = strings.TrimSpace(v.Category)
	v.Level = strings.TrimSpace(v.Level)
	if v.Title == "" || utf8.RuneCountInString(v.Title) > 160 || utf8.RuneCountInString(v.Category) > 80 || utf8.RuneCountInString(v.Level) > 40 || utf8.RuneCountInString(v.Objective) > 5000 || utf8.RuneCountInString(v.Note) > 20000 {
		return errors.New("module tidak valid")
	}
	return nil
}
func (h *handler) listManualModules(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	if actor.ID == "" {
		writeError(w, 401, "login diperlukan")
		return
	}
	list, err := h.manualStore().ListLearningModules(r.Context(), manualScope(actor))
	if err != nil {
		writeError(w, 500, "module tidak dapat dibaca")
		return
	}
	writeJSON(w, 200, map[string]any{"modules": list})
}
func (h *handler) createManualModule(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	if actor.ID == "" {
		writeError(w, 401, "login diperlukan")
		return
	}
	var v model.LearningModule
	if err := decodeJSON(r, &v); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if len(v.Materials) != 0 {
		writeError(w, 400, "materials harus disimpan terpisah setelah module dibuat")
		return
	}
	if err := moduleValid(&v); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	v.ID = newUUID()
	v.OwnerUserID = actor.ID
	v.CreatedAt = h.auth.Now()
	v.Materials = []model.ModuleMaterial{}
	out, err := h.manualStore().CreateLearningModule(r.Context(), v)
	if err != nil {
		writeError(w, 500, "module tidak dapat disimpan")
		return
	}
	writeJSON(w, 201, out)
}
func (h *handler) getManualModule(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !manualID(w, id) {
		return
	}
	v, found, err := h.manualStore().GetLearningModule(r.Context(), id, manualScope(actor))
	if err != nil {
		writeError(w, 500, "module tidak dapat dibaca")
		return
	}
	if !found {
		writeError(w, 404, "module tidak ditemukan")
		return
	}
	writeJSON(w, 200, v)
}
func (h *handler) updateManualModule(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !manualID(w, id) {
		return
	}
	var v model.LearningModule
	if err := decodeJSON(r, &v); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if len(v.Materials) != 0 {
		writeError(w, 400, "materials harus disimpan terpisah setelah module dibuat")
		return
	}
	if err := moduleValid(&v); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	v.ID = id
	out, found, err := h.manualStore().UpdateLearningModule(r.Context(), v, manualScope(actor))
	if err != nil {
		writeError(w, 500, "module tidak dapat disimpan")
		return
	}
	if !found {
		writeError(w, 404, "module tidak ditemukan")
		return
	}
	writeJSON(w, 200, out)
}
func (h *handler) deleteManualModule(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !manualID(w, id) {
		return
	}
	found, err := h.manualStore().DeleteLearningModule(r.Context(), id, manualScope(actor))
	if err != nil {
		writeError(w, 500, "module tidak dapat dihapus")
		return
	}
	if !found {
		writeError(w, 404, "module tidak ditemukan")
		return
	}
	w.WriteHeader(204)
}
func materialValid(m *model.ModuleMaterial) error {
	m.Title = strings.TrimSpace(m.Title)
	m.URL = strings.TrimSpace(m.URL)
	if m.Title == "" || utf8.RuneCountInString(m.Title) > 160 || len(m.Body) > 100000 || len(m.URL) > 2048 || m.SortOrder < 0 || m.SortOrder > 100000 || !oneOf(m.Type, "text", "pdf", "video", "youtube", "link") {
		return errors.New("material tidak valid")
	}
	if m.Type == "text" && strings.TrimSpace(m.Body) == "" {
		return errors.New("body wajib diisi")
	}
	if m.URL != "" || m.Type == "youtube" || m.Type == "link" {
		u, e := url.Parse(m.URL)
		if e != nil || u.Host == "" || !oneOf(u.Scheme, "https", "http") || u.User != nil {
			return errors.New("URL harus http(s) publik")
		}
		if m.Type == "youtube" && !oneOf(strings.ToLower(u.Hostname()), "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be") {
			return errors.New("URL YouTube tidak valid")
		}
	}
	return nil
}
func fileInfo(filename string, data []byte) (kind, mimeType, safeName string, err error) {
	safeName = strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == '\r' || r == '\n' || r < 32 || r == 127 {
			return '_'
		}
		return r
	}, filename)
	if len(safeName) > 180 {
		ext := ""
		if dot := strings.LastIndexByte(safeName, '.'); dot >= 0 && len(safeName)-dot <= 8 {
			ext = safeName[dot:]
			safeName = safeName[:dot]
		}
		prefix := []rune(safeName)
		if len(prefix) > 50 {
			prefix = prefix[:50]
		}
		safeName = string(prefix) + ext
	}
	if safeName == "" {
		safeName = "download"
	}
	lower := strings.ToLower(safeName)
	switch {
	case strings.HasSuffix(lower, ".pdf") && len(data) >= 8 && strings.HasPrefix(string(data[:5]), "%PDF-"):
		kind = "pdf"
		mimeType = "application/pdf"
	case strings.HasSuffix(lower, ".mp4") && len(data) >= 12 && string(data[4:8]) == "ftyp":
		kind = "video"
		mimeType = "video/mp4"
	case strings.HasSuffix(lower, ".webm") && len(data) >= 4 && string(data[:4]) == "\x1aE\xdf\xa3":
		kind = "video"
		mimeType = "video/webm"
	default:
		return "", "", "", errors.New("file harus PDF, MP4, atau WebM yang valid")
	}
	if (kind == "pdf" && len(data) > 20<<20) || (kind == "video" && len(data) > 100<<20) {
		return "", "", "", errors.New("ukuran file melebihi batas")
	}
	return
}
func (h *handler) createManualMaterial(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !manualID(w, id) {
		return
	}
	var m model.ModuleMaterial
	var data []byte
	media, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if media == "multipart/form-data" {
		var err error
		m, data, err = readManualUpload(w, r)
		if err != nil {
			writeError(w, 400, err.Error())
			return
		}
	} else if err := decodeJSON(r, &m); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if data == nil {
		m.FileName = ""
		m.MimeType = ""
		m.ByteSize = 0
	}
	if err := materialValid(&m); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	m.ID = newUUID()
	out, found, err := h.manualStore().CreateModuleMaterial(r.Context(), id, manualScope(actor), m, data)
	if err != nil {
		writeError(w, 500, "material tidak dapat disimpan")
		return
	}
	if !found {
		writeError(w, 404, "module tidak ditemukan")
		return
	}
	writeJSON(w, 201, out)
}

// Material edits are full metadata replacements. File metadata is always owned by /file.
func (h *handler) updateManualMaterial(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	module, material := r.PathValue("id"), r.PathValue("materialId")
	if !manualID(w, module) || !manualID(w, material) {
		return
	}
	var m model.ModuleMaterial
	if err := decodeJSON(r, &m); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	m.FileName, m.MimeType, m.ByteSize = "", "", 0
	if err := materialValid(&m); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	out, found, typeMatch, err := h.manualStore().UpdateModuleMaterial(r.Context(), module, material, manualScope(actor), m)
	if err != nil {
		writeError(w, 500, "material tidak dapat disimpan")
		return
	}
	if !found {
		writeError(w, 404, "material tidak ditemukan")
		return
	}
	if !typeMatch {
		writeError(w, 400, "type material tidak boleh diubah")
		return
	}
	writeJSON(w, 200, out)
}
func (h *handler) deleteManualMaterial(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	module, material := r.PathValue("id"), r.PathValue("materialId")
	if !manualID(w, module) || !manualID(w, material) {
		return
	}
	found, referenced, err := h.manualStore().DeleteModuleMaterial(r.Context(), module, material, manualScope(actor))
	if err != nil {
		writeError(w, 500, "material tidak dapat dihapus")
		return
	}
	if !found {
		writeError(w, 404, "material tidak ditemukan")
		return
	}
	if referenced {
		writeError(w, 409, "material dipakai oleh session")
		return
	}
	w.WriteHeader(204)
}
func readManualUpload(w http.ResponseWriter, r *http.Request) (model.ModuleMaterial, []byte, error) {
	var m model.ModuleMaterial
	r.Body = http.MaxBytesReader(w, r.Body, 101<<20)
	if err := r.ParseMultipartForm(101 << 20); err != nil {
		return m, nil, errors.New("form terlalu besar atau tidak valid")
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	f, head, err := r.FormFile("file")
	if err != nil {
		return m, nil, errors.New("field file wajib diisi")
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, (100<<20)+1))
	if err != nil {
		return m, nil, err
	}
	kind, typ, name, err := fileInfo(head.Filename, data)
	if err == nil {
		declared, _, parseErr := mime.ParseMediaType(head.Header.Get("Content-Type"))
		if parseErr == nil && declared != "" && declared != "application/octet-stream" && declared != typ {
			err = errors.New("MIME file tidak cocok dengan konten")
		}
	}
	if err != nil {
		return m, nil, err
	}
	m = model.ModuleMaterial{Type: kind, Title: r.FormValue("title"), SortOrder: 0, FileName: name, MimeType: typ, ByteSize: int64(len(data))}
	if order := r.FormValue("sortOrder"); order != "" {
		m.SortOrder, err = strconv.Atoi(order)
		if err != nil {
			return m, nil, errors.New("sortOrder tidak valid")
		}
	}
	return m, data, nil
}
func (h *handler) uploadManualFile(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id, material := r.PathValue("id"), r.PathValue("materialId")
	if !manualID(w, id) || !manualID(w, material) {
		return
	}
	_, data, err := readManualUpload(w, r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	s, ok := h.store.(interface {
		PutModuleFile(context.Context, string, string, model.LearningScope, string, []byte) (model.ModuleMaterial, bool, error)
	})
	if !ok {
		writeError(w, 500, "upload tidak tersedia")
		return
	}
	name := r.MultipartForm.File["file"][0].Filename
	kind, typ, safe, err := fileInfo(name, data)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	_ = typ
	out, found, err := s.PutModuleFile(r.Context(), id, material, manualScope(actor), kind+":"+safe, data)
	if err != nil {
		writeError(w, 500, "file tidak dapat disimpan")
		return
	}
	if !found {
		writeError(w, 404, "material tidak ditemukan")
		return
	}
	writeJSON(w, 200, out)
}
func (h *handler) getManualFile(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id, material := r.PathValue("id"), r.PathValue("materialId")
	if !manualID(w, id) || !manualID(w, material) {
		return
	}
	m, data, found, err := h.manualStore().GetModuleFile(r.Context(), id, material, manualScope(actor))
	if err != nil {
		writeError(w, 500, "file tidak dapat dibaca")
		return
	}
	if !found {
		writeError(w, 404, "file tidak ditemukan")
		return
	}
	w.Header().Set("Content-Type", m.MimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", m.FileName))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, no-store")
	_, _ = w.Write(data)
}
func sessionValid(v *model.LearningSession) error {
	v.Title = strings.TrimSpace(v.Title)
	if !validDate(v.Date) || v.Title == "" || len(v.Title) > 160 || !doingUUID.MatchString(v.ModuleID) || !oneOf(v.Status, "planned", "in_progress", "completed") || v.TargetMinutes < 0 || v.TargetMinutes > 1440 || v.ActualMinutes < 0 || v.ActualMinutes > 1440 || len(v.Method) > 2000 || len(v.Objective) > 5000 || len(v.PracticePlan) > 10000 || len(v.Reflection) > 20000 || len(v.Confusion) > 10000 || len(v.NextStep) > 10000 || v.ReviewDate != "" && !validDate(v.ReviewDate) {
		return errors.New("session tidak valid")
	}
	if v.Status == "completed" && strings.TrimSpace(v.Reflection) == "" {
		return errors.New("reflection wajib diisi sebelum selesai")
	}
	if v.PlannedItems == nil {
		v.PlannedItems = []model.LearningPortion{}
	}
	if v.ActualItems == nil {
		v.ActualItems = []model.LearningPortion{}
	}
	if len(v.PlannedItems) > 100 || len(v.ActualItems) > 100 {
		return errors.New("terlalu banyak portions")
	}
	for _, part := range append(append([]model.LearningPortion{}, v.PlannedItems...), v.ActualItems...) {
		if !doingUUID.MatchString(part.MaterialID) || part.StartPage < 0 || part.EndPage < 0 || part.StartSecond < 0 || part.EndSecond < 0 || part.StartPage > 100000 || part.EndPage > 100000 || part.StartSecond > 864000 || part.EndSecond > 864000 || (part.EndPage > 0 && (part.StartPage == 0 || part.EndPage < part.StartPage)) || (part.EndSecond > 0 && part.EndSecond < part.StartSecond) {
			return errors.New("portion tidak valid")
		}
	}
	return nil
}
func (h *handler) listManualSessions(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	list, err := h.manualStore().ListLearningSessions(r.Context(), manualScope(actor))
	if err != nil {
		writeError(w, 500, "sessions tidak dapat dibaca")
		return
	}
	writeJSON(w, 200, map[string]any{"sessions": list})
}
func (h *handler) createManualSession(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var v model.LearningSession
	if err := decodeJSON(r, &v); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if err := sessionValid(&v); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	v.ID = newUUID()
	v.CreatedAt = h.auth.Now()
	out, found, err := h.manualStore().CreateLearningSession(r.Context(), v, manualScope(actor))
	if err != nil {
		writeError(w, 500, "session tidak dapat disimpan")
		return
	}
	if !found {
		writeError(w, 404, "module atau material tidak ditemukan")
		return
	}
	writeJSON(w, 201, out)
}
func (h *handler) getManualSession(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !manualID(w, id) {
		return
	}
	v, found, err := h.manualStore().GetLearningSession(r.Context(), id, manualScope(actor))
	if err != nil {
		writeError(w, 500, "session tidak dapat dibaca")
		return
	}
	if !found {
		writeError(w, 404, "session tidak ditemukan")
		return
	}
	writeJSON(w, 200, v)
}
func (h *handler) updateManualSession(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !manualID(w, id) {
		return
	}
	var v model.LearningSession
	if err := decodeJSON(r, &v); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if err := sessionValid(&v); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	v.ID = id
	out, found, err := h.manualStore().UpdateLearningSession(r.Context(), v, manualScope(actor))
	if err != nil {
		writeError(w, 500, "session tidak dapat disimpan")
		return
	}
	if !found {
		writeError(w, 404, "session atau material tidak ditemukan")
		return
	}
	writeJSON(w, 200, out)
}
