package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"zeno-backend/internal/api"
	"zeno-backend/internal/model"
)

type fakeSource struct{}

func (fakeSource) Logs() ([]model.Log, model.SourceMeta, error) {
	return []model.Log{
		{ID: 1, Title: "Connected", Question: "Q", Answer: "A", Status: "success"},
		{ID: 2, Title: "Reference", Question: "Q", Answer: "A", Status: "info"},
	}, model.SourceMeta{SourceFile: "/tmp/session.md", ModifiedAt: time.Date(2026, 8, 22, 0, 0, 0, 0, time.UTC)}, nil
}

type fakeStore struct{}

type ownershipStore struct {
	fakeStore
	admin bool
}

func (s ownershipStore) GetSessionUser(_ context.Context, _ string, now time.Time) (model.User, bool, error) {
	role := "user"
	if s.admin {
		role = "admin"
	}
	return model.User{ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Email: "rama@example.com", DisplayName: "Rama", Role: role, EmailVerifiedAt: &now}, true, nil
}

func (ownershipStore) ListSpending(context.Context, string) ([]model.SpendingEntry, error) {
	return []model.SpendingEntry{
		{ID: "33333333-3333-4333-8333-333333333333", OwnerUserID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Date: "2026-08-23", Description: "Own expense", Amount: 10000},
		{ID: "44444444-4444-4444-8444-444444444444", OwnerUserID: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", Date: "2026-08-23", Description: "Foreign expense", Amount: 20000},
	}, nil
}

func (fakeStore) Ping(context.Context) error { return nil }
func (fakeStore) RegisterUser(_ context.Context, user model.User, _ string, _ time.Time) (model.User, bool, error) {
	return user, true, nil
}
func (fakeStore) VerifyEmail(_ context.Context, _ string, now time.Time) (model.User, bool, error) {
	return model.User{ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Email: "rama@example.com", DisplayName: "Rama", Role: "user", EmailVerifiedAt: &now}, true, nil
}
func (fakeStore) FindUserByEmail(_ context.Context, email string) (model.User, bool, error) {
	now := time.Now().UTC()
	hash, _ := bcrypt.GenerateFromPassword([]byte("long-secure-password"), bcrypt.MinCost)
	return model.User{ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Email: email, DisplayName: "Rama", PasswordHash: string(hash), Role: "user", EmailVerifiedAt: &now}, true, nil
}
func (fakeStore) CreateSession(context.Context, model.Session) error { return nil }
func (fakeStore) GetSessionUser(_ context.Context, _ string, now time.Time) (model.User, bool, error) {
	return model.User{ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Email: "rama@example.com", DisplayName: "Rama", Role: "user", EmailVerifiedAt: &now}, true, nil
}
func (fakeStore) DeleteSession(context.Context, string) error { return nil }
func (fakeStore) UpdateUserProfile(_ context.Context, id, displayName string, now time.Time) (model.User, bool, error) {
	return model.User{ID: id, Email: "rama@example.com", DisplayName: displayName, Role: "user", EmailVerifiedAt: &now}, true, nil
}
func (fakeStore) CreateActivity(context.Context, model.ActivityEvent) error { return nil }
func (fakeStore) ListActivities(_ context.Context, userID string, _ bool, _ int) ([]model.ActivityEvent, error) {
	return []model.ActivityEvent{{ID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", UserID: userID, ActorName: "Rama", ActorEmail: "rama@example.com", ActorRole: "user", Action: "create", EntityType: "spending", EntityID: "record", Description: "Menambahkan spending", Metadata: map[string]any{}, CreatedAt: time.Now().UTC()}}, nil
}
func (fakeStore) GetSettings(context.Context) (model.Settings, error) {
	return model.Settings{WorkspaceName: "Default workspace"}, nil
}
func (fakeStore) UpdateSettings(_ context.Context, name string) (model.Settings, error) {
	return model.Settings{WorkspaceName: name}, nil
}
func (fakeStore) ListLearning(context.Context, string) ([]model.LearningEntry, error) {
	return []model.LearningEntry{{ID: "11111111-1111-4111-8111-111111111111", Date: "2026-08-22", Title: "Existing lesson", Note: "Existing", Category: "Frontend"}}, nil
}
func (fakeStore) CreateLearning(context.Context, model.LearningEntry) (model.LearningEntry, error) {
	return model.LearningEntry{}, nil
}
func (fakeStore) UpdateLearning(_ context.Context, entry model.LearningEntry) (model.LearningEntry, bool, error) {
	return entry, true, nil
}
func (fakeStore) DeleteLearning(context.Context, string, string) (bool, error) { return true, nil }
func (fakeStore) CreateDoing(_ context.Context, entry model.DoingEntry) (model.DoingEntry, error) {
	return entry, nil
}
func (fakeStore) ListDoing(context.Context, string) ([]model.DoingEntry, error) {
	return []model.DoingEntry{{ID: "55555555-5555-4555-8555-555555555555", Date: "2026-08-23", Title: "Ship Doing page", Note: "Match Learning behavior", Category: "Product"}}, nil
}
func (fakeStore) UpdateDoing(_ context.Context, entry model.DoingEntry) (model.DoingEntry, bool, error) {
	return entry, true, nil
}
func (fakeStore) DeleteDoing(context.Context, string, string) (bool, error) { return true, nil }
func (fakeStore) CreateWorkout(_ context.Context, entry model.WorkoutEntry) (model.WorkoutEntry, error) {
	return entry, nil
}
func (fakeStore) ListWorkouts(context.Context, string) ([]model.WorkoutEntry, error) {
	return []model.WorkoutEntry{{ID: "11111111-1111-4111-8111-111111111111", Date: "2026-08-23", Exercise: "Morning run", Category: "Cardio", DurationMinutes: 30}}, nil
}
func (fakeStore) UpdateWorkout(_ context.Context, entry model.WorkoutEntry) (model.WorkoutEntry, bool, error) {
	return entry, true, nil
}
func (fakeStore) DeleteWorkout(context.Context, string, string) (bool, error) { return true, nil }
func (fakeStore) CreateJournal(_ context.Context, entry model.JournalEntry) (model.JournalEntry, error) {
	return entry, nil
}
func (fakeStore) ListJournals(context.Context, string) ([]model.JournalEntry, error) {
	return []model.JournalEntry{{ID: "22222222-2222-4222-8222-222222222222", Date: "2026-08-23", Title: "A focused day", Content: "Reflection", Mood: "Focused", Tags: "work"}}, nil
}
func (fakeStore) DeleteJournal(context.Context, string) (bool, error) { return true, nil }
func (fakeStore) CreateSpending(_ context.Context, entry model.SpendingEntry) (model.SpendingEntry, error) {
	return entry, nil
}
func (fakeStore) ListSpending(context.Context, string) ([]model.SpendingEntry, error) {
	return []model.SpendingEntry{
		{ID: "33333333-3333-4333-8333-333333333333", Date: "2026-08-23", Description: "Groceries", Category: "Food", Amount: 185000},
		{ID: "44444444-4444-4444-8444-444444444444", Date: "2026-08-22", Description: "Transport", Category: "Travel", Amount: 50000},
	}, nil
}
func (fakeStore) DeleteSpending(context.Context, string) (bool, error) { return true, nil }
func (fakeStore) CreateChangeLog(_ context.Context, entry model.ChangeLogEntry) (model.ChangeLogEntry, error) {
	entry.CreatedAt = time.Date(2026, 8, 23, 0, 50, 0, 0, time.UTC)
	return entry, nil
}
func (fakeStore) ListChangeLogs(context.Context) ([]model.ChangeLogEntry, error) {
	return []model.ChangeLogEntry{
		{ID: "newest", OccurredAt: time.Date(2026, 8, 23, 1, 0, 0, 0, time.UTC), Title: "Newest", Category: "Backend"},
		{ID: "older", OccurredAt: time.Date(2026, 8, 22, 1, 0, 0, 0, time.UTC), Title: "Older", Category: "Frontend"},
	}, nil
}

func TestOverviewFiltersAndSummarizesLogs(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodGet, "/api/overview?status=success", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		TotalEntries     int         `json:"totalEntries"`
		VisibleEntries   int         `json:"visibleEntries"`
		VerifiedOutcomes int         `json:"verifiedOutcomes"`
		Coverage         int         `json:"coverage"`
		Entries          []model.Log `json:"entries"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.TotalEntries != 2 || body.VisibleEntries != 1 || body.VerifiedOutcomes != 1 || body.Coverage != 100 || len(body.Entries) != 1 {
		t.Fatalf("unexpected overview: %+v", body)
	}
}

func TestHealthUsesZenoServiceName(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Service string `json:"service"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Service != "zeno-backend" {
		t.Fatalf("expected zeno-backend, got %q", body.Service)
	}
}

func TestSwaggerUIAndOpenAPISpecAreServed(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	for _, path := range []string{"/swagger/", "/openapi.yaml"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusOK || response.Body.Len() == 0 {
			t.Fatalf("expected %s to be served, got %d", path, response.Code)
		}
	}
}

func TestUpdateLearningSupportsEditAndChecklist(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	body := `{"date":"2026-08-22","title":"Updated lesson","note":"Done","category":"Frontend","completed":true}`
	request := httptest.NewRequest(http.MethodPut, "/api/learning/11111111-1111-4111-8111-111111111111", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var entry model.LearningEntry
	if err := json.NewDecoder(response.Body).Decode(&entry); err != nil {
		t.Fatal(err)
	}
	if entry.Title != "Updated lesson" || !entry.Completed {
		t.Fatalf("unexpected update response: %+v", entry)
	}
}

func TestCreateChangeLogPersistsDatedUpdate(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	body := `{"id":"change-log-api-test","occurredAt":"2026-08-23T00:50:00+07:00","title":"Persist change log","description":"Stored through backend","category":"Backend"}`
	request := httptest.NewRequest(http.MethodPost, "/api/change-logs", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
	}
	var entry struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Category string `json:"category"`
	}
	if err := json.NewDecoder(response.Body).Decode(&entry); err != nil {
		t.Fatal(err)
	}
	if entry.ID != "change-log-api-test" || entry.Title != "Persist change log" || entry.Category != "Backend" {
		t.Fatalf("unexpected change log response: %+v", entry)
	}
}

func TestListChangeLogsReturnsDatedEntries(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodGet, "/api/change-logs", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Entries []model.ChangeLogEntry `json:"entries"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Entries) != 2 || body.Entries[0].ID != "newest" || body.Entries[1].ID != "older" {
		t.Fatalf("unexpected change logs: %+v", body.Entries)
	}
}

func TestCreateWorkoutPersistsStructuredSession(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	body := `{"date":"2026-08-23","exercise":"Upper body strength","category":"Strength","sets":4,"reps":10,"durationMinutes":45,"note":"Controlled tempo","completed":true}`
	request := httptest.NewRequest(http.MethodPost, "/api/workouts", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
	}
	var entry struct {
		ID              string `json:"id"`
		Exercise        string `json:"exercise"`
		Sets            int    `json:"sets"`
		DurationMinutes int    `json:"durationMinutes"`
		Completed       bool   `json:"completed"`
	}
	if err := json.NewDecoder(response.Body).Decode(&entry); err != nil {
		t.Fatal(err)
	}
	if entry.ID == "" || entry.Exercise != "Upper body strength" || entry.Sets != 4 || entry.DurationMinutes != 45 || !entry.Completed {
		t.Fatalf("unexpected workout response: %+v", entry)
	}
}

func TestListWorkoutsReturnsDatedSessions(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodGet, "/api/workouts?date=2026-08-23", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Entries []model.WorkoutEntry `json:"entries"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Entries) != 1 || body.Entries[0].Exercise != "Morning run" || body.Entries[0].Date != "2026-08-23" {
		t.Fatalf("unexpected workouts: %+v", body.Entries)
	}
}

func TestUpdateWorkoutSupportsProgressAndCompletion(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	body := `{"date":"2026-08-23","exercise":"Morning run","category":"Cardio","sets":1,"reps":0,"durationMinutes":35,"note":"Easy pace","completed":true}`
	request := httptest.NewRequest(http.MethodPut, "/api/workouts/11111111-1111-4111-8111-111111111111", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var entry model.WorkoutEntry
	if err := json.NewDecoder(response.Body).Decode(&entry); err != nil {
		t.Fatal(err)
	}
	if entry.DurationMinutes != 35 || !entry.Completed {
		t.Fatalf("unexpected workout update: %+v", entry)
	}
}

func TestDeleteWorkoutRequiresDatedRecord(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodDelete, "/api/workouts/11111111-1111-4111-8111-111111111111?date=2026-08-23", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Deleted string `json:"deleted"`
		Date    string `json:"date"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Deleted == "" || body.Date != "2026-08-23" {
		t.Fatalf("unexpected delete response: %+v", body)
	}
}

func TestCreateJournalPersistsRichWriting(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	body := `{"date":"2026-08-23","title":"A focused day","content":"## Highlights\n\n- Shipped the dashboard\n- Wrote tests","mood":"Focused","tags":"work,reflection"}`
	request := httptest.NewRequest(http.MethodPost, "/api/journals", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
	}
	var entry struct {
		ID      string `json:"id"`
		Title   string `json:"title"`
		Content string `json:"content"`
		Mood    string `json:"mood"`
		Tags    string `json:"tags"`
	}
	if err := json.NewDecoder(response.Body).Decode(&entry); err != nil {
		t.Fatal(err)
	}
	if entry.ID == "" || entry.Title != "A focused day" || !strings.Contains(entry.Content, "## Highlights") || entry.Mood != "Focused" || entry.Tags != "work,reflection" {
		t.Fatalf("unexpected journal response: %+v", entry)
	}
}

func TestListJournalsReturnsArchiveByDate(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodGet, "/api/journals?date=2026-08-23", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Entries []model.JournalEntry `json:"entries"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Entries) != 1 || body.Entries[0].Date != "2026-08-23" || body.Entries[0].Title != "A focused day" {
		t.Fatalf("unexpected journal archive: %+v", body.Entries)
	}
}

func TestDeleteJournalRemovesEntryByID(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodDelete, "/api/journals/22222222-2222-4222-8222-222222222222", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Deleted string `json:"deleted"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Deleted != "22222222-2222-4222-8222-222222222222" {
		t.Fatalf("unexpected delete response: %+v", body)
	}
}

func TestCreateSpendingPersistsExpense(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	body := `{"date":"2026-08-23","description":"Groceries","category":"Food","amount":185000,"paymentMethod":"Debit","note":"Weekly essentials"}`
	request := httptest.NewRequest(http.MethodPost, "/api/spending", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
	}
	var entry struct {
		ID            string `json:"id"`
		Description   string `json:"description"`
		Amount        int64  `json:"amount"`
		PaymentMethod string `json:"paymentMethod"`
	}
	if err := json.NewDecoder(response.Body).Decode(&entry); err != nil {
		t.Fatal(err)
	}
	if entry.ID == "" || entry.Description != "Groceries" || entry.Amount != 185000 || entry.PaymentMethod != "Debit" {
		t.Fatalf("unexpected spending response: %+v", entry)
	}
}

func TestListSpendingReturnsExpenseLedger(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodGet, "/api/spending", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Entries []model.SpendingEntry `json:"entries"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Entries) != 2 || body.Entries[0].Amount != 185000 || body.Entries[1].Description != "Transport" {
		t.Fatalf("unexpected spending ledger: %+v", body.Entries)
	}
}

func TestDeleteSpendingRemovesExpenseByID(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodDelete, "/api/spending/33333333-3333-4333-8333-333333333333", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Deleted string `json:"deleted"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Deleted != "33333333-3333-4333-8333-333333333333" {
		t.Fatalf("unexpected delete response: %+v", body)
	}
}

func TestCreateDoingPersistsTask(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	body := `{"date":"2026-08-23","title":"Ship Doing page","note":"Match Learning behavior","category":"Product","completed":false}`
	request := httptest.NewRequest(http.MethodPost, "/api/doing", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", response.Code, response.Body.String())
	}
	var entry struct {
		ID        string `json:"id"`
		Date      string `json:"date"`
		Title     string `json:"title"`
		Category  string `json:"category"`
		Completed bool   `json:"completed"`
	}
	if err := json.NewDecoder(response.Body).Decode(&entry); err != nil {
		t.Fatal(err)
	}
	if entry.ID == "" || entry.Date != "2026-08-23" || entry.Title != "Ship Doing page" || entry.Category != "Product" || entry.Completed {
		t.Fatalf("unexpected doing response: %+v", entry)
	}
}

func TestListDoingReturnsDatedTasks(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodGet, "/api/doing?date=2026-08-23", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Entries []model.DoingEntry `json:"entries"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Entries) != 1 || body.Entries[0].Title != "Ship Doing page" || body.Entries[0].Date != "2026-08-23" {
		t.Fatalf("unexpected doing entries: %+v", body.Entries)
	}
}

