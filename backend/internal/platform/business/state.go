// Package business contains the shared transaction boundaries and value types
// used by M002 domains. It does not own domain settlement or authorization.
package business

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/security"
)

var ErrNotFound = errors.New("business subject not found")

type RevisionConflict struct{ Current string }

func (e *RevisionConflict) Error() string { return "revision conflict" }

func Revision(key []byte, scope string, version int64) string {
	return base64.RawURLEncoding.EncodeToString(security.Digest(key, "revision-v1:"+scope, strconv.FormatInt(version, 10)))
}
func MatchRevision(key []byte, scope string, version int64, expected string) bool {
	return security.EqualDigest([]byte(Revision(key, scope, version)), []byte(expected))
}

type Configuration struct {
	Revision          int64
	ActivatedAt       *time.Time
	MasteryExperience int64
	Now               time.Time
}

// LockConfiguration must be the first lock in a business transaction. The
// business clock is sampled after lock acquisition, including a 04:00 wait.
func LockConfiguration(ctx context.Context, tx interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, write bool) (Configuration, error) {
	var c Configuration
	lock := " FOR SHARE"
	if write {
		lock = " FOR UPDATE"
	}
	err := tx.QueryRow(ctx, `SELECT revision,activated_at,mastery_experience FROM wordweave.growth_settings WHERE singleton`+lock).Scan(&c.Revision, &c.ActivatedAt, &c.MasteryExperience)
	if err != nil {
		return c, err
	}
	err = tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&c.Now)
	return c, err
}

func LockLearner(ctx context.Context, tx pgx.Tx, owner uuid.UUID) error {
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM wordweave.accounts WHERE id=$1 AND role='learner' FOR UPDATE`, owner).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

func AdvanceConfiguration(ctx context.Context, tx pgx.Tx) (int64, error) {
	var revision int64
	err := tx.QueryRow(ctx, `UPDATE wordweave.growth_settings SET revision=revision+1,recompute_target_revision=revision+1,recompute_after_owner=NULL,updated_at=clock_timestamp() WHERE singleton RETURNING revision`).Scan(&revision)
	return revision, err
}

// LearningDay is Beijing's fixed 04:00 boundary, independent of browser zones
// and of the rolling 24-hour quota window. Fixed UTC+8 has no DST ambiguity.
func LearningDay(at time.Time) time.Time {
	shifted := at.UTC().Add(4 * time.Hour)
	return time.Date(shifted.Year(), shifted.Month(), shifted.Day(), 0, 0, 0, 0, time.UTC)
}

type Amount int64

func (a Amount) MarshalJSON() ([]byte, error) { return json.Marshal(strconv.FormatInt(int64(a), 10)) }
func (a *Amount) UnmarshalJSON(raw []byte) error {
	var s string
	if len(raw) == 0 || raw[0] != '"' || json.Unmarshal(raw, &s) != nil || s == "" || (len(s) > 1 && s[0] == '0') {
		return errors.New("amount must be a canonical nonnegative decimal string")
	}
	if strings.IndexFunc(s, func(r rune) bool { return r < '0' || r > '9' }) >= 0 {
		return errors.New("amount must contain decimal digits")
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return errors.New("amount exceeds int64")
	}
	*a = Amount(n)
	return nil
}
