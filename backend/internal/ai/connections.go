package ai

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/security"
)

const LegacyProviderID = "00000000-0000-4000-8000-000000000001"
const (
	ProtocolChat      = "openai_chat"
	ProtocolResponses = "openai_responses"
	ProtocolAnthropic = "anthropic_messages"
)

var ErrConnectionInvalid = errors.New("invalid model connection")

type Connection struct {
	ID                   uuid.UUID `json:"id"`
	Name                 string    `json:"name"`
	Protocol             string    `json:"protocol"`
	BaseURL              string    `json:"base_url"`
	CredentialConfigured bool      `json:"credential_configured"`
	MaskedHint           *string   `json:"masked_hint"`
}
type ConnectionDraft struct {
	Name     string `json:"name"`
	Protocol string `json:"protocol"`
	BaseURL  string `json:"base_url"`
	APIKey   string `json:"api_key"`
}

// Secrets and connection snapshots cannot be serialized into run/trace data.
type connectionSnapshot struct {
	connection      Connection
	apiKey          string
	maxOutputTokens *int
	outputMode      string
}

func ValidConnection(d ConnectionDraft) bool {
	if utf8.RuneCountInString(strings.TrimSpace(d.Name)) > 200 || len(d.APIKey) > 8192 || strings.ContainsAny(d.APIKey, "\r\n") {
		return false
	}
	if d.Protocol != ProtocolChat && d.Protocol != ProtocolResponses && d.Protocol != ProtocolAnthropic {
		return false
	}
	return ValidBaseURL(d.BaseURL)
}
func ValidBaseURL(value string) bool {
	if value == "" || len(value) > 2048 || strings.TrimSpace(value) != value {
		return false
	}
	u, err := url.Parse(value)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return false
	}
	path := strings.TrimRight(u.Path, "/")
	for _, suffix := range []string{"/chat/completions", "/responses", "/messages"} {
		if strings.HasSuffix(path, suffix) {
			return false
		}
	}
	return true
}

// The caller holds the shared configuration lock until its preflight commits.
// A run then retains this immutable snapshot through corrections/continuations.
func (s *CredentialStore) BindSpec(ctx context.Context, spec *GenerationSpec) error {
	if spec.connection != nil {
		return nil
	}
	var snap connectionSnapshot
	var cipher, nonce []byte
	var version int
	err := s.pool.QueryRow(ctx, `SELECT p.id,p.name,p.protocol,p.base_url,p.credential_configured,p.masked_hint,c.ciphertext,c.nonce,c.encryption_key_version,m.max_output_tokens,m.output_mode,m.provider_model_id
 FROM wordweave.ai_models m JOIN wordweave.ai_providers p ON p.id=m.provider_id
 JOIN wordweave.ai_provider_credentials c ON c.provider_id=p.id WHERE m.id=$1`, spec.ModelID).Scan(
		&snap.connection.ID, &snap.connection.Name, &snap.connection.Protocol, &snap.connection.BaseURL, &snap.connection.CredentialConfigured, &snap.connection.MaskedHint,
		&cipher, &nonce, &version, &snap.maxOutputTokens, &snap.outputMode, &spec.ProviderModelID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrCredentialMissing
	}
	if err != nil {
		return err
	}
	key, err := s.envelope.Decrypt(cipher, nonce, version)
	if err != nil {
		return ErrCredentialMissing
	}
	snap.apiKey = string(key)
	spec.connection = &snap
	return nil
}

func (s *CredentialStore) ConnectionKey(ctx context.Context, id uuid.UUID) (string, error) {
	var cipher, nonce []byte
	var version int
	err := s.pool.QueryRow(ctx, `SELECT ciphertext,nonce,encryption_key_version FROM wordweave.ai_provider_credentials WHERE provider_id=$1`, id).Scan(&cipher, &nonce, &version)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrCredentialMissing
	}
	if err != nil {
		return "", err
	}
	key, err := s.envelope.Decrypt(cipher, nonce, version)
	if err != nil {
		return "", ErrCredentialMissing
	}
	return string(key), nil
}

// WriteConnection belongs to the caller's model/revision transaction. The app
// role cannot select ciphertext; only this narrow definer writes/copies it.
func (s *CredentialStore) WriteConnection(ctx context.Context, tx pgx.Tx, actor uuid.UUID, d ConnectionDraft, source *uuid.UUID) (uuid.UUID, error) {
	if !ValidConnection(d) {
		return uuid.Nil, ErrConnectionInvalid
	}
	name := strings.TrimSpace(d.Name)
	if name == "" {
		u, _ := url.Parse(d.BaseURL)
		name = u.Hostname()
	}
	var id uuid.UUID
	err := tx.QueryRow(ctx, `INSERT INTO wordweave.ai_providers(name,protocol,base_url) VALUES($1,$2,$3) RETURNING id`, name, d.Protocol, d.BaseURL).Scan(&id)
	if err != nil {
		return id, err
	}
	if d.APIKey == "" {
		if source == nil {
			return id, ErrCredentialMissing
		}
		var allowed bool
		err = tx.QueryRow(ctx, `SELECT protocol=$2 AND base_url=$3 AND credential_configured FROM wordweave.ai_providers WHERE id=$1`, source, d.Protocol, d.BaseURL).Scan(&allowed)
		if err != nil {
			return id, err
		}
		if !allowed {
			return id, ErrCredentialMissing
		}
		_, err = tx.Exec(ctx, `SELECT wordweave.write_provider_credential($1,NULL,NULL,NULL,NULL,$2,$3)`, id, actor, source)
		return id, err
	}
	cipher, nonce, version, err := s.envelope.Encrypt([]byte(d.APIKey))
	if err != nil {
		return id, err
	}
	_, err = tx.Exec(ctx, `SELECT wordweave.write_provider_credential($1,$2,$3,$4,$5,$6,NULL)`, id, cipher, nonce, version, security.Fingerprint(d.APIKey), actor)
	return id, err
}

// UpdateConnection changes an explicitly selected provider as part of the
// caller's aggregate configuration transaction. Existing in-flight runs retain
// their private connection snapshots.
func (s *CredentialStore) UpdateConnection(ctx context.Context, tx pgx.Tx, actor, id uuid.UUID, d ConnectionDraft) error {
	if !ValidConnection(d) {
		return ErrConnectionInvalid
	}
	var protocol, baseURL string
	var configured bool
	if err := tx.QueryRow(ctx, `SELECT protocol,base_url,credential_configured FROM wordweave.ai_providers WHERE id=$1`, id).Scan(&protocol, &baseURL, &configured); err != nil {
		return err
	}
	if d.APIKey == "" && (!configured || protocol != d.Protocol || baseURL != d.BaseURL) {
		return ErrCredentialMissing
	}
	name := strings.TrimSpace(d.Name)
	if name == "" {
		u, _ := url.Parse(d.BaseURL)
		name = u.Hostname()
	}
	if _, err := tx.Exec(ctx, `UPDATE wordweave.ai_providers SET name=$2,protocol=$3,base_url=$4,legacy_url_pending=false WHERE id=$1`, id, name, d.Protocol, d.BaseURL); err != nil {
		return err
	}
	if d.APIKey == "" {
		return nil
	}
	cipher, nonce, version, err := s.envelope.Encrypt([]byte(d.APIKey))
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `SELECT wordweave.update_provider_credential($1,$2,$3,$4,$5,$6)`, id, cipher, nonce, version, security.Fingerprint(d.APIKey), actor)
	return err
}
