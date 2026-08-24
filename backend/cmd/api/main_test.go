package main

import "testing"

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
