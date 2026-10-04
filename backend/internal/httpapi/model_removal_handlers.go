package httpapi

import (
	"net/http"
	"wordweave/internal/admin"
)

func (server *Server) adminModelRemovalImpact(w http.ResponseWriter, r *http.Request) {
	id, ok := parseAdminUUID(w, r, "model_id")
	if !ok {
		return
	}
	actor, _ := actorFromContext(r.Context())
	impact, err := server.admin.RemovalImpact(r.Context(), actor.ID.String()+":"+actor.SessionID.String(), id)
	if err != nil {
		server.writeAdminProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, struct {
		Model       adminModelDTO        `json:"model"`
		Groups      []admin.RemovalGroup `json:"affected_groups"`
		Presets     int                  `json:"affected_presets"`
		Definitions int                  `json:"affected_item_definitions"`
		Owned       int                  `json:"affected_owned_cards"`
		Token       string               `json:"confirmation_token"`
		Revision    string               `json:"revision"`
	}{mapAdminModel(impact.Model), impact.Groups, impact.Presets, impact.Definitions, impact.Owned, impact.Token, impact.Revision})
}
func (server *Server) adminRemoveModel(w http.ResponseWriter, r *http.Request) {
	id, ok := parseAdminUUID(w, r, "model_id")
	if !ok {
		return
	}
	var body struct {
		Expected  string `json:"expected_revision"`
		Token     string `json:"confirmation_token"`
		Confirmed bool   `json:"confirmed"`
	}
	if !decodeConfiguration(w, r, &body) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	model, groups, err := server.admin.RemoveModel(r.Context(), actor.ID.String()+":"+actor.SessionID.String(), id, body.Expected, body.Token, body.Confirmed)
	if err != nil {
		server.writeAdminProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, struct {
		Model    adminModelDTO `json:"model"`
		Groups   []string      `json:"affected_groups"`
		Revision string        `json:"revision"`
	}{mapAdminModel(model), groups, model.Revision})
}
