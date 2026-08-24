package source_test

import (
	"os"
	"path/filepath"
	"testing"

	"zeno-backend/internal/source"
)

func TestMarkdownLoadsNumberedSessionEntries(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "session.md")
	markdown := `# Session

## 1. Connected

### Pertanyaan
Apakah terhubung?

### Jawaban
Service berhasil terhubung.

## 2. Reference

### Pertanyaan
Apa referensinya?

### Jawaban
Dokumentasi tersedia untuk dibaca.
`
	if err := os.WriteFile(path, []byte(markdown), 0o600); err != nil {
		t.Fatal(err)
	}

	reader := source.New(path)
	logs, meta, err := reader.Logs()
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 2 {
		t.Fatalf("expected 2 logs, got %d", len(logs))
	}
	if logs[0].Status != "success" || logs[1].Status != "info" {
		t.Fatalf("unexpected statuses: %q, %q", logs[0].Status, logs[1].Status)
	}
	if meta.SourceFile != path || meta.ModifiedAt.IsZero() {
		t.Fatalf("unexpected metadata: %+v", meta)
	}
}
