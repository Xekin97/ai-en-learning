package growth

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
)

type LedgerCursor struct {
	At time.Time `json:"at"`
	ID uuid.UUID `json:"id"`
}
type LedgerEntry struct {
	ID            uuid.UUID       `json:"id"`
	SettlementID  uuid.UUID       `json:"settlement_id"`
	Kind          string          `json:"kind"`
	Delta         business.Amount `json:"delta"`
	After         business.Amount `json:"balance_after"`
	At            time.Time       `json:"created_at"`
	AdminUsername *string         `json:"admin_username,omitempty"`
}
type Ledger struct {
	Balance business.Amount `json:"balance"`
	Items   []LedgerEntry   `json:"items"`
}

func (s *Service) Ledger(ctx context.Context, owner uuid.UUID, admin bool, cursor *LedgerCursor, limit int) (Ledger, bool, error) {
	if limit < 1 || limit > 100 {
		return Ledger{}, false, &ValidationError{[]FieldError{{"/limit", "out_of_range"}}}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Ledger{}, false, err
	}
	defer tx.Rollback(ctx)
	if _, err = business.LockConfiguration(ctx, tx, false); err != nil {
		return Ledger{}, false, err
	}
	if err = business.LockLearner(ctx, tx, owner); err != nil {
		return Ledger{}, false, err
	}
	out := Ledger{Items: make([]LedgerEntry, 0)}
	if err = tx.QueryRow(ctx, `SELECT coalesce((SELECT points FROM wordweave.growth_balances WHERE owner_id=$1),0)`, owner).Scan(&out.Balance); err != nil {
		return out, false, err
	}
	var at, id any
	if cursor != nil {
		at = cursor.At
		id = cursor.ID
	}
	rows, err := tx.Query(ctx, `SELECT l.id,l.settlement_id,s.kind,l.delta,l.balance_after,l.created_at,
 CASE WHEN $5 AND s.kind='admin_grant' THEN a.username END FROM wordweave.growth_ledger l JOIN wordweave.growth_settlements s ON s.id=l.settlement_id AND s.owner_id=l.owner_id LEFT JOIN wordweave.accounts a ON a.id::text=s.config_snapshot->>'admin_id'
 WHERE l.owner_id=$1 AND l.currency='points' AND ($2::timestamptz IS NULL OR (l.created_at,l.id)<($2,$3)) ORDER BY l.created_at DESC,l.id DESC LIMIT $4`, owner, at, id, limit+1, admin)
	if err != nil {
		return out, false, err
	}
	defer rows.Close()
	for rows.Next() {
		var row LedgerEntry
		if err = rows.Scan(&row.ID, &row.SettlementID, &row.Kind, &row.Delta, &row.After, &row.At, &row.AdminUsername); err != nil {
			return out, false, err
		}
		out.Items = append(out.Items, row)
	}
	if err = rows.Err(); err != nil {
		return out, false, err
	}
	more := len(out.Items) > limit
	if more {
		out.Items = out.Items[:limit]
	}
	return out, more, nil
}
func (s *Service) GrantPoints(ctx context.Context, admin, owner, key uuid.UUID, points business.Amount, reason string) (Receipt, error) {
	reason = strings.TrimSpace(reason)
	v := &ValidationError{}
	if points <= 0 {
		v.Add("/points", "out_of_range")
	}
	if reason == "" || utf8.RuneCountInString(reason) > 200 {
		v.Add("/reason", "out_of_range")
	}
	if key == uuid.Nil {
		v.Add("/idempotency_key", "required")
	}
	if err := v.Result(); err != nil {
		return Receipt{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Receipt{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return Receipt{}, err
	}
	var role string
	if err = tx.QueryRow(ctx, `SELECT role FROM wordweave.accounts WHERE id=$1 FOR UPDATE`, owner).Scan(&role); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Receipt{}, ErrNotFound
		}
		return Receipt{}, err
	}
	if role != "learner" {
		return Receipt{}, reject("validation_failed", 422)
	}

	if err = Ensure(ctx, tx, owner); err != nil {
		return Receipt{}, err
	}
	id, previous, err := intent(ctx, tx, owner, "admin_grant", admin.String()+":"+key.String(), struct {
		Points business.Amount
		Reason string
	}{points, reason}, c.Now)
	if err != nil {
		return Receipt{}, err
	}
	if previous != nil {
		return *previous, nil
	}
	var balance int64
	if err = tx.QueryRow(ctx, `SELECT points FROM wordweave.growth_balances WHERE owner_id=$1`, owner).Scan(&balance); err != nil {
		return Receipt{}, err
	}
	if int64(points) > math.MaxInt64-balance {
		return Receipt{}, &ValidationError{[]FieldError{{"/points", "out_of_range"}}}
	}
	if err = credit(ctx, tx, owner, id, "admin_grant", int64(points), 0); err != nil {
		return Receipt{}, err
	}
	receipt, err := finishReceipt(ctx, tx, owner, id, map[string]any{"admin_id": admin.String(), "reason": reason})
	if err != nil {
		return Receipt{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Receipt{}, err
	}
	return receipt, nil
}
