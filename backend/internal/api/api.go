package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"

	"zeno-backend/internal/mailer"
	"zeno-backend/internal/model"
)

//go:embed openapi.yaml
var docs embed.FS

var dummyPasswordHash = func() []byte {
	hash, _ := bcrypt.GenerateFromPassword([]byte("not-a-real-user-password"), 12)
	return hash
}()

type Store interface {
	Ping(context.Context) error
	RegisterUser(context.Context, model.User, string, time.Time) (model.User, bool, error)
	VerifyEmail(context.Context, string, time.Time) (model.User, bool, error)
	FindUserByEmail(context.Context, string) (model.User, bool, error)
	CreateSession(context.Context, model.Session) error
	GetSessionUser(context.Context, string, time.Time) (model.User, bool, error)
	DeleteSession(context.Context, string) error
	UpdateUserProfile(context.Context, string, string, time.Time) (model.User, bool, error)
	CreateActivity(context.Context, model.ActivityEvent) error
	ListActivities(context.Context, string, bool, int) ([]model.ActivityEvent, error)
	GetSettings(context.Context) (model.Settings, error)
	UpdateSettings(context.Context, string) (model.Settings, error)
	ListLearning(context.Context, string) ([]model.LearningEntry, error)
	CreateLearning(context.Context, model.LearningEntry) (model.LearningEntry, error)
	UpdateLearning(context.Context, model.LearningEntry) (model.LearningEntry, bool, error)
	DeleteLearning(context.Context, string, string) (bool, error)
	SeedLearningMaterials(context.Context, []model.LearningMaterialSeed) error
	ListLearningMaterials(context.Context, string, string, string, string, time.Time) ([]model.LearningMaterialSummary, error)
	GetLearningMaterial(context.Context, string, string, time.Time) (model.LearningMaterial, bool, error)
	UpsertLearningMaterialProgress(context.Context, string, model.LearningMaterialProgressInput, time.Time) (model.LearningMaterialProgress, bool, error)
	CreateDoing(context.Context, model.DoingEntry) (model.DoingEntry, error)
	ListDoing(context.Context, string, string, bool) ([]model.DoingEntry, error)
	UpdateDoing(context.Context, model.DoingEntry, string, bool) (model.DoingEntry, bool, error)
	DeleteDoing(context.Context, string, string, string, bool) (bool, error)
	CreateWorkout(context.Context, model.WorkoutEntry) (model.WorkoutEntry, error)
	ListWorkouts(context.Context, string) ([]model.WorkoutEntry, error)
	UpdateWorkout(context.Context, model.WorkoutEntry) (model.WorkoutEntry, bool, error)
	DeleteWorkout(context.Context, string, string) (bool, error)
	CreateWorkoutSession(context.Context, model.WorkoutSession) (model.WorkoutSession, error)
	ListWorkoutSessions(context.Context, string, string, string, bool) ([]model.WorkoutSession, error)
	UpdateWorkoutSession(context.Context, model.WorkoutSession, string, bool, time.Time) (model.WorkoutSession, bool, bool, error)
	DeleteWorkoutSession(context.Context, string, string, bool) (bool, error)
	CreateWorkoutTemplate(context.Context, model.WorkoutTemplate) (model.WorkoutTemplate, error)
	ListWorkoutTemplates(context.Context, string, bool) ([]model.WorkoutTemplate, error)
	CreateJournal(context.Context, model.JournalEntry) (model.JournalEntry, error)
	ListJournals(context.Context, string) ([]model.JournalEntry, error)
	GetJournal(context.Context, string) (model.JournalEntry, bool, error)
	ListJournalRevisions(context.Context, string) ([]model.JournalRevision, error)
	AppendJournalRevision(context.Context, string, string, bool, model.JournalRevisionInput, time.Time) (model.JournalEntry, model.JournalRevision, bool, bool, bool, error)
	DeleteJournal(context.Context, string, string, bool) (model.JournalEntry, bool, error)
	CreateSpending(context.Context, model.SpendingEntry) (model.SpendingEntry, error)
	ListSpending(context.Context, string) ([]model.SpendingEntry, error)
	DeleteSpending(context.Context, string) (bool, error)
	CreateChangeLog(context.Context, model.ChangeLogEntry) (model.ChangeLogEntry, error)
	ListChangeLogs(context.Context) ([]model.ChangeLogEntry, error)
}

type Source interface {
	Logs() ([]model.Log, model.SourceMeta, error)
}

type handler struct {
	store        Store
	source       Source
	version      string
	auth         AuthOptions
	attemptMu    sync.Mutex
	authAttempts map[string]rateAttempt
}

type rateAttempt struct {
	Count   int
	ResetAt time.Time
}

type AuthOptions struct {
	Enabled         bool
	AppBaseURL      string
	VerificationTTL time.Duration
	SessionTTL      time.Duration
	CookieName      string
	CSRFCookieName  string
	CookieSecure    bool
	AllowedOrigin   string
	AdminEmails     map[string]bool
	Mailer          mailer.Sender
	PasswordCost    int
	RateLimit       int
	RateWindow      time.Duration
	Now             func() time.Time
}

type Option func(*handler)

type userContextKey struct{}

func WithAuth(options AuthOptions) Option {
	return func(h *handler) {
		h.auth = options
		applyAuthDefaults(&h.auth)
	}
}

type discardMailer struct{}

func (discardMailer) SendVerification(context.Context, string, string, string) error { return nil }

func applyAuthDefaults(options *AuthOptions) {
	if options.AppBaseURL == "" {
		options.AppBaseURL = "http://localhost:8080"
	}
	if options.VerificationTTL <= 0 {
		options.VerificationTTL = 24 * time.Hour
	}
	if options.SessionTTL <= 0 {
		options.SessionTTL = 30 * 24 * time.Hour
	}
	if options.CookieName == "" {
		options.CookieName = "zeno_session"
	}
	if options.CSRFCookieName == "" {
		options.CSRFCookieName = "zeno_csrf"
	}
	if options.Mailer == nil {
		options.Mailer = discardMailer{}
	}
	if options.PasswordCost == 0 {
		options.PasswordCost = 12
	}
	if options.RateLimit <= 0 {
		options.RateLimit = 5
	}
	if options.RateWindow <= 0 {
		options.RateWindow = 10 * time.Minute
	}
	if options.Now == nil {
		options.Now = func() time.Time { return time.Now().UTC() }
	}
	if options.AdminEmails == nil {
		options.AdminEmails = map[string]bool{}
	}
}

