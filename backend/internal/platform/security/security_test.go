package security

import (
	"strings"
	"testing"
	"time"
)

func TestPasswordHashRoundTrip(t *testing.T) {
	password := "correct horse battery staple"
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	valid, err := VerifyPassword(hash, password)
	if err != nil || !valid {
		t.Fatalf("valid=%v err=%v", valid, err)
	}
	valid, err = VerifyPassword(hash, "wrong password")
	if err != nil || valid {
		t.Fatalf("wrong password valid=%v err=%v", valid, err)
	}
}

func TestCursorIsBoundToScopeAndIntegrity(t *testing.T) {
	signer := NewCursorSigner([]byte(strings.Repeat("k", 32)))
	token, err := signer.Encode("users:q", map[string]int{"page": 2})
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]int
	if err := signer.Decode("users:q", token, &decoded); err != nil || decoded["page"] != 2 {
		t.Fatalf("decoded=%v err=%v", decoded, err)
	}
	if err := signer.Decode("users:other", token, &decoded); err == nil {
		t.Fatal("cursor unexpectedly accepted in another scope")
	}
}

func TestCSRFSignerBindsSubjectAndExpiry(t *testing.T) {
	now := time.Unix(2_000_000_000, 0)
	signer := NewCSRFSigner([]byte(strings.Repeat("c", 32)), time.Minute)
	token, err := signer.Sign("account:one", now)
	if err != nil {
		t.Fatal(err)
	}
	if !signer.Verify(token, "account:one", now.Add(30*time.Second)) {
		t.Fatal("valid CSRF token rejected")
	}
	if signer.Verify(token, "account:two", now) || signer.Verify(token, "account:one", now.Add(2*time.Minute)) {
		t.Fatal("CSRF subject or expiry was not enforced")
	}
}
