package generation

import (
	"encoding/base64"
	"strings"

	"github.com/google/uuid"
	"wordweave/internal/identity"
	"wordweave/internal/platform/security"
)

// NewRunToken issues an opaque, random capability bound to one actor and run.
// Its signature remains verifiable after process-local registry entries are lost.
// It is not permission to save: callers must still check persisted ownership,
// disposition, expiry and, for pending drafts, the stored token digest.
func NewRunToken(key []byte, runID uuid.UUID, actor identity.Actor) (string, error) {
	if !validTokenSubject(key, runID, actor) {
		return "", ErrForbidden
	}
	nonce, err := security.RandomToken()
	if err != nil {
		return "", err
	}
	return nonce + "." + base64.RawURLEncoding.EncodeToString(security.Digest(key, tokenScope(runID, actor), nonce)), nil
}

func VerifyRunToken(key []byte, runID uuid.UUID, actor identity.Actor, token string) bool {
	if !validTokenSubject(key, runID, actor) || len(token) != 87 {
		return false
	}
	nonce, signature, ok := strings.Cut(token, ".")
	if !ok || !canonicalTokenPart(nonce) || !canonicalTokenPart(signature) {
		return false
	}
	digest, _ := base64.RawURLEncoding.DecodeString(signature)
	return security.EqualDigest(digest, security.Digest(key, tokenScope(runID, actor), nonce))
}

func canonicalTokenPart(part string) bool {
	decoded, err := base64.RawURLEncoding.Strict().DecodeString(part)
	return err == nil && len(decoded) == 32 && base64.RawURLEncoding.EncodeToString(decoded) == part
}

func validTokenSubject(key []byte, runID uuid.UUID, actor identity.Actor) bool {
	return len(key) >= 32 && runID != uuid.Nil && actor.ID != uuid.Nil && (actor.IsVisitor() || actor.IsLearner())
}

func tokenScope(runID uuid.UUID, actor identity.Actor) string {
	return "generation-capability-v1:" + actor.Kind + ":" + actor.ID.String() + ":" + runID.String()
}
