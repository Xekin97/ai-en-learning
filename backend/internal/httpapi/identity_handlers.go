package httpapi

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"wordweave/internal/identity"
)

type actorDTO struct {
	Kind     string  `json:"kind"`
	Username *string `json:"username"`
	Role     *string `json:"role"`
	PlanCode *string `json:"plan_code"`
}

type bootstrapDTO struct {
	Actor              actorDTO `json:"actor"`
	UILocale           *string  `json:"ui_locale"`
	SupportedUILocales []string `json:"supported_ui_locales"`
	CSRFToken          string   `json:"csrf_token"`
}

type authDTO struct {
	Actor     actorDTO `json:"actor"`
	UILocale  *string  `json:"ui_locale"`
	CSRFToken string   `json:"csrf_token"`
}

func (server *Server) bootstrap(writer http.ResponseWriter, request *http.Request) {
	actor, _ := actorFromContext(request.Context())
	server.writeBootstrapProjection(writer, request, actor)
}

func (server *Server) register(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Username             string `json:"username"`
		Password             string `json:"password"`
		PasswordConfirmation string `json:"password_confirmation"`
		UILocale             string `json:"ui_locale"`
	}
	if !decodeOrProblem(writer, request, &body, 4096) {
		return
	}
	if !server.requireAuthRate(writer, request, "register", body.Username, 5, 12*time.Second) {
		return
	}
	actor, _ := actorFromContext(request.Context())
	registered, credential, err := server.identity.Register(request.Context(), actor, identity.RegisterInput{
		Username: body.Username, Password: body.Password,
		PasswordConfirmation: body.PasswordConfirmation, UILocale: body.UILocale,
	})
	if err != nil {
		server.writeIdentityProblem(writer, request, err, true)
		return
	}
	server.setSessionCookie(writer, credential)
	server.writeAuthProjection(writer, request, http.StatusCreated, registered)
}

func (server *Server) login(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		Username        string `json:"username"`
		Password        string `json:"password"`
		BrowserUILocale string `json:"browser_ui_locale"`
	}
	if !decodeOrProblem(writer, request, &body, 4096) {
		return
	}
	if !server.requireAuthRate(writer, request, "login", body.Username, 10, 6*time.Second) {
		return
	}
	actor, credential, err := server.identity.Login(request.Context(), identity.LoginInput{
		Username: body.Username, Password: body.Password, BrowserUILocale: body.BrowserUILocale,
	})
	if err != nil {
		server.writeIdentityProblem(writer, request, err, false)
		return
	}
	server.setSessionCookie(writer, credential)
	server.writeAuthProjection(writer, request, http.StatusOK, actor)
}

func (server *Server) logout(writer http.ResponseWriter, request *http.Request) {
	var body struct{}
	if !decodeOrProblem(writer, request, &body, 128) {
		return
	}
	actor, _ := actorFromContext(request.Context())
	if err := server.identity.Logout(request.Context(), actor); err != nil {
		server.writeIdentityProblem(writer, request, err, false)
		return
	}
	server.clearSessionCookie(writer)
	writeNoContent(writer)
}

func (server *Server) updateLocale(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		UILocale string `json:"ui_locale"`
	}
	if !decodeOrProblem(writer, request, &body, 256) {
		return
	}
	actor, _ := actorFromContext(request.Context())
	if err := server.identity.SetLocale(request.Context(), actor, body.UILocale); err != nil {
		server.writeIdentityProblem(writer, request, err, false)
		return
	}
	writeJSON(writer, request, http.StatusOK, struct {
		UILocale string `json:"ui_locale"`
	}{UILocale: body.UILocale})
}

func (server *Server) account(writer http.ResponseWriter, request *http.Request) {
	actor, _ := actorFromContext(request.Context())
	writeJSON(writer, request, http.StatusOK, struct {
		Username string  `json:"username"`
		PlanCode *string `json:"plan_code"`
		UILocale string  `json:"ui_locale"`
	}{Username: actor.Username, PlanCode: identity.PlanCode(actor.GroupCode), UILocale: dereference(actor.UILocale)})
}

