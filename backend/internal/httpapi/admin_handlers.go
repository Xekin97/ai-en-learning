package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"wordweave/internal/admin"
	"wordweave/internal/ai"
	"wordweave/internal/learning"
	"wordweave/internal/platform/business"
)

type adminCredentialDTO struct {
	Configured bool    `json:"configured"`
	MaskedHint *string `json:"masked_hint"`
	UpdatedAt  *string `json:"updated_at"`
}

type adminModelDTO struct {
	ID                 string        `json:"id"`
	DisplayName        string        `json:"display_name"`
	Description        *string       `json:"description"`
	ProviderModelID    string        `json:"provider_model_id"`
	Enabled            bool          `json:"enabled"`
	RetiredAt          *time.Time    `json:"retired_at"`
	AssignedGroupCodes []string      `json:"assigned_group_codes"`
	Connection         ai.Connection `json:"connection"`
	MaxOutputTokens    *int          `json:"max_output_tokens"`
	OutputMode         string        `json:"output_mode"`
	CreatedAt          string        `json:"created_at"`
	UpdatedAt          string        `json:"updated_at"`
}

type adminGroupModelDTO struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	Enabled     bool   `json:"enabled"`
}

type adminGroupDTO struct {
	Code            string               `json:"code"`
	Priority        int                  `json:"priority"`
	Rolling24hLimit *int                 `json:"rolling_24h_limit"`
	MaxEntries      int                  `json:"max_entries"`
	AllowedLengths  []string             `json:"allowed_lengths"`
	Models          []adminGroupModelDTO `json:"models"`
}

type adminUserSummaryDTO struct {
	ID        string  `json:"id"`
	Username  string  `json:"username"`
	Role      string  `json:"role"`
	PlanCode  *string `json:"plan_code"`
	Status    string  `json:"status"`
	CreatedAt string  `json:"created_at"`
}

type adminUserDetailDTO struct {
	ID                 string                   `json:"id"`
	Username           string                   `json:"username"`
	Role               string                   `json:"role"`
	PlanCode           *string                  `json:"plan_code"`
	Status             string                   `json:"status"`
	UILocale           *string                  `json:"ui_locale"`
	CreatedAt          string                   `json:"created_at"`
	LearningBatchCount int                      `json:"learning_batch_count"`
	GenerationQuota    *adminGenerationQuotaDTO `json:"generation_quota"`
	Nickname           *string                  `json:"nickname"`
	Gender             *string                  `json:"gender"`
	LastLoginAt        *time.Time               `json:"last_login_at"`
	LastLearningAt     *time.Time               `json:"last_learning_at"`
	Growth             *admin.UserGrowth        `json:"growth"`
	BaseRevision       *string                  `json:"base_revision"`
	EffectivePlanCode  *string                  `json:"effective_plan_code"`
}

type adminGenerationQuotaDTO struct {
	Kind      string `json:"kind"`
	Remaining *int   `json:"remaining"`
}

func mapAdminCredential(status ai.CredentialStatus) adminCredentialDTO {
	return adminCredentialDTO{Configured: status.Configured, MaskedHint: status.MaskedHint, UpdatedAt: status.UpdatedAt}
}

func mapAdminModel(model admin.Model) adminModelDTO {
	groups := model.AssignedGroupCodes
	if groups == nil {
		groups = []string{}
	}
	return adminModelDTO{
		ID: model.ID.String(), DisplayName: model.DisplayName, Description: model.Description,
		ProviderModelID: model.ProviderModelID, Enabled: model.Enabled, AssignedGroupCodes: groups,
		RetiredAt: model.RetiredAt, Connection: model.Connection, MaxOutputTokens: model.MaxOutputTokens, OutputMode: model.OutputMode,
		CreatedAt: model.CreatedAt.Format(time.RFC3339Nano), UpdatedAt: model.UpdatedAt.Format(time.RFC3339Nano),
	}
}

