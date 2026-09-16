package generation

import (
	"strings"
	"testing"

	"github.com/google/uuid"
	"wordweave/internal/identity"
)

func TestRunTokenBindingAndCanonicalEncoding(t *testing.T) {
	key := []byte(strings.Repeat("k", 32))
	runID := uuid.New()
	actor := identity.Actor{Kind: "account", ID: uuid.New(), Role: "learner"}
	token, err := NewRunToken(key, runID, actor)
	if err != nil || !VerifyRunToken(append([]byte(nil), key...), runID, actor, token) {
		t.Fatal("fresh capability cannot be independently verified")
	}
	other, err := NewRunToken(key, runID, actor)
	if err != nil || other == token {
		t.Fatal("capabilities must contain fresh randomness")
	}
	for name, candidate := range map[string]string{
		"empty": "", "unsigned": token[:43], "short": token[:86],
		"padding": token + "=", "extra": token + ".x", "large": strings.Repeat("x", 4096),
		"nonce tamper": "!" + token[1:], "signature tamper": token[:44] + "!" + token[45:],
		"valid encoding wrong signature": other[:44] + token[44:],
		"newline":                        token[:10] + "\n" + token[11:], "separator": token[:43] + "_" + token[44:],
	} {
		t.Run(name, func(t *testing.T) {
			if VerifyRunToken(key, runID, actor, candidate) {
				t.Fatal("malformed capability accepted")
			}
		})
	}
	wrongActor := actor
	wrongActor.ID = uuid.New()
	visitor := identity.Actor{Kind: "visitor", ID: actor.ID}
	admin := actor
	admin.Role = "admin"
	if VerifyRunToken(key, uuid.New(), actor, token) || VerifyRunToken(key, runID, wrongActor, token) ||
		VerifyRunToken(key, runID, visitor, token) || VerifyRunToken(key, runID, admin, token) ||
		VerifyRunToken([]byte(strings.Repeat("z", 32)), runID, actor, token) {
		t.Fatal("capability crossed its run/actor/kind/key boundary")
	}
	visitorToken, err := NewRunToken(key, runID, visitor)
	if err != nil || !VerifyRunToken(key, runID, visitor, visitorToken) {
		t.Fatal("visitor capability rejected")
	}
	for _, invalid := range []identity.Actor{{}, admin, {Kind: "visitor"}} {
		if _, err := NewRunToken(key, runID, invalid); err == nil {
			t.Fatal("invalid actor issued a capability")
		}
	}
	if _, err := NewRunToken(nil, runID, actor); err == nil {
		t.Fatal("empty signing key accepted")
	}
}

func FuzzRunTokenVerifier(f *testing.F) {
	f.Add("")
	f.Add(strings.Repeat("a", 43) + "." + strings.Repeat("a", 43))
	f.Fuzz(func(t *testing.T, token string) {
		actor := identity.Actor{Kind: "visitor", ID: uuid.MustParse("11111111-1111-4111-8111-111111111111")}
		_ = VerifyRunToken([]byte(strings.Repeat("k", 32)), actor.ID, actor, token)
	})
}
