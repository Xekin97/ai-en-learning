package admin

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/ai"
	"wordweave/internal/identity"
	"wordweave/internal/learning"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
)

var (
	ErrNotFound          = errors.New("admin resource not found")
	ErrValidation        = errors.New("admin validation failed")
	ErrInvalidCursor     = errors.New("admin cursor invalid")
	ErrConflict          = errors.New("admin conflict")
	ErrModelIncompatible = errors.New("model incompatible")
)

type Service struct {
	pool        *pgxpool.Pool
	credentials *ai.CredentialStore
	provider    ai.Provider
	learning    *learning.Service
	key         []byte
	signer      security.CursorSigner
}

func NewService(pool *pgxpool.Pool, credentials *ai.CredentialStore, provider ai.Provider, learningService *learning.Service, key []byte) *Service {
	return &Service{pool: pool, credentials: credentials, provider: provider, learning: learningService, key: append([]byte(nil), key...), signer: security.NewCursorSigner(key)}
}

func (service *Service) CredentialStatus(ctx context.Context) (ai.CredentialStatus, string, error) {
	tx, err := service.pool.Begin(ctx)
	if err != nil {
		return ai.CredentialStatus{}, "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return ai.CredentialStatus{}, "", err
	}
	status, err := service.credentials.Status(ctx)
	return status, service.revision(c), err
}

func (service *Service) PutCredential(ctx context.Context, actor identity.Actor, apiKey string, confirmed bool, expected string) (ai.CredentialStatus, string, error) {
	if !confirmed || strings.TrimSpace(apiKey) == "" {
		return ai.CredentialStatus{}, "", ErrValidation
	}
	tx, err := service.pool.Begin(ctx)
	if err != nil {
		return ai.CredentialStatus{}, "", err
	}
	c, err := business.LockConfiguration(ctx, tx, false)
	_ = tx.Rollback(ctx)
	if err != nil {
		return ai.CredentialStatus{}, "", err
	}
	if err = service.requireRevision(c, expected); err != nil {
		return ai.CredentialStatus{}, "", err
	}
	legacy, ok := service.provider.(*ai.OpenRouter)
	if !ok {
		return ai.CredentialStatus{}, "", ErrValidation
	}
	if err := legacy.ValidateAPIKey(ctx, apiKey); err != nil {
		return ai.CredentialStatus{}, "", err
	}
	status, revision, applied, err := service.credentials.Replace(ctx, actor.ID, apiKey, &c.Revision)
	if err != nil {
		return ai.CredentialStatus{}, "", err
	}
	publicRevision := business.Revision(service.key, "configuration", revision)
	if !applied {
		return ai.CredentialStatus{}, "", &business.RevisionConflict{Current: publicRevision}
	}
	return status, publicRevision, nil
}

type User struct {
	ID                 uuid.UUID
	Username           string
	Role               string
	PlanCode           *string
	Status             string
	UILocale           *string
	CreatedAt          time.Time
	LearningBatchCount int
	GenerationQuota    *GenerationQuota
	Nickname           *string
	Gender             *string
	LastLoginAt        *time.Time
	LastLearningAt     *time.Time
	Growth             *UserGrowth
	BaseRevision       *string
	EffectivePlanCode  *string
	baseEpoch          int64
	baseReset          string
}

type UserGrowth struct {
	Level      int64           `json:"level_number"`
	Points     business.Amount `json:"points"`
	Experience business.Amount `json:"experience"`
	Mastered   int64           `json:"mastered_total"`
	Saved      int64           `json:"saved_total"`
}

const UserCursorVersion = 2

type UserCursorV2 struct {
	Version            int       `json:"version"`
	MatchTier          int       `json:"match_tier"`
	NormalizedUsername string    `json:"normalized_username"`
	ID                 uuid.UUID `json:"id"`
}

func NormalizeUserQuery(query string) string {
	return strings.ToLower(strings.TrimSpace(query))
}

func NewUserCursor(query string, user User) UserCursorV2 {
	normalizedQuery := NormalizeUserQuery(query)
	normalizedUsername := strings.ToLower(user.Username)
	return UserCursorV2{
		Version:            UserCursorVersion,
		MatchTier:          userMatchTier(normalizedQuery, normalizedUsername),
		NormalizedUsername: normalizedUsername,
		ID:                 user.ID,
	}
}

func ValidUserCursor(query string, cursor UserCursorV2) bool {
	normalizedQuery := NormalizeUserQuery(query)
	if cursor.Version != UserCursorVersion || cursor.ID == uuid.Nil || cursor.NormalizedUsername == "" ||
		cursor.NormalizedUsername != strings.TrimSpace(cursor.NormalizedUsername) ||
		cursor.NormalizedUsername != strings.ToLower(cursor.NormalizedUsername) ||
		!validNormalizedUsername(cursor.NormalizedUsername) {
		return false
	}
	if normalizedQuery != "" && !strings.Contains(cursor.NormalizedUsername, normalizedQuery) {
		return false
	}
	return cursor.MatchTier == userMatchTier(normalizedQuery, cursor.NormalizedUsername)
}

func validNormalizedUsername(username string) bool {
	if len(username) < 3 || len(username) > 32 {
		return false
	}
	for _, character := range username {
		if character != '_' && (character < 'a' || character > 'z') && (character < '0' || character > '9') {
			return false
		}
	}
	return true
}

func userMatchTier(normalizedQuery, normalizedUsername string) int {
	if normalizedQuery != "" && normalizedUsername == normalizedQuery {
		return 0
	}
	return 1
}