func New(store Store, source Source, version string, options ...Option) http.Handler {
	h := &handler{store: store, source: source, version: version, authAttempts: map[string]rateAttempt{}}
	applyAuthDefaults(&h.auth)
	for _, option := range options {
		option(h)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", h.health)
	mux.HandleFunc("POST /api/auth/register", h.register)
	mux.HandleFunc("POST /api/auth/verify-email", h.verifyEmail)
	mux.HandleFunc("POST /api/auth/login", h.login)
	mux.HandleFunc("GET /api/auth/me", h.me)
	mux.HandleFunc("POST /api/auth/logout", h.logout)
	mux.HandleFunc("PUT /api/profile", h.updateProfile)
	mux.HandleFunc("GET /api/overview", h.overview)
	mux.HandleFunc("GET /api/logs", h.logs)
	mux.HandleFunc("GET /api/logs/{id}", h.logByID)
	mux.HandleFunc("GET /api/activity", h.activity)
	mux.HandleFunc("GET /api/settings", h.getSettings)
	mux.HandleFunc("PUT /api/settings", h.updateSettings)
	mux.HandleFunc("GET /api/learning", h.listLearning)
	mux.HandleFunc("POST /api/learning", h.createLearning)
	mux.HandleFunc("PUT /api/learning/{id}", h.updateLearning)
	mux.HandleFunc("DELETE /api/learning/{id}", h.deleteLearning)
	mux.HandleFunc("GET /api/learning-modules", h.listManualModules)
	mux.HandleFunc("POST /api/learning-modules", h.createManualModule)
	mux.HandleFunc("GET /api/learning-modules/{id}", h.getManualModule)
	mux.HandleFunc("PUT /api/learning-modules/{id}", h.updateManualModule)
	mux.HandleFunc("DELETE /api/learning-modules/{id}", h.deleteManualModule)
	mux.HandleFunc("POST /api/learning-modules/{id}/materials", h.createManualMaterial)
	mux.HandleFunc("PUT /api/learning-modules/{id}/materials/{materialId}", h.updateManualMaterial)
	mux.HandleFunc("DELETE /api/learning-modules/{id}/materials/{materialId}", h.deleteManualMaterial)
	mux.HandleFunc("POST /api/learning-modules/{id}/materials/{materialId}/file", h.uploadManualFile)
	mux.HandleFunc("GET /api/learning-modules/{id}/materials/{materialId}/file", h.getManualFile)
	mux.HandleFunc("GET /api/learning-sessions", h.listManualSessions)
	mux.HandleFunc("POST /api/learning-sessions", h.createManualSession)
	mux.HandleFunc("GET /api/learning-sessions/{id}", h.getManualSession)
	mux.HandleFunc("PUT /api/learning-sessions/{id}", h.updateManualSession)
	mux.HandleFunc("GET /api/learning-materials", h.listLearningMaterials)
	mux.HandleFunc("GET /api/learning-materials/{id}", h.getLearningMaterial)
	mux.HandleFunc("PUT /api/learning-materials/{id}/progress", h.upsertLearningMaterialProgress)
	mux.HandleFunc("GET /api/doing/tasks/{id}", h.getDoingTask)
	mux.HandleFunc("GET /api/doing/tasks", h.listDoingTasks)
	mux.HandleFunc("POST /api/doing/tasks", h.createDoingTask)
	mux.HandleFunc("PUT /api/doing/tasks/{id}", h.updateDoingTask)
	mux.HandleFunc("DELETE /api/doing/tasks/{id}", h.deleteDoingTask)
	mux.HandleFunc("POST /api/doing", h.createDoing)
	mux.HandleFunc("GET /api/doing", h.listDoing)
	mux.HandleFunc("PUT /api/doing/{id}", h.updateDoing)
	mux.HandleFunc("DELETE /api/doing/{id}", h.deleteDoing)
	mux.HandleFunc("POST /api/workouts", h.createWorkout)
	mux.HandleFunc("GET /api/workouts", h.listWorkouts)
	mux.HandleFunc("PUT /api/workouts/{id}", h.updateWorkout)
	mux.HandleFunc("DELETE /api/workouts/{id}", h.deleteWorkout)
	mux.HandleFunc("POST /api/workout-sessions", h.createWorkoutSession)
	mux.HandleFunc("GET /api/workout-sessions", h.listWorkoutSessions)
	mux.HandleFunc("PUT /api/workout-sessions/{id}", h.updateWorkoutSession)
	mux.HandleFunc("DELETE /api/workout-sessions/{id}", h.deleteWorkoutSession)
	mux.HandleFunc("POST /api/workout-templates", h.createWorkoutTemplate)
	mux.HandleFunc("GET /api/workout-templates", h.listWorkoutTemplates)
	mux.HandleFunc("POST /api/journals", h.createJournal)
	mux.HandleFunc("GET /api/journals", h.listJournals)
	mux.HandleFunc("GET /api/journals/{id}/revisions", h.listJournalRevisions)
	mux.HandleFunc("POST /api/journals/{id}/revisions", h.appendJournalRevision)
	mux.HandleFunc("DELETE /api/journals/{id}", h.deleteJournal)
	mux.HandleFunc("POST /api/spending", h.createSpending)
	mux.HandleFunc("GET /api/spending", h.listSpending)
	mux.HandleFunc("DELETE /api/spending/{id}", h.deleteSpending)
	mux.HandleFunc("POST /api/change-logs", h.createChangeLog)
	mux.HandleFunc("GET /api/change-logs", h.listChangeLogs)
	mux.HandleFunc("GET /openapi.yaml", openAPI)
	mux.HandleFunc("GET /swagger/", h.swaggerUI)
	mux.HandleFunc("GET /", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"service": "zeno-backend", "swagger": "/swagger/"})
	})
	return h.cors(h.authMiddleware(mux))
}

func (h *handler) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if h.auth.Enabled && r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions && r.ContentLength != 0 {
			mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || (mediaType != "application/json" && !(mediaType == "multipart/form-data" && strings.HasPrefix(r.URL.Path, "/api/learning-modules/") && strings.Contains(r.URL.Path, "/materials"))) {
				writeError(w, http.StatusUnsupportedMediaType, "Content-Type harus application/json")
				return
			}
		}
		if h.auth.AllowedOrigin != "" && r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
			if origin := r.Header.Get("Origin"); origin != "" && origin != h.auth.AllowedOrigin {
				writeError(w, http.StatusForbidden, "origin tidak diizinkan")
				return
			}
		}
		if !h.auth.Enabled || isPublicPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		user, authenticated, err := h.authenticateCookie(r)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "session tidak dapat diverifikasi")
			return
		}
		if !authenticated {
			writeError(w, http.StatusUnauthorized, "login diperlukan")
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
			csrfCookie, cookieErr := r.Cookie(h.auth.CSRFCookieName)
			csrfHeader := r.Header.Get("X-CSRF-Token")
			if cookieErr != nil || csrfCookie.Value == "" || csrfHeader == "" || len(csrfCookie.Value) != len(csrfHeader) || subtle.ConstantTimeCompare([]byte(csrfCookie.Value), []byte(csrfHeader)) != 1 {
				writeError(w, http.StatusForbidden, "CSRF token tidak valid")
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userContextKey{}, user)))
	})
}

func isPublicPath(path string) bool {
	switch path {
	case "/", "/api/health", "/api/auth/register", "/api/auth/verify-email", "/api/auth/login", "/api/auth/resend-verification", "/openapi.yaml":
		return true
	default:
		return strings.HasPrefix(path, "/swagger/")
	}
}

func (h *handler) authenticateCookie(r *http.Request) (model.User, bool, error) {
	cookie, err := r.Cookie(h.auth.CookieName)
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return model.User{}, false, nil
	}
	hash := sha256.Sum256([]byte(cookie.Value))
	return h.store.GetSessionUser(r.Context(), hex.EncodeToString(hash[:]), h.auth.Now())
}

func currentUser(r *http.Request) (model.User, bool) {
	user, ok := r.Context().Value(userContextKey{}).(model.User)
	return user, ok
}

func (h *handler) actorForRequest(r *http.Request) (model.User, bool, error) {
	if user, ok := currentUser(r); ok {
		return user, true, nil
	}
	if user, ok, err := h.authenticateCookie(r); err != nil || ok {
		return user, ok, err
	}
	if !h.auth.Enabled {
		return model.User{Role: "admin", DisplayName: "system", Email: "system@local"}, true, nil
	}
	return model.User{}, false, nil
}

func canAccessOwner(user model.User, ownerUserID string) bool {
	return user.Role == "admin" || (user.ID != "" && ownerUserID == user.ID)
}

func (h *handler) requireActor(w http.ResponseWriter, r *http.Request) (model.User, bool) {
	user, ok, err := h.actorForRequest(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "session tidak dapat diverifikasi")
		return model.User{}, false
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, "login diperlukan")
		return model.User{}, false
	}
	return user, true
}

func (h *handler) authAttemptKey(r *http.Request, email string) string {
	host := r.RemoteAddr
	if parsed, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		host = parsed
	}
	return r.URL.Path + "|" + host + "|" + strings.ToLower(strings.TrimSpace(email))
}

func (h *handler) allowAuthAttempt(r *http.Request, email string) bool {
	key := h.authAttemptKey(r, email)
	now := h.auth.Now()
	h.attemptMu.Lock()
	defer h.attemptMu.Unlock()
	attempt := h.authAttempts[key]
	if attempt.ResetAt.IsZero() || now.After(attempt.ResetAt) {
		attempt = rateAttempt{ResetAt: now.Add(h.auth.RateWindow)}
	}
	attempt.Count++
	h.authAttempts[key] = attempt
	return attempt.Count <= h.auth.RateLimit
}

func (h *handler) clearAuthAttempts(r *http.Request, email string) {
	h.attemptMu.Lock()
	delete(h.authAttempts, h.authAttemptKey(r, email))
	h.attemptMu.Unlock()
}

