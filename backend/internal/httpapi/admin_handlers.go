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
)

type adminCredentialDTO struct {
	Configured bool    `json:"configured"`
	MaskedHint *string `json:"masked_hint"`
	UpdatedAt  *string `json:"updated_at"`
}

type adminModelDTO struct {
	ID                 string   `json:"id"`
	DisplayName        string   `json:"display_name"`
	Description        *string  `json:"description"`
	OpenRouterModelID  string   `json:"openrouter_model_id"`
	Enabled            bool     `json:"enabled"`
	AssignedGroupCodes []string `json:"assigned_group_codes"`
	CreatedAt          string   `json:"created_at"`
	UpdatedAt          string   `json:"updated_at"`
}

type adminGroupModelDTO struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	Enabled     bool   `json:"enabled"`
}

type adminGroupDTO struct {
	Code            string               `json:"code"`
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
		OpenRouterModelID: model.OpenRouterModelID, Enabled: model.Enabled, AssignedGroupCodes: groups,
		CreatedAt: model.CreatedAt.Format(time.RFC3339Nano), UpdatedAt: model.UpdatedAt.Format(time.RFC3339Nano),
	}
}

func mapAdminGroup(group admin.Group) adminGroupDTO {
	lengths := group.AllowedLengths
	if lengths == nil {
		lengths = []string{}
	}
	dto := adminGroupDTO{Code: group.Code, Rolling24hLimit: group.Rolling24hLimit, MaxEntries: group.MaxEntries, AllowedLengths: lengths, Models: make([]adminGroupModelDTO, 0, len(group.Models))}
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
	}
}

func (server *Server) adminCredential(writer http.ResponseWriter, request *http.Request) {
	status, err := server.admin.CredentialStatus(request.Context())
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, mapAdminCredential(status))
}

func (server *Server) adminPutCredential(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		APIKey    string `json:"api_key"`
		Confirmed bool   `json:"confirmed"`
	}
	if !decodeOrProblem(writer, request, &body, 16<<10) {
		return
	}
	actor, _ := actorFromContext(request.Context())
	status, err := server.admin.PutCredential(request.Context(), actor, body.APIKey, body.Confirmed)
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, mapAdminCredential(status))
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
	limit, err := queryLimit(request)
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	var cursor *admin.ModelCursor
	if raw := request.URL.Query().Get("cursor"); raw != "" {
		var decoded admin.ModelCursor
		if err := server.cursor.Decode("admin-models", raw, &decoded); err != nil {
			server.writeAdminProblem(writer, request, admin.ErrValidation)
			return
		}
		cursor = &decoded
	}
	items, hasMore, err := server.admin.ListModels(request.Context(), cursor, limit)
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
		value, err := server.cursor.Encode("admin-models", admin.ModelCursor{CreatedAt: last.CreatedAt, ID: last.ID})
		if err != nil {
			server.writeAdminProblem(writer, request, err)
			return
		}
		next = &value
	}
	writeListJSON(writer, request, struct {
		Items []adminModelDTO `json:"items"`
	}{Items: dtos}, next, hasMore)
}

func (server *Server) adminCreateModel(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		DisplayName       string  `json:"display_name"`
		Description       *string `json:"description"`
		OpenRouterModelID string  `json:"openrouter_model_id"`
	}
	if !decodeOrProblem(writer, request, &body, 16<<10) {
		return
	}
	model, err := server.admin.CreateModel(request.Context(), body.DisplayName, body.Description, body.OpenRouterModelID)
	server.writeAdminModelResult(writer, request, model, err, http.StatusCreated)
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

func (server *Server) adminPatchModel(writer http.ResponseWriter, request *http.Request) {
	modelID, ok := parseAdminUUID(writer, request, "model_id")
	if !ok {
		return
	}
	var body struct {
		DisplayName       optionalString `json:"display_name"`
		Description       optionalString `json:"description"`
		OpenRouterModelID optionalString `json:"openrouter_model_id"`
	}
	if !decodeOrProblem(writer, request, &body, 16<<10) {
		return
	}
	patch := admin.ModelPatch{DescriptionSet: body.Description.Set, Description: body.Description.Value}
	if body.DisplayName.Set {
		if body.DisplayName.Value == nil {
			server.writeAdminProblem(writer, request, admin.ErrValidation)
			return
		}
		patch.DisplayNameSet, patch.DisplayName = true, *body.DisplayName.Value
	}
	if body.OpenRouterModelID.Set {
		if body.OpenRouterModelID.Value == nil {
			server.writeAdminProblem(writer, request, admin.ErrValidation)
			return
		}
		patch.OpenRouterModelIDSet, patch.OpenRouterModelID = true, *body.OpenRouterModelID.Value
	}
	model, err := server.admin.PatchModel(request.Context(), modelID, patch)
	server.writeAdminModelResult(writer, request, model, err, http.StatusOK)
}

