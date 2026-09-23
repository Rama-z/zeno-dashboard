package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"zeno-backend/internal/api"
	"zeno-backend/internal/model"
)

type manualStore struct {
	fakeStore
	module  model.LearningModule
	session model.LearningSession
	file    []byte
	saved   bool
}

func (s *manualStore) CreateLearningModule(_ context.Context, m model.LearningModule) (model.LearningModule, error) {
	s.module = m
	return m, nil
}
func (s *manualStore) ListLearningModules(_ context.Context, scope model.LearningScope) ([]model.LearningModule, error) {
	if s.module.ID != "" && (scope.AllOwners || s.module.OwnerUserID == scope.OwnerUserID) {
		return []model.LearningModule{s.module}, nil
	}
	return []model.LearningModule{}, nil
}
func (s *manualStore) GetLearningModule(_ context.Context, id string, scope model.LearningScope) (model.LearningModule, bool, error) {
	return s.module, s.module.ID == id && (scope.AllOwners || s.module.OwnerUserID == scope.OwnerUserID), nil
}
func (s *manualStore) UpdateLearningModule(_ context.Context, m model.LearningModule, scope model.LearningScope) (model.LearningModule, bool, error) {
	if !scope.AllOwners && scope.OwnerUserID != s.module.OwnerUserID {
		return m, false, nil
	}
	m.OwnerUserID = s.module.OwnerUserID
	s.module = m
	return m, true, nil
}
func (s *manualStore) DeleteLearningModule(_ context.Context, id string, scope model.LearningScope) (bool, error) {
	return id == s.module.ID && (scope.AllOwners || scope.OwnerUserID == s.module.OwnerUserID), nil
}
func (s *manualStore) CreateModuleMaterial(_ context.Context, id string, scope model.LearningScope, m model.ModuleMaterial, data []byte) (model.ModuleMaterial, bool, error) {
	if id != s.module.ID || !(scope.AllOwners || scope.OwnerUserID == s.module.OwnerUserID) {
		return m, false, nil
	}
	s.module.Materials = append(s.module.Materials, m)
	s.file = data
	return m, true, nil
}
func (s *manualStore) UpdateModuleMaterial(_ context.Context, module, material string, scope model.LearningScope, input model.ModuleMaterial) (model.ModuleMaterial, bool, bool, error) {
	if s.module.ID != module || !(scope.AllOwners || s.module.OwnerUserID == scope.OwnerUserID) {
		return model.ModuleMaterial{}, false, false, nil
	}
	for i := range s.module.Materials {
		m := &s.module.Materials[i]
		if m.ID == material {
			if m.Type != input.Type {
				return model.ModuleMaterial{}, true, false, nil
			}
			m.Title, m.Body, m.URL, m.SortOrder = input.Title, input.Body, input.URL, input.SortOrder
			return *m, true, true, nil
		}
	}
	return model.ModuleMaterial{}, false, false, nil
}
func (s *manualStore) DeleteModuleMaterial(_ context.Context, module, material string, scope model.LearningScope) (bool, bool, error) {
	if s.module.ID != module || !(scope.AllOwners || s.module.OwnerUserID == scope.OwnerUserID) {
		return false, false, nil
	}
	for i, m := range s.module.Materials {
		if m.ID == material {
			s.module.Materials = append(s.module.Materials[:i], s.module.Materials[i+1:]...)
			return true, false, nil
		}
	}
	return false, false, nil
}
func (s *manualStore) PutModuleFile(_ context.Context, module, material string, scope model.LearningScope, kindName string, data []byte) (model.ModuleMaterial, bool, error) {
	if module != s.module.ID || !(scope.AllOwners || scope.OwnerUserID == s.module.OwnerUserID) || len(s.module.Materials) == 0 || material != s.module.Materials[0].ID {
		return model.ModuleMaterial{}, false, nil
	}
	s.file = data
	m := s.module.Materials[0]
	m.FileName = strings.TrimPrefix(kindName, "pdf:")
	m.MimeType = "application/pdf"
	m.ByteSize = int64(len(data))
	s.module.Materials[0] = m
	return m, true, nil
}
func (s *manualStore) GetModuleFile(_ context.Context, id, material string, scope model.LearningScope) (model.ModuleMaterial, []byte, bool, error) {
	if !(scope.AllOwners || scope.OwnerUserID == s.module.OwnerUserID) || id != s.module.ID || len(s.module.Materials) == 0 || material != s.module.Materials[0].ID {
		return model.ModuleMaterial{}, nil, false, nil
	}
	return s.module.Materials[0], s.file, true, nil
}
func (s *manualStore) CreateLearningSession(_ context.Context, v model.LearningSession, scope model.LearningScope) (model.LearningSession, bool, error) {
	if v.ModuleID != s.module.ID || (!scope.AllOwners && scope.OwnerUserID != s.module.OwnerUserID) {
		return v, false, nil
	}
	v.OwnerUserID = s.module.OwnerUserID
	s.session = v
	s.saved = true
	return v, true, nil
}
func (s *manualStore) ListLearningSessions(_ context.Context, scope model.LearningScope) ([]model.LearningSession, error) {
	if s.saved && (scope.AllOwners || s.session.OwnerUserID == scope.OwnerUserID) {
		return []model.LearningSession{s.session}, nil
	}
	return []model.LearningSession{}, nil
}
func (s *manualStore) GetLearningSession(_ context.Context, id string, scope model.LearningScope) (model.LearningSession, bool, error) {
	return s.session, s.saved && s.session.ID == id && (scope.AllOwners || s.session.OwnerUserID == scope.OwnerUserID), nil
}
func (s *manualStore) UpdateLearningSession(_ context.Context, v model.LearningSession, scope model.LearningScope) (model.LearningSession, bool, error) {
	if !scope.AllOwners && scope.OwnerUserID != s.session.OwnerUserID {
		return v, false, nil
	}
	v.OwnerUserID = s.session.OwnerUserID
	s.session = v
	return v, true, nil
}
func manualRequest(method, path, body string) *http.Request {
	return authenticatedRevisionRequest(method, path, body)
}
func TestManualLearningContractAndReflection(t *testing.T) {
	s := &manualStore{}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	call := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRecorder()
		h.ServeHTTP(r, manualRequest(method, path, body))
		return r
	}
	m := call("POST", "/api/learning-modules", `{"title":"Biology","category":"Science","level":"intro","objective":"Cells","note":"Remember"}`)
	if m.Code != 201 {
		t.Fatalf("module %d %s", m.Code, m.Body.String())
	}
	var module model.LearningModule
	if err := json.Unmarshal(m.Body.Bytes(), &module); err != nil {
		t.Fatal(err)
	}
	list := call("GET", "/api/learning-modules", "")
	var ml struct {
		Modules []model.LearningModule `json:"modules"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &ml); err != nil || len(ml.Modules) != 1 {
		t.Fatalf("module list %d %s %v", list.Code, list.Body.String(), err)
	}
	invalid := call("POST", "/api/learning-sessions", `{"moduleId":"`+module.ID+`","date":"2026-09-23","title":"Study","status":"completed","reflection":"  "}`)
	if invalid.Code != 400 || s.saved {
		t.Fatalf("invalid completed %d %s", invalid.Code, invalid.Body.String())
	}
	created := call("POST", "/api/learning-sessions", `{"moduleId":"`+module.ID+`","date":"2026-09-23","title":"Study","status":"planned","plannedItems":[],"actualItems":[]}`)
	if created.Code != 201 {
		t.Fatalf("session %d %s", created.Code, created.Body.String())
	}
	var session model.LearningSession
	if err := json.Unmarshal(created.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	updated := call("PUT", "/api/learning-sessions/"+session.ID, `{"moduleId":"`+module.ID+`","date":"2026-09-23","title":"Study","status":"completed","reflection":"I learned cells","plannedItems":[],"actualItems":[]}`)
	if updated.Code != 200 || s.session.Reflection != "I learned cells" {
		t.Fatalf("completed %d %s", updated.Code, updated.Body.String())
	}
	sessions := call("GET", "/api/learning-sessions", "")
	var sl struct {
		Sessions []model.LearningSession `json:"sessions"`
	}
	if err := json.Unmarshal(sessions.Body.Bytes(), &sl); err != nil || len(sl.Sessions) != 1 {
		t.Fatalf("session list %d %s %v", sessions.Code, sessions.Body.String(), err)
	}
}
func TestManualLearningFileUploadMagicAndAuthenticatedRead(t *testing.T) {
	s := &manualStore{module: model.LearningModule{ID: "00000000-0000-4000-8000-000000000123", OwnerUserID: revisionTestUserID, Materials: []model.ModuleMaterial{}}}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	upload := func(data []byte) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		w := multipart.NewWriter(&buf)
		_ = w.WriteField("title", "Paper")
		part, _ := w.CreateFormFile("file", "paper.pdf")
		_, _ = part.Write(data)
		_ = w.Close()
		req := httptest.NewRequest("POST", "/api/learning-modules/"+s.module.ID+"/materials", &buf)
		req.Header.Set("Content-Type", w.FormDataContentType())
		req.AddCookie(&http.Cookie{Name: "zeno_session", Value: "revision-session"})
		req.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "revision-csrf"})
		req.Header.Set("X-CSRF-Token", "revision-csrf")
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		return res
	}
	bad := upload([]byte("not pdf"))
	if bad.Code != 400 {
		t.Fatalf("bad magic %d %s", bad.Code, bad.Body.String())
	}
	good := upload([]byte("%PDF-1.7\nhello"))
	if good.Code != 201 {
		t.Fatalf("upload %d %s", good.Code, good.Body.String())
	}
	var mat model.ModuleMaterial
	_ = json.Unmarshal(good.Body.Bytes(), &mat)
	path := "/api/learning-modules/" + s.module.ID + "/materials/" + mat.ID + "/file"
	unauth := httptest.NewRecorder()
	h.ServeHTTP(unauth, httptest.NewRequest("GET", path, nil))
	if unauth.Code != 401 {
		t.Fatalf("unauth file %d", unauth.Code)
	}
	read := httptest.NewRecorder()
	h.ServeHTTP(read, manualRequest("GET", path, ""))
	if read.Code != 200 || !strings.HasPrefix(read.Body.String(), "%PDF-") {
		t.Fatalf("file %d %s", read.Code, read.Body.String())
	}
}

func TestManualMaterialMetadataThenFileUpload(t *testing.T) {
	s := &manualStore{module: model.LearningModule{ID: "00000000-0000-4000-8000-000000000321", OwnerUserID: revisionTestUserID, Materials: []model.ModuleMaterial{}}}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	r := httptest.NewRecorder()
	h.ServeHTTP(r, manualRequest("POST", "/api/learning-modules/"+s.module.ID+"/materials", `{"type":"pdf","title":"Paper"}`))
	if r.Code != 201 {
		t.Fatalf("metadata %d %s", r.Code, r.Body.String())
	}
	var m model.ModuleMaterial
	_ = json.Unmarshal(r.Body.Bytes(), &m)
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	f, _ := w.CreateFormFile("file", "study.pdf")
	_, _ = f.Write([]byte("%PDF-1.7\npage"))
	_ = w.Close()
	req := httptest.NewRequest("POST", "/api/learning-modules/"+s.module.ID+"/materials/"+m.ID+"/file", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: "zeno_session", Value: "revision-session"})
	req.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "revision-csrf"})
	req.Header.Set("X-CSRF-Token", "revision-csrf")
	r = httptest.NewRecorder()
	h.ServeHTTP(r, req)
	if r.Code != 200 {
		t.Fatalf("file %d %s", r.Code, r.Body.String())
	}
}

func TestManualModuleRejectsInlineMaterialsRatherThanDroppingThem(t *testing.T) {
	s := &manualStore{}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, manualRequest("POST", "/api/learning-modules", `{"title":"Chemistry","materials":[{"type":"text","title":"Lesson","body":"atoms"}]}`))
	if w.Code != 400 || s.module.ID != "" {
		t.Fatalf("inline materials discarded: %d %s", w.Code, w.Body.String())
	}
}

func TestManualUploadRejectsDeclaredMimeMismatch(t *testing.T) {
	s := &manualStore{module: model.LearningModule{ID: "00000000-0000-4000-8000-000000000345", OwnerUserID: revisionTestUserID, Materials: []model.ModuleMaterial{}}}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	hdr := make(textproto.MIMEHeader)
	hdr.Set("Content-Disposition", `form-data; name="file"; filename="study.pdf"`)
	hdr.Set("Content-Type", "video/mp4")
	f, _ := w.CreatePart(hdr)
	_, _ = f.Write([]byte("%PDF-1.7\npage"))
	_ = w.WriteField("title", "Study")
	_ = w.Close()
	r := httptest.NewRequest("POST", "/api/learning-modules/"+s.module.ID+"/materials", &body)
	r.Header.Set("Content-Type", w.FormDataContentType())
	r.AddCookie(&http.Cookie{Name: "zeno_session", Value: "revision-session"})
	r.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "revision-csrf"})
	r.Header.Set("X-CSRF-Token", "revision-csrf")
	res := httptest.NewRecorder()
	h.ServeHTTP(res, r)
	if res.Code != 400 || len(s.module.Materials) != 0 {
		t.Fatalf("declared MIME mismatch %d %s", res.Code, res.Body.String())
	}
}

func TestManualMaterialIgnoresClientFileMetadata(t *testing.T) {
	s := &manualStore{module: model.LearningModule{ID: "00000000-0000-4000-8000-000000000346", OwnerUserID: revisionTestUserID, Materials: []model.ModuleMaterial{}}}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	r := httptest.NewRecorder()
	h.ServeHTTP(r, manualRequest("POST", "/api/learning-modules/"+s.module.ID+"/materials", `{"type":"text","title":"Private","body":"notes","fileName":"spoof.pdf","mimeType":"application/pdf","byteSize":987}`))
	if r.Code != 201 {
		t.Fatalf("create %d %s", r.Code, r.Body.String())
	}
	if s.module.Materials[0].FileName != "" || s.module.Materials[0].ByteSize != 0 || s.module.Materials[0].MimeType != "" {
		t.Fatalf("client forged file metadata %+v", s.module.Materials[0])
	}
}

func TestManualMaterialRejectsUnsafeURLOnText(t *testing.T) {
	s := &manualStore{module: model.LearningModule{ID: "00000000-0000-4000-8000-000000000347", OwnerUserID: revisionTestUserID, Materials: []model.ModuleMaterial{}}}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	r := httptest.NewRecorder()
	h.ServeHTTP(r, manualRequest("POST", "/api/learning-modules/"+s.module.ID+"/materials", `{"type":"text","title":"Private","body":"notes","url":"javascript:alert(1)"}`))
	if r.Code != 400 || len(s.module.Materials) != 0 {
		t.Fatalf("unsafe URL %d %s", r.Code, r.Body.String())
	}
}

func TestManualFileNameSanitizedBeforeDownload(t *testing.T) {
	s := &manualStore{module: model.LearningModule{ID: "00000000-0000-4000-8000-000000000348", OwnerUserID: revisionTestUserID, Materials: []model.ModuleMaterial{}}}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	_ = w.WriteField("title", "Paper")
	f, _ := w.CreateFormFile("file", "evil\\name.pdf")
	_, _ = f.Write([]byte("%PDF-1.7\npage"))
	_ = w.Close()
	r := httptest.NewRequest("POST", "/api/learning-modules/"+s.module.ID+"/materials", &body)
	r.Header.Set("Content-Type", w.FormDataContentType())
	r.AddCookie(&http.Cookie{Name: "zeno_session", Value: "revision-session"})
	r.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "revision-csrf"})
	r.Header.Set("X-CSRF-Token", "revision-csrf")
	res := httptest.NewRecorder()
	h.ServeHTTP(res, r)
	if res.Code != 201 {
		t.Fatalf("upload %d %s", res.Code, res.Body.String())
	}
	if strings.ContainsAny(s.module.Materials[0].FileName, "\\/\r\n") {
		t.Fatalf("unsafe filename %q", s.module.Materials[0].FileName)
	}
}

func TestManualLongUnicodePDFNameRetainsExtension(t *testing.T) {
	s := &manualStore{module: model.LearningModule{ID: "00000000-0000-4000-8000-000000000349", OwnerUserID: revisionTestUserID, Materials: []model.ModuleMaterial{}}}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	_ = w.WriteField("title", "Long PDF")
	f, _ := w.CreateFormFile("file", strings.Repeat("中", 90)+".pdf")
	_, _ = f.Write([]byte("%PDF-1.7\npage"))
	_ = w.Close()
	r := httptest.NewRequest("POST", "/api/learning-modules/"+s.module.ID+"/materials", &body)
	r.Header.Set("Content-Type", w.FormDataContentType())
	r.AddCookie(&http.Cookie{Name: "zeno_session", Value: "revision-session"})
	r.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "revision-csrf"})
	r.Header.Set("X-CSRF-Token", "revision-csrf")
	res := httptest.NewRecorder()
	h.ServeHTTP(res, r)
	if res.Code != 201 || !strings.HasSuffix(s.module.Materials[0].FileName, ".pdf") {
		t.Fatalf("long name upload %d %s", res.Code, res.Body.String())
	}
}

func TestManualMultipartRequiresCSRF(t *testing.T) {
	s := &manualStore{module: model.LearningModule{ID: "00000000-0000-4000-8000-000000000350", OwnerUserID: revisionTestUserID, Materials: []model.ModuleMaterial{}}}
	h := api.New(s, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	_ = w.WriteField("title", "Paper")
	f, _ := w.CreateFormFile("file", "paper.pdf")
	_, _ = f.Write([]byte("%PDF-1.7\npage"))
	_ = w.Close()
	r := httptest.NewRequest("POST", "/api/learning-modules/"+s.module.ID+"/materials", &body)
	r.Header.Set("Content-Type", w.FormDataContentType())
	r.AddCookie(&http.Cookie{Name: "zeno_session", Value: "revision-session"})
	res := httptest.NewRecorder()
	h.ServeHTTP(res, r)
	if res.Code != 403 || len(s.module.Materials) != 0 {
		t.Fatalf("CSRF not enforced %d %s", res.Code, res.Body.String())
	}
}
