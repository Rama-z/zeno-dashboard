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

type LearningMaterialSeed struct {
	ID                  string          `json:"id"`
	SubjectID           string          `json:"subjectId"`
	SubjectTitle        string          `json:"subjectTitle"`
	CategoryID          string          `json:"categoryId"`
	CategoryTitle       string          `json:"categoryTitle"`
	TopicID             string          `json:"topicId"`
	TopicTitle          string          `json:"topicTitle"`
	Locale              string          `json:"locale"`
	Level               string          `json:"level"`
	CoverageMode        string          `json:"coverageMode"`
	Title               string          `json:"title"`
	Summary             string          `json:"summary"`
	Sequence            int             `json:"sequence"`
	PositionWithinTopic int             `json:"positionWithinTopic"`
	EstimatedMinutes    int             `json:"estimatedMinutes"`
	SchemaVersion       string          `json:"schemaVersion"`
	ContentVersion      int             `json:"contentVersion"`
	Prerequisites       []string        `json:"prerequisites"`
	Revisits            []string        `json:"revisits"`
	Mastery             json.RawMessage `json:"mastery"`
	Review              json.RawMessage `json:"review"`
	Published           bool            `json:"published"`
	Content             json.RawMessage `json:"content,omitempty"`
}

type LearningMaterialProgress struct {
	OwnerUserID    string          `json:"-"`
	MaterialID     string          `json:"materialId"`
	Status         string          `json:"status"`
	MasteryScore   *int            `json:"masteryScore,omitempty"`
	ObjectiveState map[string]bool `json:"objectiveState"`
	AttemptCount   int             `json:"attemptCount"`
	ContentVersion int             `json:"contentVersion"`
	LastReviewedAt *time.Time      `json:"lastReviewedAt,omitempty"`
	NextReviewAt   *time.Time      `json:"nextReviewAt,omitempty"`
	CreatedAt      time.Time       `json:"createdAt"`
	UpdatedAt      time.Time       `json:"updatedAt"`
}

type LearningMaterialProgressInput struct {
	MaterialID     string          `json:"materialId,omitempty"`
	ContentVersion int             `json:"contentVersion"`
	Status         string          `json:"status"`
	MasteryScore   *int            `json:"masteryScore,omitempty"`
	ObjectiveState map[string]bool `json:"objectiveState"`
	AttemptCount   int             `json:"attemptCount"`
	LastReviewedAt *time.Time      `json:"lastReviewedAt,omitempty"`
	NextReviewAt   *time.Time      `json:"nextReviewAt,omitempty"`
}

type LearningMaterialSummary struct {
	ID                  string                    `json:"id"`
	SubjectID           string                    `json:"subjectId"`
	SubjectTitle        string                    `json:"subjectTitle"`
	CategoryID          string                    `json:"categoryId"`
	CategoryTitle       string                    `json:"categoryTitle"`
	TopicID             string                    `json:"topicId"`
	TopicTitle          string                    `json:"topicTitle"`
	Locale              string                    `json:"locale"`
	Level               string                    `json:"level"`
	CoverageMode        string                    `json:"coverageMode"`
	Title               string                    `json:"title"`
	Summary             string                    `json:"summary"`
	Sequence            int                       `json:"sequence"`
	PositionWithinTopic int                       `json:"positionWithinTopic"`
	EstimatedMinutes    int                       `json:"estimatedMinutes"`
	SchemaVersion       string                    `json:"schemaVersion"`
	ContentVersion      int                       `json:"contentVersion"`
	Prerequisites       []string                  `json:"prerequisites"`
	Revisits            []string                  `json:"revisits"`
	Published           bool                      `json:"published"`
	Progress            *LearningMaterialProgress `json:"progress"`
	ReviewDue           bool                      `json:"reviewDue"`
}

type LearningMaterial struct {
	LearningMaterialSummary
	Content json.RawMessage `json:"content"`
	Mastery json.RawMessage `json:"mastery"`
	Review  json.RawMessage `json:"review"`
}

// DoingTask is the Complete Workspace DTO; DoingEntry remains the legacy Overview DTO.
type DoingCriterion struct {
	ID   string `json:"id"`
	Text string `json:"text"`
	Done bool   `json:"done"`
}