func TestUpdateDoingSupportsEditAndChecklist(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	body := `{"date":"2026-08-23","title":"Ship Doing page now","note":"Completed task","category":"Product","completed":true}`
	request := httptest.NewRequest(http.MethodPut, "/api/doing/55555555-5555-4555-8555-555555555555", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var entry model.DoingEntry
	if err := json.NewDecoder(response.Body).Decode(&entry); err != nil {
		t.Fatal(err)
	}
	if entry.Title != "Ship Doing page now" || !entry.Completed {
		t.Fatalf("unexpected doing update: %+v", entry)
	}
}

func TestDeleteDoingRequiresDatedTask(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodDelete, "/api/doing/55555555-5555-4555-8555-555555555555?date=2026-08-23", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Deleted string `json:"deleted"`
		Date    string `json:"date"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Deleted != "55555555-5555-4555-8555-555555555555" || body.Date != "2026-08-23" {
		t.Fatalf("unexpected doing delete: %+v", body)
	}
}

func TestRegisterAcceptsEmailForVerification(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	body := `{"email":"rama@example.com","password":"long-secure-password","displayName":"Rama"}`
	request := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", response.Code, response.Body.String())
	}
}

func TestVerifyEmailActivatesAccount(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	body := `{"token":"abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"}`
	request := httptest.NewRequest(http.MethodPost, "/api/auth/verify-email", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
}

func TestLoginCreatesSecureSessionCookie(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	body := `{"email":"rama@example.com","password":"long-secure-password"}`
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	cookies := response.Result().Cookies()
	var sessionCookie, csrfCookie *http.Cookie
	for _, cookie := range cookies {
		if cookie.Name == "zeno_session" {
			sessionCookie = cookie
		}
		if cookie.Name == "zeno_csrf" {
			csrfCookie = cookie
		}
	}
	if sessionCookie == nil || csrfCookie == nil || !sessionCookie.HttpOnly || csrfCookie.HttpOnly || sessionCookie.SameSite != http.SameSiteStrictMode || csrfCookie.SameSite != http.SameSiteStrictMode {
		t.Fatalf("unexpected session cookies: %+v", cookies)
	}
}

func TestAuthMeReturnsSessionUser(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	request.AddCookie(&http.Cookie{Name: "zeno_session", Value: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		User model.User `json:"user"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.User.Email != "rama@example.com" {
		t.Fatalf("unexpected me response: %+v", body.User)
	}
}

func TestProtectedDashboardRejectsAnonymousWhenAuthEnabled(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	request := httptest.NewRequest(http.MethodGet, "/api/overview", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", response.Code, response.Body.String())
	}
}

func TestActivityReturnsUserAuditEvents(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	request := httptest.NewRequest(http.MethodGet, "/api/activity", nil)
	request.AddCookie(&http.Cookie{Name: "zeno_session", Value: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var body struct {
		Events []struct {
			ActorEmail string `json:"actorEmail"`
			Action     string `json:"action"`
			EntityType string `json:"entityType"`
		} `json:"events"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Events) != 1 || body.Events[0].ActorEmail != "rama@example.com" || body.Events[0].Action != "create" || body.Events[0].EntityType != "spending" {
		t.Fatalf("unexpected activity response: %+v", body.Events)
	}
}

func TestUserOnlySeesAndDeletesOwnedRecords(t *testing.T) {
	handler := api.New(ownershipStore{}, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	cookie := &http.Cookie{Name: "zeno_session", Value: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"}
	listRequest := httptest.NewRequest(http.MethodGet, "/api/spending", nil)
	listRequest.AddCookie(cookie)
	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, listRequest)
	var listBody struct {
		Entries []model.SpendingEntry `json:"entries"`
	}
	if err := json.NewDecoder(listResponse.Body).Decode(&listBody); err != nil {
		t.Fatal(err)
	}
	if len(listBody.Entries) != 1 || listBody.Entries[0].Description != "Own expense" {
		t.Fatalf("unexpected owned entries: %+v", listBody.Entries)
	}
	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/spending/44444444-4444-4444-8444-444444444444", nil)
	deleteRequest.AddCookie(cookie)
	deleteRequest.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "csrf-value"})
	deleteRequest.Header.Set("X-CSRF-Token", "csrf-value")
	deleteResponse := httptest.NewRecorder()
	handler.ServeHTTP(deleteResponse, deleteRequest)
	if deleteResponse.Code != http.StatusNotFound {
		t.Fatalf("expected foreign record to be hidden with 404, got %d: %s", deleteResponse.Code, deleteResponse.Body.String())
	}
}

func TestAdminCanSeeAndDeleteAllRecords(t *testing.T) {
	handler := api.New(ownershipStore{admin: true}, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	cookie := &http.Cookie{Name: "zeno_session", Value: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"}
	listRequest := httptest.NewRequest(http.MethodGet, "/api/spending", nil)
	listRequest.AddCookie(cookie)
	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, listRequest)
	var listBody struct {
		Entries []model.SpendingEntry `json:"entries"`
	}
	if err := json.NewDecoder(listResponse.Body).Decode(&listBody); err != nil {
		t.Fatal(err)
	}
	if len(listBody.Entries) != 2 {
		t.Fatalf("expected admin to see two entries, got %+v", listBody.Entries)
	}
	deleteRequest := httptest.NewRequest(http.MethodDelete, "/api/spending/44444444-4444-4444-8444-444444444444", nil)
	deleteRequest.AddCookie(cookie)
	deleteRequest.AddCookie(&http.Cookie{Name: "zeno_csrf", Value: "csrf-value"})
	deleteRequest.Header.Set("X-CSRF-Token", "csrf-value")
	deleteResponse := httptest.NewRecorder()
	handler.ServeHTTP(deleteResponse, deleteRequest)
	if deleteResponse.Code != http.StatusOK {
		t.Fatalf("expected admin delete 200, got %d: %s", deleteResponse.Code, deleteResponse.Body.String())
	}
}

func TestLoginRateLimitBlocksSixthAttempt(t *testing.T) {
	handler := api.New(fakeStore{}, fakeSource{}, "test")
	for attempt := 1; attempt <= 6; attempt++ {
		body := `{"email":"rama@example.com","password":"wrong-password-value"}`
		request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
		request.RemoteAddr = "203.0.113.10:1234"
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if attempt < 6 && response.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d expected 401, got %d", attempt, response.Code)
		}
		if attempt == 6 && response.Code != http.StatusTooManyRequests {
			t.Fatalf("sixth attempt expected 429, got %d: %s", response.Code, response.Body.String())
		}
	}
}

func TestProtectedMutationRejectsMissingCSRF(t *testing.T) {
	handler := api.New(ownershipStore{admin: true}, fakeSource{}, "test", api.WithAuth(api.AuthOptions{Enabled: true}))
	request := httptest.NewRequest(http.MethodDelete, "/api/spending/44444444-4444-4444-8444-444444444444", nil)
	request.AddCookie(&http.Cookie{Name: "zeno_session", Value: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403 without CSRF, got %d: %s", response.Code, response.Body.String())
	}
}
