package api_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/jackc/pgx/v5/pgxpool"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
	"zeno-backend/internal/api"
	"zeno-backend/internal/model"
	"zeno-backend/internal/store"
)

func TestManualLearningAuthenticatedHTTPPostgres(t *testing.T) {
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
	ids := []string{"00000000-0000-4000-8000-000000009211", "00000000-0000-4000-8000-000000009212", "00000000-0000-4000-8000-000000009213"}
	tokens := []string{"manual-db-token-a", "manual-db-token-b", "manual-db-token-admin"}
	for i, id := range ids {
		_, err = raw.Exec(ctx, `INSERT INTO users(id,email,display_name,password_hash,email_verified_at) VALUES($1,$2,'Manual DB','hash',now())`, id, "manual-http-"+id+"@example.test")
		if err != nil {
			t.Fatal(err)
		}
		hash := sha256.Sum256([]byte(tokens[i]))
		_, err = raw.Exec(ctx, `INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')`, hex.EncodeToString(hash[:]), id)
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err = raw.Exec(ctx, `UPDATE users SET role='admin' WHERE id=$1`, ids[2]); err != nil {
		t.Fatal(err)
	}
	defer func() {
		for _, id := range ids {
			_, _ = raw.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, id)
		}
	}()
	h := api.New(db, fakeSource{}, "integration", api.WithAuth(api.AuthOptions{Enabled: true}))
	call := func(actor int, method, path, body, contentType string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		if actor >= 0 {
			req.AddCookie(&http.Cookie{Name: "zeno_session", Value: tokens[actor]})
		}
		if method != "GET" {
			req.Header.Set("Content-Type", contentType)
			req.Header.Set("X-CSRF-Token", "manual-csrf")
			req.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "manual-csrf"})
		}
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		return res
	}
	created := call(0, "POST", "/api/learning-modules", `{"title":"Integration","note":"Owned"}`, "application/json")
	if created.Code != 201 {
		t.Fatalf("module create %d %s", created.Code, created.Body.String())
	}
	var mod model.LearningModule
	if err = json.Unmarshal(created.Body.Bytes(), &mod); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	_ = writer.WriteField("title", "Research PDF")
	file, _ := writer.CreateFormFile("file", "safe.pdf")
	_, _ = file.Write([]byte("%PDF-1.7\nexample"))
	_ = writer.Close()
	req := httptest.NewRequest("POST", "/api/learning-modules/"+mod.ID+"/materials", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: "zeno_session", Value: tokens[0]})
	req.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "manual-csrf"})
	req.Header.Set("X-CSRF-Token", "manual-csrf")
	uploaded := httptest.NewRecorder()
	h.ServeHTTP(uploaded, req)
	if uploaded.Code != 201 {
		t.Fatalf("upload %d %s", uploaded.Code, uploaded.Body.String())
	}
	var mat model.ModuleMaterial
	_ = json.Unmarshal(uploaded.Body.Bytes(), &mat)
	filePath := "/api/learning-modules/" + mod.ID + "/materials/" + mat.ID + "/file"
	foreign := call(1, "GET", filePath, "", "")
	if foreign.Code != 404 || bytes.Contains(foreign.Body.Bytes(), []byte("safe.pdf")) {
		t.Fatalf("foreign file response %d %s", foreign.Code, foreign.Body.String())
	}
	if noAuth := call(-1, "GET", filePath, "", ""); noAuth.Code != 401 {
		t.Fatalf("anonymous file %d", noAuth.Code)
	}
	owned := call(0, "GET", filePath, "", "")
	if owned.Code != 200 || owned.Body.String() != "%PDF-1.7\nexample" || owned.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("file readback %d %s", owned.Code, owned.Body.String())
	}
	sessionBody := `{"moduleId":"` + mod.ID + `","date":"2026-09-23","title":"Read paper","status":"completed","reflection":"I understood the main result","plannedItems":[{"materialId":"` + mat.ID + `","startPage":1,"endPage":2}],"actualItems":[]}`
	session := call(0, "POST", "/api/learning-sessions", sessionBody, "application/json")
	if session.Code != 201 {
		t.Fatalf("session create %d %s", session.Code, session.Body.String())
	}
	var createdSession model.LearningSession
	_ = json.Unmarshal(session.Body.Bytes(), &createdSession)
	if createdSession.Date != "2026-09-23" || len(createdSession.PlannedItems) != 1 {
		t.Fatalf("session response %+v", createdSession)
	}
	modulePath := "/api/learning-modules/" + mod.ID
	sessionPath := "/api/learning-sessions/" + createdSession.ID
	for _, tc := range []struct{ path, key, id string }{
		{"/api/learning-modules", "modules", mod.ID},
		{"/api/learning-sessions", "sessions", createdSession.ID},
	} {
		res := call(2, "GET", tc.path, "", "")
		if res.Code != 200 || !bytes.Contains(res.Body.Bytes(), []byte(tc.id)) {
			t.Fatalf("admin list %s: %d %s", tc.key, res.Code, res.Body.String())
		}
		res = call(1, "GET", tc.path, "", "")
		if res.Code != 200 || bytes.Contains(res.Body.Bytes(), []byte(tc.id)) {
			t.Fatalf("foreign user list %s: %d %s", tc.key, res.Code, res.Body.String())
		}
	}
	for _, path := range []string{modulePath, sessionPath, filePath} {
		if res := call(2, "GET", path, "", ""); res.Code != 200 {
			t.Fatalf("admin GET %s: %d %s", path, res.Code, res.Body.String())
		}
		if res := call(1, "GET", path, "", ""); res.Code != 404 {
			t.Fatalf("foreign GET %s: %d %s", path, res.Code, res.Body.String())
		}
	}
	if res := call(2, "PUT", modulePath, `{"title":"Admin edited"}`, "application/json"); res.Code != 200 {
		t.Fatalf("admin module edit: %d %s", res.Code, res.Body.String())
	}
	if res := call(1, "PUT", modulePath, `{"title":"Intrusion"}`, "application/json"); res.Code != 404 {
		t.Fatalf("foreign module edit: %d %s", res.Code, res.Body.String())
	}
	adminSessionBody := `{"moduleId":"` + mod.ID + `","date":"2026-09-23","title":"Admin edited","status":"completed","reflection":"Updated","plannedItems":[{"materialId":"` + mat.ID + `"}]}`
	if res := call(2, "PUT", sessionPath, adminSessionBody, "application/json"); res.Code != 200 {
		t.Fatalf("admin session edit: %d %s", res.Code, res.Body.String())
	}
	if res := call(1, "PUT", sessionPath, adminSessionBody, "application/json"); res.Code != 404 {
		t.Fatalf("foreign session edit: %d %s", res.Code, res.Body.String())
	}
	var moduleOwner, sessionOwner string
	if err := raw.QueryRow(ctx, `SELECT owner_user_id::text FROM manual_learning_modules WHERE id=$1`, mod.ID).Scan(&moduleOwner); err != nil || moduleOwner != ids[0] {
		t.Fatalf("module owner changed: %s %v", moduleOwner, err)
	}
	if err := raw.QueryRow(ctx, `SELECT owner_user_id::text FROM manual_learning_sessions WHERE id=$1`, createdSession.ID).Scan(&sessionOwner); err != nil || sessionOwner != ids[0] {
		t.Fatalf("session owner changed: %s %v", sessionOwner, err)
	}
	if res := call(0, "GET", sessionPath, "", ""); res.Code != 200 || !bytes.Contains(res.Body.Bytes(), []byte("Admin edited")) {
		t.Fatalf("owner readback session: %d %s", res.Code, res.Body.String())
	}
	adminNewSession := call(2, "POST", "/api/learning-sessions", `{"moduleId":"`+mod.ID+`","date":"2026-09-25","title":"Admin planned","status":"planned"}`, "application/json")
	if adminNewSession.Code != 201 {
		t.Fatalf("admin session create in foreign module: %d %s", adminNewSession.Code, adminNewSession.Body.String())
	}
	var adminSession model.LearningSession
	_ = json.Unmarshal(adminNewSession.Body.Bytes(), &adminSession)
	if err := raw.QueryRow(ctx, `SELECT owner_user_id::text FROM manual_learning_sessions WHERE id=$1`, adminSession.ID).Scan(&sessionOwner); err != nil || sessionOwner != ids[0] {
		t.Fatalf("admin-created session not owned by module owner: %s %v", sessionOwner, err)
	}
	if res := call(1, "POST", "/api/learning-sessions", `{"moduleId":"`+mod.ID+`","date":"2026-09-25","title":"Intrusion","status":"planned"}`, "application/json"); res.Code != 404 {
		t.Fatalf("foreign session create: %d %s", res.Code, res.Body.String())
	}
	adminCreated := call(2, "POST", modulePath+"/materials", `{"type":"text","title":"Admin material","body":"notes"}`, "application/json")
	if adminCreated.Code != 201 {
		t.Fatalf("admin material create: %d %s", adminCreated.Code, adminCreated.Body.String())
	}
	var adminMat model.ModuleMaterial
	_ = json.Unmarshal(adminCreated.Body.Bytes(), &adminMat)
	adminMatPath := modulePath + "/materials/" + adminMat.ID
	if res := call(1, "POST", modulePath+"/materials", `{"type":"text","title":"Intrusion","body":"x"}`, "application/json"); res.Code != 404 {
		t.Fatalf("foreign material create: %d %s", res.Code, res.Body.String())
	}
	if res := call(2, "PUT", adminMatPath, `{"type":"text","title":"Admin revised","body":"revised"}`, "application/json"); res.Code != 200 {
		t.Fatalf("admin material edit: %d %s", res.Code, res.Body.String())
	}
	if res := call(1, "PUT", adminMatPath, `{"type":"text","title":"Intrusion","body":"x"}`, "application/json"); res.Code != 404 {
		t.Fatalf("foreign material edit: %d %s", res.Code, res.Body.String())
	}
	var replacementByAdmin bytes.Buffer
	adminWriter := multipart.NewWriter(&replacementByAdmin)
	adminFile, _ := adminWriter.CreateFormFile("file", "admin.pdf")
	_, _ = adminFile.Write([]byte("%PDF-1.7\nadmin"))
	_ = adminWriter.Close()
	adminReq := httptest.NewRequest("POST", filePath, &replacementByAdmin)
	adminReq.Header.Set("Content-Type", adminWriter.FormDataContentType())
	adminReq.Header.Set("X-CSRF-Token", "manual-csrf")
	adminReq.AddCookie(&http.Cookie{Name: "zeno_session", Value: tokens[2]})
	adminReq.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "manual-csrf"})
	adminUpload := httptest.NewRecorder()
	h.ServeHTTP(adminUpload, adminReq)
	if adminUpload.Code != 200 || call(2, "GET", filePath, "", "").Body.String() != "%PDF-1.7\nadmin" {
		t.Fatalf("admin file replacement: %d %s", adminUpload.Code, adminUpload.Body.String())
	}
	var foreignFile bytes.Buffer
	foreignWriter := multipart.NewWriter(&foreignFile)
	foreignPart, _ := foreignWriter.CreateFormFile("file", "intrusion.pdf")
	_, _ = foreignPart.Write([]byte("%PDF-1.7\nintrusion"))
	_ = foreignWriter.Close()
	foreignReq := httptest.NewRequest("POST", filePath, &foreignFile)
	foreignReq.Header.Set("Content-Type", foreignWriter.FormDataContentType())
	foreignReq.Header.Set("X-CSRF-Token", "manual-csrf")
	foreignReq.AddCookie(&http.Cookie{Name: "zeno_session", Value: tokens[1]})
	foreignReq.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "manual-csrf"})
	foreignUpload := httptest.NewRecorder()
	h.ServeHTTP(foreignUpload, foreignReq)
	if foreignUpload.Code != 404 || call(0, "GET", filePath, "", "").Body.String() != "%PDF-1.7\nadmin" {
		t.Fatalf("foreign file replacement: %d %s", foreignUpload.Code, foreignUpload.Body.String())
	}
	if res := call(2, "DELETE", modulePath+"/materials/"+mat.ID, "", "application/json"); res.Code != 409 {
		t.Fatalf("admin must not delete referenced material: %d %s", res.Code, res.Body.String())
	}
	if res := call(2, "DELETE", adminMatPath, "", "application/json"); res.Code != 204 {
		t.Fatalf("admin material delete: %d %s", res.Code, res.Body.String())
	}
	if res := call(1, "DELETE", modulePath, "", "application/json"); res.Code != 404 {
		t.Fatalf("foreign module delete: %d %s", res.Code, res.Body.String())
	}
	adminModule := call(2, "POST", "/api/learning-modules", `{"title":"Admin's module"}`, "application/json")
	if adminModule.Code != 201 {
		t.Fatalf("admin own module create: %d %s", adminModule.Code, adminModule.Body.String())
	}
	var otherMod model.LearningModule
	_ = json.Unmarshal(adminModule.Body.Bytes(), &otherMod)
	crossOwnerEdit := `{"moduleId":"` + otherMod.ID + `","date":"2026-09-23","title":"Attempt transfer","status":"planned"}`
	if res := call(2, "PUT", sessionPath, crossOwnerEdit, "application/json"); res.Code != 404 {
		t.Fatalf("admin cross-owner session reparent: %d %s", res.Code, res.Body.String())
	}
	if err := raw.QueryRow(ctx, `SELECT owner_user_id::text FROM manual_learning_sessions WHERE id=$1`, createdSession.ID).Scan(&sessionOwner); err != nil || sessionOwner != ids[0] {
		t.Fatalf("cross-owner update changed session owner: %s %v", sessionOwner, err)
	}
	if res := call(1, "DELETE", "/api/learning-modules/"+otherMod.ID, "", "application/json"); res.Code != 404 {
		t.Fatalf("foreign admin module delete: %d %s", res.Code, res.Body.String())
	}
	foreign = call(1, "GET", "/api/learning-sessions/"+createdSession.ID, "", "")
	if foreign.Code != 404 {
		t.Fatalf("foreign session %d", foreign.Code)
	}
	materialPath := "/api/learning-modules/" + mod.ID + "/materials/" + mat.ID
	for _, method := range []string{"PUT", "DELETE"} {
		res := call(1, method, materialPath, `{"type":"pdf","title":"Intrusion","sortOrder":1}`, "application/json")
		if res.Code != 404 {
			t.Fatalf("foreign %s: %d %s", method, res.Code, res.Body.String())
		}
	}
	updated := call(0, "PUT", materialPath, `{"type":"pdf","title":"Reordered PDF","sortOrder":12}`, "application/json")
	if updated.Code != 200 {
		t.Fatalf("update PDF %d %s", updated.Code, updated.Body.String())
	}
	var updatedMat model.ModuleMaterial
	_ = json.Unmarshal(updated.Body.Bytes(), &updatedMat)
	if updatedMat.Title != "Reordered PDF" || updatedMat.SortOrder != 12 || updatedMat.FileName != "admin.pdf" {
		t.Fatalf("updated material %+v", updatedMat)
	}
	var replacement bytes.Buffer
	replaceWriter := multipart.NewWriter(&replacement)
	replaceFile, _ := replaceWriter.CreateFormFile("file", "new.pdf")
	_, _ = replaceFile.Write([]byte("%PDF-1.7\nreplacement"))
	_ = replaceWriter.Close()
	replaceReq := httptest.NewRequest("POST", filePath, &replacement)
	replaceReq.Header.Set("Content-Type", replaceWriter.FormDataContentType())
	replaceReq.Header.Set("X-CSRF-Token", "manual-csrf")
	replaceReq.AddCookie(&http.Cookie{Name: "zeno_session", Value: tokens[0]})
	replaceReq.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "manual-csrf"})
	replaced := httptest.NewRecorder()
	h.ServeHTTP(replaced, replaceReq)
	if replaced.Code != 200 {
		t.Fatalf("replace file %d %s", replaced.Code, replaced.Body.String())
	}
	if read := call(0, "GET", filePath, "", ""); read.Code != 200 || read.Body.String() != "%PDF-1.7\nreplacement" {
		t.Fatalf("replacement readback %d %s", read.Code, read.Body.String())
	}
	for _, body := range []string{`{"type":"video","title":"wrong type","sortOrder":0}`, `{"type":"pdf","title":"bad order","sortOrder":100001}`, `{"type":"pdf","title":"","sortOrder":0}`} {
		res := call(0, "PUT", materialPath, body, "application/json")
		if res.Code != 400 {
			t.Fatalf("invalid update %d %s", res.Code, res.Body.String())
		}
	}
	if res := call(0, "DELETE", materialPath, "", "application/json"); res.Code != 409 {
		t.Fatalf("referenced planned item delete %d %s", res.Code, res.Body.String())
	}
	createdText := call(0, "POST", "/api/learning-modules/"+mod.ID+"/materials", `{"type":"text","title":"Text","body":"before"}`, "application/json")
	if createdText.Code != 201 {
		t.Fatalf("text create %d %s", createdText.Code, createdText.Body.String())
	}
	var textMat model.ModuleMaterial
	_ = json.Unmarshal(createdText.Body.Bytes(), &textMat)
	textPath := "/api/learning-modules/" + mod.ID + "/materials/" + textMat.ID
	res := call(0, "PUT", textPath, `{"type":"text","title":"After","body":"after","sortOrder":2,"fileName":"spoof.pdf","byteSize":999}`, "application/json")
	if res.Code != 200 {
		t.Fatalf("text update %d %s", res.Code, res.Body.String())
	}
	_ = json.Unmarshal(res.Body.Bytes(), &updatedMat)
	if updatedMat.Body != "after" || updatedMat.FileName != "" || updatedMat.ByteSize != 0 {
		t.Fatalf("text update %+v", updatedMat)
	}
	for _, body := range []string{`{"type":"text","title":"Unsafe","body":"x","url":"javascript:alert(1)"}`, `{"type":"youtube","title":"wrong type","url":"https://youtube.com/watch?v=x"}`} {
		if res := call(0, "PUT", textPath, body, "application/json"); res.Code != 400 {
			t.Fatalf("invalid text update %d %s", res.Code, res.Body.String())
		}
	}
	if res := call(0, "DELETE", textPath, "", "application/json"); res.Code != 204 {
		t.Fatalf("delete unreferenced %d %s", res.Code, res.Body.String())
	}
	if res := call(0, "DELETE", textPath, "", "application/json"); res.Code != 404 {
		t.Fatalf("delete missing %d %s", res.Code, res.Body.String())
	}
	modRead := call(0, "GET", "/api/learning-modules/"+mod.ID, "", "")
	var readback model.LearningModule
	_ = json.Unmarshal(modRead.Body.Bytes(), &readback)
	if len(readback.Materials) != 1 || readback.Materials[0].ID != mat.ID || readback.Materials[0].Title != "Reordered PDF" {
		t.Fatalf("readback %+v", readback.Materials)
	}
	linkCreated := call(0, "POST", "/api/learning-modules/"+mod.ID+"/materials", `{"type":"link","title":"Reference","url":"https://example.com/start"}`, "application/json")
	if linkCreated.Code != 201 {
		t.Fatalf("link create %d %s", linkCreated.Code, linkCreated.Body.String())
	}
	var link model.ModuleMaterial
	_ = json.Unmarshal(linkCreated.Body.Bytes(), &link)
	linkPath := "/api/learning-modules/" + mod.ID + "/materials/" + link.ID
	if res := call(0, "PUT", linkPath, `{"type":"link","title":"New link","url":"https://example.com/new","sortOrder":1}`, "application/json"); res.Code != 200 {
		t.Fatalf("link update %d %s", res.Code, res.Body.String())
	}
	actualBody := `{"moduleId":"` + mod.ID + `","date":"2026-09-24","title":"Link notes","status":"planned","plannedItems":[],"actualItems":[{"materialId":"` + link.ID + `"}]}`
	if res := call(0, "POST", "/api/learning-sessions", actualBody, "application/json"); res.Code != 201 {
		t.Fatalf("actual session %d %s", res.Code, res.Body.String())
	}
	if res := call(0, "DELETE", linkPath, "", "application/json"); res.Code != 409 {
		t.Fatalf("referenced actual item delete %d %s", res.Code, res.Body.String())
	}
	youtubeCreated := call(0, "POST", "/api/learning-modules/"+mod.ID+"/materials", `{"type":"youtube","title":"Video","url":"https://youtu.be/demo"}`, "application/json")
	if youtubeCreated.Code != 201 {
		t.Fatalf("youtube create %d %s", youtubeCreated.Code, youtubeCreated.Body.String())
	}
	var youtube model.ModuleMaterial
	_ = json.Unmarshal(youtubeCreated.Body.Bytes(), &youtube)
	youtubePath := "/api/learning-modules/" + mod.ID + "/materials/" + youtube.ID
	if res := call(0, "PUT", youtubePath, `{"type":"youtube","title":"Bad","url":"https://youtube.com.evil.test/watch"}`, "application/json"); res.Code != 400 {
		t.Fatalf("youtube unsafe update %d %s", res.Code, res.Body.String())
	}
	if res := call(0, "PUT", youtubePath, `{"type":"youtube","title":"Good","url":"https://www.youtube.com/watch?v=xyz","sortOrder":5}`, "application/json"); res.Code != 200 {
		t.Fatalf("youtube update %d %s", res.Code, res.Body.String())
	}
	if res := call(0, "DELETE", youtubePath, "", "application/json"); res.Code != 204 {
		t.Fatalf("youtube delete %d %s", res.Code, res.Body.String())
	}
	if res := call(2, "DELETE", modulePath, "", "application/json"); res.Code != 204 {
		t.Fatalf("admin foreign module delete: %d %s", res.Code, res.Body.String())
	}
	if res := call(0, "GET", modulePath, "", ""); res.Code != 404 {
		t.Fatalf("deleted module remained visible: %d %s", res.Code, res.Body.String())
	}
}