func filterOwned[T any](entries []T, user model.User, owner func(T) string) []T {
	if user.Role == "admin" {
		return entries
	}
	filtered := make([]T, 0, len(entries))
	for _, entry := range entries {
		if owner(entry) == user.ID {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}

func findOwned[T any](entries []T, id string, user model.User, entryID func(T) string, owner func(T) string) (T, bool) {
	for _, entry := range entries {
		if entryID(entry) == id && canAccessOwner(user, owner(entry)) {
			return entry, true
		}
	}
	var zero T
	return zero, false
}

func (h *handler) audit(ctx context.Context, user model.User, action, entityType, entityID, description string, metadata map[string]any) {
	h.auditSubject(ctx, user, user.ID, action, entityType, entityID, description, metadata)
}

func (h *handler) auditSubject(ctx context.Context, user model.User, subjectUserID, action, entityType, entityID, description string, metadata map[string]any) {
	if user.ID == "" {
		return
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	event := model.ActivityEvent{ID: newUUID(), UserID: user.ID, SubjectUserID: subjectUserID, ActorName: user.DisplayName, ActorEmail: user.Email, ActorRole: user.Role, Action: action, EntityType: entityType, EntityID: entityID, Description: description, Metadata: metadata, CreatedAt: h.auth.Now()}
	if err := h.store.CreateActivity(ctx, event); err != nil {
		log.Printf("create activity event: %v", err)
	}
}

func (h *handler) health(w http.ResponseWriter, r *http.Request) {
	dbStatus := "up"
	if err := h.store.Ping(r.Context()); err != nil {
		dbStatus = "down"
	}
	_, meta, sourceErr := h.source.Logs()
	status := "ok"
	code := http.StatusOK
	if dbStatus == "down" || sourceErr != nil {
		status, code = "degraded", http.StatusServiceUnavailable
	}
	writeJSON(w, code, map[string]any{
		"status": status, "service": "zeno-backend", "version": h.version,
		"database": map[string]string{"status": dbStatus},
		"source":   map[string]any{"exists": sourceErr == nil, "modifiedAt": nullableTime(meta.ModifiedAt)},
	})
}

func (h *handler) register(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
	}
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	rawEmail := strings.TrimSpace(input.Email)
	parsedEmail, err := mail.ParseAddress(rawEmail)
	if err != nil || !strings.EqualFold(parsedEmail.Address, rawEmail) || len(parsedEmail.Address) > 254 {
		writeError(w, http.StatusBadRequest, "email tidak valid")
		return
	}
	email := strings.ToLower(parsedEmail.Address)
	if !h.allowAuthAttempt(r, email) {
		writeError(w, http.StatusTooManyRequests, "terlalu banyak percobaan; coba lagi nanti")
		return
	}
	displayName := strings.TrimSpace(input.DisplayName)
	if displayName == "" {
		displayName = strings.SplitN(email, "@", 2)[0]
	}
	if len(displayName) < 2 || len(displayName) > 80 {
		writeError(w, http.StatusBadRequest, "displayName harus 2-80 karakter")
		return
	}
	if len(input.Password) < 12 || len(input.Password) > 72 {
		writeError(w, http.StatusBadRequest, "password harus 12-72 karakter")
		return
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), h.auth.PasswordCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password tidak dapat diproses")
		return
	}
	rawToken, tokenHash, err := newAuthToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "token verifikasi tidak dapat dibuat")
		return
	}
	now := h.auth.Now()
	role := "user"
	if h.auth.AdminEmails[email] {
		role = "admin"
	}
	user := model.User{ID: newUUID(), Email: email, DisplayName: displayName, PasswordHash: string(passwordHash), Role: role, CreatedAt: now, UpdatedAt: now}
	stored, shouldSend, err := h.store.RegisterUser(r.Context(), user, tokenHash, now.Add(h.auth.VerificationTTL))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "registrasi tidak dapat diproses")
		return
	}
	if shouldSend {
		h.audit(r.Context(), stored, "register", "auth", stored.ID, "Mendaftarkan akun Zeno", map[string]any{"emailVerified": false})
		verificationURL := strings.TrimRight(h.auth.AppBaseURL, "/") + "/verify-email?token=" + url.QueryEscape(rawToken)
		if err := h.auth.Mailer.SendVerification(r.Context(), stored.Email, stored.DisplayName, verificationURL); err != nil {
			if errors.Is(err, mailer.ErrNotConfigured) {
				writeError(w, http.StatusServiceUnavailable, "layanan email belum dikonfigurasi")
				return
			}
			log.Printf("send verification email: %v", err)
		}
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"message": "Jika email valid, tautan verifikasi telah dikirim."})
}

func (h *handler) verifyEmail(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token string `json:"token"`
	}
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	rawToken := strings.TrimSpace(input.Token)
	if len(rawToken) < 32 || len(rawToken) > 256 {
		writeError(w, http.StatusBadRequest, "token verifikasi tidak valid atau kedaluwarsa")
		return
	}
	hash := sha256.Sum256([]byte(rawToken))
	user, verified, err := h.store.VerifyEmail(r.Context(), hex.EncodeToString(hash[:]), h.auth.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "verifikasi email tidak dapat diproses")
		return
	}
	if !verified {
		writeError(w, http.StatusBadRequest, "token verifikasi tidak valid atau kedaluwarsa")
		return
	}
	h.audit(r.Context(), user, "verify_email", "auth", user.ID, "Memverifikasi alamat email", nil)
	writeJSON(w, http.StatusOK, map[string]any{"message": "Email berhasil diverifikasi. Silakan login.", "user": user})
}

func (h *handler) login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if !h.allowAuthAttempt(r, email) {
		writeError(w, http.StatusTooManyRequests, "terlalu banyak percobaan; coba lagi nanti")
		return
	}
	user, found, err := h.store.FindUserByEmail(r.Context(), email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "login tidak dapat diproses")
		return
	}
	if !found {
		_ = bcrypt.CompareHashAndPassword(dummyPasswordHash, []byte(input.Password))
		writeError(w, http.StatusUnauthorized, "email atau password salah")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)) != nil {
		writeError(w, http.StatusUnauthorized, "email atau password salah")
		return
	}
	if user.EmailVerifiedAt == nil {
		writeError(w, http.StatusForbidden, "email belum diverifikasi")
		return
	}
	rawToken, tokenHash, err := newAuthToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "session tidak dapat dibuat")
		return
	}
	csrfToken, _, err := newAuthToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "CSRF token tidak dapat dibuat")
		return
	}
	now := h.auth.Now()
	expiresAt := now.Add(h.auth.SessionTTL)
	if err := h.store.CreateSession(r.Context(), model.Session{TokenHash: tokenHash, UserID: user.ID, ExpiresAt: expiresAt, CreatedAt: now, LastSeenAt: now}); err != nil {
		writeError(w, http.StatusInternalServerError, "session tidak dapat disimpan")
		return
	}
	h.audit(r.Context(), user, "login", "auth", user.ID, "Login ke Zeno", nil)
	h.clearAuthAttempts(r, email)
	http.SetCookie(w, &http.Cookie{Name: h.auth.CookieName, Value: rawToken, Path: "/", Expires: expiresAt, MaxAge: int(h.auth.SessionTTL.Seconds()), HttpOnly: true, Secure: h.auth.CookieSecure, SameSite: http.SameSiteStrictMode})
	http.SetCookie(w, &http.Cookie{Name: h.auth.CSRFCookieName, Value: csrfToken, Path: "/", Expires: expiresAt, MaxAge: int(h.auth.SessionTTL.Seconds()), HttpOnly: false, Secure: h.auth.CookieSecure, SameSite: http.SameSiteStrictMode})
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (h *handler) me(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r)
	if !ok {
		var err error
		user, ok, err = h.authenticateCookie(r)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "session tidak dapat diverifikasi")
			return
		}
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, "login diperlukan")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (h *handler) logout(w http.ResponseWriter, r *http.Request) {
	user, _ := currentUser(r)
	if cookie, err := r.Cookie(h.auth.CookieName); err == nil && cookie.Value != "" {
		hash := sha256.Sum256([]byte(cookie.Value))
		if err := h.store.DeleteSession(r.Context(), hex.EncodeToString(hash[:])); err != nil {
			writeError(w, http.StatusInternalServerError, "logout tidak dapat diproses")
			return
		}
	}
	h.audit(r.Context(), user, "logout", "auth", user.ID, "Logout dari Zeno", nil)
	http.SetCookie(w, &http.Cookie{Name: h.auth.CookieName, Value: "", Path: "/", MaxAge: -1, Expires: time.Unix(1, 0), HttpOnly: true, Secure: h.auth.CookieSecure, SameSite: http.SameSiteStrictMode})
	http.SetCookie(w, &http.Cookie{Name: h.auth.CSRFCookieName, Value: "", Path: "/", MaxAge: -1, Expires: time.Unix(1, 0), HttpOnly: false, Secure: h.auth.CookieSecure, SameSite: http.SameSiteStrictMode})
	writeJSON(w, http.StatusOK, map[string]string{"message": "Logout berhasil."})
}

func (h *handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r)
	if !ok {
		var err error
		user, ok, err = h.authenticateCookie(r)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "session tidak dapat diverifikasi")
			return
		}
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, "login diperlukan")
		return
	}
	var input struct {
		DisplayName string `json:"displayName"`
	}
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	displayName := strings.TrimSpace(input.DisplayName)
	if len(displayName) < 2 || len(displayName) > 80 {
		writeError(w, http.StatusBadRequest, "displayName harus 2-80 karakter")
		return
	}
	updated, found, err := h.store.UpdateUserProfile(r.Context(), user.ID, displayName, h.auth.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "profil tidak dapat diperbarui")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "user tidak ditemukan")
		return
	}
	h.audit(r.Context(), updated, "update", "profile", updated.ID, "Memperbarui profil", map[string]any{"displayName": updated.DisplayName})
	writeJSON(w, http.StatusOK, map[string]any{"user": updated})
}

func (h *handler) overview(w http.ResponseWriter, r *http.Request) {
	logs, meta, err := h.source.Logs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "source tidak dapat dibaca")
		return
	}
	entries := filterLogs(logs, r.URL.Query().Get("status"), r.URL.Query().Get("query"))
	verified := 0
	for _, entry := range logs {
		if entry.Status == "success" {
			verified++
		}
	}
	coverage := 0
	if len(logs) > 0 {
		coverage = 100
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"totalEntries": len(logs), "visibleEntries": len(entries), "verifiedOutcomes": verified,
		"coverage": coverage, "entries": entries, "generatedAt": meta.ModifiedAt, "sourceFile": meta.SourceFile,
	})
}

func (h *handler) logs(w http.ResponseWriter, r *http.Request) {
	logs, meta, err := h.source.Logs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "source tidak dapat dibaca")
		return
	}
	entries := filterLogs(logs, r.URL.Query().Get("status"), r.URL.Query().Get("query"))
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries, "total": len(logs), "generatedAt": meta.ModifiedAt, "sourceFile": meta.SourceFile})
}

func (h *handler) logByID(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "id log tidak valid")
		return
	}
	logs, _, err := h.source.Logs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "source tidak dapat dibaca")
		return
	}
	for _, entry := range logs {
		if entry.ID == id {
			writeJSON(w, http.StatusOK, entry)
			return
		}
	}
	writeError(w, http.StatusNotFound, "log entry tidak ditemukan")
}

