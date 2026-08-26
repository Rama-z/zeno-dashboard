package learningseed

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"

	"zeno-backend/internal/model"
)

//go:embed catalog.json lessons.json
var seedFiles embed.FS

type taxonomy struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type topicFamily struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Sequence    int    `json:"sequence"`
}

type catalog struct {
	SchemaVersion     string                       `json:"schemaVersion"`
	ContentVersion    int                          `json:"contentVersion"`
	Subject           taxonomy                     `json:"subject"`
	Category          taxonomy                     `json:"category"`
	TopicFamilies     []topicFamily                `json:"topicFamilies"`
	Matrix            []model.LearningMaterialSeed `json:"matrix"`
	SupportingLessons []model.LearningMaterialSeed `json:"supportingLessons"`
}

type lessonItem struct {
	ID             string   `json:"id"`
	Type           string   `json:"type"`
	Prompt         string   `json:"prompt"`
	Answer         string   `json:"answer"`
	Explanation    string   `json:"explanation"`
	Options        []string `json:"options"`
	ObjectiveIndex *int     `json:"objectiveIndex"`
}

type lessonRule struct {
	Label       string `json:"label"`
	Pattern     string `json:"pattern"`
	Explanation string `json:"explanation"`
}

type lessonExample struct {
	Sentence string   `json:"sentence"`
	Note     string   `json:"note"`
	Tags     []string `json:"tags"`
}

type lessonMistake struct {
	Incorrect   string `json:"incorrect"`
	Correct     string `json:"correct"`
	Explanation string `json:"explanation"`
}

type lessonReview struct {
	KeyTakeaways             []string `json:"keyTakeaways"`
	SuggestedReviewAfterDays []int    `json:"suggestedReviewAfterDays"`
	ReviewPrompts            []string `json:"reviewPrompts"`
}

type lessonMastery struct {
	MinimumScorePercent      int   `json:"minimumScorePercent"`
	RequiredObjectiveIndexes []int `json:"requiredObjectiveIndexes"`
}

type lessonDocument struct {
	SchemaVersion    string           `json:"schemaVersion"`
	ContentVersion   int              `json:"contentVersion"`
	ID               string           `json:"id"`
	Subject          string           `json:"subject"`
	Category         string           `json:"category"`
	Locale           string           `json:"locale"`
	Level            string           `json:"level"`
	Title            string           `json:"title"`
	Sequence         int              `json:"sequence"`
	EstimatedMinutes int              `json:"estimatedMinutes"`
	TopicID          string           `json:"topicId"`
	Prerequisites    []string         `json:"prerequisites"`
	Revisits         []string         `json:"revisits"`
	Objectives       []string         `json:"objectives"`
	Rules            []lessonRule     `json:"rules"`
	Explanation      []map[string]any `json:"explanation"`
	Examples         []lessonExample  `json:"examples"`
	CommonMistakes   []lessonMistake  `json:"commonMistakes"`
	Practice         []lessonItem     `json:"practice"`
	Quiz             []lessonItem     `json:"quiz"`
	Mastery          lessonMastery    `json:"mastery"`
	Review           lessonReview     `json:"review"`
}

var validLevels = map[string]bool{"A1": true, "A2": true, "B1": true, "B2": true, "C1": true}
var validCoverageModes = map[string]bool{"lesson": true, "awareness": true, "planned": true}
var validExerciseTypes = map[string]bool{"multiple_choice": true, "fill_blank": true, "rewrite": true}

// Load validates the complete version-controlled catalogue and returns rows ready for a transactional upsert.
func Load() ([]model.LearningMaterialSeed, error) {
	catalogBytes, err := seedFiles.ReadFile("catalog.json")
	if err != nil {
		return nil, fmt.Errorf("read learning catalogue: %w", err)
	}
	lessonsBytes, err := seedFiles.ReadFile("lessons.json")
	if err != nil {
		return nil, fmt.Errorf("read learning lessons: %w", err)
	}
	var source catalog
	if err := json.Unmarshal(catalogBytes, &source); err != nil {
		return nil, fmt.Errorf("decode learning catalogue: %w", err)
	}
	var lessons map[string]json.RawMessage
	if err := json.Unmarshal(lessonsBytes, &lessons); err != nil {
		return nil, fmt.Errorf("decode learning lessons: %w", err)
	}
	rows, err := Validate(source, lessons)
	if err != nil {
		return nil, err
	}
	for index := range rows {
		if raw, ok := lessons[rows[index].ID]; ok {
			rows[index].Content = raw
		} else {
			rows[index].Content = json.RawMessage(`{}`)
		}
	}
	return rows, nil
}

