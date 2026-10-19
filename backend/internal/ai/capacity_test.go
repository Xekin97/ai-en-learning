package ai

import (
	"strings"
	"testing"
	"time"
)

func TestRetryAfterDurationIsBounded(t *testing.T) {
	if got := retryAfterDuration("900"); got != 600*time.Second {
		t.Fatalf("upper bound=%s", got)
	}
	if got := retryAfterDuration("invalid"); got != 30*time.Second {
		t.Fatalf("fallback=%s", got)
	}
}

func TestUnsavedProbeCapacityKeyDoesNotExposeEndpoint(t *testing.T) {
	snapshot := connectionSnapshot{connection: Connection{Protocol: ProtocolChat, BaseURL: "https://provider.example/private-account"}}
	key := connectionCapacityKey(GenerationSpec{}, snapshot)
	if key == "" || strings.Contains(key, "provider.example") || strings.Contains(key, "private-account") {
		t.Fatalf("unsafe capacity key %q", key)
	}
	if key != connectionCapacityKey(GenerationSpec{}, snapshot) {
		t.Fatal("unsaved probe capacity key is not stable")
	}
}