type DoingDuration struct {
	MinMinutes int    `json:"minMinutes"`
	MaxMinutes int    `json:"maxMinutes"`
	Label      string `json:"label,omitempty"`
}

type DoingTask struct {
	ID               string           `json:"id"`
	OwnerUserID      string           `json:"ownerUserId,omitempty"`
	Title            string           `json:"title"`
	Area             string           `json:"area"`
	Project          string           `json:"project"`
	Type             string           `json:"type"`
	Status           string           `json:"status"`
	Priority         string           `json:"priority"`
	Urgency          string           `json:"urgency"`
	Impact           string           `json:"impact"`
	Effort           string           `json:"effort"`
	Energy           string           `json:"energy"`
	Focus            string           `json:"focus"`
	Duration         DoingDuration    `json:"duration"`
	Context          string           `json:"context"`
	Device           string           `json:"device"`
	Location         string           `json:"location"`
	TimePreference   string           `json:"timePreference"`
	Difficulty       string           `json:"difficulty"`
	Resistance       string           `json:"resistance"`
	Due              *string          `json:"due"`
	NextAction       string           `json:"nextAction"`
	DefinitionOfDone []DoingCriterion `json:"definitionOfDone"`
	PlannedDate      *string          `json:"plannedDate"`
	Notes            string           `json:"notes"`
	LegacyMetadata   map[string]any   `json:"legacyMetadata,omitempty"`
	CreatedAt        time.Time        `json:"createdAt"`
	UpdatedAt        time.Time        `json:"updatedAt"`
}

type DoingEntry struct {
	ID               string     `json:"id"`
	OwnerUserID      string     `json:"ownerUserId,omitempty"`
	Date             string     `json:"date,omitempty"`
	Title            string     `json:"title"`
	Status           string     `json:"status"`
	Priority         string     `json:"priority"`
	TimeBlockStart   string     `json:"timeBlockStart"`
	TimeBlockEnd     string     `json:"timeBlockEnd"`
	EstimatedMinutes int        `json:"estimatedMinutes"`
	ActualMinutes    int        `json:"actualMinutes"`
	Category         string     `json:"category"`
	Project          string     `json:"project"`
	GoalOutcome      string     `json:"goalOutcome"`
	Progress         int        `json:"progress"`
	EnergyFocus      string     `json:"energyFocus"`
	Dependency       string     `json:"dependency"`
	BlockedBy        string     `json:"blockedBy"`
	Note             string     `json:"note"`
	CarryOver        bool       `json:"carryOver"`
	Completed        bool       `json:"completed"`
	CompletedAt      *time.Time `json:"completedAt,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
}

type WorkoutEntry struct {
	ID              string    `json:"id"`
	OwnerUserID     string    `json:"ownerUserId,omitempty"`
	Date            string    `json:"date,omitempty"`
	MaterialID      string    `json:"materialId,omitempty"`
	Exercise        string    `json:"exercise"`
	Category        string    `json:"category"`
	Sets            int       `json:"sets"`
	Reps            int       `json:"reps"`
	DurationMinutes int       `json:"durationMinutes"`
	Note            string    `json:"note"`
	Completed       bool      `json:"completed"`
	CreatedAt       time.Time `json:"createdAt"`
}

type WorkoutSet struct {
	ID         string         `json:"id"`
	MovementID string         `json:"movementId,omitempty"`
	Number     int            `json:"number"`
	Target     map[string]any `json:"target"`
	Actual     map[string]any `json:"actual"`
	Status     string         `json:"status"`
	RecordedAt *time.Time     `json:"recordedAt,omitempty"`
	RPE        *float64       `json:"rpe,omitempty"`
}

type WorkoutMovement struct {
	ID           string         `json:"id"`
	SessionID    string         `json:"sessionId,omitempty"`
	MaterialID   string         `json:"materialId,omitempty"`
	Custom       bool           `json:"custom"`
	Name         string         `json:"name"`
	ExerciseType string         `json:"exerciseType"`
	Position     int            `json:"position"`
	Equipment    []string       `json:"equipment"`
	MuscleGroups []string       `json:"muscleGroups"`
	Target       map[string]any `json:"target"`
	RestSeconds  *int           `json:"restSeconds,omitempty"`
	Status       string         `json:"status"`
	Note         string         `json:"note"`
	Sets         []WorkoutSet   `json:"sets"`
}

type WorkoutSession struct {
	ID                              string            `json:"id"`
	OwnerUserID                     string            `json:"ownerUserId,omitempty"`
	Name                            string            `json:"name"`
	Date                            string            `json:"date"`
	LocalTime                       string            `json:"localTime,omitempty"`
	Timezone                        string            `json:"timezone"`
	Status                          string            `json:"status"`
	EstimatedMinutes                int               `json:"estimatedMinutes"`
	StartedAt                       *time.Time        `json:"startedAt,omitempty"`
	PausedAt                        *time.Time        `json:"pausedAt,omitempty"`
	PausedSeconds                   int               `json:"pausedSeconds"`
	EndedAt                         *time.Time        `json:"endedAt,omitempty"`
	RestTimerEndsAt                 *time.Time        `json:"restTimerEndsAt,omitempty"`
	RestTimerPausedRemainingSeconds *int              `json:"restTimerPausedRemainingSeconds,omitempty"`
	Location                        string            `json:"location"`
	Note                            string            `json:"note"`
	TemplateID                      string            `json:"templateId,omitempty"`
	LegacyWorkoutEntryID            string            `json:"legacyWorkoutEntryId,omitempty"`
	Movements                       []WorkoutMovement `json:"movements"`
	CreatedAt                       time.Time         `json:"createdAt"`
	UpdatedAt                       time.Time         `json:"updatedAt"`
}

type WorkoutTemplate struct {
	ID          string            `json:"id"`
	OwnerUserID string            `json:"ownerUserId,omitempty"`
	Name        string            `json:"name"`
	Movements   []WorkoutMovement `json:"movements"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
}

