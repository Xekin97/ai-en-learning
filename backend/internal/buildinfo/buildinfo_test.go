package buildinfo

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"testing"
)

func TestOBS042CBuildProvenanceNotInvented(t *testing.T) {
	for _, bad := range []string{"", "version-v1", "ab", "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"} {
		if ValidDigest(bad) {
			t.Fatal("invalid digest")
		}
	}
	if _, err := Executable(os.Args[0], true); err == nil {
		t.Fatal("test binary accepted as server")
	}
	if _, err := Executable("/nonexistent/synthetic-binary", true); err == nil {
		t.Fatal("nonexistent binary")
	}
}
func TestOBS042CActualServerArtifact(t *testing.T) {
	p := os.Getenv("TEST_SERVER_BINARY")
	if p == "" {
		t.Skip("isolated compiled server artifact not supplied")
	}
	info, err := Executable(p, true)
	if err != nil {
		t.Fatal(err)
	}
	if !info.Valid() {
		t.Fatal("actual artifact provenance missing")
	}
	raw, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(raw)
	if info.Binary != hex.EncodeToString(digest[:]) {
		t.Fatal("actual binary bytes not hashed")
	}
	if info.Source != os.Getenv("TEST_SOURCE_SHA256") || info.Validator != os.Getenv("TEST_VALIDATOR_SHA256") {
		t.Fatal("artifact does not match source manifest")
	}
	t.Logf("server source=%s binary=%s validator=%s", info.Source, info.Binary, info.Validator)
	oldSource, oldValidator := SourceSHA256, ValidatorSHA256
	t.Cleanup(func() { SourceSHA256, ValidatorSHA256 = oldSource, oldValidator })
	SourceSHA256, ValidatorSHA256 = info.Source, info.Validator
	if _, err := MatchingServer(p); err != nil {
		t.Fatal("matching source rejected", err)
	}
	SourceSHA256 = "different-source"
	if _, err := MatchingServer(p); err == nil {
		t.Fatal("mismatched admin source accepted")
	}
	if admin := os.Getenv("TEST_ADMIN_BINARY"); admin != "" {
		if _, err := Executable(admin, true); err == nil {
			t.Fatal("admin binary treated as generating server")
		}
	}
}
