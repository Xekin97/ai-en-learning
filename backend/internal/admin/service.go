package admin

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
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
	openrouter  *ai.OpenRouter
	learning    *learning.Service
}

func NewService(pool *pgxpool.Pool, credentials *ai.CredentialStore, openrouter *ai.OpenRouter, learningService *learning.Service) *Service {
	return &Service{pool: pool, credentials: credentials, openrouter: openrouter, learning: learningService}
}

func (service *Service) CredentialStatus(ctx context.Context) (ai.CredentialStatus, error) {
	return service.credentials.Status(ctx)
}

func (service *Service) PutCredential(ctx context.Context, actor identity.Actor, apiKey string, confirmed bool) (ai.CredentialStatus, error) {
	if !confirmed || strings.TrimSpace(apiKey) == "" {
		return ai.CredentialStatus{}, ErrValidation
	}
	if err := service.openrouter.ValidateAPIKey(ctx, apiKey); err != nil {
		return ai.CredentialStatus{}, err
	}
	if err := service.credentials.Put(ctx, actor.ID, apiKey); err != nil {
		return ai.CredentialStatus{}, err
	}
	return service.credentials.Status(ctx)
}

type Model struct {
	ID                 uuid.UUID
	DisplayName        string
	Description        *string
	OpenRouterModelID  string
	Enabled            bool
	AssignedGroupCodes []string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

type ModelCursor struct {
	CreatedAt time.Time `json:"created_at"`
	ID        uuid.UUID `json:"id"`
}

func (service *Service) ListModels(ctx context.Context, cursor *ModelCursor, limit int) ([]Model, bool, error) {
	if limit < 1 || limit > 100 {
		return nil, false, ErrValidation
	}
	var cursorTime any
	var cursorID any
	if cursor != nil {
		cursorTime, cursorID = cursor.CreatedAt, cursor.ID
	}
	rows, err := service.pool.Query(ctx, `
		SELECT model.id,model.display_name,model.description,model.provider_model_id,
			model.enabled,model.created_at,model.updated_at,
			coalesce(array_agg(assignment.group_code ORDER BY CASE assignment.group_code
				WHEN 'visitor' THEN 1 WHEN 'registered' THEN 2 WHEN 'pro' THEN 3 WHEN 'plus' THEN 4 END)
				FILTER (WHERE assignment.group_code IS NOT NULL),ARRAY[]::text[])
		FROM wordweave.ai_models model
		LEFT JOIN wordweave.group_models assignment ON assignment.model_id=model.id
		WHERE ($1::timestamptz IS NULL OR (model.created_at,model.id)>($1,$2))
		GROUP BY model.id ORDER BY model.created_at,model.id LIMIT $3`, cursorTime, cursorID, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	items := make([]Model, 0, limit+1)
	for rows.Next() {
		var item Model
		var description pgtype.Text
		var groups []string
		if err := rows.Scan(&item.ID, &item.DisplayName, &description, &item.OpenRouterModelID,
			&item.Enabled, &item.CreatedAt, &item.UpdatedAt, &groups); err != nil {
			return nil, false, err
		}
		if description.Valid {
			value := description.String
			item.Description = &value
		}
		for _, group := range groups {
			item.AssignedGroupCodes = append(item.AssignedGroupCodes, publicGroupCode(group))
		}
		items = append(items, item)
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	return items, hasMore, rows.Err()
}

func (service *Service) CreateModel(ctx context.Context, displayName string, description *string, providerModelID string) (Model, error) {
	if !validModelFields(displayName, description, providerModelID) {
		return Model{}, ErrValidation
	}
	description = trimmedOptional(description)
	var id uuid.UUID
	err := service.pool.QueryRow(ctx, `
		INSERT INTO wordweave.ai_models(display_name,description,provider_model_id,enabled)
		VALUES ($1,$2,$3,false) RETURNING id`, strings.TrimSpace(displayName), description, strings.TrimSpace(providerModelID)).Scan(&id)
	if err != nil {
		return Model{}, mapWriteError(err)
	}
	return service.GetModel(ctx, id)
}

type ModelPatch struct {
	DisplayNameSet       bool
	DisplayName          string
	DescriptionSet       bool
	Description          *string
	OpenRouterModelIDSet bool
	OpenRouterModelID    string
}

func (service *Service) PatchModel(ctx context.Context, id uuid.UUID, patch ModelPatch) (Model, error) {
	if !patch.DisplayNameSet && !patch.DescriptionSet && !patch.OpenRouterModelIDSet {
		return Model{}, ErrValidation
	}
	if (patch.DisplayNameSet && strings.TrimSpace(patch.DisplayName) == "") ||
		(patch.DescriptionSet && patch.Description != nil && strings.TrimSpace(*patch.Description) == "") ||
		(patch.OpenRouterModelIDSet && strings.TrimSpace(patch.OpenRouterModelID) == "") {
		return Model{}, ErrValidation
	}
	if patch.DescriptionSet {
		patch.Description = trimmedOptional(patch.Description)
	}
	if (patch.DisplayNameSet && utf8.RuneCountInString(strings.TrimSpace(patch.DisplayName)) > 200) ||
		(patch.DescriptionSet && patch.Description != nil && utf8.RuneCountInString(*patch.Description) > 1000) ||
		(patch.OpenRouterModelIDSet && utf8.RuneCountInString(strings.TrimSpace(patch.OpenRouterModelID)) > 500) {
		return Model{}, ErrValidation
	}
	result, err := service.pool.Exec(ctx, `
		UPDATE wordweave.ai_models SET
			display_name=CASE WHEN $2 THEN $3 ELSE display_name END,
			description=CASE WHEN $4 THEN $5 ELSE description END,
			provider_model_id=CASE WHEN $6 THEN $7 ELSE provider_model_id END,
			enabled=CASE WHEN $6 THEN false ELSE enabled END
		WHERE id=$1`, id, patch.DisplayNameSet, strings.TrimSpace(patch.DisplayName),
		patch.DescriptionSet, patch.Description, patch.OpenRouterModelIDSet, strings.TrimSpace(patch.OpenRouterModelID))
	if err != nil {
		return Model{}, mapWriteError(err)
	}
	if result.RowsAffected() != 1 {
		return Model{}, ErrNotFound
	}
	return service.GetModel(ctx, id)
}

func (service *Service) SetModelEnabled(ctx context.Context, id uuid.UUID, enabled bool) (Model, error) {
	model, err := service.GetModel(ctx, id)
	if err != nil {
		return Model{}, err
	}
	if enabled {
		if err := service.openrouter.CheckCompatibility(ctx, model.OpenRouterModelID); err != nil {
			slog.WarnContext(ctx, "ai_model_compatibility_failed",
				"model_id", id.String(),
				"prompt_version", ai.PromptVersion,
				"validator_version", ai.ValidatorVersion,
				"reason", err.Error(),
			)
			_, _ = service.pool.Exec(ctx, `UPDATE wordweave.ai_models SET enabled=false WHERE id=$1`, id)
			return Model{}, fmt.Errorf("%w: %v", ErrModelIncompatible, err)
		}
	}
	if _, err := service.pool.Exec(ctx, `UPDATE wordweave.ai_models SET enabled=$2 WHERE id=$1`, id, enabled); err != nil {
		return Model{}, err
	}
	return service.GetModel(ctx, id)
}

func (service *Service) GetModel(ctx context.Context, id uuid.UUID) (Model, error) {
	var item Model
	var description pgtype.Text
	var groups []string
	err := service.pool.QueryRow(ctx, `
		SELECT model.id,model.display_name,model.description,model.provider_model_id,
			model.enabled,model.created_at,model.updated_at,
			coalesce(array_agg(assignment.group_code ORDER BY CASE assignment.group_code
				WHEN 'visitor' THEN 1 WHEN 'registered' THEN 2 WHEN 'pro' THEN 3 WHEN 'plus' THEN 4 END)
				FILTER (WHERE assignment.group_code IS NOT NULL),ARRAY[]::text[])
		FROM wordweave.ai_models model
		LEFT JOIN wordweave.group_models assignment ON assignment.model_id=model.id
		WHERE model.id=$1 GROUP BY model.id`, id).Scan(
		&item.ID, &item.DisplayName, &description, &item.OpenRouterModelID,
		&item.Enabled, &item.CreatedAt, &item.UpdatedAt, &groups,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Model{}, ErrNotFound
	}
	if err != nil {
		return Model{}, err
	}
	if description.Valid {
		value := description.String
		item.Description = &value
	}
	for _, group := range groups {
		item.AssignedGroupCodes = append(item.AssignedGroupCodes, publicGroupCode(group))
	}
	return item, nil
}

type GroupModel struct {
	ID          uuid.UUID
	DisplayName string
	Enabled     bool
}

type Group struct {
	Code            string
	Rolling24hLimit *int
	MaxEntries      int
	AllowedLengths  []string
	Models          []GroupModel
}

func (service *Service) ListGroups(ctx context.Context) ([]Group, error) {
	groups := make([]Group, 0, 4)
	for _, code := range []string{"visitor", "basic", "pro", "plus"} {
		group, err := service.GetGroup(ctx, code)
		if err != nil {
			return nil, err
		}
		groups = append(groups, group)
	}
	return groups, nil
}

func (service *Service) GetGroup(ctx context.Context, publicCode string) (Group, error) {
	databaseCode, ok := databaseGroupCode(publicCode)
	if !ok {
		return Group{}, ErrNotFound
	}
	var limit pgtype.Int4
	var maxEntries int
	if err := service.pool.QueryRow(ctx, `
		SELECT rolling_quota_limit,max_entries_per_run FROM wordweave.entitlement_groups WHERE code=$1`, databaseCode).Scan(&limit, &maxEntries); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Group{}, ErrNotFound
		}
		return Group{}, err
	}
	group := Group{Code: publicCode, MaxEntries: maxEntries}
	if limit.Valid {
		value := int(limit.Int32)
		group.Rolling24hLimit = &value
	}
	lengthRows, err := service.pool.Query(ctx, `
		SELECT length_code FROM wordweave.group_lengths WHERE group_code=$1
		ORDER BY CASE length_code WHEN 'short' THEN 1 WHEN 'medium' THEN 2 WHEN 'long' THEN 3 WHEN 'xlong' THEN 4 END`, databaseCode)
	if err != nil {
		return Group{}, err
	}
	for lengthRows.Next() {
		var length string
		if err := lengthRows.Scan(&length); err != nil {
			lengthRows.Close()
			return Group{}, err
		}
		group.AllowedLengths = append(group.AllowedLengths, length)
	}
	if err := lengthRows.Err(); err != nil {
		lengthRows.Close()
		return Group{}, err
	}
	lengthRows.Close()
	modelRows, err := service.pool.Query(ctx, `
		SELECT model.id,model.display_name,model.enabled
		FROM wordweave.group_models assignment JOIN wordweave.ai_models model ON model.id=assignment.model_id
		WHERE assignment.group_code=$1 ORDER BY lower(model.display_name),model.id`, databaseCode)
	if err != nil {
		return Group{}, err
	}
	for modelRows.Next() {
		var model GroupModel
		if err := modelRows.Scan(&model.ID, &model.DisplayName, &model.Enabled); err != nil {
			modelRows.Close()
			return Group{}, err
		}
		group.Models = append(group.Models, model)
	}
	if err := modelRows.Err(); err != nil {
		modelRows.Close()
		return Group{}, err
	}
	modelRows.Close()
	return group, nil
}

func (service *Service) PutGroup(ctx context.Context, publicCode string, rollingLimit *int, maxEntries int, lengths []string, modelIDs []uuid.UUID) (Group, error) {
	databaseCode, ok := databaseGroupCode(publicCode)
	if !ok {
		return Group{}, ErrNotFound
	}
	if maxEntries <= 0 || rollingLimit != nil && *rollingLimit < 0 || hasDuplicateStrings(lengths) || hasDuplicateUUIDs(modelIDs) {
		return Group{}, ErrValidation
	}
	for _, length := range lengths {
		if length != "short" && length != "medium" && length != "long" && length != "xlong" {
			return Group{}, ErrValidation
		}
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Group{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(ctx, `UPDATE wordweave.entitlement_groups SET rolling_quota_limit=$2,max_entries_per_run=$3 WHERE code=$1`, databaseCode, rollingLimit, maxEntries)
	if err != nil {
		return Group{}, err
	}
	if result.RowsAffected() != 1 {
		return Group{}, ErrNotFound
	}
	if _, err := tx.Exec(ctx, `DELETE FROM wordweave.group_lengths WHERE group_code=$1`, databaseCode); err != nil {
		return Group{}, err
	}
	for _, length := range lengths {
		if _, err := tx.Exec(ctx, `INSERT INTO wordweave.group_lengths(group_code,length_code) VALUES ($1,$2)`, databaseCode, length); err != nil {
			return Group{}, err
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM wordweave.group_models WHERE group_code=$1`, databaseCode); err != nil {
		return Group{}, err
	}
	for _, modelID := range modelIDs {
		if _, err := tx.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES ($1,$2)`, databaseCode, modelID); err != nil {
			var postgresError *pgconn.PgError
			if errors.As(err, &postgresError) && postgresError.Code == "23503" {
				return Group{}, ErrValidation
			}
			return Group{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Group{}, err
	}
	return service.GetGroup(ctx, publicCode)
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
	return getUser(ctx, service.pool, id)
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

func (service *Service) ChangeUserGroup(ctx context.Context, id uuid.UUID, publicGroup string, confirmed bool) (User, error) {
	databaseCode, ok := databaseGroupCode(publicGroup)
	if !confirmed || !ok || databaseCode == "visitor" {
		return User{}, ErrValidation
	}
	tx, err := service.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return User{}, err
	}
	return changeUserGroup(ctx, tx, id, databaseCode)
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