func (h *handler) activity(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r)
	if !ok {
		var err error
		user, ok, err = h.authenticateCookie(r)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "session tidak dapat diverifikasi")
			return
		}
	}
	if !ok {
		writeError(w, http.StatusUnauthorized, "login diperlukan")
		return
	}
	limit := 100
	if value := r.URL.Query().Get("limit"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed >= 1 && parsed <= 200 {
			limit = parsed
		}
	}
	events, err := h.store.ListActivities(r.Context(), user.ID, user.Role == "admin", limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "activity tidak dapat dibaca")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events})
}

func (h *handler) getSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.store.GetSettings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "settings tidak dapat dibaca")
		return
	}
	_, meta, _ := h.source.Logs()
	settings.SourceFile = meta.SourceFile
	writeJSON(w, http.StatusOK, settings)
}

func (h *handler) updateSettings(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	if h.auth.Enabled && actor.Role != "admin" {
		writeError(w, http.StatusForbidden, "hanya admin yang dapat mengubah settings")
		return
	}
	var input struct {
		WorkspaceName string `json:"workspaceName"`
	}
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.WorkspaceName = strings.TrimSpace(input.WorkspaceName)
	if len(input.WorkspaceName) < 1 || len(input.WorkspaceName) > 80 {
		writeError(w, http.StatusBadRequest, "workspaceName harus 1-80 karakter")
		return
	}
	settings, err := h.store.UpdateSettings(r.Context(), input.WorkspaceName)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "settings tidak dapat disimpan")
		return
	}
	_, meta, _ := h.source.Logs()
	settings.SourceFile = meta.SourceFile
	h.audit(r.Context(), actor, "update", "settings", "workspace", "Memperbarui workspace settings", map[string]any{"workspaceName": settings.WorkspaceName})
	writeJSON(w, http.StatusOK, settings)
}

func (h *handler) listLearning(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	date := r.URL.Query().Get("date")
	if date != "" && !validDate(date) {
		writeError(w, http.StatusBadRequest, "date harus berformat YYYY-MM-DD")
		return
	}
	entries, err := h.store.ListLearning(r.Context(), date)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "learning entries tidak dapat dibaca")
		return
	}
	entries = filterOwned(entries, actor, func(entry model.LearningEntry) string { return entry.OwnerUserID })
	writeJSON(w, http.StatusOK, map[string]any{"date": nullableString(date), "entries": entries})
}

func (h *handler) createLearning(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var input model.LearningEntry
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.Date = strings.TrimSpace(input.Date)
	input.Title = strings.TrimSpace(input.Title)
	input.Note = strings.TrimSpace(input.Note)
	input.Category = strings.TrimSpace(input.Category)
	if !validDate(input.Date) || input.Title == "" {
		writeError(w, http.StatusBadRequest, "date YYYY-MM-DD dan title wajib diisi")
		return
	}
	if len(input.Title) > 160 || len(input.Note) > 2000 || len(input.Category) > 60 {
		writeError(w, http.StatusBadRequest, "panjang data melebihi batas")
		return
	}
	if input.Note == "" {
		input.Note = "Catatan pembelajaran ditambahkan."
	}
	if input.Category == "" {
		input.Category = "General"
	}
	input.ID = newUUID()
	input.OwnerUserID = actor.ID
	input.CreatedAt = h.auth.Now()
	entry, err := h.store.CreateLearning(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "learning entry tidak dapat disimpan")
		return
	}
	h.audit(r.Context(), actor, "create", "learning", entry.ID, "Menambahkan learning: "+entry.Title, map[string]any{"date": entry.Date, "category": entry.Category})
	writeJSON(w, http.StatusCreated, entry)
}

func (h *handler) updateLearning(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var input model.LearningEntry
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.ID = r.PathValue("id")
	input.Date = strings.TrimSpace(input.Date)
	input.Title = strings.TrimSpace(input.Title)
	input.Note = strings.TrimSpace(input.Note)
	input.Category = strings.TrimSpace(input.Category)
	if input.ID == "" || !validDate(input.Date) || input.Title == "" {
		writeError(w, http.StatusBadRequest, "id, date YYYY-MM-DD, dan title wajib diisi")
		return
	}
	if len(input.Title) > 160 || len(input.Note) > 2000 || len(input.Category) > 60 {
		writeError(w, http.StatusBadRequest, "panjang data melebihi batas")
		return
	}
	if input.Note == "" {
		input.Note = "Catatan pembelajaran ditambahkan."
	}
	if input.Category == "" {
		input.Category = "General"
	}
	existingEntries, err := h.store.ListLearning(r.Context(), input.Date)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "learning entry tidak dapat diperiksa")
		return
	}
	existing, allowed := findOwned(existingEntries, input.ID, actor, func(entry model.LearningEntry) string { return entry.ID }, func(entry model.LearningEntry) string { return entry.OwnerUserID })
	if !allowed {
		writeError(w, http.StatusNotFound, "learning entry tidak ditemukan")
		return
	}
	input.OwnerUserID = existing.OwnerUserID
	entry, found, err := h.store.UpdateLearning(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "learning entry tidak dapat diperbarui")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "learning entry tidak ditemukan")
		return
	}
	h.auditSubject(r.Context(), actor, entry.OwnerUserID, "update", "learning", entry.ID, "Memperbarui learning: "+entry.Title, map[string]any{"completed": entry.Completed})
	writeJSON(w, http.StatusOK, entry)
}

func (h *handler) deleteLearning(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	date := r.URL.Query().Get("date")
	id := r.PathValue("id")
	if !validDate(date) || id == "" {
		writeError(w, http.StatusBadRequest, "id dan date YYYY-MM-DD wajib diisi")
		return
	}
	entries, err := h.store.ListLearning(r.Context(), date)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "learning entry tidak dapat diperiksa")
		return
	}
	entry, allowed := findOwned(entries, id, actor, func(entry model.LearningEntry) string { return entry.ID }, func(entry model.LearningEntry) string { return entry.OwnerUserID })
	if !allowed {
		writeError(w, http.StatusNotFound, "learning entry tidak ditemukan")
		return
	}
	deleted, err := h.store.DeleteLearning(r.Context(), id, date)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "learning entry tidak dapat dihapus")
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "learning entry tidak ditemukan")
		return
	}
	h.auditSubject(r.Context(), actor, entry.OwnerUserID, "delete", "learning", id, "Menghapus learning: "+entry.Title, map[string]any{"date": date})
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id, "date": date})
}

func (h *handler) listLearningMaterials(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	level := strings.TrimSpace(r.URL.Query().Get("level"))
	if level != "" && !validLearningLevel(level) {
		writeError(w, http.StatusBadRequest, "level harus A1, A2, B1, B2, atau C1")
		return
	}
	materials, err := h.store.ListLearningMaterials(r.Context(), actor.ID, r.URL.Query().Get("subjectId"), r.URL.Query().Get("categoryId"), level, h.auth.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "learning materials tidak dapat dibaca")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"materials": materials})
}

func (h *handler) getLearningMaterial(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if !validMaterialID(id) {
		writeError(w, http.StatusBadRequest, "id material tidak valid")
		return
	}
	material, found, err := h.store.GetLearningMaterial(r.Context(), id, actor.ID, h.auth.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "learning material tidak dapat dibaca")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "learning material tidak ditemukan")
		return
	}
	writeJSON(w, http.StatusOK, material)
}

func (h *handler) upsertLearningMaterialProgress(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if !validMaterialID(id) {
		writeError(w, http.StatusBadRequest, "id material tidak valid")
		return
	}
	var input model.LearningMaterialProgressInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if input.MaterialID != "" && input.MaterialID != id {
		writeError(w, http.StatusBadRequest, "materialId harus sama dengan id route")
		return
	}
	input.MaterialID = id
	if input.Status != "in_progress" && input.Status != "mastered" {
		writeError(w, http.StatusBadRequest, "status progress tidak valid")
		return
	}
	if input.ContentVersion < 1 || input.AttemptCount < 0 || (input.MasteryScore != nil && (*input.MasteryScore < 0 || *input.MasteryScore > 100)) || len(input.ObjectiveState) > 100 {
		writeError(w, http.StatusBadRequest, "progress material tidak valid")
		return
	}
	material, found, err := h.store.GetLearningMaterial(r.Context(), id, actor.ID, h.auth.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "learning material tidak dapat diperiksa")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "learning material tidak ditemukan")
		return
	}
	if input.ContentVersion != material.ContentVersion {
		writeError(w, http.StatusConflict, "content material sudah berubah; muat ulang sebelum menyimpan progress")
		return
	}
	var content struct {
		Objectives []json.RawMessage `json:"objectives"`
	}
	if err := json.Unmarshal(material.Content, &content); err != nil {
		writeError(w, http.StatusInternalServerError, "content material tidak valid")
		return
	}
	for key := range input.ObjectiveState {
		index, err := strconv.Atoi(key)
		if err != nil || index < 0 || index >= len(content.Objectives) {
			writeError(w, http.StatusBadRequest, "objectiveState memiliki objective index yang tidak valid")
			return
		}
	}
	if input.Status == "mastered" {
		var mastery struct {
			MinimumScorePercent      int   `json:"minimumScorePercent"`
			RequiredObjectiveIndexes []int `json:"requiredObjectiveIndexes"`
		}
		if err := json.Unmarshal(material.Mastery, &mastery); err != nil {
			writeError(w, http.StatusInternalServerError, "mastery policy material tidak valid")
			return
		}
		if input.MasteryScore == nil || *input.MasteryScore < mastery.MinimumScorePercent {
			writeError(w, http.StatusBadRequest, "mastered membutuhkan masteryScore yang mencapai threshold")
			return
		}
		for _, index := range mastery.RequiredObjectiveIndexes {
			if !input.ObjectiveState[strconv.Itoa(index)] {
				writeError(w, http.StatusBadRequest, "mastered membutuhkan seluruh objective wajib")
				return
			}
		}
	}
	progress, found, err := h.store.UpsertLearningMaterialProgress(r.Context(), actor.ID, input, h.auth.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "progress material tidak dapat disimpan")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "learning material tidak ditemukan")
		return
	}
	h.audit(r.Context(), actor, "update", "learning_material_progress", id, "Memperbarui progress learning material", map[string]any{"status": progress.Status, "masteryScore": progress.MasteryScore, "attemptCount": progress.AttemptCount, "contentVersion": progress.ContentVersion})
	writeJSON(w, http.StatusOK, progress)
}

