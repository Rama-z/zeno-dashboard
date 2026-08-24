package mailer_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"zeno-backend/internal/mailer"
)

func TestResendSenderPostsVerificationEmail(t *testing.T) {
	var authorization string
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"email-id"}`))
	}))
	defer server.Close()

	sender := mailer.NewResend("resend-secret", "Zeno <verify@example.com>", server.URL)
	if err := sender.SendVerification(context.Background(), "rama@example.com", "Rama", "http://localhost:8080/verify-email?token=abc"); err != nil {
		t.Fatal(err)
	}
	if authorization != "Bearer resend-secret" {
		t.Fatalf("unexpected authorization: %q", authorization)
	}
	to, _ := payload["to"].([]any)
	if payload["from"] != "Zeno <verify@example.com>" || len(to) != 1 || to[0] != "rama@example.com" {
		t.Fatalf("unexpected payload: %+v", payload)
	}
	if html, _ := payload["html"].(string); !strings.Contains(html, "http://localhost:8080/verify-email?token=abc") || !strings.Contains(html, "Rama") {
		t.Fatalf("verification HTML missing expected content: %q", html)
	}
}

func TestFileSenderWritesDevelopmentOutbox(t *testing.T) {
	dir := t.TempDir()
	sender := mailer.NewFile(dir)
	if err := sender.SendVerification(context.Background(), "rama@example.com", "Rama", "http://localhost:8080/verify-email?token=abc"); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected one email file, got %d", len(entries))
	}
	content, err := os.ReadFile(dir + "/" + entries[0].Name())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(content), "rama@example.com") || !strings.Contains(string(content), "token=abc") {
		t.Fatalf("unexpected outbox content: %s", content)
	}
}
