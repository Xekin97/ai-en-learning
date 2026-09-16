package main

import (
	"context"
	"testing"
)

func TestCutoverRequiresExplicitTargetAndStoppedWriters(t *testing.T) {
	valid := []string{"--database", "synthetic", "--system-id", "1234", "--role", "postgres", "--writers-stopped", "--lock-timeout", "1s", "--statement-timeout", "10s"}
	if _, err := parseEntryMeaningCutoverOptions(valid); err != nil {
		t.Fatal(err)
	}
	for _, args := range [][]string{nil, valid[:6], append(append([]string{}, valid...), "--force"), append(append([]string{}, valid...), "--lock-timeout", "0")} {
		if _, err := parseEntryMeaningCutoverOptions(args); err == nil {
			t.Fatal("unsafe options accepted")
		}
	}
	if err := runEntryMeaningCutover(context.Background(), valid, ""); err == nil {
		t.Fatal("application credential fallback must not exist")
	}
}