const maxDoingMinutes = 2147483647

func normalizeDoingInput(input *model.DoingEntry, now time.Time, previousCompletedAt *time.Time) error {
	input.Date = strings.TrimSpace(input.Date)
	input.Title = strings.TrimSpace(input.Title)
	input.Status = strings.ToLower(strings.TrimSpace(input.Status))
	input.Priority = strings.ToLower(strings.TrimSpace(input.Priority))
	input.TimeBlockStart = strings.TrimSpace(input.TimeBlockStart)
	input.TimeBlockEnd = strings.TrimSpace(input.TimeBlockEnd)
	input.Category = strings.TrimSpace(input.Category)
	input.Project = strings.TrimSpace(input.Project)
	input.GoalOutcome = strings.TrimSpace(input.GoalOutcome)
	input.EnergyFocus = strings.ToLower(strings.TrimSpace(input.EnergyFocus))
	input.Dependency = strings.TrimSpace(input.Dependency)
	input.BlockedBy = strings.TrimSpace(input.BlockedBy)
	input.Note = strings.TrimSpace(input.Note)
	if input.Status == "" {
		if input.Completed {
			input.Status = "done"
		} else {
			input.Status = "todo"
		}
	}
	if input.Priority == "" {
		input.Priority = "medium"
	}
	if input.EnergyFocus == "" {
		input.EnergyFocus = "medium"
	}
	validStatus := input.Status == "todo" || input.Status == "doing" || input.Status == "blocked" || input.Status == "done"
	validPriority := input.Priority == "high" || input.Priority == "medium" || input.Priority == "low"
	validEnergy := input.EnergyFocus == "deep" || input.EnergyFocus == "medium" || input.EnergyFocus == "light"
	startTime, startErr := time.Parse("15:04", input.TimeBlockStart)
	endTime, endErr := time.Parse("15:04", input.TimeBlockEnd)
	validTimeBlock := input.TimeBlockStart == "" && input.TimeBlockEnd == ""
	if input.TimeBlockStart != "" && input.TimeBlockEnd != "" && startErr == nil && endErr == nil && startTime.Before(endTime) {
		validTimeBlock = true
	}
	if !validDate(input.Date) || input.Title == "" || !validStatus || !validPriority || !validEnergy || !validTimeBlock || input.EstimatedMinutes < 0 || input.EstimatedMinutes > maxDoingMinutes || input.ActualMinutes < 0 || input.ActualMinutes > maxDoingMinutes || input.Progress < 0 || input.Progress > 100 {
		return errors.New("data doing tidak valid")
	}
	if utf8.RuneCountInString(input.Title) > 160 || utf8.RuneCountInString(input.Note) > 2000 || utf8.RuneCountInString(input.Category) > 60 || utf8.RuneCountInString(input.Project) > 160 || utf8.RuneCountInString(input.GoalOutcome) > 500 || utf8.RuneCountInString(input.Dependency) > 500 || utf8.RuneCountInString(input.BlockedBy) > 500 {
		return errors.New("panjang data doing melebihi batas")
	}
	if input.Note == "" {
		input.Note = "Task ditambahkan."
	}
	if input.Category == "" {
		input.Category = "General"
	}
	input.Completed = input.Status == "done"
	input.CompletedAt = nil
	if input.Completed {
		input.Progress = 100
		completedAt := now.UTC()
		if previousCompletedAt != nil {
			completedAt = previousCompletedAt.UTC()
		}
		input.CompletedAt = &completedAt
	}
	return nil
}

func (h *handler) createDoing(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var input model.DoingEntry
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := normalizeDoingInput(&input, h.auth.Now(), nil); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.ID = newUUID()
	input.OwnerUserID = actor.ID
	input.CreatedAt = h.auth.Now()
	entry, err := h.store.CreateDoing(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "doing entry tidak dapat disimpan")
		return
	}
	h.audit(r.Context(), actor, "create", "doing", entry.ID, "Menambahkan task Doing: "+entry.Title, map[string]any{"date": entry.Date, "category": entry.Category, "status": entry.Status, "priority": entry.Priority})
	writeJSON(w, http.StatusCreated, entry)
}

func (h *handler) listDoing(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	date := r.URL.Query().Get("date")
	if date != "" && !validDate(date) {
		writeError(w, http.StatusBadRequest, "date harus berformat YYYY-MM-DD")
		return
	}
	entries, err := h.store.ListDoing(r.Context(), date, actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "doing entries tidak dapat dibaca")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"date": nullableString(date), "entries": entries})
}

func (h *handler) updateDoing(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var input model.DoingEntry
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.ID = r.PathValue("id")
	input.Date = strings.TrimSpace(input.Date)
	input.Title = strings.TrimSpace(input.Title)
	if input.ID == "" || !validDate(input.Date) || input.Title == "" {
		writeError(w, http.StatusBadRequest, "data doing tidak valid")
		return
	}
	existingEntries, err := h.store.ListDoing(r.Context(), input.Date, actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "doing entry tidak dapat diperiksa")
		return
	}
	existing, allowed := findOwned(existingEntries, input.ID, actor, func(entry model.DoingEntry) string { return entry.ID }, func(entry model.DoingEntry) string { return entry.OwnerUserID })
	if !allowed {
		writeError(w, http.StatusNotFound, "doing entry tidak ditemukan")
		return
	}
	if utf8.RuneCountInString(existing.Note) > 2000 {
		writeError(w, http.StatusBadRequest, "Complete Workspace task memiliki Notes panjang; gunakan /api/doing/tasks/{id} agar tidak terpotong")
		return
	}
	if err := normalizeDoingInput(&input, h.auth.Now(), existing.CompletedAt); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.OwnerUserID = existing.OwnerUserID
	entry, found, err := h.store.UpdateDoing(r.Context(), input, actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "doing entry tidak dapat diperbarui")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "doing entry tidak ditemukan")
		return
	}
	h.auditSubject(r.Context(), actor, entry.OwnerUserID, "update", "doing", entry.ID, "Memperbarui task Doing: "+entry.Title, map[string]any{"completed": entry.Completed, "status": entry.Status, "priority": entry.Priority, "progress": entry.Progress})
	writeJSON(w, http.StatusOK, entry)
}

func (h *handler) deleteDoing(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	date := r.URL.Query().Get("date")
	id := r.PathValue("id")
	if !validDate(date) || id == "" {
		writeError(w, http.StatusBadRequest, "id dan date YYYY-MM-DD wajib diisi")
		return
	}
	entries, err := h.store.ListDoing(r.Context(), date, actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "doing entry tidak dapat diperiksa")
		return
	}
	entry, allowed := findOwned(entries, id, actor, func(entry model.DoingEntry) string { return entry.ID }, func(entry model.DoingEntry) string { return entry.OwnerUserID })
	if !allowed {
		writeError(w, http.StatusNotFound, "doing entry tidak ditemukan")
		return
	}
	deleted, err := h.store.DeleteDoing(r.Context(), id, date, actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "doing entry tidak dapat dihapus")
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "doing entry tidak ditemukan")
		return
	}
	h.auditSubject(r.Context(), actor, entry.OwnerUserID, "delete", "doing", id, "Menghapus task Doing: "+entry.Title, map[string]any{"date": date})
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id, "date": date})
}

func (h *handler) createWorkout(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var input model.WorkoutEntry
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.Date = strings.TrimSpace(input.Date)
	input.MaterialID = strings.TrimSpace(input.MaterialID)
	input.Exercise = strings.TrimSpace(input.Exercise)
	input.Category = strings.TrimSpace(input.Category)
	input.Note = strings.TrimSpace(input.Note)
	if !validDate(input.Date) || input.Exercise == "" {
		writeError(w, http.StatusBadRequest, "date YYYY-MM-DD dan exercise wajib diisi")
		return
	}
	if !validWorkoutMaterialID(input.MaterialID) || len(input.Exercise) > 160 || len(input.Category) > 60 || len(input.Note) > 2000 || input.Sets < 0 || input.Reps < 0 || input.DurationMinutes < 0 {
		writeError(w, http.StatusBadRequest, "data workout tidak valid")
		return
	}
	if input.Category == "" {
		input.Category = "General"
	}
	input.ID = newUUID()
	input.OwnerUserID = actor.ID
	input.CreatedAt = h.auth.Now()
	entry, err := h.store.CreateWorkout(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workout tidak dapat disimpan")
		return
	}
	metadata := map[string]any{"date": entry.Date, "category": entry.Category}
	if entry.MaterialID != "" {
		metadata["materialId"] = entry.MaterialID
	}
	h.audit(r.Context(), actor, "create", "workout", entry.ID, "Menambahkan workout: "+entry.Exercise, metadata)
	writeJSON(w, http.StatusCreated, entry)
}

