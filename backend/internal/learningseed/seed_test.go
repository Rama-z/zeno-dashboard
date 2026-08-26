package learningseed

import (
	"encoding/json"
	"testing"
)

func fixtureCatalogAndLessons(t *testing.T) (catalog, map[string]json.RawMessage) {
	t.Helper()
	catalogBytes, err := seedFiles.ReadFile("catalog.json")
	if err != nil {
		t.Fatal(err)
	}
	lessonBytes, err := seedFiles.ReadFile("lessons.json")
	if err != nil {
		t.Fatal(err)
	}
	var source catalog
	if err := json.Unmarshal(catalogBytes, &source); err != nil {
		t.Fatal(err)
	}
	var lessons map[string]json.RawMessage
	if err := json.Unmarshal(lessonBytes, &lessons); err != nil {
		t.Fatal(err)
	}
	return source, lessons
}

func TestLoadValidatesCompleteMatrixAndPublishedLessons(t *testing.T) {
	rows, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 102 {
		t.Fatalf("expected 100 matrix rows plus 2 supporting planned rows, got %d", len(rows))
	}
	published := 0
	for _, row := range rows {
		if row.Published {
			published++
		}
	}
	if published != 99 {
		t.Fatalf("expected 19 A1 lessons, 19 new A2 lessons, 18 new B1 lessons, 20 B2 lessons, 19 new C1 lessons, and 4 retained lessons, got %d", published)
	}
}

func TestValidateRejectsDanglingRelationships(t *testing.T) {
	source, lessons := fixtureCatalogAndLessons(t)
	source.Matrix[0].Prerequisites = append(source.Matrix[0].Prerequisites, "missing-lesson")
	if _, err := Validate(source, lessons); err == nil {
		t.Fatal("expected dangling prerequisite to be rejected")
	}
}

func TestValidateRejectsDuplicateExamples(t *testing.T) {
	source, lessons := fixtureCatalogAndLessons(t)
	row := source.Matrix[0]
	var lesson map[string]any
	if err := json.Unmarshal(lessons[row.ID], &lesson); err != nil {
		t.Fatal(err)
	}
	examples := lesson["examples"].([]any)
	examples[1] = examples[0]
	lesson["examples"] = examples
	mutated, err := json.Marshal(lesson)
	if err != nil {
		t.Fatal(err)
	}
	lessons[row.ID] = mutated
	if _, err := Validate(source, lessons); err == nil {
		t.Fatal("expected duplicate examples to be rejected")
	}
}