func mapAdminGroup(group admin.Group) adminGroupDTO {
	lengths := group.AllowedLengths
	if lengths == nil {
		lengths = []string{}
	}
	dto := adminGroupDTO{Code: group.Code, Priority: group.Priority, Rolling24hLimit: group.Rolling24hLimit, MaxEntries: group.MaxEntries, AllowedLengths: lengths, Models: make([]adminGroupModelDTO, 0, len(group.Models))}
	for _, model := range group.Models {
		dto.Models = append(dto.Models, adminGroupModelDTO{ID: model.ID.String(), DisplayName: model.DisplayName, Enabled: model.Enabled})
	}
	return dto
}

func mapAdminUserSummary(user admin.User) adminUserSummaryDTO {
	return adminUserSummaryDTO{ID: user.ID.String(), Username: user.Username, Role: user.Role, PlanCode: user.PlanCode, Status: user.Status, CreatedAt: user.CreatedAt.Format(time.RFC3339Nano)}
}

func mapAdminUserDetail(user admin.User) adminUserDetailDTO {
	var quota *adminGenerationQuotaDTO
	if user.GenerationQuota != nil {
		quota = &adminGenerationQuotaDTO{Kind: user.GenerationQuota.Kind, Remaining: user.GenerationQuota.Remaining}
	}
	return adminUserDetailDTO{
		ID: user.ID.String(), Username: user.Username, Role: user.Role,
		PlanCode: user.PlanCode, Status: user.Status, UILocale: user.UILocale,
		CreatedAt:          user.CreatedAt.Format(time.RFC3339Nano),
		LearningBatchCount: user.LearningBatchCount, GenerationQuota: quota,
		Nickname: user.Nickname, Gender: user.Gender, LastLoginAt: user.LastLoginAt, LastLearningAt: user.LastLearningAt, Growth: user.Growth, BaseRevision: user.BaseRevision, EffectivePlanCode: user.EffectivePlanCode,
	}
}

func (server *Server) adminCredential(writer http.ResponseWriter, request *http.Request) {
	status, revision, err := server.admin.CredentialStatus(request.Context())
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Credential adminCredentialDTO `json:"credential"`
		Revision   string             `json:"revision"`
	}{mapAdminCredential(status), revision})
}

func (server *Server) adminPutCredential(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		APIKey    string `json:"api_key"`
		Confirmed bool   `json:"confirmed"`
		Expected  string `json:"expected_revision"`
	}
	if !decodeConfiguration(writer, request, &body) {
		return
	}
	actor, _ := actorFromContext(request.Context())
	status, revision, err := server.admin.PutCredential(request.Context(), actor, body.APIKey, body.Confirmed, body.Expected)
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Credential adminCredentialDTO `json:"credential"`
		Revision   string             `json:"revision"`
	}{mapAdminCredential(status), revision})
}

func queryLimit(request *http.Request) (int, error) {
	if raw := request.URL.Query().Get("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil {
			return 0, admin.ErrValidation
		}
		return limit, nil
	}
	return 20, nil
}

func (server *Server) adminListModels(writer http.ResponseWriter, request *http.Request) {
	actor, _ := actorFromContext(request.Context())
	status := request.URL.Query().Get("status")
	scope := "admin-models:" + actor.ID.String() + ":" + status
	limit, err := queryLimit(request)
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	var cursor *admin.ModelCursor
	if raw := request.URL.Query().Get("cursor"); raw != "" {
		var decoded admin.ModelCursor
		if err := server.cursor.Decode(scope, raw, &decoded); err != nil {
			server.writeAdminProblem(writer, request, admin.ErrValidation)
			return
		}
		cursor = &decoded
	}
	items, revision, hasMore, err := server.admin.ListModels(request.Context(), status, cursor, limit)
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	dtos := make([]adminModelDTO, 0, len(items))
	for _, item := range items {
		dtos = append(dtos, mapAdminModel(item))
	}
	var next *string
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		value, err := server.cursor.Encode(scope, admin.ModelCursor{CreatedAt: last.CreatedAt, ID: last.ID, Revision: revision})
		if err != nil {
			server.writeAdminProblem(writer, request, err)
			return
		}
		next = &value
	}
	writeListJSON(writer, request, struct {
		Items    []adminModelDTO `json:"items"`
		Revision string          `json:"revision"`
	}{Items: dtos, Revision: revision}, next, hasMore)
}

