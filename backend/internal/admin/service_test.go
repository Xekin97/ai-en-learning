package admin

import (
	"testing"

	"github.com/google/uuid"
)

func TestUserCursorV2Validation(t *testing.T) {
	t.Parallel()
	userID := uuid.MustParse("11111111-1111-4111-8111-111111111111")
	exact := NewUserCursor("  QekY2Nak  ", User{ID: userID, Username: "qeky2nak"})
	if exact.Version != UserCursorVersion || exact.MatchTier != 0 || exact.NormalizedUsername != "qeky2nak" {
		t.Fatalf("unexpected exact cursor: %#v", exact)
	}
	if !ValidUserCursor("QEKY2NAK", exact) {
		t.Fatal("valid case-insensitive exact cursor rejected")
	}

	partial := NewUserCursor("qeky2nak", User{ID: userID, Username: "Aqeky2nakZ"})
	if partial.MatchTier != 1 || partial.NormalizedUsername != "aqeky2nakz" || !ValidUserCursor("qeky2nak", partial) {
		t.Fatalf("unexpected partial cursor: %#v", partial)
	}

	emptyQuery := NewUserCursor("", User{ID: userID, Username: "Root_Admin"})
	if emptyQuery.MatchTier != 1 || !ValidUserCursor("", emptyQuery) {
		t.Fatalf("empty-query cursor must use the ordinary tier: %#v", emptyQuery)
	}

	for name, mutate := range map[string]func(UserCursorV2) UserCursorV2{
		"unknown version": func(cursor UserCursorV2) UserCursorV2 {
			cursor.Version++
			return cursor
		},
		"invalid tier": func(cursor UserCursorV2) UserCursorV2 {
			cursor.MatchTier = 2
			return cursor
		},
		"tier inconsistent with exact name": func(cursor UserCursorV2) UserCursorV2 {
			cursor.MatchTier = 1
			return cursor
		},
		"unnormalized username": func(cursor UserCursorV2) UserCursorV2 {
			cursor.NormalizedUsername = "QekY2Nak"
			return cursor
		},
		"username outside query": func(cursor UserCursorV2) UserCursorV2 {
			cursor.MatchTier = 1
			cursor.NormalizedUsername = "someone_else"
			return cursor
		},
		"username outside account contract": func(cursor UserCursorV2) UserCursorV2 {
			cursor.MatchTier = 1
			cursor.NormalizedUsername = "qeky2nak!"
			return cursor
		},
		"missing id": func(cursor UserCursorV2) UserCursorV2 {
			cursor.ID = uuid.Nil
			return cursor
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if candidate := mutate(exact); ValidUserCursor("qeky2nak", candidate) {
				t.Fatalf("invalid cursor accepted: %#v", candidate)
			}
		})
	}
}

func TestNormalizeUserQuery(t *testing.T) {
	t.Parallel()
	if got := NormalizeUserQuery("  Reader_01  "); got != "reader_01" {
		t.Fatalf("NormalizeUserQuery() = %q", got)
	}
}
