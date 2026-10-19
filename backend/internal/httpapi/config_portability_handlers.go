package httpapi

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"wordweave/internal/portability"
)

const portabilityRequestLimit = 12 << 20
const portabilityResponseLimit = 12 << 20

type portabilityKDFGate struct {
	sem        chan struct{}
	mu         sync.Mutex
	admissions map[uuid.UUID][]time.Time
}

func newPortabilityKDFGate() *portabilityKDFGate {
	return &portabilityKDFGate{sem: make(chan struct{}, 2), admissions: map[uuid.UUID][]time.Time{}}
}
func (g *portabilityKDFGate) acquire(actor uuid.UUID, now time.Time) bool {
	g.mu.Lock()
	rows := g.admissions[actor][:0]
	for _, at := range g.admissions[actor] {
		if now.Sub(at) < time.Minute {
			rows = append(rows, at)
		}
	}
	if len(rows) >= 10 {
		g.admissions[actor] = rows
		g.mu.Unlock()
		return false
	}
	select {
	case g.sem <- struct{}{}:
		rows = append(rows, now)
		g.admissions[actor] = rows
		g.mu.Unlock()
		return true
	default:
		g.admissions[actor] = rows
		g.mu.Unlock()
		return false
	}
}
func (g *portabilityKDFGate) release() { <-g.sem }

type portabilityExportRequest struct {
	IncludeCredentials     *bool   `json:"include_credentials"`
	Passphrase             *string `json:"passphrase,omitempty"`
	PassphraseConfirmation *string `json:"passphrase_confirmation,omitempty"`
	passphraseSet          bool
	confirmationSet        bool
}
type portabilityFileRequest struct {
	FileBase64    string  `json:"file_base64"`
	Passphrase    *string `json:"passphrase,omitempty"`
	passphraseSet bool
}
type portabilityImportRequest struct {
	FileBase64    string    `json:"file_base64"`
	PreviewToken  string    `json:"preview_token"`
	OperationID   uuid.UUID `json:"operation_id"`
	Confirmed     *bool     `json:"confirmed"`
	Passphrase    *string   `json:"passphrase,omitempty"`
	passphraseSet bool
}
type portabilityResolveRequest struct {
	PreviewToken string `json:"preview_token"`
}

func exactPortabilityRequest(raw []byte, allowed ...string) (map[string]json.RawMessage, error) {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil || object == nil {
		return nil, errors.New("request must be an object")
	}
	keys := make(map[string]bool, len(allowed))
	for _, key := range allowed {
		keys[key] = true
	}
	for key := range object {
		if !keys[key] {
			return nil, errors.New("unknown request field")
		}
	}
	return object, nil
}

func requiredPortabilityValue(object map[string]json.RawMessage, key string, target any) error {
	raw, ok := object[key]
	if !ok || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return errors.New("required request field is missing or null")
	}
	return json.Unmarshal(raw, target)
}

func optionalPortabilityString(object map[string]json.RawMessage, key string) (*string, bool, error) {
	raw, ok := object[key]
	if !ok {
		return nil, false, nil
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, true, errors.New("optional request field cannot be null")
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, true, err
	}
	return &value, true, nil
}

func (in *portabilityExportRequest) UnmarshalJSON(raw []byte) error {
	object, err := exactPortabilityRequest(raw, "include_credentials", "passphrase", "passphrase_confirmation")
	if err != nil {
		return err
	}
	var include bool
	if err = requiredPortabilityValue(object, "include_credentials", &include); err != nil {
		return err
	}
	in.IncludeCredentials = &include
	if in.Passphrase, in.passphraseSet, err = optionalPortabilityString(object, "passphrase"); err != nil {
		return err
	}
	in.PassphraseConfirmation, in.confirmationSet, err = optionalPortabilityString(object, "passphrase_confirmation")
	return err
}

func (in *portabilityFileRequest) UnmarshalJSON(raw []byte) error {
	object, err := exactPortabilityRequest(raw, "file_base64", "passphrase")
	if err != nil {
		return err
	}
	if err = requiredPortabilityValue(object, "file_base64", &in.FileBase64); err != nil {
		return err
	}
	in.Passphrase, in.passphraseSet, err = optionalPortabilityString(object, "passphrase")
	return err
}