func (server *Server) adminEnableModel(writer http.ResponseWriter, request *http.Request) {
	server.adminSetModelEnabled(writer, request, true)
}

func (server *Server) adminDisableModel(writer http.ResponseWriter, request *http.Request) {
	server.adminSetModelEnabled(writer, request, false)
}

func (server *Server) adminSetModelEnabled(writer http.ResponseWriter, request *http.Request, enabled bool) {
	var body struct{}
	if !decodeOrProblem(writer, request, &body, 128) {
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
	model, err := server.admin.SetModelEnabled(request.Context(), modelID, enabled)
	server.writeAdminModelResult(writer, request, model, err, http.StatusOK)
}

func (server *Server) writeAdminModelResult(writer http.ResponseWriter, request *http.Request, model admin.Model, err error, status int) {
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, status, struct {
		Model adminModelDTO `json:"model"`
	}{Model: mapAdminModel(model)})
}

func (server *Server) adminListGroups(writer http.ResponseWriter, request *http.Request) {
	items, err := server.admin.ListGroups(request.Context())
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	dtos := make([]adminGroupDTO, 0, len(items))
	for _, item := range items {
		dtos = append(dtos, mapAdminGroup(item))
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Items []adminGroupDTO `json:"items"`
	}{Items: dtos})
}

func (server *Server) adminPutGroup(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Rolling24hLimit requiredNullableInt `json:"rolling_24h_limit"`
		MaxEntries      int                 `json:"max_entries"`
		AllowedLengths  requiredStrings     `json:"allowed_lengths"`
		ModelIDs        requiredUUIDs       `json:"model_ids"`
	}
	if !decodeOrProblem(writer, request, &body, 64<<10) {
		return
	}
	if !body.Rolling24hLimit.Set || !body.AllowedLengths.Set || !body.ModelIDs.Set {
		server.writeAdminProblem(writer, request, admin.ErrValidation)
		return
	}
	group, err := server.admin.PutGroup(request.Context(), chi.URLParam(request, "group_code"), body.Rolling24hLimit.Value, body.MaxEntries, body.AllowedLengths.Values, body.ModelIDs.Values)
	if err != nil {
		server.writeAdminProblem(writer, request, err)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		Group adminGroupDTO `json:"group"`
	}{Group: mapAdminGroup(group)})
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
	}
	if !decodeOrProblem(writer, request, &body, 1024) {
		return
	}
	user, err := server.admin.ChangeUserGroup(request.Context(), userID, body.GroupCode, body.Confirmed)
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
	switch {
	case errors.Is(err, admin.ErrNotFound):
		writeProblem(writer, request, http.StatusNotFound, "not_found", "Not found", "The requested resource could not be found.")
	case errors.Is(err, admin.ErrInvalidCursor):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "validation_failed", "Request could not be accepted", "One or more fields need attention.", fieldError{Field: "cursor", Code: "invalid"})
	case errors.Is(err, admin.ErrConflict):
		writeProblem(writer, request, http.StatusConflict, "conflict", "Resource conflict", "A resource with these values already exists.")
	case errors.Is(err, admin.ErrModelIncompatible):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "model_incompatible", "Model is not compatible", "The model could not complete the required structured streaming check.")
	case errors.Is(err, admin.ErrValidation):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "validation_failed", "Request could not be accepted", "One or more fields need attention.")
	case errors.Is(err, ai.ErrCredentialMissing):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "model_incompatible", "Model is not compatible", "OpenRouter is not configured.")
	case errors.As(err, &providerError):
		status := http.StatusBadGateway
		if providerError.Category == ai.FailureAuthentication || providerError.Category == ai.FailureAuthorization {
			status = http.StatusUnprocessableEntity
		}
		writeProblem(writer, request, status, "provider_unavailable", "Provider unavailable", "OpenRouter could not validate this configuration.")
	default:
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
	}
}
