package vocabulary

import (
	"reflect"
	"strings"
	"testing"
)

func TestBlockedCandidateEntriesAreExactDATA307Catalogue(t *testing.T) {
	want := []string{
		"i", "me", "you", "he", "him", "she", "her", "it", "we", "us", "they", "them",
		"my", "mine", "your", "yours", "his", "hers", "its", "our", "ours", "their", "theirs",
		"a", "an", "the", "be", "am", "is", "are", "was", "were", "been", "being",
		"and", "or", "but", "so", "yes", "no", "yeah",
	}
	if !reflect.DeepEqual(blockedCandidateEntries, want) {
		t.Fatalf("DATA-307 catalogue drifted: got=%v", blockedCandidateEntries)
	}
	seen := make(map[string]bool, len(blockedCandidateEntries))
	for _, entry := range blockedCandidateEntries {
		if entry != strings.ToLower(entry) || seen[entry] {
			t.Fatalf("catalogue entry is not unique lowercase: %q", entry)
		}
		seen[entry] = true
	}
	for _, allowed := range []string{"art", "go", "theater", "another"} {
		if seen[allowed] {
			t.Fatalf("allowed exact entry was blocked: %q", allowed)
		}
	}
}

func TestRandomCandidateFiltersBeforeRandomLimit(t *testing.T) {
	predicate := strings.Index(randomCandidateSQL, "lower(v.entry) <> ALL($4::text[])")
	randomOrder := strings.Index(randomCandidateSQL, "ORDER BY random()")
	limit := strings.Index(randomCandidateSQL, "LIMIT 1")
	if predicate < 0 || randomOrder < 0 || limit < 0 || predicate > randomOrder || predicate > limit {
		t.Fatalf("blocked predicate must precede random ordering and limit: %s", randomCandidateSQL)
	}
}
