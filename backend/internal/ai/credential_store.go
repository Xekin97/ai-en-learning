package ai

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/platform/security"
)

type CredentialStatus struct {
	Configured bool
	MaskedHint *string
	UpdatedAt  *string
}

type CredentialStore struct {
	pool     *pgxpool.Pool
	envelope security.Envelope
}

func NewCredentialStore(pool *pgxpool.Pool, envelope security.Envelope) *CredentialStore {
	return &CredentialStore{pool: pool, envelope: envelope}
}

func (store *CredentialStore) Get(ctx context.Context) (string, error) {
	return store.ConnectionKey(ctx, uuid.MustParse(LegacyProviderID))
}

func (store *CredentialStore) Put(ctx context.Context, accountID uuid.UUID, apiKey string) error {
	_, _, _, err := store.Replace(ctx, accountID, apiKey, nil)
	return err
}

// Replace performs ciphertext replacement and the configuration revision CAS
// in one database statement through a narrowly granted definer function.
// expected=nil is reserved for internal initialization, never the admin API.
func (store *CredentialStore) Replace(ctx context.Context, accountID uuid.UUID, apiKey string, expected *int64) (CredentialStatus, int64, bool, error) {
	ciphertext, nonce, version, err := store.envelope.Encrypt([]byte(apiKey))
	if err != nil {
		return CredentialStatus{}, 0, false, err
	}
	var applied bool
	var revision int64
	var hint *string
	var updated *time.Time
	err = store.pool.QueryRow(ctx, `SELECT applied,configuration_revision,fingerprint,credential_updated_at FROM wordweave.replace_openrouter_credential($1,$2,$3,$4,$5,$6)`, expected, ciphertext, nonce, version, security.Fingerprint(apiKey), accountID).Scan(&applied, &revision, &hint, &updated)
	if err != nil {
		return CredentialStatus{}, 0, false, fmt.Errorf("store OpenRouter credential: %w", err)
	}
	status := CredentialStatus{Configured: applied, MaskedHint: hint}
	if updated != nil {
		value := updated.UTC().Format(time.RFC3339Nano)
		status.UpdatedAt = &value
	}
	return status, revision, applied, nil
}

func (store *CredentialStore) Status(ctx context.Context) (CredentialStatus, error) {
	var fingerprint string
	var updatedAt string
	err := store.pool.QueryRow(ctx, `
		SELECT display_fingerprint, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
		FROM wordweave.ai_provider_credentials WHERE provider_id='00000000-0000-4000-8000-000000000001'`).Scan(&fingerprint, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return CredentialStatus{}, nil
	}
	if err != nil {
		return CredentialStatus{}, fmt.Errorf("read OpenRouter credential status: %w", err)
	}
	return CredentialStatus{Configured: true, MaskedHint: &fingerprint, UpdatedAt: &updatedAt}, nil
}