func (server *Server) adminGetModel(w http.ResponseWriter, r *http.Request) {
	id, ok := parseAdminUUID(w, r, "model_id")
	if !ok {
		return
	}
	model, err := server.admin.GetModel(r.Context(), id)
	server.writeAdminModelResult(w, r, model, err, http.StatusOK)
}

func (server *Server) adminCreateModel(w http.ResponseWriter, r *http.Request) {
	var body admin.ModelInput
	if !decodeOrProblem(w, r, &body, 32<<10) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	model, err := server.admin.SaveModel(r.Context(), actor.ID, uuid.Nil, body)
	server.writeAdminModelResult(w, r, model, err, http.StatusCreated)
}
func (server *Server) adminCreateModels(w http.ResponseWriter, r *http.Request) {
	var body admin.ModelBatchInput
	if !decodeOrProblem(w, r, &body, 256<<10) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	models, revision, err := server.admin.CreateModels(r.Context(), actor.ID, body)
	if err != nil {
		server.writeAdminProblem(w, r, err)
		return
	}
	items := make([]adminModelDTO, 0, len(models))
	for _, model := range models {
		items = append(items, mapAdminModel(model))
	}
	writeJSON(w, r, http.StatusCreated, struct {
		Items    []adminModelDTO `json:"items"`
		Revision string          `json:"revision"`
	}{items, revision})
}

func (server *Server) adminModelConnections(w http.ResponseWriter, r *http.Request) {
	items, err := server.admin.Connections(r.Context())
	if err != nil {
		server.writeAdminProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, struct {
		Items []ai.Connection `json:"items"`
	}{items})
}
func (server *Server) adminTestModelConnection(w http.ResponseWriter, r *http.Request) {
	var body admin.ModelInput
	if !decodeOrProblem(w, r, &body, 32<<10) {
		return
	}
	if err := server.admin.TestConnection(r.Context(), body); err != nil {
		server.writeAdminProblem(w, r, err)
		return
	}
	writeJSON(w, r, http.StatusOK, struct {
		OK bool `json:"ok"`
	}{true})
}

type optionalString struct {
	Set   bool
	Value *string
}

type requiredNullableInt struct {
	Set   bool
	Value *int
}

func (value *requiredNullableInt) UnmarshalJSON(raw []byte) error {
	value.Set = true
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		value.Value = nil
		return nil
	}
	var decoded int
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return err
	}
	value.Value = &decoded
	return nil
}

type requiredStrings struct {
	Set    bool
	Values []string
}

func (value *requiredStrings) UnmarshalJSON(raw []byte) error {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return errors.New("array cannot be null")
	}
	if err := json.Unmarshal(raw, &value.Values); err != nil {
		return err
	}
	value.Set = true
	return nil
}

type requiredUUIDs struct {
	Set    bool
	Values []uuid.UUID
}

func (value *requiredUUIDs) UnmarshalJSON(raw []byte) error {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return errors.New("array cannot be null")
	}
	if err := json.Unmarshal(raw, &value.Values); err != nil {
		return err
	}
	value.Set = true
	return nil
}

func (value *optionalString) UnmarshalJSON(raw []byte) error {
	value.Set = true
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		value.Value = nil
		return nil
	}
	var decoded string
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return err
	}
	value.Value = &decoded
	return nil
}