// Validate is exported so seed tests can validate malformed fixtures without touching PostgreSQL.
func Validate(source catalog, lessons map[string]json.RawMessage) ([]model.LearningMaterialSeed, error) {
	if source.SchemaVersion == "" || source.ContentVersion < 1 {
		return nil, fmt.Errorf("catalogue schema/version is invalid")
	}
	if source.Subject.ID != "english" || source.Category.ID != "grammar" {
		return nil, fmt.Errorf("catalogue taxonomy must be English → Grammar")
	}
	if len(source.TopicFamilies) != 20 {
		return nil, fmt.Errorf("catalogue must contain exactly 20 topic families, got %d", len(source.TopicFamilies))
	}
	familyIDs := make(map[string]bool, len(source.TopicFamilies))
	familyTitles := make(map[string]string, len(source.TopicFamilies))
	for index, family := range source.TopicFamilies {
		if family.ID == "" || family.Title == "" || family.Description == "" || family.Sequence != index+1 || familyIDs[family.ID] {
			return nil, fmt.Errorf("topic family %q is invalid or duplicated", family.ID)
		}
		familyIDs[family.ID] = true
		familyTitles[family.ID] = family.Title
	}
	if len(source.Matrix) != 100 {
		return nil, fmt.Errorf("catalogue must contain exactly 100 matrix cells, got %d", len(source.Matrix))
	}
	rows := append(append([]model.LearningMaterialSeed{}, source.Matrix...), source.SupportingLessons...)
	ids := make(map[string]bool, len(rows))
	sequences := make(map[int]bool, len(rows))
	matrixKeys := make(map[string]bool, len(source.Matrix))
	levelSeen := make(map[string]bool, len(validLevels))
	for index, row := range rows {
		if err := validateRow(row, index, familyIDs, familyTitles, ids, sequences, lessons); err != nil {
			return nil, err
		}
		if index < len(source.Matrix) {
			key := row.TopicID + ":" + row.Level
			if matrixKeys[key] {
				return nil, fmt.Errorf("duplicate matrix cell %s", key)
			}
			matrixKeys[key] = true
			levelSeen[row.Level] = true
		}
	}
	for _, level := range []string{"A1", "A2", "B1", "B2", "C1"} {
		if !levelSeen[level] {
			return nil, fmt.Errorf("matrix does not represent level %s", level)
		}
	}
	for _, row := range rows {
		for _, link := range append(append([]string{}, row.Prerequisites...), row.Revisits...) {
			if link == row.ID || !ids[link] {
				return nil, fmt.Errorf("%s has dangling or self relationship %q", row.ID, link)
			}
		}
	}
	return rows, nil
}

func validateRow(row model.LearningMaterialSeed, index int, familyIDs map[string]bool, familyTitles map[string]string, ids map[string]bool, sequences map[int]bool, lessons map[string]json.RawMessage) error {
	if row.ID == "" || ids[row.ID] || row.SubjectID != "english" || row.CategoryID != "grammar" || row.SubjectTitle == "" || row.CategoryTitle == "" || row.TopicID == "" || !familyIDs[row.TopicID] || row.TopicTitle != familyTitles[row.TopicID] || !validLevels[row.Level] || !validCoverageModes[row.CoverageMode] || row.Title == "" || row.Summary == "" || row.Sequence < 1 || row.PositionWithinTopic < 1 || row.EstimatedMinutes < 1 || row.SchemaVersion == "" || row.ContentVersion < 1 {
		return fmt.Errorf("invalid learning material row %d (%s)", index, row.ID)
	}
	if sequences[row.Sequence] {
		return fmt.Errorf("duplicate learning material sequence %d", row.Sequence)
	}
	if row.CoverageMode == "planned" && row.Published {
		return fmt.Errorf("planned material %s cannot be published", row.ID)
	}
	ids[row.ID] = true
	sequences[row.Sequence] = true
	if row.Published {
		raw, ok := lessons[row.ID]
		if !ok {
			return fmt.Errorf("published material %s has no content document", row.ID)
		}
		if err := validateLesson(row, raw); err != nil {
			return err
		}
	}
	return nil
}

