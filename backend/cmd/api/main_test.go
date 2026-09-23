package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestConfigFromEnvironment(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("PORT", "4100")
	t.Setenv("SOURCE_FILE", "/tmp/session.md")
	config, err := configFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if config.DatabaseURL != "postgres://example" || config.Address != ":4100" || config.SourceFile != "/tmp/session.md" {
		t.Fatalf("unexpected config: %+v", config)
	}
}

func TestTransferServerTimeoutPolicy(t *testing.T) {
	s := serverTimeouts(&http.Server{})
	if s.ReadHeaderTimeout < 5*time.Second || s.IdleTimeout <= 0 || s.ReadTimeout != 0 || s.WriteTimeout != 0 {
		t.Fatalf("whole-request timeouts break large transfers: %+v", s)
	}
}

func TestTransferRouteDeadlines(t *testing.T) {
	for _, test := range []struct {
		method, path string
		read, write  time.Duration
	}{
		{"POST", "/api/learning-modules/11111111-1111-4111-8111-111111111111/materials", 15 * time.Minute, 15 * time.Minute},
		{"POST", "/api/learning-modules/11111111-1111-4111-8111-111111111111/materials/22222222-2222-4222-8222-222222222222/file", 15 * time.Minute, 15 * time.Minute},
		{"GET", "/api/learning-modules/11111111-1111-4111-8111-111111111111/materials/22222222-2222-4222-8222-222222222222/file", 2 * time.Minute, 15 * time.Minute},
		{"POST", "/api/learning-modules", 2 * time.Minute, 2 * time.Minute},
	} {
		r := httptest.NewRequest(test.method, test.path, nil)
		read, write := requestDeadlines(r)
		if read != test.read || write != test.write {
			t.Errorf("%s %s: got %v/%v want %v/%v", test.method, test.path, read, write, test.read, test.write)
		}
	}
}
