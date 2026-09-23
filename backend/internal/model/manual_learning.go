package model

import "time"

// LearningScope is constructed from the authenticated actor at the HTTP boundary.
// OwnerUserID must be a real user ID even for AllOwners; an empty owner is never
// a shortcut to global access.
type LearningScope struct {
	OwnerUserID string
	AllOwners   bool
}

type LearningModule struct {
	ID          string           `json:"id"`
	OwnerUserID string           `json:"-"`
	Title       string           `json:"title"`
	Category    string           `json:"category"`
	Level       string           `json:"level"`
	Objective   string           `json:"objective"`
	Note        string           `json:"note"`
	Materials   []ModuleMaterial `json:"materials"`
	CreatedAt   time.Time        `json:"createdAt"`
}
type ModuleMaterial struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	URL       string `json:"url"`
	FileName  string `json:"fileName"`
	MimeType  string `json:"mimeType"`
	ByteSize  int64  `json:"byteSize"`
	SortOrder int    `json:"sortOrder"`
}
type LearningPortion struct {
	MaterialID  string `json:"materialId"`
	StartPage   int    `json:"startPage"`
	EndPage     int    `json:"endPage"`
	StartSecond int    `json:"startSecond"`
	EndSecond   int    `json:"endSecond"`
}
type LearningSession struct {
	ID            string            `json:"id"`
	OwnerUserID   string            `json:"-"`
	ModuleID      string            `json:"moduleId"`
	Date          string            `json:"date"`
	Title         string            `json:"title"`
	TargetMinutes int               `json:"targetMinutes"`
	Method        string            `json:"method"`
	Objective     string            `json:"objective"`
	PracticePlan  string            `json:"practicePlan"`
	Status        string            `json:"status"`
	PlannedItems  []LearningPortion `json:"plannedItems"`
	ActualItems   []LearningPortion `json:"actualItems"`
	ActualMinutes int               `json:"actualMinutes"`
	Reflection    string            `json:"reflection"`
	Confusion     string            `json:"confusion"`
	NextStep      string            `json:"nextStep"`
	ReviewDate    string            `json:"reviewDate"`
	CreatedAt     time.Time         `json:"createdAt"`
}