func validateLesson(row model.LearningMaterialSeed, raw json.RawMessage) error {
	var lesson lessonDocument
	if err := json.Unmarshal(raw, &lesson); err != nil {
		return fmt.Errorf("decode lesson %s: %w", row.ID, err)
	}
	if lesson.SchemaVersion != row.SchemaVersion || lesson.ContentVersion != row.ContentVersion || lesson.ID != row.ID || lesson.Subject != row.SubjectID || lesson.Category != row.CategoryID || lesson.Locale != row.Locale || lesson.Level != row.Level || lesson.Title != row.Title || lesson.Sequence != row.Sequence || lesson.EstimatedMinutes != row.EstimatedMinutes || lesson.TopicID != row.TopicID || !sameStrings(lesson.Prerequisites, row.Prerequisites) || !sameStrings(lesson.Revisits, row.Revisits) || len(lesson.Objectives) == 0 || len(lesson.Rules) == 0 || len(lesson.Explanation) == 0 || len(lesson.Practice) == 0 || len(lesson.Quiz) == 0 || len(lesson.CommonMistakes) == 0 {
		return fmt.Errorf("lesson %s has incomplete or mismatched projected metadata", row.ID)
	}
	if row.CoverageMode == "lesson" && len(lesson.Examples) < 5 {
		return fmt.Errorf("published taught lesson %s needs at least five examples", row.ID)
	}
	if lesson.Mastery.MinimumScorePercent < 0 || lesson.Mastery.MinimumScorePercent > 100 || len(lesson.Mastery.RequiredObjectiveIndexes) == 0 || len(lesson.Review.KeyTakeaways) == 0 || len(lesson.Review.SuggestedReviewAfterDays) == 0 || len(lesson.Review.ReviewPrompts) == 0 {
		return fmt.Errorf("lesson %s has incomplete mastery or review policy", row.ID)
	}
	var projectedMastery lessonMastery
	var projectedReview lessonReview
	if err := json.Unmarshal(row.Mastery, &projectedMastery); err != nil {
		return fmt.Errorf("lesson %s has invalid projected mastery policy", row.ID)
	}
	if err := json.Unmarshal(row.Review, &projectedReview); err != nil {
		return fmt.Errorf("lesson %s has invalid projected review policy", row.ID)
	}
	if projectedMastery.MinimumScorePercent != lesson.Mastery.MinimumScorePercent || !sameInts(projectedMastery.RequiredObjectiveIndexes, lesson.Mastery.RequiredObjectiveIndexes) || !sameStrings(projectedReview.KeyTakeaways, lesson.Review.KeyTakeaways) || !sameInts(projectedReview.SuggestedReviewAfterDays, lesson.Review.SuggestedReviewAfterDays) || !sameStrings(projectedReview.ReviewPrompts, lesson.Review.ReviewPrompts) {
		return fmt.Errorf("lesson %s mastery or review policy disagrees with catalogue metadata", row.ID)
	}
	for _, index := range lesson.Mastery.RequiredObjectiveIndexes {
		if index < 0 || index >= len(lesson.Objectives) {
			return fmt.Errorf("lesson %s has an invalid mastery objective index", row.ID)
		}
	}
	for _, days := range lesson.Review.SuggestedReviewAfterDays {
		if days < 1 {
			return fmt.Errorf("lesson %s has an invalid review interval", row.ID)
		}
	}
	for index, rule := range lesson.Rules {
		if rule.Label == "" || rule.Pattern == "" || rule.Explanation == "" {
			return fmt.Errorf("lesson %s rule %d is incomplete", row.ID, index)
		}
	}
	for index, part := range lesson.Explanation {
		heading, headingOK := part["heading"].(string)
		body, bodyOK := part["body"].(string)
		if !headingOK || strings.TrimSpace(heading) == "" || !bodyOK || strings.TrimSpace(body) == "" {
			return fmt.Errorf("lesson %s explanation %d is incomplete", row.ID, index)
		}
	}
	seenExamples := map[string]bool{}
	for _, example := range lesson.Examples {
		key := strings.ToLower(strings.Join(strings.Fields(example.Sentence), " "))
		if key == "" || example.Note == "" || len(example.Tags) == 0 || seenExamples[key] {
			return fmt.Errorf("lesson %s has invalid or duplicate example", row.ID)
		}
		seenExamples[key] = true
	}
	itemIDs := map[string]bool{}
	for _, item := range append(append([]lessonItem{}, lesson.Practice...), lesson.Quiz...) {
		if item.ID == "" || itemIDs[item.ID] || item.Prompt == "" || item.Answer == "" || item.Explanation == "" || !validExerciseTypes[item.Type] {
			return fmt.Errorf("lesson %s has invalid or duplicate exercise %s", row.ID, item.ID)
		}
		itemIDs[item.ID] = true
		if item.Type == "multiple_choice" {
			if len(item.Options) < 2 || !contains(item.Options, item.Answer) {
				return fmt.Errorf("lesson %s exercise %s has an invalid multiple-choice answer", row.ID, item.ID)
			}
		}
	}
	for _, item := range lesson.Quiz {
		if item.ObjectiveIndex == nil || *item.ObjectiveIndex < 0 || *item.ObjectiveIndex >= len(lesson.Objectives) {
			return fmt.Errorf("lesson %s exercise %s has an invalid objective index", row.ID, item.ID)
		}
	}
	return nil
}

func sameStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func sameInts(left, right []int) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
