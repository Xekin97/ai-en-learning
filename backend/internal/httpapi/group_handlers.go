package httpapi

import (
	"github.com/go-chi/chi/v5"
	"net/http"
	"wordweave/internal/admin"
)

func (server *Server) adminGroupImpact(w http.ResponseWriter, r *http.Request) {
	var body admin.GroupInput
	if !decodeConfiguration(w, r, &body) {
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
		Items    []adminGroupDTO `json:"items"`
		Revision string          `json:"revision"`
	}{dtos, revision})
}
