package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"zeno-backend/internal/api"
	"zeno-backend/internal/mailer"
	"zeno-backend/internal/source"
	"zeno-backend/internal/store"
)

const version = "1.5.0"

type config struct {
	Address        string
	DatabaseURL    string
	SourceFile     string
	AuthEnabled    bool
	AppBaseURL     string
	AllowedOrigin  string
	CookieSecure   bool
	AdminEmails    map[string]bool
	MailProvider   string
	MailFileDir    string
	ResendAPIKey   string
	ResendFrom     string
	ResendEndpoint string
	SMTPHost       string
	SMTPPort       string
	SMTPUsername   string
	SMTPPassword   string
	SMTPFrom       string
}

func configFromEnv() (config, error) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return config{}, errors.New("DATABASE_URL wajib diisi")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	sourceFile := os.Getenv("SOURCE_FILE")
	if sourceFile == "" {
		sourceFile = "../sesi-hermes-discord-gemini.md"
	}
	absoluteSource, err := filepath.Abs(sourceFile)
	if err != nil {
		return config{}, fmt.Errorf("resolve SOURCE_FILE: %w", err)
	}
	authEnabled := !strings.EqualFold(os.Getenv("AUTH_ENABLED"), "false")
	appBaseURL := strings.TrimRight(os.Getenv("APP_BASE_URL"), "/")
	if appBaseURL == "" {
		appBaseURL = "http://localhost:8080"
	}
	allowedOrigin := os.Getenv("ALLOWED_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = appBaseURL
	}
	cookieSecure, _ := strconv.ParseBool(os.Getenv("COOKIE_SECURE"))
	adminEmails := map[string]bool{}
	for _, email := range strings.Split(os.Getenv("ADMIN_EMAILS"), ",") {
		if normalized := strings.ToLower(strings.TrimSpace(email)); normalized != "" {
			adminEmails[normalized] = true
		}
	}
	mailProvider := strings.ToLower(strings.TrimSpace(os.Getenv("MAIL_PROVIDER")))
	if mailProvider == "" {
		mailProvider = "file"
	}
	mailFileDir := os.Getenv("MAIL_FILE_DIR")
	if mailFileDir == "" {
		mailFileDir = "./data/mail-outbox"
	}
	return config{
		Address: ":" + port, DatabaseURL: databaseURL, SourceFile: absoluteSource,
		AuthEnabled: authEnabled, AppBaseURL: appBaseURL, AllowedOrigin: allowedOrigin, CookieSecure: cookieSecure, AdminEmails: adminEmails,
		MailProvider: mailProvider, MailFileDir: mailFileDir, ResendAPIKey: os.Getenv("RESEND_API_KEY"), ResendFrom: os.Getenv("RESEND_FROM"), ResendEndpoint: os.Getenv("RESEND_ENDPOINT"),
		SMTPHost: os.Getenv("SMTP_HOST"), SMTPPort: os.Getenv("SMTP_PORT"), SMTPUsername: os.Getenv("SMTP_USERNAME"), SMTPPassword: os.Getenv("SMTP_PASSWORD"), SMTPFrom: os.Getenv("SMTP_FROM"),
	}, nil
}

func emailSender(cfg config) mailer.Sender {
	switch cfg.MailProvider {
	case "resend":
		return mailer.NewResend(cfg.ResendAPIKey, cfg.ResendFrom, cfg.ResendEndpoint)
	case "smtp":
		return mailer.NewSMTP(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword, cfg.SMTPFrom)
	case "file":
		return mailer.NewFile(cfg.MailFileDir)
	default:
		return mailer.Disabled{}
	}
}

func main() {
	cfg, err := configFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	startupContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	database, err := store.New(startupContext, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer database.Close()

	server := &http.Server{
		Addr: cfg.Address,
		Handler: api.New(database, source.New(cfg.SourceFile), version, api.WithAuth(api.AuthOptions{
			Enabled: cfg.AuthEnabled, AppBaseURL: cfg.AppBaseURL, AllowedOrigin: cfg.AllowedOrigin, CookieSecure: cfg.CookieSecure,
			AdminEmails: cfg.AdminEmails, Mailer: emailSender(cfg),
		})),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-shutdown
		ctx, stop := context.WithTimeout(context.Background(), 10*time.Second)
		defer stop()
		_ = server.Shutdown(ctx)
	}()

	log.Printf("Zeno API %s listening on http://localhost%s (Swagger: /swagger/)", version, cfg.Address)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