func (server *Server) adminPatchModel(w http.ResponseWriter, r *http.Request) {
	id, ok := parseAdminUUID(w, r, "model_id")
	if !ok {
		return
	}
	var body admin.ModelInput
	if !decodeOrProblem(w, r, &body, 32<<10) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	model, err := server.admin.SaveModel(r.Context(), actor.ID, id, body)
	server.writeAdminModelResult(w, r, model, err, http.StatusOK)
}

func (server *Server) adminEnableModel(writer http.ResponseWriter, request *http.Request) {
	server.adminSetModelEnabled(writer, request, true)
}

func (server *Server) adminDisableModel(writer http.ResponseWriter, request *http.Request) {
	server.adminSetModelEnabled(writer, request, false)
}

func (server *Server) adminSetModelEnabled(writer http.ResponseWriter, request *http.Request, enabled bool) {
	var body struct {
		Expected string `json:"expected_revision"`
	}
	if !decodeConfiguration(writer, request, &body) {
		return
	}
	modelID, ok := parseAdminUUID(writer, request, "model_id")
	if !ok {
		return
	}
	if enabled {
		// Enabling performs a real structured stream compatibility check. Like a
		// learner generation, it is governed by the request context and provider
		// terminal event rather than the ordinary JSON response write timeout.
		_ = http.NewResponseController(writer).SetWriteDeadline(time.Time{})
	}
	model, err := server.admin.SetModelEnabled(request.Context(), modelID, body.Expected, enabled)
	server.writeAdminModelResult(writer, request, model, err, http.StatusOK)
}

func (server *Server) writeAdminModelResult(writer http.ResponseWriter, request *http.Request, model admin.Model, err error, status int) {
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, status, struct {
		Model    adminModelDTO `json:"model"`
		Revision string        `json:"revision"`
	}{Model: mapAdminModel(model), Revision: model.Revision})
}

func (server *Server) adminListGroups(writer http.ResponseWriter, request *http.Request) {
	items, revision, err := server.admin.ListGroups(request.Context())
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	dtos := make([]adminGroupDTO, 0, len(items))
	for _, item := range items {
		dtos = append(dtos, mapAdminGroup(item))
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Items    []adminGroupDTO `json:"items"`
		Revision string          `json:"revision"`
	}{Items: dtos, Revision: revision})
}

func (server *Server) adminPutGroup(writer http.ResponseWriter, request *http.Request) {
	var body admin.GroupInput
	if !decodeConfiguration(writer, request, &body) {
		return
	}
	group, err := server.admin.PutGroup(request.Context(), chi.URLParam(request, "group_code"), body)
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Group    adminGroupDTO `json:"group"`
		Revision string        `json:"revision"`
	}{Group: mapAdminGroup(group), Revision: group.Revision})
}

func (server *Server) adminListUsers(writer http.ResponseWriter, request *http.Request) {
	limit, err := queryLimit(request)
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	query := strings.TrimSpace(request.URL.Query().Get("username"))
	normalizedQuery := admin.NormalizeUserQuery(query)
	actor, ok := actorFromContext(request.Context())
	if !ok || !actor.IsAdmin() {
		writeProblem(writer, request, http.StatusForbidden, "forbidden", "Access denied", "Administrator access is required.")
		return
	}
	scope := adminUserCursorScope(actor.ID, normalizedQuery)
	var cursor *admin.UserCursorV2
	if raw := request.URL.Query().Get("cursor"); raw != "" {
		var decoded admin.UserCursorV2
		if err := server.cursor.Decode(scope, raw, &decoded); err != nil || !admin.ValidUserCursor(normalizedQuery, decoded) {
			server.writeAdminProblem(writer, request, admin.ErrInvalidCursor)
			return
		}
		cursor = &decoded
	}
	items, hasMore, err := server.admin.ListUsers(request.Context(), normalizedQuery, cursor, limit)
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	dtos := make([]adminUserSummaryDTO, 0, len(items))
	for _, item := range items {
		dtos = append(dtos, mapAdminUserSummary(item))
	}
	var next *string
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		value, err := server.cursor.Encode(scope, admin.NewUserCursor(normalizedQuery, last))
		if err != nil {
			server.writeAdminProblem(writer, request, err)
			return
		}
		next = &value
	}
	writeListJSON(writer, request, struct {
		Items []adminUserSummaryDTO `json:"items"`
	}{Items: dtos}, next, hasMore)
}