func (service *Service) ListUsers(ctx context.Context, username string, cursor *UserCursorV2, limit int) ([]User, bool, error) {
	normalizedQuery := NormalizeUserQuery(username)
	if limit < 1 || limit > 100 || utf8.RuneCountInString(normalizedQuery) > 64 {
		return nil, false, ErrValidation
	}
	if cursor != nil && !ValidUserCursor(normalizedQuery, *cursor) {
		return nil, false, ErrInvalidCursor
	}
	var cursorTier any
	var cursorName any
	var cursorID any
	if cursor != nil {
		cursorTier, cursorName, cursorID = cursor.MatchTier, cursor.NormalizedUsername, cursor.ID
	}
	rows, err := service.pool.Query(ctx, `
		WITH matched_accounts AS (
			SELECT id,username,role,group_code,status,ui_locale,created_at,
				CASE WHEN $1::text<>'' AND lower(username)=$1 THEN 0 ELSE 1 END AS match_tier,
				lower(username) AS normalized_username
			FROM wordweave.accounts
			WHERE ($1='' OR lower(username) LIKE '%'||$1||'%')
		)
		SELECT id,username,role,group_code,status,ui_locale,created_at
		FROM matched_accounts
		WHERE ($2::integer IS NULL OR
			(match_tier,normalized_username,id)>($2::integer,$3::text,$4::uuid))
		ORDER BY match_tier,normalized_username,id LIMIT $5`, normalizedQuery, cursorTier, cursorName, cursorID, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	items := make([]User, 0, limit+1)
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			return nil, false, err
		}
		items = append(items, user)
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	return items, hasMore, rows.Err()
}

func (service *Service) GetUser(ctx context.Context, id uuid.UUID) (User, error) {
	user, err := getUser(ctx, service.pool, id)
	if err != nil {
		return User{}, err
	}
	signUserBase(&user, service.key)
	return user, nil
}

// RequireUser is deliberately a narrow existence check. Read-only library
// routes must not aggregate generation history just to validate their parent.
func (service *Service) RequireUser(ctx context.Context, id uuid.UUID) error {
	var found uuid.UUID
	err := service.pool.QueryRow(ctx, `SELECT id FROM wordweave.accounts WHERE id=$1`, id).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

func (service *Service) ChangeUserGroup(ctx context.Context, id uuid.UUID, publicGroup string, confirmed bool, expected string) (User, error) {
	databaseCode, ok := databaseGroupCode(publicGroup)
	if !confirmed || !ok || databaseCode == "visitor" {
		return User{}, ErrValidation
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return User{}, err
	}
	return changeUserGroup(ctx, tx, id, databaseCode, expected, service.key)
}

func (service *Service) ResetUserPassword(ctx context.Context, id uuid.UUID, password, confirmation string, confirmed bool) error {
	if !confirmed || password != confirmation || security.ValidatePassword(password) != nil {
		return ErrValidation
	}
	hash, err := security.HashPassword(password)
	if err != nil {
		return err
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = business.LockConfiguration(ctx, tx, false); err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `UPDATE wordweave.accounts SET password_hash=$2 WHERE id=$1 AND role='learner'`, id, hash)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrNotFound
	}
	if _, err := tx.Exec(ctx, `DELETE FROM wordweave.account_sessions WHERE account_id=$1`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (service *Service) Learning() *learning.Service { return service.learning }

type rowScanner interface{ Scan(...any) error }

func scanUser(row rowScanner) (User, error) {
	var user User
	var group, locale pgtype.Text
	err := row.Scan(&user.ID, &user.Username, &user.Role, &group, &user.Status, &locale, &user.CreatedAt)
	applyUserNullable(&user, group, locale)
	return user, err
}

func applyUserNullable(user *User, group, locale pgtype.Text) {
	if group.Valid {
		value := publicGroupCode(group.String)
		user.PlanCode = &value
	}
	if locale.Valid {
		value := locale.String
		user.UILocale = &value
	}
}

func publicGroupCode(databaseCode string) string {
	if databaseCode == "registered" {
		return "basic"
	}
	return databaseCode
}

func databaseGroupCode(publicCode string) (string, bool) {
	switch publicCode {
	case "visitor":
		return "visitor", true
	case "basic":
		return "registered", true
	case "pro", "plus":
		return publicCode, true
	default:
		return "", false
	}
}

func validModelFields(name string, description *string, providerID string) bool {
	return strings.TrimSpace(name) != "" && strings.TrimSpace(providerID) != "" &&
		utf8.RuneCountInString(strings.TrimSpace(name)) <= 200 &&
		utf8.RuneCountInString(strings.TrimSpace(providerID)) <= 500 &&
		(description == nil || strings.TrimSpace(*description) != "" && utf8.RuneCountInString(strings.TrimSpace(*description)) <= 1000)
}

func trimmedOptional(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	return &trimmed
}

func mapWriteError(err error) error {
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) && postgresError.Code == "23505" {
		return ErrConflict
	}
	return err
}

func hasDuplicateStrings(values []string) bool {
	seen := map[string]struct{}{}
	for _, value := range values {
		if _, ok := seen[value]; ok {
			return true
		}
		seen[value] = struct{}{}
	}
	return false
}

func hasDuplicateUUIDs(values []uuid.UUID) bool {
	seen := map[uuid.UUID]struct{}{}
	for _, value := range values {
		if value == uuid.Nil {
			return true
		}
		if _, ok := seen[value]; ok {
			return true
		}
		seen[value] = struct{}{}
	}
	return false
}
