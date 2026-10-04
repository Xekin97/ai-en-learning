package growth

import (
	"context"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Qualification is a historical fact at the last model's retirement time. A
// delayed sweep must still qualify cards that have since expired, without
// refunding points or changing their remaining contributions automatically.
func qualifyRetiredCards(ctx context.Context, tx pgx.Tx, owner uuid.UUID) error {
	_, err := tx.Exec(ctx, `WITH retirement AS (
 SELECT i.id,max(m.retired_at) at FROM wordweave.user_items i JOIN wordweave.user_item_models im ON im.item_id=i.id JOIN wordweave.ai_models m ON m.id=im.model_id
 WHERE i.owner_id=$1 AND i.kind_snapshot='model_trial' AND i.refund_eligible_at IS NULL AND i.refunded_at IS NULL
 GROUP BY i.id HAVING bool_and(m.retired_at IS NOT NULL)
 ) UPDATE wordweave.user_items i SET refund_eligible_at=r.at FROM retirement r WHERE i.id=r.id
 AND ((i.activated_at IS NULL AND r.at>=i.issued_at AND r.at<i.activation_deadline)
 OR (i.activated_at IS NOT NULL AND EXISTS(SELECT 1 FROM wordweave.model_time_contributions t WHERE t.item_id=i.id AND t.revoked_at IS NULL AND t.ends_at>r.at)))`, owner)
	return err
}