func (in *portabilityImportRequest) UnmarshalJSON(raw []byte) error {
	object, err := exactPortabilityRequest(raw, "file_base64", "preview_token", "operation_id", "confirmed", "passphrase")
	if err != nil {
		return err
	}
	for _, field := range []struct {
		key    string
		target any
	}{{"file_base64", &in.FileBase64}, {"preview_token", &in.PreviewToken}, {"operation_id", &in.OperationID}, {"confirmed", &in.Confirmed}} {
		if err = requiredPortabilityValue(object, field.key, field.target); err != nil {
			return err
		}
	}
	in.Passphrase, in.passphraseSet, err = optionalPortabilityString(object, "passphrase")
	return err
}

func (in *portabilityResolveRequest) UnmarshalJSON(raw []byte) error {
	object, err := exactPortabilityRequest(raw, "preview_token")
	if err != nil {
		return err
	}
	return requiredPortabilityValue(object, "preview_token", &in.PreviewToken)
}

func portabilityCategory(request *http.Request) (portability.Category, bool) {
	return portability.ParseCategory(chi.URLParam(request, "category"))
}

func (server *Server) adminConfigPortabilityCurrent(writer http.ResponseWriter, request *http.Request) {
	category, ok := portabilityCategory(request)
	if !ok {
		writeProblem(writer, request, 404, "not_found", "Not found", "The configuration category does not exist.")
		return
	}
	actor, _ := actorFromContext(request.Context())
	current, err := server.portability.Current(request.Context(), portability.Principal{ID: actor.ID, SessionID: actor.SessionID}, category)
	if err != nil {
		server.writePortabilityError(writer, request, err)
		return
	}
	server.writeBoundedPortabilityJSON(writer, request, current, "response_too_large")
}

