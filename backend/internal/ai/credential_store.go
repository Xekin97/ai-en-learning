package ai

import (
	"context"
	"errors"
	"fmt"

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
	var ciphertext, nonce []byte
	var version int
	if err := store.pool.QueryRow(ctx, `
		SELECT ciphertext, nonce, encryption_key_version
		FROM wordweave.openrouter_credentials
		WHERE provider = 'openrouter'`).Scan(&ciphertext, &nonce, &version); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrCredentialMissing
		}
		return "", fmt.Errorf("read OpenRouter credential: %w", err)
	}
	plaintext, err := store.envelope.Decrypt(ciphertext, nonce, version)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func (store *CredentialStore) Put(ctx context.Context, accountID uuid.UUID, apiKey string) error {
	ciphertext, nonce, version, err := store.envelope.Encrypt([]byte(apiKey))
	if err != nil {
		return err
	}
	_, err = store.pool.Exec(ctx, `
		INSERT INTO wordweave.openrouter_credentials(
			provider, ciphertext, nonce, encryption_key_version, display_fingerprint, updated_by, updated_at
		) VALUES ('openrouter', $1, $2, $3, $4, $5, clock_timestamp())
		ON CONFLICT (provider) DO UPDATE SET
			ciphertext = EXCLUDED.ciphertext,
			nonce = EXCLUDED.nonce,
			encryption_key_version = EXCLUDED.encryption_key_version,
			display_fingerprint = EXCLUDED.display_fingerprint,
			updated_by = EXCLUDED.updated_by,
			updated_at = EXCLUDED.updated_at`,
		ciphertext, nonce, version, security.Fingerprint(apiKey), accountID,
	)
	if err != nil {
		return fmt.Errorf("store OpenRouter credential: %w", err)
	}
	return nil
}

func (store *CredentialStore) Status(ctx context.Context) (CredentialStatus, error) {
	var fingerprint string
	var updatedAt string
	err := store.pool.QueryRow(ctx, `
		SELECT display_fingerprint, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
		FROM wordweave.openrouter_credentials WHERE provider='openrouter'`).Scan(&fingerprint, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return CredentialStatus{}, nil
	}
	if err != nil {
		return CredentialStatus{}, fmt.Errorf("read OpenRouter credential status: %w", err)
	}
	return CredentialStatus{Configured: true, MaskedHint: &fingerprint, UpdatedAt: &updatedAt}, nil
}
