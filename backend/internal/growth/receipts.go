package growth

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"wordweave/internal/platform/business"
	"wordweave/internal/platform/security"
)

type ReceiptItem struct {
	ID           uuid.UUID `json:"item_id"`
	DefinitionID uuid.UUID `json:"definition_id"`
	Kind         string    `json:"kind"`
	Deadline     time.Time `json:"activation_deadline"`
}
type Receipt struct {
	ID              uuid.UUID       `json:"id"`
	Kind            string          `json:"kind"`
	SettledAt       time.Time       `json:"settled_at"`
	PointsDelta     business.Amount `json:"points_delta"`
	ExperienceDelta business.Amount `json:"experience_delta"`
	PointsAfter     business.Amount `json:"points_after"`
	ExperienceAfter business.Amount `json:"experience_after"`
	Items           []ReceiptItem   `json:"items"`
}

func fingerprint(value any) ([]byte, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(raw)
	return sum[:], nil
}

// Each command stores only domain parameters and its durable receipt. Neither
// request bodies, transient review answers nor general HTTP responses are kept.
func intent(ctx context.Context, tx pgx.Tx, owner uuid.UUID, kind, source string, params any, now time.Time) (uuid.UUID, *Receipt, error) {
	digest, err := fingerprint(params)
	if err != nil {
		return uuid.Nil, nil, err
	}
	var id uuid.UUID
	var stored []byte
	err = tx.QueryRow(ctx, `SELECT id,request_fingerprint FROM wordweave.growth_settlements WHERE owner_id=$1 AND kind=$2 AND source_key=$3`, owner, kind, source).Scan(&id, &stored)
	if err == nil {
		if !security.EqualDigest(digest, stored) {
			return uuid.Nil, nil, reject("idempotency_conflict", 409)
		}
		receipt, err := readReceipt(ctx, tx, owner, id)
		return id, &receipt, err
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, nil, err
	}
	err = tx.QueryRow(ctx, `INSERT INTO wordweave.growth_settlements(owner_id,kind,source_key,request_fingerprint,created_at,config_snapshot) VALUES($1,$2,$3,$4,$5,'{}') RETURNING id`, owner, kind, source, digest, now).Scan(&id)
	return id, nil, err
}
func readReceipt(ctx context.Context, tx pgx.Tx, owner, id uuid.UUID) (Receipt, error) {
	var receipt Receipt
	var raw []byte
	err := tx.QueryRow(ctx, `SELECT config_snapshot->'receipt' FROM wordweave.growth_settlements WHERE owner_id=$1 AND id=$2`, owner, id).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return receipt, ErrNotFound
	}
	if err != nil {
		return receipt, err
	}
	if len(raw) == 0 {
		return receipt, errors.New("settlement receipt is missing")
	}
	// Signed points are permitted only in the receipt of an exchange. Amount's
	// public input codec deliberately rejects negative input, so decode amounts
	// here through strings after their origin has been validated by database.
	var wire struct {
		ID              uuid.UUID     `json:"id"`
		Kind            string        `json:"kind"`
		SettledAt       time.Time     `json:"settled_at"`
		PointsDelta     string        `json:"points_delta"`
		ExperienceDelta string        `json:"experience_delta"`
		PointsAfter     string        `json:"points_after"`
		ExperienceAfter string        `json:"experience_after"`
		Items           []ReceiptItem `json:"items"`
	}
	if err = json.Unmarshal(raw, &wire); err != nil {
		return receipt, err
	}
	receipt = Receipt{ID: wire.ID, Kind: wire.Kind, SettledAt: wire.SettledAt, Items: wire.Items}
	for _, pair := range []struct {
		raw    string
		target *business.Amount
	}{{wire.PointsDelta, &receipt.PointsDelta}, {wire.ExperienceDelta, &receipt.ExperienceDelta}, {wire.PointsAfter, &receipt.PointsAfter}, {wire.ExperienceAfter, &receipt.ExperienceAfter}} {
		var value int64
		if _, err = fmt.Sscan(pair.raw, &value); err != nil {
			return Receipt{}, err
		}
		*pair.target = business.Amount(value)
	}
	return receipt, nil
}
func finishReceipt(ctx context.Context, tx pgx.Tx, owner, id uuid.UUID, metadata map[string]any) (Receipt, error) {
	var r Receipt
	r.Items = make([]ReceiptItem, 0)
	err := tx.QueryRow(ctx, `SELECT s.id,s.kind,s.created_at,b.points,b.experience,
 coalesce((SELECT sum(delta) FROM wordweave.growth_ledger WHERE settlement_id=s.id AND currency='points'),0)::bigint,
 coalesce((SELECT sum(delta) FROM wordweave.growth_ledger WHERE settlement_id=s.id AND currency='experience'),0)::bigint
 FROM wordweave.growth_settlements s JOIN wordweave.growth_balances b ON b.owner_id=s.owner_id WHERE s.owner_id=$1 AND s.id=$2`, owner, id).Scan(&r.ID, &r.Kind, &r.SettledAt, &r.PointsAfter, &r.ExperienceAfter, &r.PointsDelta, &r.ExperienceDelta)
	if err != nil {
		return r, err
	}
	rows, err := tx.Query(ctx, `SELECT id,definition_id,kind_snapshot,activation_deadline FROM wordweave.user_items WHERE owner_id=$1 AND issuance_settlement_id=$2 ORDER BY issuance_component`, owner, id)
	if err != nil {
		return r, err
	}
	for rows.Next() {
		var item ReceiptItem
		if err = rows.Scan(&item.ID, &item.DefinitionID, &item.Kind, &item.Deadline); err != nil {
			rows.Close()
			return r, err
		}
		r.Items = append(r.Items, item)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return r, err
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	metadata["receipt"] = r
	raw, err := json.Marshal(metadata)
	if err != nil {
		return r, err
	}
	_, err = tx.Exec(ctx, `UPDATE wordweave.growth_settlements SET config_snapshot=$2 WHERE id=$1`, id, raw)
	return r, err
}
func definitionAvailable(ctx context.Context, tx pgx.Tx, d ItemConfig) (bool, error) {
	if d.Kind != "model_trial" {
		return true, nil
	}
	var available bool
	err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.item_definition_models dm JOIN wordweave.ai_models m ON m.id=dm.model_id WHERE dm.definition_id=$1 AND m.enabled AND m.retired_at IS NULL)`, d.ID).Scan(&available)
	return available, err
}

type issuedParameters struct {
	Kind       string `json:"kind"`
	ExtraCount int64  `json:"extra_count,omitempty"`
	Seconds    int64  `json:"trial_seconds,omitempty"`
	Plan       string `json:"target_plan_code,omitempty"`
}

func issueItems(ctx context.Context, tx pgx.Tx, owner, settlement uuid.UUID, d ItemConfig, count int64, now time.Time) error {
	if count < 1 || count > math.MaxInt32 {
		return &ValidationError{[]FieldError{{"/quantity", "out_of_range"}}}
	}
	raw, err := json.Marshal(issuedParameters{d.Kind, d.Effect.ExtraCount, d.Effect.Seconds, d.Effect.Plan})
	if err != nil {
		return err
	}
	// Use a set-based insert so issuance remains atomic for every quantity. The
	// caller's request context bounds query execution, not a hidden product cap.
	rows, err := tx.Query(ctx, `INSERT INTO wordweave.user_items(owner_id,definition_id,issuance_settlement_id,issuance_component,issued_at,activation_deadline,kind_snapshot,parameters_snapshot)
 SELECT $1,$2,$3,'item:'||n::text,$4::timestamptz,$4::timestamptz+make_interval(secs=>$5::double precision),$6,$7 FROM generate_series(1,$8::integer) n RETURNING id`, owner, d.ID, settlement, now, d.TTL, d.Kind, raw, count)
	if err != nil {
		return err
	}
	// Model snapshots are copied with SQL after closing the INSERT result; the
	// global shared configuration lock prevents edits during this operation.
	for rows.Next() {
		var id uuid.UUID
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return err
	}
	if d.Kind == "model_trial" {
		if _, err = tx.Exec(ctx, `INSERT INTO wordweave.user_item_models(item_id,model_id,owner_id) SELECT i.id,m.model_id,i.owner_id FROM wordweave.user_items i JOIN wordweave.item_definition_models m ON m.definition_id=i.definition_id WHERE i.issuance_settlement_id=$1 AND i.owner_id=$2`, settlement, owner); err != nil {
			return err
		}
	}
	_, err = tx.Exec(ctx, `UPDATE wordweave.item_definitions SET ever_issued=true WHERE id=$1`, d.ID)
	return err
}
func (s *Service) Exchange(ctx context.Context, owner, key, definition uuid.UUID, quantity int64) (Receipt, error) {
	if key == uuid.Nil || quantity < 1 || quantity > math.MaxInt32 {
		return Receipt{}, &ValidationError{[]FieldError{{"/quantity", "out_of_range"}}}
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
	if err = business.LockLearner(ctx, tx, owner); err != nil {
		return Receipt{}, err
	}
	if err = Ensure(ctx, tx, owner); err != nil {
		return Receipt{}, err
	}
	id, existing, err := intent(ctx, tx, owner, "exchange", key.String(), struct {
		Definition uuid.UUID
		Quantity   int64
	}{definition, quantity}, c.Now)
	if err != nil {
		return Receipt{}, err
	}
	if existing != nil {
		return *existing, nil
	}
	d, err := readDefinition(ctx, tx, definition)
	if err != nil {
		return Receipt{}, err
	}
	if !d.Listed {
		return Receipt{}, reject("item_unlisted", 422)
	}
	available, err := definitionAvailable(ctx, tx, d)
	if err != nil {
		return Receipt{}, err
	}
	if !available {
		return Receipt{}, reject("reward_unavailable", 422)
	}
	if d.Price > 0 && quantity > math.MaxInt64/int64(d.Price) {
		return Receipt{}, &ValidationError{[]FieldError{{"/quantity", "out_of_range"}}}
	}
	total := int64(d.Price) * quantity
	var remaining int64
	err = tx.QueryRow(ctx, `UPDATE wordweave.growth_balances SET points=points-$2,revision=revision+1 WHERE owner_id=$1 AND points>=$2 RETURNING points`, owner, total).Scan(&remaining)
	if errors.Is(err, pgx.ErrNoRows) {
		return Receipt{}, reject("insufficient_points", 422)
	}
	if err != nil {
		return Receipt{}, err
	}
	if total > 0 {
		if _, err = tx.Exec(ctx, `INSERT INTO wordweave.growth_ledger(owner_id,settlement_id,component_key,currency,delta,balance_after,created_at) VALUES($1,$2,'exchange','points',$3,$4,$5)`, owner, id, -total, remaining, c.Now); err != nil {
			return Receipt{}, err
		}
	}
	if err = issueItems(ctx, tx, owner, id, d, quantity, c.Now); err != nil {
		return Receipt{}, err
	}
	receipt, err := finishReceipt(ctx, tx, owner, id, nil)
	if err != nil {
		return Receipt{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Receipt{}, err
	}
	return receipt, nil
}
