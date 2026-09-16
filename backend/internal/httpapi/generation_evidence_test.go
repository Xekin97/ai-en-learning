package httpapi

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	evidence "wordweave/internal/generationevidence"
	gt "wordweave/internal/generationtrace"
	"wordweave/internal/identity"
)

func testEvidenceManager(t *testing.T) (*evidence.Manager, string, evidence.Fingerprint) {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err = os.Chmod(dir, 0700); err != nil {
		t.Fatal(err)
	}
	h := evidence.Digest([]byte("synthetic HTTP fixture provenance"))
	fp := evidence.Fingerprint{Source: h, Binary: h, Template: h, Schema: h, Validator: h, Lexicon: h}
	m, err := evidence.Open(evidence.Options{Directory: dir, Fingerprint: fp})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		if err := m.Close(ctx); err != nil {
			t.Error(err)
		}
	})
	return m, dir, fp
}
func TestOBS042COnlyVerifiedDedicatedGenerationIdentityIsAttached(t *testing.T) {
	m, _, _ := testEvidenceManager(t)
	server := &Server{evidence: m}
	dedicated := identity.Actor{Kind: "account", Role: "learner", ID: uuid.MustParse(evidence.DedicatedAccountID)}
	server.attachGenerationEvidence(context.Background(), dedicated)
	if len(m.IDs()) != 0 {
		t.Fatal("unrelated route/probe captured")
	}
	for _, actor := range []identity.Actor{{Kind: "visitor", ID: dedicated.ID}, {Kind: "account", ID: uuid.New()}} {
		trace := gt.New("req_other", nil)
		ctx := context.WithValue(gt.With(context.Background(), trace), requestIDKey, "req_other")
		server.attachGenerationEvidence(ctx, actor)
		trace.Finish()
		if trace.Capture() != nil {
			t.Fatal("different identity captured")
		}
	}
	trace := gt.New("req_dedicated", nil)
	ctx := context.WithValue(gt.With(context.Background(), trace), requestIDKey, "req_dedicated")
	server.attachGenerationEvidence(ctx, dedicated)
	trace.Finish()
	if trace.Capture() == nil || len(m.IDs()) != 1 {
		t.Fatal("dedicated identity not captured")
	}
}
