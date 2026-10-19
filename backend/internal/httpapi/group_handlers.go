package httpapi

import (
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"net/http"
	"wordweave/internal/admin"
	"wordweave/internal/entitlement"
)

type groupInputRequest struct {
	Expected             string                `json:"expected_revision"`
	Priority             int                   `json:"priority"`
	Limit                *int                  `json:"rolling_24h_limit" nullable:"true"`
	Maximum              int                   `json:"max_entries"`
	Lengths              []string              `json:"allowed_lengths"`
	Models               []uuid.UUID           `json:"model_ids"`
	ContentReviewEnabled *bool                 `json:"content_review_enabled"`
	ContentRepairLimit   *configurationInteger `json:"content_repair_limit"`
}

func decodeGroupInput(w http.ResponseWriter, r *http.Request, code string) (admin.GroupInput, bool) {
	var body groupInputRequest
	if !decodeConfiguration(w, r, &body) {
		return admin.GroupInput{}, false
	}
	if body.ContentReviewEnabled == nil || body.ContentRepairLimit == nil {
		writeProblem(w, r, http.StatusUnprocessableEntity, "validation_failed", "Request could not be accepted", "Content service fields are required.")
		return admin.GroupInput{}, false
	}
	repairLimit := int(*body.ContentRepairLimit)
	fields := make([]fieldError, 0, 2)
	if repairLimit < 0 || repairLimit > 99 || (!*body.ContentReviewEnabled && repairLimit != 0) || (*body.ContentReviewEnabled && repairLimit == 0) {
		fields = append(fields, fieldError{Field: "/content_repair_limit", Code: "out_of_range"})
	}
	if (code == "visitor" || code == "basic") && *body.ContentReviewEnabled {
		fields = append(fields, fieldError{Field: "/content_review_enabled", Code: "out_of_range"})
	}
	if len(fields) > 0 {
		writeProblem(w, r, http.StatusUnprocessableEntity, "validation_failed", "Request could not be accepted", "One or more fields need attention.", fields...)
		return admin.GroupInput{}, false
	}
	return admin.GroupInput{Expected: body.Expected, Priority: body.Priority, Limit: body.Limit, Maximum: body.Maximum, Lengths: body.Lengths, Models: body.Models, ContentReviewEnabled: *body.ContentReviewEnabled, ContentRepairLimit: repairLimit}, true
}

func (server *Server) adminGroupImpact(w http.ResponseWriter, r *http.Request) {
	body, ok := decodeGroupInput(w, r, chi.URLParam(r, "group_code"))
	if !ok {
		return
	}
	impact, err := server.admin.GroupImpact(r.Context(), chi.URLParam(r, "group_code"), body)
	if err != nil {
		server.writeAdminProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, impact)
}
func (server *Server) adminPriorityImpact(w http.ResponseWriter, r *http.Request) {
	var body admin.PrioritiesInput
	if !decodeConfiguration(w, r, &body) {
		return
	}
	impact, err := server.admin.PriorityImpact(r.Context(), body)
	if err != nil {
		server.writeAdminProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, impact)
}
func (server *Server) adminSavePriorities(w http.ResponseWriter, r *http.Request) {
	var body admin.PrioritiesInput
	if !decodeConfiguration(w, r, &body) {
		return
	}
	groups, revision, err := server.admin.SavePriorities(r.Context(), body)
	if err != nil {
		server.writeAdminProblem(w, r, err)
		return
	}
	dtos := make([]adminGroupDTO, 0, len(groups))
	for _, g := range groups {
		dtos = append(dtos, mapAdminGroup(g))
	}
	writeJSON(w, r, 200, struct {
		Items                  []adminGroupDTO          `json:"items"`
		Revision               string                   `json:"revision"`
		NativeCorrectionPolicy entitlement.NativePolicy `json:"native_correction_policy"`
	}{dtos, revision, entitlement.SystemNativePolicy()})
}
