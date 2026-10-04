package httpapi

import (
	"net/http"

	"github.com/google/uuid"
	"wordweave/internal/admin"
	"wordweave/internal/ai"
)

type modelProviderDTO struct {
	Connection ai.Connection   `json:"connection"`
	Models     []adminModelDTO `json:"models"`
}

func mapModelProvider(p admin.ModelProvider) modelProviderDTO {
	dto := modelProviderDTO{Connection: p.Connection, Models: make([]adminModelDTO, 0, len(p.Models))}
	for _, m := range p.Models {
		dto.Models = append(dto.Models, mapAdminModel(m))
	}
	return dto
}
func (server *Server) adminModelProviders(w http.ResponseWriter, r *http.Request) {
	providers, revision, err := server.admin.ModelProviders(r.Context())
	if err != nil {
		server.writeAdminProblem(w, r, err)
		return
	}
	items := make([]modelProviderDTO, 0, len(providers))
	for _, p := range providers {
		items = append(items, mapModelProvider(p))
	}
	writeJSON(w, r, http.StatusOK, struct {
		Items    []modelProviderDTO `json:"items"`
		Revision string             `json:"revision"`
	}{items, revision})
}
func (server *Server) adminSaveModelProvider(w http.ResponseWriter, r *http.Request) {
	id := uuid.Nil
	status := http.StatusCreated
	if r.Method == http.MethodPatch {
		var ok bool
		id, ok = parseAdminUUID(w, r, "provider_id")
		if !ok {
			return
		}
		status = http.StatusOK
	}
	var body admin.ModelProviderInput
	if !decodeOrProblem(w, r, &body, 2<<20) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	p, revision, err := server.admin.SaveProvider(r.Context(), actor.ID, id, body)
	if err != nil {
		server.writeAdminProblem(w, r, err)
		return
	}
	writeJSON(w, r, status, struct {
		Provider modelProviderDTO `json:"provider"`
		Revision string           `json:"revision"`
	}{mapModelProvider(p), revision})
}