func (server *Server) adminConfigPortabilityExport(writer http.ResponseWriter, request *http.Request) {
	category, ok := portabilityCategory(request)
	if !ok {
		writeProblem(writer, request, 404, "not_found", "Not found", "The configuration category does not exist.")
		return
	}
	var in portabilityExportRequest
	if !decodeOrProblem(writer, request, &in, 4096) {
		return
	}
	if in.IncludeCredentials == nil {
		writeProblem(writer, request, 422, "validation_failed", "Validation failed", "include_credentials is required.", fieldError{Field: "/include_credentials", Code: "required"})
		return
	}
	include := *in.IncludeCredentials
	if !include && (in.passphraseSet || in.confirmationSet) || include && (category != portability.Models || !in.passphraseSet || !in.confirmationSet || *in.Passphrase != *in.PassphraseConfirmation || portability.ValidatePassphrase(*in.Passphrase) != nil) {
		writeProblem(writer, request, 422, "validation_failed", "Validation failed", "The export credential options are invalid.")
		return
	}
	actor, _ := actorFromContext(request.Context())
	if include && !server.acquirePortabilityKDF(writer, request, actor.ID) {
		return
	}
	if include {
		defer server.portabilityKDF.release()
	}
	file, err := server.portability.Export(request.Context(), category, portability.Principal{ID: actor.ID, SessionID: actor.SessionID}, include)
	if err != nil {
		server.writePortabilityError(writer, request, err)
		return
	}
	var raw []byte
	if include {
		raw, err = portability.EncryptFile(file, *in.Passphrase)
	} else {
		raw, err = json.Marshal(file)
	}
	if err != nil {
		server.writePortabilityError(writer, request, err)
		return
	}
	if len(raw) > portability.MaxFileBytes {
		writeProblem(writer, request, 413, "export_too_large", "Export too large", "The complete configuration export exceeds the file size limit.")
		return
	}
	suffix := ".json"
	if include {
		suffix = ".wwcfg.json"
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="wordweave-%s-%s%s"`, category, time.Now().UTC().Format("20060102T150405Z"), suffix))
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.WriteHeader(200)
	_, _ = writer.Write(raw)
}

func (server *Server) adminConfigPortabilityPreview(writer http.ResponseWriter, request *http.Request) {
	category, ok := portabilityCategory(request)
	if !ok {
		writeProblem(writer, request, 404, "not_found", "Not found", "The configuration category does not exist.")
		return
	}
	var in portabilityFileRequest
	if !decodeOrProblem(writer, request, &in, portabilityRequestLimit) {
		return
	}
	raw, ok := decodePortableBase64(writer, request, in.FileBase64)
	if !ok {
		return
	}
	actor, _ := actorFromContext(request.Context())
	if in.Passphrase != nil && !server.acquirePortabilityKDF(writer, request, actor.ID) {
		return
	}
	if in.Passphrase != nil {
		defer server.portabilityKDF.release()
	}
	file, err := portability.ParseFile(raw, category, in.Passphrase, true)
	if err != nil {
		server.writePortabilityError(writer, request, err)
		return
	}
	preview, err := server.portability.Preview(request.Context(), portability.Principal{ID: actor.ID, SessionID: actor.SessionID}, category, file)
	if err != nil {
		server.writePortabilityError(writer, request, err)
		return
	}
	server.writeBoundedPortabilityJSON(writer, request, preview, "preview_too_large")
}

func (server *Server) adminConfigPortabilityImport(writer http.ResponseWriter, request *http.Request) {
	category, ok := portabilityCategory(request)
	if !ok {
		writeProblem(writer, request, 404, "not_found", "Not found", "The configuration category does not exist.")
		return
	}
	var in portabilityImportRequest
	if !decodeOrProblem(writer, request, &in, portabilityRequestLimit) {
		return
	}
	if in.OperationID == uuid.Nil || in.PreviewToken == "" || in.Confirmed == nil || !*in.Confirmed {
		writeProblem(writer, request, 422, "validation_failed", "Validation failed", "A confirmed preview operation is required.")
		return
	}
	raw, ok := decodePortableBase64(writer, request, in.FileBase64)
	if !ok {
		return
	}
	actor, _ := actorFromContext(request.Context())
	if in.Passphrase != nil && !server.acquirePortabilityKDF(writer, request, actor.ID) {
		return
	}
	if in.Passphrase != nil {
		defer server.portabilityKDF.release()
	}
	file, err := portability.ParseFile(raw, category, in.Passphrase, true)
	if err != nil {
		server.writePortabilityError(writer, request, err)
		return
	}
	result, err := server.portability.Commit(request.Context(), portability.Principal{ID: actor.ID, SessionID: actor.SessionID}, category, in.OperationID, in.PreviewToken, file)
	if err != nil {
		server.writePortabilityError(writer, request, err)
		return
	}
	server.writeBoundedPortabilityJSON(writer, request, result, "response_too_large")
}

func (server *Server) adminConfigPortabilityResolve(writer http.ResponseWriter, request *http.Request) {
	category, ok := portabilityCategory(request)
	if !ok {
		writeProblem(writer, request, 404, "not_found", "Not found", "The configuration category does not exist.")
		return
	}
	operation, err := uuid.Parse(chi.URLParam(request, "operation_id"))
	if err != nil || operation == uuid.Nil {
		writeProblem(writer, request, 404, "not_found", "Not found", "The operation could not be found.")
		return
	}
	var in portabilityResolveRequest
	if !decodeOrProblem(writer, request, &in, 4096) {
		return
	}
	if in.PreviewToken == "" {
		writeProblem(writer, request, 422, "validation_failed", "Validation failed", "preview_token is required.")
		return
	}
	actor, _ := actorFromContext(request.Context())
	result, err := server.portability.Resolve(request.Context(), portability.Principal{ID: actor.ID, SessionID: actor.SessionID}, category, operation, in.PreviewToken)
	if err != nil {
		server.writePortabilityError(writer, request, err)
		return
	}
	server.writeBoundedPortabilityJSON(writer, request, result, "response_too_large")
}

func (server *Server) writeBoundedPortabilityJSON(writer http.ResponseWriter, request *http.Request, data any, tooLargeCode string) bool {
	raw, err := json.Marshal(successEnvelope{Data: data, Meta: responseMeta{RequestID: requestID(request.Context())}})
	if err != nil {
		writeProblem(writer, request, 503, "service_unavailable", "Service unavailable", "The configuration response could not be encoded.")
		return false
	}
	if len(raw)+1 > portabilityResponseLimit {
		writeProblem(writer, request, 413, tooLargeCode, "Response too large", "The complete configuration response exceeds the transport size limit.")
		return false
	}
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write(append(raw, '\n'))
	return true
}

func (server *Server) acquirePortabilityKDF(writer http.ResponseWriter, request *http.Request, actor uuid.UUID) bool {
	if server.portabilityKDF.acquire(actor, time.Now()) {
		return true
	}
	writer.Header().Set("Retry-After", "6")
	writeProblem(writer, request, 429, "portability_busy", "Configuration portability is busy", "Try the password operation again shortly.")
	return false
}
func decodePortableBase64(writer http.ResponseWriter, request *http.Request, value string) ([]byte, bool) {
	if value == "" {
		writeProblem(writer, request, 400, "malformed_request", "Malformed request", "file_base64 is required.")
		return nil, false
	}
	raw, err := base64.StdEncoding.Strict().DecodeString(value)
	if err != nil || base64.StdEncoding.EncodeToString(raw) != value {
		writeProblem(writer, request, 400, "malformed_request", "Malformed request", "file_base64 must use canonical padded base64.")
		return nil, false
	}
	if len(raw) > portability.MaxFileBytes {
		writeProblem(writer, request, 413, "payload_too_large", "Payload too large", "The configuration file exceeds the size limit.")
		return nil, false
	}
	return raw, true
}

func (server *Server) writePortabilityError(writer http.ResponseWriter, request *http.Request, err error) {
	var validation *portability.ValidationError
	if errors.As(err, &validation) {
		fields := make([]fieldError, 0, len(validation.Fields))
		items := make([]map[string]string, 0, len(validation.Fields))
		for i, x := range validation.Fields {
			if i == 200 {
				break
			}
			field := safePortabilityPointer(x.Field)
			fields = append(fields, fieldError{Field: field, Code: x.Code})
			items = append(items, map[string]string{"identity": "input", "label": "", "field": field, "code": x.Code})
		}
		category, _ := portabilityCategory(request)
		context := map[string]any{"category": category, "items": items, "errors_truncated": len(validation.Fields) > len(fields)}
		writeProblemContext(writer, request, 422, "validation_failed", "Validation failed", "The configuration file is not valid.", context, fields...)
		return
	}
	switch {
	case errors.Is(err, portability.ErrForbidden):
		writeProblem(writer, request, 403, "forbidden", "Forbidden", "Administrator authorization has expired.")
	case errors.Is(err, portability.ErrSourceIncomplete):
		writeProblem(writer, request, 422, "source_configuration_incomplete", "Source configuration incomplete", "The source category cannot be represented as a complete portable configuration.")
	case errors.Is(err, portability.ErrCredentialsRequired):
		writeProblem(writer, request, 422, "credentials_required", "Credentials required", "Every imported connection requires a non-empty encrypted API key.")
	case errors.Is(err, portability.ErrDecryption):
		writeProblem(writer, request, 422, "decryption_failed", "Decryption failed", "The password is incorrect or the encrypted file is invalid.")
	case errors.Is(err, portability.ErrConflict):
		writeProblem(writer, request, 409, "operation_conflict", "Operation conflict", "This operation identifier is already bound to different input.")
	case errors.Is(err, portability.ErrToken):
		writeProblem(writer, request, 403, "recovery_token_invalid", "Recovery token invalid", "The operation result cannot be verified with this token.")
	case errors.Is(err, portability.ErrExpired):
		writeProblem(writer, request, 410, "result_expired", "Result expired", "The operation result retention window has expired.")
	case errors.Is(err, portability.ErrUnknown):
		writer.Header().Set("Retry-After", "2")
		writeProblemContext(writer, request, 503, "outcome_unknown", "Outcome unknown", "The service cannot yet determine whether the operation was applied.", map[string]any{"outcome": "unknown"})
	default:
		writeProblem(writer, request, 503, "service_unavailable", "Service unavailable", "The configuration operation could not be completed.")
	}
}
func safePortabilityPointer(value string) string {
	if value == "" || !strings.HasPrefix(value, "/") {
		return "/"
	}
	if strings.Contains(strings.ToLower(value), "api_key") || len(value) > 512 {
		return "/"
	}
	return value
}