func (h *handler) listWorkouts(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	date := r.URL.Query().Get("date")
	if date != "" && !validDate(date) {
		writeError(w, http.StatusBadRequest, "date harus berformat YYYY-MM-DD")
		return
	}
	entries, err := h.store.ListWorkouts(r.Context(), date)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workouts tidak dapat dibaca")
		return
	}
	entries = filterOwned(entries, actor, func(entry model.WorkoutEntry) string { return entry.OwnerUserID })
	writeJSON(w, http.StatusOK, map[string]any{"date": nullableString(date), "entries": entries})
}

func (h *handler) updateWorkout(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var input model.WorkoutEntry
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.ID = r.PathValue("id")
	input.Date = strings.TrimSpace(input.Date)
	input.MaterialID = strings.TrimSpace(input.MaterialID)
	input.Exercise = strings.TrimSpace(input.Exercise)
	input.Category = strings.TrimSpace(input.Category)
	input.Note = strings.TrimSpace(input.Note)
	if input.ID == "" || !validDate(input.Date) || input.Exercise == "" || !validWorkoutMaterialID(input.MaterialID) || len(input.Exercise) > 160 || len(input.Category) > 60 || len(input.Note) > 2000 || input.Sets < 0 || input.Reps < 0 || input.DurationMinutes < 0 {
		writeError(w, http.StatusBadRequest, "data workout tidak valid")
		return
	}
	if input.Category == "" {
		input.Category = "General"
	}
	existingEntries, err := h.store.ListWorkouts(r.Context(), input.Date)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workout tidak dapat diperiksa")
		return
	}
	existing, allowed := findOwned(existingEntries, input.ID, actor, func(entry model.WorkoutEntry) string { return entry.ID }, func(entry model.WorkoutEntry) string { return entry.OwnerUserID })
	if !allowed {
		writeError(w, http.StatusNotFound, "workout tidak ditemukan")
		return
	}
	input.OwnerUserID = existing.OwnerUserID
	input.MaterialID = existing.MaterialID
	entry, found, err := h.store.UpdateWorkout(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workout tidak dapat diperbarui")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "workout tidak ditemukan")
		return
	}
	h.auditSubject(r.Context(), actor, entry.OwnerUserID, "update", "workout", entry.ID, "Memperbarui workout: "+entry.Exercise, map[string]any{"completed": entry.Completed})
	writeJSON(w, http.StatusOK, entry)
}

func (h *handler) deleteWorkout(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	date := r.URL.Query().Get("date")
	id := r.PathValue("id")
	if !validDate(date) || id == "" {
		writeError(w, http.StatusBadRequest, "id dan date YYYY-MM-DD wajib diisi")
		return
	}
	entries, err := h.store.ListWorkouts(r.Context(), date)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workout tidak dapat diperiksa")
		return
	}
	entry, allowed := findOwned(entries, id, actor, func(entry model.WorkoutEntry) string { return entry.ID }, func(entry model.WorkoutEntry) string { return entry.OwnerUserID })
	if !allowed {
		writeError(w, http.StatusNotFound, "workout tidak ditemukan")
		return
	}
	deleted, err := h.store.DeleteWorkout(r.Context(), id, date)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "workout tidak dapat dihapus")
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "workout tidak ditemukan")
		return
	}
	h.auditSubject(r.Context(), actor, entry.OwnerUserID, "delete", "workout", id, "Menghapus workout: "+entry.Exercise, map[string]any{"date": date})
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id, "date": date})
}

func validWorkoutSessionStatus(value string) bool {
	switch value {
	case "planned", "in_progress", "completed", "partial", "skipped":
		return true
	}
	return false
}

func validWorkoutMovementStatus(value string) bool {
	switch value {
	case "planned", "in_progress", "completed", "skipped":
		return true
	}
	return false
}

func validWorkoutSetStatus(value string) bool {
	switch value {
	case "unrecorded", "completed", "skipped":
		return true
	}
	return false
}

func validWorkoutExerciseType(value string) bool {
	switch value {
	case "strength", "bodyweight", "cardio", "mobility", "interval":
		return true
	}
	return false
}

func mapHasNil(value map[string]any) bool {
	for _, item := range value {
		if item == nil {
			return true
		}
	}
	return false
}

func normalizeWorkoutPlan(session *model.WorkoutSession, resetActual bool) bool {
	session.Name = strings.TrimSpace(session.Name)
	session.Date = strings.TrimSpace(session.Date)
	session.LocalTime = strings.TrimSpace(session.LocalTime)
	session.Timezone = strings.TrimSpace(session.Timezone)
	session.Location = strings.TrimSpace(session.Location)
	session.Note = strings.TrimSpace(session.Note)
	session.TemplateID = strings.TrimSpace(session.TemplateID)
	if session.Timezone == "" {
		session.Timezone = "Asia/Jakarta"
	}
	if session.Status == "" {
		session.Status = "planned"
	}
	if session.Name == "" || !validDate(session.Date) || !validWorkoutSessionStatus(session.Status) || session.EstimatedMinutes < 0 || session.PausedSeconds < 0 || len(session.Name) > 160 || len(session.Timezone) > 80 || len(session.Location) > 160 || len(session.Note) > 2000 {
		return false
	}
	if session.LocalTime != "" {
		if _, err := time.Parse("15:04", session.LocalTime); err != nil {
			return false
		}
	}
	if session.TemplateID != "" && !validUUID(session.TemplateID) {
		return false
	}
	positions := map[int]bool{}
	for movementIndex := range session.Movements {
		movement := &session.Movements[movementIndex]
		movement.Name = strings.TrimSpace(movement.Name)
		movement.MaterialID = strings.TrimSpace(movement.MaterialID)
		movement.Note = strings.TrimSpace(movement.Note)
		if movement.Position == 0 {
			movement.Position = movementIndex + 1
		}
		if movement.Status == "" {
			movement.Status = "planned"
		}
		if movement.Name == "" || len(movement.Name) > 160 || len(movement.Note) > 2000 || !validWorkoutExerciseType(movement.ExerciseType) || !validWorkoutMovementStatus(movement.Status) || positions[movement.Position] || !validWorkoutMaterialID(movement.MaterialID) || mapHasNil(movement.Target) {
			return false
		}
		positions[movement.Position] = true
		if movement.RestSeconds != nil && *movement.RestSeconds < 0 {
			return false
		}
		setNumbers := map[int]bool{}
		for setIndex := range movement.Sets {
			set := &movement.Sets[setIndex]
			if set.Number == 0 {
				set.Number = setIndex + 1
			}
			if set.Status == "" {
				set.Status = "unrecorded"
			}
			if set.Number < 1 || setNumbers[set.Number] || !validWorkoutSetStatus(set.Status) || mapHasNil(set.Target) || mapHasNil(set.Actual) {
				return false
			}
			setNumbers[set.Number] = true
			if set.RPE != nil && (*set.RPE < 1 || *set.RPE > 10) {
				return false
			}
			if set.Status == "completed" && len(set.Actual) == 0 {
				return false
			}
			if set.Status != "completed" && len(set.Actual) > 0 {
				return false
			}
			if resetActual {
				set.Actual = nil
				set.Status = "unrecorded"
				set.RecordedAt = nil
				set.RPE = nil
			}
		}
		if resetActual {
			movement.Status = "planned"
		}
	}
	if resetActual {
		if !(len(session.Movements) == 0 && session.Status == "skipped") {
			session.Status = "planned"
		}
		session.StartedAt = nil
		session.PausedAt = nil
		session.PausedSeconds = 0
		session.EndedAt = nil
		session.RestTimerEndsAt = nil
		session.RestTimerPausedRemainingSeconds = nil
	}
	return true
}

func assignWorkoutNestedIDs(session *model.WorkoutSession) {
	for movementIndex := range session.Movements {
		movement := &session.Movements[movementIndex]
		movement.ID = newUUID()
		movement.SessionID = session.ID
		for setIndex := range movement.Sets {
			movement.Sets[setIndex].ID = newUUID()
			movement.Sets[setIndex].MovementID = movement.ID
		}
	}
}

func (h *handler) createWorkoutSession(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var input model.WorkoutSession
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if !normalizeWorkoutPlan(&input, true) {
		writeError(w, http.StatusBadRequest, "data sesi workout tidak valid")
		return
	}
	now := h.auth.Now()
	input.ID = newUUID()
	input.OwnerUserID = actor.ID
	input.CreatedAt = now
	input.UpdatedAt = now
	assignWorkoutNestedIDs(&input)
	created, err := h.store.CreateWorkoutSession(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "sesi workout tidak dapat disimpan")
		return
	}
	h.audit(r.Context(), actor, "create", "workout_session", created.ID, "Membuat sesi workout: "+created.Name, map[string]any{"date": created.Date, "movements": len(created.Movements)})
	writeJSON(w, http.StatusCreated, created)
}

