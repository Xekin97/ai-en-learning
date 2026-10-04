package growth

import (
	"context"
	"github.com/google/uuid"
	"wordweave/internal/platform/business"
)

type ShopItem struct {
	ID          uuid.UUID       `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Kind        string          `json:"kind"`
	Price       business.Amount `json:"price"`
	TTL         int64           `json:"activation_ttl_seconds"`
	Effect      Effect          `json:"effect"`
	Available   bool            `json:"available"`
	Reason      *string         `json:"unavailable_reason"`
	cursor      DefinitionCursor
}
type Shop struct {
	Balance business.Amount `json:"balance"`
	Items   []ShopItem      `json:"items"`
}

func (s *Service) Shop(ctx context.Context, owner uuid.UUID, locale, kind string, cursor *DefinitionCursor, limit int) (Shop, *DefinitionCursor, error) {
	if limit < 1 || limit > 100 || kind != "" && !validItemKind(kind) {
		return Shop{}, nil, &ValidationError{[]FieldError{{"/filter", "out_of_range"}}}
	}
	tx, c, err := s.previewTransaction(ctx, owner)
	if err != nil {
		return Shop{}, nil, err
	}
	defer tx.Rollback(ctx)
	out := Shop{Items: make([]ShopItem, 0)}
	if err = tx.QueryRow(ctx, `SELECT coalesce((SELECT points FROM wordweave.growth_balances WHERE owner_id=$1),0)`, owner).Scan(&out.Balance); err != nil {
		return out, nil, err
	}
	var at, id any
	if cursor != nil {
		at = cursor.At
		id = cursor.ID
	}
	rows, err := tx.Query(ctx, `SELECT id FROM wordweave.item_definitions WHERE listed AND ($1='' OR kind=$1) AND ($2::timestamptz IS NULL OR created_at<$2 OR (created_at=$2 AND id>$3)) ORDER BY created_at DESC,id ASC LIMIT $4`, kind, at, id, limit+1)
	if err != nil {
		return out, nil, err
	}
	ids := make([]uuid.UUID, 0)
	for rows.Next() {
		var id uuid.UUID
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return out, nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return out, nil, err
	}
	more := len(ids) > limit
	if more {
		ids = ids[:limit]
	}
	for _, id := range ids {
		d, err := readDefinition(ctx, tx, id)
		if err != nil {
			return out, nil, err
		}
		effect := Effect{Kind: d.Kind, Count: d.Effect.ExtraCount, Seconds: d.Effect.Seconds, Plan: d.Effect.Plan, Retirement: d.Effect.Retirement}
		if d.Kind == "model_trial" {
			effect.Models, err = modelEffects(ctx, tx, id, false)
			if err != nil {
				return out, nil, err
			}
		}
		available, err := definitionAvailable(ctx, tx, d)
		if err != nil {
			return out, nil, err
		}
		var reason *string
		if !available {
			value := "model_unavailable"
			reason = &value
		}
		out.Items = append(out.Items, ShopItem{ID: id, Name: local(d.Name, locale), Description: local(d.Description, locale), Kind: d.Kind, Price: d.Price, TTL: d.TTL, Effect: effect, Available: available, Reason: reason, cursor: DefinitionCursor{At: d.CreatedAt, ID: d.ID, Revision: s.revision(c)}})
	}
	var next *DefinitionCursor
	if more {
		value := out.Items[len(out.Items)-1].cursor
		next = &value
	}
	return out, next, nil
}