type JournalEditReason string

const (
	JournalEditReasonTypo                 JournalEditReason = "typo"
	JournalEditReasonClarify              JournalEditReason = "clarify"
	JournalEditReasonIncorrectInformation JournalEditReason = "incorrect_information"
	JournalEditReasonChangedMyMind        JournalEditReason = "changed_my_mind"
)

func (reason JournalEditReason) Valid() bool {
	switch reason {
	case JournalEditReasonTypo, JournalEditReasonClarify, JournalEditReasonIncorrectInformation, JournalEditReasonChangedMyMind:
		return true
	default:
		return false
	}
}

type JournalInput struct {
	Date    string `json:"date"`
	Title   string `json:"title"`
	Content string `json:"content"`
	Mood    string `json:"mood"`
	Tags    string `json:"tags"`
}

type JournalRevisionInput struct {
	BaseRevisionNumber int               `json:"baseRevisionNumber"`
	Date               string            `json:"date"`
	Title              string            `json:"title"`
	Content            string            `json:"content"`
	Mood               string            `json:"mood"`
	Tags               string            `json:"tags"`
	EditReason         JournalEditReason `json:"editReason"`
}

type JournalEntry struct {
	ID                   string             `json:"id"`
	OwnerUserID          string             `json:"ownerUserId,omitempty"`
	Date                 string             `json:"date,omitempty"`
	Title                string             `json:"title"`
	Content              string             `json:"content"`
	Mood                 string             `json:"mood"`
	Tags                 string             `json:"tags"`
	CreatedAt            time.Time          `json:"createdAt"`
	UpdatedAt            time.Time          `json:"updatedAt"`
	LatestRevisionNumber int                `json:"latestRevisionNumber"`
	LatestEditReason     *JournalEditReason `json:"latestEditReason,omitempty"`
}

type JournalRevision struct {
	JournalID      string             `json:"journalId"`
	RevisionNumber int                `json:"revisionNumber"`
	Date           string             `json:"date"`
	Title          string             `json:"title"`
	Content        string             `json:"content"`
	Mood           string             `json:"mood"`
	Tags           string             `json:"tags"`
	EditReason     *JournalEditReason `json:"editReason,omitempty"`
	CreatedAt      time.Time          `json:"createdAt"`
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