func (server *Server) changePassword(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		CurrentPassword         string `json:"current_password"`
		NewPassword             string `json:"new_password"`
		NewPasswordConfirmation string `json:"new_password_confirmation"`
	}
	if !decodeOrProblem(writer, request, &body, 4096) {
		return
	}
	actor, _ := actorFromContext(request.Context())
	if !server.requireAuthRate(writer, request, "change-password", actor.ID.String(), 5, 12*time.Second) {
		return
	}
	if err := server.identity.ChangePassword(request.Context(), actor, identity.ChangePasswordInput{
		CurrentPassword: body.CurrentPassword, NewPassword: body.NewPassword,
		NewPasswordConfirmation: body.NewPasswordConfirmation,
	}); err != nil {
		server.writeIdentityProblem(writer, request, err, false)
		return
	}
	writeNoContent(writer)
}

func (server *Server) deleteAccount(writer http.ResponseWriter, request *http.Request) {
	var body struct {
		CurrentPassword string `json:"current_password"`
		Confirmed       bool   `json:"confirmed"`
	}
	if !decodeOrProblem(writer, request, &body, 2048) {
		return
	}
	actor, _ := actorFromContext(request.Context())
	if err := server.identity.DeleteAccount(request.Context(), actor, body.CurrentPassword, body.Confirmed); err != nil {
		server.writeIdentityProblem(writer, request, err, false)
		return
	}
	server.generation.Registry().CancelActor(actor)
	// Account deletion has already committed. Diagnostic cleanup cannot undo
	// it or change the successful user-facing response.
	if err := server.evidence.RevokeAccount(actor.ID.String()); err != nil {
		slog.Warn("generation_evidence_account_cleanup_failed")
	}
	server.clearSessionCookie(writer)
	writeNoContent(writer)
}

func (server *Server) writeBootstrapProjection(writer http.ResponseWriter, request *http.Request, actor identity.Actor) {
	csrf, err := server.csrf.Sign(actor.CSRFSubject(), server.identityNow())
	if err != nil {
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
		return
	}
	dto := actorDTO{Kind: actor.Kind}
	if actor.Kind == "account" {
		dto.Username = &actor.Username
		dto.Role = &actor.Role
		dto.PlanCode = identity.PlanCode(actor.GroupCode)
	}
	writeJSON(writer, request, http.StatusOK, bootstrapDTO{
		Actor: dto, UILocale: actor.UILocale,
		SupportedUILocales: []string{"zh-CN", "en-US"}, CSRFToken: csrf,
	})
}

func (server *Server) writeAuthProjection(writer http.ResponseWriter, request *http.Request, status int, actor identity.Actor) {
	csrf, err := server.csrf.Sign(actor.CSRFSubject(), server.identityNow())
	if err != nil {
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
		return
	}
	dto := actorDTO{Kind: actor.Kind}
	if actor.Kind == "account" {
		dto.Username = &actor.Username
		dto.Role = &actor.Role
		dto.PlanCode = identity.PlanCode(actor.GroupCode)
	}
	writeJSON(writer, request, status, authDTO{Actor: dto, UILocale: actor.UILocale, CSRFToken: csrf})
}

func (server *Server) writeIdentityProblem(writer http.ResponseWriter, request *http.Request, err error, registering bool) {
	switch {
	case errors.Is(err, identity.ErrAuthentication):
		writeProblem(writer, request, http.StatusUnauthorized, "invalid_credentials", "Sign in failed", "The username or password is incorrect.")
	case errors.Is(err, identity.ErrUnauthorized):
		writeProblem(writer, request, http.StatusUnauthorized, "authentication_required", "Sign in required", "Authentication is required for this operation.")
	case errors.Is(err, identity.ErrForbidden):
		writeProblem(writer, request, http.StatusForbidden, "forbidden", "Access denied", "This operation is not available for this account.")
	case errors.Is(err, identity.ErrUsernameTaken) && registering:
		writeProblem(writer, request, http.StatusConflict, "username_unavailable", "Username unavailable", "Choose a different username.", fieldError{Field: "username", Code: "unavailable"})
	case errors.Is(err, identity.ErrValidation):
		writeProblem(writer, request, http.StatusUnprocessableEntity, "validation_failed", "Request could not be accepted", "One or more fields need attention.")
	default:
		writeProblem(writer, request, http.StatusInternalServerError, "internal_error", "Internal error", "The request could not be completed.")
	}
}

func (server *Server) identityNow() time.Time { return time.Now() }

func dereference(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
