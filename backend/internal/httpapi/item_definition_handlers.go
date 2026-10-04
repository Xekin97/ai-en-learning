package httpapi

import (
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"net/http"
	"strconv"
	"strings"
	"wordweave/internal/growth"
)

func growthID(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		writeProblem(w, r, 404, "not_found", "Not found", "The requested resource could not be found.")
		return uuid.Nil, false
	}
	return id, true
}
func listLimit(w http.ResponseWriter, r *http.Request) (int, bool) {
	limit := 20
	if value := r.URL.Query().Get("limit"); value != "" {
		var err error
		limit, err = strconv.Atoi(value)
		if err != nil || limit < 1 || limit > 100 {
			writeProblem(w, r, 422, "validation_failed", "Request could not be accepted", "The page size is invalid.", fieldError{"/limit", "out_of_range"})
			return 0, false
		}
	}
	return limit, true
}
func (server *Server) adminListItemDefinitions(w http.ResponseWriter, r *http.Request) {
	limit, ok := listLimit(w, r)
	if !ok {
		return
	}
	actor, _ := actorFromContext(r.Context())
	filter := growth.DefinitionFilter{Query: strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q"))), Kind: r.URL.Query().Get("kind")}
	listed := ""
	if values, exists := r.URL.Query()["listed"]; exists {
		if len(values) != 1 || (values[0] != "true" && values[0] != "false") {
			server.writeGrowthProblem(w, r, &growth.ValidationError{Fields: []growth.FieldError{{Field: "/listed", Code: "out_of_range"}}})
			return
		}
		listed = values[0]
		value := listed == "true"
		filter.Listed = &value
	}
	scope := "item-definitions:" + actor.ID.String() + ":" + strconv.Quote(filter.Query) + ":" + filter.Kind + ":" + listed
	var cursor *growth.DefinitionCursor
	if token := r.URL.Query().Get("cursor"); token != "" {
		var decoded growth.DefinitionCursor
		if err := server.cursor.Decode(scope, token, &decoded); err != nil {
			server.writeGrowthProblem(w, r, &growth.ValidationError{Fields: []growth.FieldError{{Field: "/cursor", Code: "invalid"}}})
			return
		}
		cursor = &decoded
	}
	items, revision, more, err := server.growth.ListDefinitions(r.Context(), filter, cursor, limit)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	var next *string
	if more {
		last := items[len(items)-1]
		token, err := server.cursor.Encode(scope, growth.DefinitionCursor{At: last.CreatedAt, ID: last.ID, Revision: revision})
		if err != nil {
			server.writeGrowthProblem(w, r, err)
			return
		}
		next = &token
	}
	writeListJSON(w, r, struct {
		Items    []growth.ItemConfig `json:"items"`
		Revision string              `json:"revision"`
	}{items, revision}, next, more)
}
func (server *Server) adminGetItemDefinition(w http.ResponseWriter, r *http.Request) {
	id, ok := growthID(w, r, "item_id")
	if !ok {
		return
	}
	item, rev, err := server.growth.Definition(r.Context(), id)
	server.writeItemDefinition(w, r, 200, item, rev, err)
}
func (server *Server) writeItemDefinition(w http.ResponseWriter, r *http.Request, status int, item growth.ItemConfig, rev string, err error) {
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeJSON(w, r, status, struct {
		Item     growth.ItemConfig `json:"item"`
		Revision string            `json:"revision"`
	}{item, rev})
}
func (server *Server) adminCreateItemDefinition(w http.ResponseWriter, r *http.Request) {
	var input growth.ItemInput
	if !decodeConfiguration(w, r, &input) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	item, rev, err := server.growth.SaveDefinition(r.Context(), actor.ID, uuid.Nil, "", input)
	server.writeItemDefinition(w, r, 201, item, rev, err)
}
func (server *Server) adminUpdateItemDefinition(w http.ResponseWriter, r *http.Request) {
	id, ok := growthID(w, r, "item_id")
	if !ok {
		return
	}
	var input struct {
		growth.ItemInput
		Expected string `json:"expected_revision"`
	}
	if !decodeConfiguration(w, r, &input) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	item, rev, err := server.growth.SaveDefinition(r.Context(), actor.ID, id, input.Expected, input.ItemInput)
	server.writeItemDefinition(w, r, 200, item, rev, err)
}
func (server *Server) adminSetItemListing(w http.ResponseWriter, r *http.Request) {
	id, ok := growthID(w, r, "item_id")
	if !ok {
		return
	}
	var body struct {
		Listed   bool   `json:"listed"`
		Expected string `json:"expected_revision"`
	}
	if !decodeConfiguration(w, r, &body) {
		return
	}
	actor, _ := actorFromContext(r.Context())
	item, rev, err := server.growth.SetDefinitionListing(r.Context(), actor.ID, id, body.Expected, body.Listed)
	server.writeItemDefinition(w, r, 200, item, rev, err)
}
func (server *Server) adminDeleteItemDefinition(w http.ResponseWriter, r *http.Request) {
	id, ok := growthID(w, r, "item_id")
	if !ok {
		return
	}
	var body struct {
		Expected  string `json:"expected_revision"`
		Confirmed bool   `json:"confirmed"`
	}
	if !decodeConfiguration(w, r, &body) {
		return
	}
	if err := server.growth.DeleteDefinition(r.Context(), id, body.Expected, body.Confirmed); err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	writeNoContent(w)
}
func (server *Server) adminItemReferences(w http.ResponseWriter, r *http.Request) {
	id, ok := growthID(w, r, "item_id")
	if !ok {
		return
	}
	limit, ok := listLimit(w, r)
	if !ok {
		return
	}
	actor, _ := actorFromContext(r.Context())
	locale := "zh-CN"
	if actor.UILocale != nil {
		locale = *actor.UILocale
	}
	scope := "item-references:" + actor.ID.String() + ":" + id.String() + ":" + locale
	var cursor *growth.ReferenceCursor
	if token := r.URL.Query().Get("cursor"); token != "" {
		var decoded growth.ReferenceCursor
		if err := server.cursor.Decode(scope, token, &decoded); err != nil {
			server.writeGrowthProblem(w, r, &growth.ValidationError{Fields: []growth.FieldError{{Field: "/cursor", Code: "invalid"}}})
			return
		}
		cursor = &decoded
	}
	issued, items, more, err := server.growth.DefinitionReferences(r.Context(), id, locale, cursor, limit)
	if err != nil {
		server.writeGrowthProblem(w, r, err)
		return
	}
	var next *string
	if more {
		last := items[len(items)-1]
		token, err := server.cursor.Encode(scope, growth.ReferenceCursor{Kind: last.Kind, ID: last.ID})
		if err != nil {
			server.writeGrowthProblem(w, r, err)
			return
		}
		next = &token
	}
	writeListJSON(w, r, struct {
		EverIssued bool                   `json:"ever_issued"`
		Items      []growth.ItemReference `json:"items"`
	}{issued, items}, next, more)
}