func (h *handler) listWorkoutSessions(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	date := strings.TrimSpace(r.URL.Query().Get("date"))
	exercise := strings.TrimSpace(r.URL.Query().Get("exercise"))
	if date != "" && !validDate(date) {
		writeError(w, http.StatusBadRequest, "date harus berformat YYYY-MM-DD")
		return
	}
	if len(exercise) > 160 {
		writeError(w, http.StatusBadRequest, "filter gerakan terlalu panjang")
		return
	}
	sessions, err := h.store.ListWorkoutSessions(r.Context(), date, exercise, actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "sesi workout tidak dapat dibaca")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"date": nullableString(date), "sessions": sessions})
}

func (h *handler) updateWorkoutSession(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var input model.WorkoutSession
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.ID = r.PathValue("id")
	if !validUUID(input.ID) || !normalizeWorkoutPlan(&input, false) {
		writeError(w, http.StatusBadRequest, "data sesi workout tidak valid")
		return
	}
	for movementIndex := range input.Movements {
		movement := &input.Movements[movementIndex]
		if !validUUID(movement.ID) {
			writeError(w, http.StatusBadRequest, "id gerakan tidak valid")
			return
		}
		movement.SessionID = input.ID
		for setIndex := range movement.Sets {
			if !validUUID(movement.Sets[setIndex].ID) {
				writeError(w, http.StatusBadRequest, "id set tidak valid")
				return
			}
			movement.Sets[setIndex].MovementID = movement.ID
		}
	}
	baseUpdatedAt := input.UpdatedAt
	input.UpdatedAt = h.auth.Now()
	updated, found, conflict, err := h.store.UpdateWorkoutSession(r.Context(), input, actor.ID, actor.Role == "admin", baseUpdatedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "sesi workout tidak dapat diperbarui")
		return
	}
	if conflict {
		writeError(w, http.StatusConflict, "sesi workout sudah berubah; muat ulang sebelum menyimpan")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "sesi workout tidak ditemukan")
		return
	}
	h.auditSubject(r.Context(), actor, updated.OwnerUserID, "update", "workout_session", updated.ID, "Memperbarui sesi workout: "+updated.Name, map[string]any{"status": updated.Status})
	writeJSON(w, http.StatusOK, updated)
}

func (h *handler) deleteWorkoutSession(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !validUUID(id) {
		writeError(w, http.StatusBadRequest, "id sesi tidak valid")
		return
	}
	deleted, err := h.store.DeleteWorkoutSession(r.Context(), id, actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "sesi workout tidak dapat dihapus")
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "sesi workout tidak ditemukan")
		return
	}
	h.audit(r.Context(), actor, "delete", "workout_session", id, "Menghapus sesi workout", nil)
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
}

func resetTemplateMovements(movements []model.WorkoutMovement) []model.WorkoutMovement {
	for movementIndex := range movements {
		movement := &movements[movementIndex]
		movement.ID = ""
		movement.SessionID = ""
		movement.Status = "planned"
		movement.Position = movementIndex + 1
		for setIndex := range movement.Sets {
			movement.Sets[setIndex].ID = ""
			movement.Sets[setIndex].MovementID = ""
			movement.Sets[setIndex].Actual = nil
			movement.Sets[setIndex].Status = "unrecorded"
			movement.Sets[setIndex].RecordedAt = nil
			movement.Sets[setIndex].RPE = nil
		}
	}
	return movements
}

func (h *handler) createWorkoutTemplate(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var input model.WorkoutTemplate
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Movements = resetTemplateMovements(input.Movements)
	probe := model.WorkoutSession{Name: input.Name, Date: "2000-01-01", Timezone: "Asia/Jakarta", Status: "planned", Movements: input.Movements}
	if input.Name == "" || len(input.Name) > 160 || !normalizeWorkoutPlan(&probe, true) {
		writeError(w, http.StatusBadRequest, "template workout tidak valid")
		return
	}
	now := h.auth.Now()
	input.ID = newUUID()
	input.OwnerUserID = actor.ID
	input.CreatedAt = now
	input.UpdatedAt = now
	input.Movements = resetTemplateMovements(probe.Movements)
	created, err := h.store.CreateWorkoutTemplate(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "template workout tidak dapat disimpan")
		return
	}
	h.audit(r.Context(), actor, "create", "workout_template", created.ID, "Menyimpan template workout: "+created.Name, map[string]any{"movements": len(created.Movements)})
	writeJSON(w, http.StatusCreated, created)
}

func (h *handler) listWorkoutTemplates(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	templates, err := h.store.ListWorkoutTemplates(r.Context(), actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "template workout tidak dapat dibaca")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"templates": templates})
}

func (h *handler) createJournal(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var input model.JournalInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if !normalizeJournalInput(&input) {
		writeError(w, http.StatusBadRequest, "date YYYY-MM-DD, title, dan content wajib diisi")
		return
	}
	if !validJournalInput(input) {
		writeError(w, http.StatusBadRequest, "panjang journal melebihi batas")
		return
	}
	if input.Mood == "" {
		input.Mood = "Neutral"
	}
	now := h.auth.Now()
	entry := model.JournalEntry{ID: newUUID(), OwnerUserID: actor.ID, Date: input.Date, Title: input.Title, Content: input.Content, Mood: input.Mood, Tags: input.Tags, CreatedAt: now, UpdatedAt: now, LatestRevisionNumber: 1}
	created, err := h.store.CreateJournal(r.Context(), entry)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "journal tidak dapat disimpan")
		return
	}
	h.audit(r.Context(), actor, "create", "journal", created.ID, "Menambahkan journal: "+created.Title, map[string]any{"date": created.Date, "mood": created.Mood})
	writeJSON(w, http.StatusCreated, created)
}

func normalizeJournalInput(input *model.JournalInput) bool {
	input.Date = strings.TrimSpace(input.Date)
	input.Title = strings.TrimSpace(input.Title)
	input.Content = strings.TrimSpace(input.Content)
	input.Mood = strings.TrimSpace(input.Mood)
	input.Tags = strings.TrimSpace(input.Tags)
	return validDate(input.Date) && input.Title != "" && input.Content != ""
}

func validJournalInput(input model.JournalInput) bool {
	return len(input.Title) <= 160 && len(input.Content) <= 50000 && len(input.Mood) <= 30 && len(input.Tags) <= 500
}

func (h *handler) listJournals(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	date := r.URL.Query().Get("date")
	if date != "" && !validDate(date) {
		writeError(w, http.StatusBadRequest, "date harus berformat YYYY-MM-DD")
		return
	}
	entries, err := h.store.ListJournals(r.Context(), date)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "journals tidak dapat dibaca")
		return
	}
	entries = filterOwned(entries, actor, func(entry model.JournalEntry) string { return entry.OwnerUserID })
	writeJSON(w, http.StatusOK, map[string]any{"date": nullableString(date), "entries": entries})
}

func (h *handler) listJournalRevisions(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if id == "" || !validUUID(id) {
		writeError(w, http.StatusBadRequest, "id journal wajib diisi dan harus UUID")
		return
	}
	entry, found, err := h.store.GetJournal(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "journal tidak dapat diperiksa")
		return
	}
	if !found || !canAccessOwner(actor, entry.OwnerUserID) {
		writeError(w, http.StatusNotFound, "journal tidak ditemukan")
		return
	}
	revisions, err := h.store.ListJournalRevisions(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "riwayat journal tidak dapat dibaca")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"journalId": id, "latestRevisionNumber": entry.LatestRevisionNumber, "revisions": revisions})
}

func (h *handler) appendJournalRevision(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if id == "" || !validUUID(id) {
		writeError(w, http.StatusBadRequest, "id journal wajib diisi dan harus UUID")
		return
	}
	var input model.JournalRevisionInput
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	journalInput := model.JournalInput{Date: input.Date, Title: input.Title, Content: input.Content, Mood: input.Mood, Tags: input.Tags}
	if !normalizeJournalInput(&journalInput) || !validJournalInput(journalInput) {
		writeError(w, http.StatusBadRequest, "data revision journal tidak valid")
		return
	}
	input.Date, input.Title, input.Content, input.Mood, input.Tags = journalInput.Date, journalInput.Title, journalInput.Content, journalInput.Mood, journalInput.Tags
	if input.Mood == "" {
		input.Mood = "Neutral"
	}
	if input.BaseRevisionNumber < 1 {
		writeError(w, http.StatusBadRequest, "baseRevisionNumber harus minimal 1")
		return
	}
	if !input.EditReason.Valid() {
		writeError(w, http.StatusBadRequest, "editReason tidak valid")
		return
	}
	entry, found, err := h.store.GetJournal(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "journal tidak dapat diperiksa")
		return
	}
	if !found || !canAccessOwner(actor, entry.OwnerUserID) {
		writeError(w, http.StatusNotFound, "journal tidak ditemukan")
		return
	}
	created, revision, found, conflict, noop, err := h.store.AppendJournalRevision(r.Context(), id, actor.ID, actor.Role == "admin", input, h.auth.Now())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "revision journal tidak dapat disimpan")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "journal tidak ditemukan")
		return
	}
	if conflict {
		writeError(w, http.StatusConflict, "journal sudah berubah; muat versi terbaru sebelum mencoba lagi")
		return
	}
	if noop {
		writeError(w, http.StatusBadRequest, "revision harus mengubah isi journal")
		return
	}
	h.auditSubject(r.Context(), actor, created.OwnerUserID, "update", "journal", created.ID, "Menyimpan revisi journal", map[string]any{"revisionNumber": revision.RevisionNumber, "editReason": revision.EditReason})
	writeJSON(w, http.StatusCreated, map[string]any{"entry": created, "revision": revision})
}

