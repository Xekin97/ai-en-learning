package admin

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"time"
	"wordweave/internal/platform/business"
)

var ErrImpactChanged = errors.New("configuration impact changed")
var ErrPreviewStale = errors.New("configuration preview stale")

type RemovalGroup struct {
	Code      string `json:"code"`
	Remaining int    `json:"remaining_enabled_models"`
}
type RemovalImpact struct {
	Model                       Model
	Groups                      []RemovalGroup
	Presets, Definitions, Owned int
	Token, Revision             string
	digest                      string
}
type removalToken struct {
	Subject  string
	Model    uuid.UUID
	Revision string
	Digest   string
	Expires  time.Time
}

func (s *Service) removalImpact(ctx context.Context, tx pgx.Tx, id uuid.UUID, c business.Configuration) (RemovalImpact, error) {
	out := RemovalImpact{Groups: make([]RemovalGroup, 0), Revision: s.revision(c)}
	var err error
	out.Model, err = readModel(ctx, tx, id)
	if err != nil {
		return out, err
	}
	if out.Model.RetiredAt != nil {
		return out, ErrModelRetired
	}
	rows, err := tx.Query(ctx, `SELECT g.group_code,(SELECT count(*) FROM wordweave.group_models other JOIN wordweave.ai_models m ON m.id=other.model_id WHERE other.group_code=g.group_code AND m.id<>$1 AND m.enabled AND m.retired_at IS NULL) FROM wordweave.group_models g WHERE g.model_id=$1 ORDER BY CASE g.group_code WHEN 'visitor' THEN 1 WHEN 'registered' THEN 2 WHEN 'pro' THEN 3 ELSE 4 END`, id)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var group RemovalGroup
		if err = rows.Scan(&group.Code, &group.Remaining); err != nil {
			rows.Close()
			return out, err
		}
		group.Code = publicGroupCode(group.Code)
		out.Groups = append(out.Groups, group)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return out, err
	}
	var presets, definitions []uuid.UUID
	if err = tx.QueryRow(ctx, `SELECT coalesce(array_agg(p.id ORDER BY p.id),ARRAY[]::uuid[]) FROM wordweave.presets p WHERE EXISTS(SELECT 1 FROM wordweave.preset_versions v WHERE v.preset_id=p.id AND v.model_id=$1 AND v.id IN(p.draft_version_id,p.published_version_id))`, id).Scan(&presets); err != nil {
		return out, err
	}
	if err = tx.QueryRow(ctx, `SELECT coalesce(array_agg(definition_id ORDER BY definition_id),ARRAY[]::uuid[]) FROM wordweave.item_definition_models WHERE model_id=$1`, id).Scan(&definitions); err != nil {
		return out, err
	}
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM wordweave.user_item_models WHERE model_id=$1`, id).Scan(&out.Owned); err != nil {
		return out, err
	}
	out.Presets = len(presets)
	out.Definitions = len(definitions)
	raw, err := json.Marshal(struct {
		Groups               []RemovalGroup
		Presets, Definitions []uuid.UUID
	}{out.Groups, presets, definitions})
	if err != nil {
		return out, err
	}
	sum := sha256.Sum256(raw)
	out.digest = hex.EncodeToString(sum[:])
	return out, nil
}
func (s *Service) RemovalImpact(ctx context.Context, subject string, id uuid.UUID) (RemovalImpact, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return RemovalImpact{}, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return RemovalImpact{}, err
	}
	out, err := s.removalImpact(ctx, tx, id, c)
	if err != nil {
		return out, err
	}
	out.Token, err = s.signer.Encode("model-removal", removalToken{subject, id, out.Revision, out.digest, c.Now.Add(5 * time.Minute)})
	return out, err
}
func (s *Service) RemoveModel(ctx context.Context, subject string, id uuid.UUID, expected, tokenString string, confirmed bool) (Model, []string, error) {
	if !confirmed {
		return Model{}, nil, ErrValidation
	}
	var token removalToken
	if err := s.signer.Decode("model-removal", tokenString, &token); err != nil {
		return Model{}, nil, ErrPreviewStale
	}
	if token.Subject != subject || token.Model != id || token.Revision != expected {
		return Model{}, nil, ErrImpactChanged
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Model{}, nil, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return Model{}, nil, err
	}
	if err = s.requireRevision(c, expected); err != nil {
		return Model{}, nil, err
	}
	if !token.Expires.After(c.Now) {
		return Model{}, nil, ErrPreviewStale
	}
	impact, err := s.removalImpact(ctx, tx, id, c)
	if err != nil {
		return Model{}, nil, err
	}
	if impact.digest != token.Digest {
		return Model{}, nil, ErrImpactChanged
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.ai_models SET enabled=false,retired_at=$2,updated_at=$2 WHERE id=$1`, id, c.Now); err != nil {
		return Model{}, nil, err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM wordweave.group_models WHERE model_id=$1`, id); err != nil {
		return Model{}, nil, err
	}
	// Immutable retirement time is sufficient for synchronous owned-card refund
	// qualification. No user scan or account lock runs under this exclusive lock.
	model, err := s.finishModel(ctx, tx, id)
	if err != nil {
		return Model{}, nil, err
	}
	groups := make([]string, 0, len(impact.Groups))
	for _, group := range impact.Groups {
		groups = append(groups, group.Code)
	}
	return model, groups, nil
}