func adminUserCursorScope(adminID uuid.UUID, normalizedQuery string) string {
	return "api-103:admin-users:v2:" + adminID.String() + ":" + normalizedQuery
}

func (server *Server) adminGetUser(writer http.ResponseWriter, request *http.Request) {
	userID, ok := parseAdminUUID(writer, request, "user_id")
	if !ok {
		return
	}
	user, err := server.admin.GetUser(request.Context(), userID)
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		User adminUserDetailDTO `json:"user"`
	}{User: mapAdminUserDetail(user)})
}

func (server *Server) adminChangeUserGroup(writer http.ResponseWriter, request *http.Request) {
	userID, ok := parseAdminUUID(writer, request, "user_id")
	if !ok {
		return
	}
	var body struct {
		GroupCode string `json:"group_code"`
		Confirmed bool   `json:"confirmed"`
		Expected  string `json:"expected_base_revision"`
	}
	if !decodeConfiguration(writer, request, &body) {
		return
	}
	user, err := server.admin.ChangeUserGroup(request.Context(), userID, body.GroupCode, body.Confirmed, body.Expected)
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		User       adminUserDetailDTO `json:"user"`
		QuotaReset bool               `json:"quota_reset"`
	}{User: mapAdminUserDetail(user), QuotaReset: true})
}

func (server *Server) adminResetUserPassword(writer http.ResponseWriter, request *http.Request) {
	userID, ok := parseAdminUUID(writer, request, "user_id")
	if !ok {
		return
	}
	var body struct {
		NewPassword             string `json:"new_password"`
		NewPasswordConfirmation string `json:"new_password_confirmation"`
		Confirmed               bool   `json:"confirmed"`
	}
	if !decodeOrProblem(writer, request, &body, 16<<10) {
		return
	}
	if !server.requireAuthRate(writer, request, "admin-reset-password", userID.String(), 10, 6*time.Second) {
		return
	}
	if err := server.admin.ResetUserPassword(request.Context(), userID, body.NewPassword, body.NewPasswordConfirmation, body.Confirmed); err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	writeNoContent(writer)
}

func (server *Server) adminListUserBatches(writer http.ResponseWriter, request *http.Request) {
	userID, ok := parseAdminUUID(writer, request, "user_id")
	if !ok {
		return
	}
	if err := server.admin.RequireUser(request.Context(), userID); err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	limit, err := queryLimit(request)
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	scope := "admin-user-batches:" + userID.String()
	var cursor *learning.BatchCursor
	if raw := request.URL.Query().Get("cursor"); raw != "" {
		var decoded learning.BatchCursor
		if err := server.cursor.Decode(scope, raw, &decoded); err != nil {
			server.writeAdminProblem(writer, request, admin.ErrValidation)
			return
		}
		cursor = &decoded
	}
	items, hasMore, err := server.admin.Learning().ListBatches(request.Context(), userID, nil, cursor, limit)
	if err != nil {
		server.writeLearningProblem(writer, request, err)
		return
	}
	dtos := make([]batchSummaryDTO, 0, len(items))
	for _, item := range items {
		dtos = append(dtos, mapBatchSummary(item))
	}
	var next *string
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		value, err := server.cursor.Encode(scope, learning.BatchCursor{SavedAt: last.SavedAt, ID: last.ID})
		if err != nil {
			server.writeAdminProblem(writer, request, err)
			return
		}
		next = &value
	}
	writeListJSON(writer, request, struct {
		Items []batchSummaryDTO `json:"items"`
	}{Items: dtos}, next, hasMore)
}