func (h *handler) deleteJournal(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if id == "" || !validUUID(id) {
		writeError(w, http.StatusBadRequest, "id journal wajib diisi dan harus UUID")
		return
	}
	entry, deleted, err := h.store.DeleteJournal(r.Context(), id, actor.ID, actor.Role == "admin")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "journal tidak dapat dihapus")
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "journal tidak ditemukan")
		return
	}
	h.auditSubject(r.Context(), actor, entry.OwnerUserID, "delete", "journal", id, "Menghapus journal beserta semua revisinya", map[string]any{"date": entry.Date})
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
}

func (h *handler) createSpending(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	var input model.SpendingEntry
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.Date = strings.TrimSpace(input.Date)
	input.Description = strings.TrimSpace(input.Description)
	input.Category = strings.TrimSpace(input.Category)
	input.PaymentMethod = strings.TrimSpace(input.PaymentMethod)
	input.Note = strings.TrimSpace(input.Note)
	if !validDate(input.Date) || input.Description == "" || input.Amount <= 0 {
		writeError(w, http.StatusBadRequest, "date YYYY-MM-DD, description, dan amount positif wajib diisi")
		return
	}
	if len(input.Description) > 160 || len(input.Category) > 60 || len(input.PaymentMethod) > 60 || len(input.Note) > 2000 {
		writeError(w, http.StatusBadRequest, "panjang spending melebihi batas")
		return
	}
	if input.Category == "" {
		input.Category = "Other"
	}
	if input.PaymentMethod == "" {
		input.PaymentMethod = "Other"
	}
	input.ID = newUUID()
	input.OwnerUserID = actor.ID
	input.CreatedAt = h.auth.Now()
	entry, err := h.store.CreateSpending(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "spending tidak dapat disimpan")
		return
	}
	h.audit(r.Context(), actor, "create", "spending", entry.ID, "Menambahkan spending: "+entry.Description, map[string]any{"date": entry.Date, "amount": entry.Amount, "category": entry.Category})
	writeJSON(w, http.StatusCreated, entry)
}

func (h *handler) listSpending(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	date := r.URL.Query().Get("date")
	if date != "" && !validDate(date) {
		writeError(w, http.StatusBadRequest, "date harus berformat YYYY-MM-DD")
		return
	}
	entries, err := h.store.ListSpending(r.Context(), date)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "spending tidak dapat dibaca")
		return
	}
	entries = filterOwned(entries, actor, func(entry model.SpendingEntry) string { return entry.OwnerUserID })
	writeJSON(w, http.StatusOK, map[string]any{"date": nullableString(date), "entries": entries})
}

func (h *handler) deleteSpending(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id spending wajib diisi")
		return
	}
	entries, err := h.store.ListSpending(r.Context(), "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "spending tidak dapat diperiksa")
		return
	}
	entry, allowed := findOwned(entries, id, actor, func(entry model.SpendingEntry) string { return entry.ID }, func(entry model.SpendingEntry) string { return entry.OwnerUserID })
	if !allowed {
		writeError(w, http.StatusNotFound, "spending tidak ditemukan")
		return
	}
	deleted, err := h.store.DeleteSpending(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "spending tidak dapat dihapus")
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "spending tidak ditemukan")
		return
	}
	h.auditSubject(r.Context(), actor, entry.OwnerUserID, "delete", "spending", id, "Menghapus spending: "+entry.Description, map[string]any{"amount": entry.Amount, "date": entry.Date})
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
}

func (h *handler) createChangeLog(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.requireActor(w, r)
	if !ok {
		return
	}
	if h.auth.Enabled && actor.Role != "admin" {
		writeError(w, http.StatusForbidden, "hanya admin yang dapat mengubah Change Log")
		return
	}
	var input model.ChangeLogEntry
	if err := decodeJSON(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	input.ID = strings.TrimSpace(input.ID)
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	input.Category = strings.TrimSpace(input.Category)
	if input.ID == "" {
		input.ID = newUUID()
	}
	if input.OccurredAt.IsZero() || input.Title == "" {
		writeError(w, http.StatusBadRequest, "occurredAt dan title wajib diisi")
		return
	}
	if len(input.ID) > 120 || len(input.Title) > 160 || len(input.Description) > 2000 || len(input.Category) > 60 {
		writeError(w, http.StatusBadRequest, "panjang data melebihi batas")
		return
	}
	if input.Category == "" {
		input.Category = "General"
	}
	entry, err := h.store.CreateChangeLog(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "change log tidak dapat disimpan")
		return
	}
	h.audit(r.Context(), actor, "create", "change_log", entry.ID, "Menambahkan Change Log: "+entry.Title, map[string]any{"category": entry.Category})
	writeJSON(w, http.StatusCreated, entry)
}

func (h *handler) listChangeLogs(w http.ResponseWriter, r *http.Request) {
	entries, err := h.store.ListChangeLogs(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "change logs tidak dapat dibaca")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

func filterLogs(logs []model.Log, status, query string) []model.Log {
	if status == "" {
		status = "all"
	}
	query = strings.ToLower(query)
	entries := make([]model.Log, 0, len(logs))
	for _, entry := range logs {
		haystack := strings.ToLower(entry.Title + " " + entry.Question + " " + entry.Answer)
		if (status == "all" || entry.Status == status) && strings.Contains(haystack, query) {
			entries = append(entries, entry)
		}
	}
	return entries
}

func openAPI(w http.ResponseWriter, _ *http.Request) {
	content, err := docs.ReadFile("openapi.yaml")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "OpenAPI spec tidak tersedia")
		return
	}
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}

func (h *handler) swaggerUI(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(`<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Zeno API</title></head><body style="margin:0;background:#050A14;color:#F5F9FF;font:16px system-ui;padding:48px"><main style="max-width:760px;margin:auto;background:#0D192B;border:1px solid #1B304A;border-radius:14px;padding:28px"><h1 style="margin-top:0">Zeno API ` + h.version + `</h1><p style="color:#98A9BD;line-height:1.6">Interactive third-party Swagger scripts dinonaktifkan untuk melindungi authenticated session. Gunakan OpenAPI specification berikut pada editor atau client pilihan Anda.</p><a href="/openapi.yaml" style="display:inline-block;margin-top:16px;padding:11px 16px;border-radius:8px;background:#168BFF;color:white;text-decoration:none">Open OpenAPI YAML</a></main></body></html>`))
}

func decodeJSON(r *http.Request, target any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return errors.New("request body harus JSON yang valid")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return errors.New("request body hanya boleh berisi satu JSON object")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func (h *handler) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && origin == h.auth.AllowedOrigin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Add("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token")
		if r.Method == http.MethodOptions {
			if origin != "" && h.auth.AllowedOrigin != "" && origin != h.auth.AllowedOrigin {
				writeError(w, http.StatusForbidden, "origin tidak diizinkan")
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func validDate(value string) bool {
	parsed, err := time.Parse("2006-01-02", value)
	return err == nil && parsed.Format("2006-01-02") == value
}

func validLearningLevel(value string) bool {
	switch value {
	case "A1", "A2", "B1", "B2", "C1":
		return true
	default:
		return false
	}
}

func validMaterialID(value string) bool {
	if value == "" || len(value) > 120 || value[0] == '-' || value[len(value)-1] == '-' {
		return false
	}
	previousDash := false
	for _, char := range value {
		if char == '-' {
			if previousDash {
				return false
			}
			previousDash = true
			continue
		}
		previousDash = false
		if (char < 'a' || char > 'z') && (char < '0' || char > '9') {
			return false
		}
	}
	return true
}

func validWorkoutMaterialID(value string) bool {
	if value == "" {
		return true
	}
	if len(value) > 120 || value[0] == '-' || value[len(value)-1] == '-' {
		return false
	}
	previousDash := false
	for _, char := range value {
		if char == '-' {
			if previousDash {
				return false
			}
			previousDash = true
			continue
		}
		previousDash = false
		if (char < 'a' || char > 'z') && (char < '0' || char > '9') {
			return false
		}
	}
	return true
}

func validUUID(value string) bool {
	if len(value) != 36 || value[8] != '-' || value[13] != '-' || value[18] != '-' || value[23] != '-' {
		return false
	}
	_, err := hex.DecodeString(strings.ReplaceAll(value, "-", ""))
	return err == nil
}

func newAuthToken() (string, string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", "", err
	}
	raw := base64.RawURLEncoding.EncodeToString(value)
	hash := sha256.Sum256([]byte(raw))
	return raw, hex.EncodeToString(hash[:]), nil
}

func newUUID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	hexValue := hex.EncodeToString(value[:])
	return hexValue[0:8] + "-" + hexValue[8:12] + "-" + hexValue[12:16] + "-" + hexValue[16:20] + "-" + hexValue[20:]
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func nullableTime(value time.Time) any {
	if value.IsZero() {
		return nil
	}
	return value
}
