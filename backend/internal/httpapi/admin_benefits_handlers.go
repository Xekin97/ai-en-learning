package httpapi

import "net/http"

func (server *Server) adminUserBenefits(w http.ResponseWriter, r *http.Request) {
	id, ok := parseAdminUUID(w, r, "user_id")
	if !ok {
		return
	}
	out, err := server.admin.Benefits(r.Context(), id)
	if err != nil {
		server.writeAdminProblem(w, r, err)
		return
	}
	writeJSON(w, r, 200, out)
}
