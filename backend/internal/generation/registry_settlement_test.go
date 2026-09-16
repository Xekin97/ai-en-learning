package generation

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"wordweave/internal/identity"
)

func TestPendingFailuresAreBoundedFairAndTerminalSafe(t *testing.T) {
	r := NewRegistry([]byte("synthetic test key"))
	actor := identity.Actor{ID: uuid.New(), Kind: "account", Role: "learner"}
	ids := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	for _, id := range ids {
		r.Register(id, actor, "synthetic-token")
		r.rememberFailure(id, "validation_failed", "original")
	}
	first := r.PendingFailures(1)
	if len(first) != 1 || len(r.PendingFailures(0)) != 0 {
		t.Fatal("batch bounds")
	}
	retry := r.rememberFailure(first[0].RunID, "server_failed", "later")
	if retry.Status != "validation_failed" || retry.Code != "original" {
		t.Fatal("overwrote original cause")
	}
	if r.PendingFailures(1)[0].RunID == first[0].RunID {
		t.Fatal("persistent row starves other pending rows")
	}
	r.PurgeOlderThan(time.Now().Add(2 * time.Hour))
	if len(r.PendingFailures(10)) != 3 {
		t.Fatal("pending data purged")
	}
	r.SetStatus(ids[0], "cancelled")
	r.rememberFailure(ids[0], "server_failed", "late")
	if len(r.PendingFailures(10)) != 2 {
		t.Fatal("terminal retry resurrected work")
	}
}
