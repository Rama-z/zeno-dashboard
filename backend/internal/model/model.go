package model

import (
	"encoding/json"
	"time"
)

type User struct {
	ID              string     `json:"id"`
	Email           string     `json:"email"`
	DisplayName     string     `json:"displayName"`
	PasswordHash    string     `json:"-"`
	Role            string     `json:"role"`
	EmailVerifiedAt *time.Time `json:"emailVerifiedAt"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

type Session struct {
	TokenHash  string
	UserID     string
	ExpiresAt  time.Time
	CreatedAt  time.Time
	LastSeenAt time.Time
}

type ActivityEvent struct {
	ID            string          `json:"id"`
	UserID        string          `json:"userId,omitempty"`
	SubjectUserID string          `json:"subjectUserId,omitempty"`
	ActorName     string          `json:"actorName"`
	ActorEmail    string          `json:"actorEmail"`
	ActorRole     string          `json:"actorRole"`
	Action        string          `json:"action"`
	EntityType    string          `json:"entityType"`
	EntityID      string          `json:"entityId,omitempty"`
	Description   string          `json:"description"`
	Metadata      map[string]any  `json:"metadata"`
	CreatedAt     time.Time       `json:"createdAt"`
	RawMetadata   json.RawMessage `json:"-"`
}

type Log struct {
	ID       int    `json:"id"`
	Title    string `json:"title"`
	Question string `json:"question"`
	Answer   string `json:"answer"`
	Excerpt  string `json:"excerpt"`
	Status   string `json:"status"`
}

type SourceMeta struct {
	SourceFile string    `json:"sourceFile"`
	ModifiedAt time.Time `json:"modifiedAt"`
}

type Settings struct {
	WorkspaceName string `json:"workspaceName"`
	SourceFile    string `json:"sourceFile"`
}

type LearningEntry struct {
	ID          string    `json:"id"`
	OwnerUserID string    `json:"ownerUserId,omitempty"`
	Date        string    `json:"date,omitempty"`
	Title       string    `json:"title"`
	Note        string    `json:"note"`
	Category    string    `json:"category"`
	Completed   bool      `json:"completed"`
	CreatedAt   time.Time `json:"createdAt"`
}

type DoingEntry struct {
	ID          string    `json:"id"`
	OwnerUserID string    `json:"ownerUserId,omitempty"`
	Date        string    `json:"date,omitempty"`
	Title       string    `json:"title"`
	Note        string    `json:"note"`
	Category    string    `json:"category"`
	Completed   bool      `json:"completed"`
	CreatedAt   time.Time `json:"createdAt"`
}

type WorkoutEntry struct {
	ID              string    `json:"id"`
	OwnerUserID     string    `json:"ownerUserId,omitempty"`
	Date            string    `json:"date,omitempty"`
	Exercise        string    `json:"exercise"`
	Category        string    `json:"category"`
	Sets            int       `json:"sets"`
	Reps            int       `json:"reps"`
	DurationMinutes int       `json:"durationMinutes"`
	Note            string    `json:"note"`
	Completed       bool      `json:"completed"`
	CreatedAt       time.Time `json:"createdAt"`
}

type JournalEntry struct {
	ID          string    `json:"id"`
	OwnerUserID string    `json:"ownerUserId,omitempty"`
	Date        string    `json:"date,omitempty"`
	Title       string    `json:"title"`
	Content     string    `json:"content"`
	Mood        string    `json:"mood"`
	Tags        string    `json:"tags"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type SpendingEntry struct {
	ID            string    `json:"id"`
	OwnerUserID   string    `json:"ownerUserId,omitempty"`
	Date          string    `json:"date,omitempty"`
	Description   string    `json:"description"`
	Category      string    `json:"category"`
	Amount        int64     `json:"amount"`
	PaymentMethod string    `json:"paymentMethod"`
	Note          string    `json:"note"`
	CreatedAt     time.Time `json:"createdAt"`
}

type ChangeLogEntry struct {
	ID          string    `json:"id"`
	OccurredAt  time.Time `json:"occurredAt"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	CreatedAt   time.Time `json:"createdAt"`
}