func (server *Server) adminGetUserBatch(writer http.ResponseWriter, request *http.Request) {
	userID, ok := parseAdminUUID(writer, request, "user_id")
	if !ok {
		return
	}
	batchID, ok := parseAdminUUID(writer, request, "batch_id")
	if !ok {
		return
	}
	if err := server.admin.RequireUser(request.Context(), userID); err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	detail, err := server.admin.Learning().BatchDetail(request.Context(), userID, batchID)
	if err != nil {
		server.writeLearningProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Batch batchDetailDTO `json:"batch"`
	}{Batch: mapBatchDetail(detail)})
}

func parseAdminUUID(writer http.ResponseWriter, request *http.Request, parameter string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(request, parameter))
	if err != nil {
		writeProblem(writer, request, http.StatusNotFound, "not_found", "Not found", "The requested resource could not be found.")
		return uuid.Nil, false
	}
	return id, true
}

func (server *Server) writeAdminProblem(writer http.ResponseWriter, request *http.Request, err error) {
	var providerError *ai.ProviderError
	var revision *business.RevisionConflict
	switch {
	case errors.Is(err, admin.ErrBasePlanChanged):
		writeProblem(writer, request, 409, "base_plan_changed", "Base plan changed", "Read the user's current base plan before making a new adjustment.")
	case errors.Is(err, admin.ErrDuplicatePriority):
		writeProblem(writer, request, 422, "duplicate_priority", "Priority is already used", "Choose distinct plan priorities.")
	case errors.Is(err, admin.ErrPreviewStale):
		writeProblem(writer, request, 409, "preview_stale", "Confirmation expired", "Preview the changes again.")
	case errors.Is(err, admin.ErrImpactChanged):
		writeProblem(writer, request, 409, "impact_changed", "Impact changed", "Preview the changes again.")
	case errors.As(err, &revision):
		writeProblemContext(writer, request, 409, "revision_conflict", "Configuration changed", "Refresh the current configuration.", map[string]string{"current_revision": revision.Current})
	case errors.Is(err, admin.ErrModelRetired):
		writeProblem(writer, request, 422, "model_retired", "Model is retired", "This model has been permanently removed.")
	case errors.Is(err, admin.ErrNotFound):
		writeProblem(writer, request, http.StatusNotFound, "not_found", "Not found", "The requested resource could not be found.")
	case errors.Is(err, admin.ErrInvalidCursor):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "validation_failed", "Request could not be accepted", "One or more fields need attention.", fieldError{Field: "cursor", Code: "invalid"})
	case errors.Is(err, admin.ErrConflict):
		writeProblem(writer, request, http.StatusConflict, "model_conflict", "Resource conflict", "A resource with these values already exists.")
	case errors.Is(err, admin.ErrModelIncompatible):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "model_incompatible", "Model is not compatible", "The model could not complete the required structured streaming check.")
	case errors.Is(err, admin.ErrValidation), errors.Is(err, ai.ErrConnectionInvalid):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "validation_failed", "Request could not be accepted", "One or more fields need attention.")
	case errors.Is(err, ai.ErrCredentialMissing):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "credential_missing", "API key required", "Enter an API key for this connection.")
	case errors.As(err, &providerError):
		status := http.StatusBadGateway
		code := "model_connection_unavailable"
		if providerError.Category == ai.FailureAuthentication || providerError.Category == ai.FailureAuthorization {
			status = http.StatusUnprocessableEntity
			code = "model_connection_auth"
		}
		if providerError.Category == ai.FailureProtocol {
			code = "model_connection_protocol"
		}
		if providerError.Category == ai.FailureRateLimited {
			status = http.StatusTooManyRequests
			code = "model_connection_rate_limited"
		}
		writeProblem(writer, request, status, code, "Connection test failed", "Check the model connection configuration and try again.")
	default:
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
	}
}
