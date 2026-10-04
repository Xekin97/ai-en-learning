//go:build integration

package notices

import (
	"errors"
	"github.com/google/uuid"
	"testing"
	"wordweave/internal/platform/business"
	"wordweave/internal/testdb"
)

func TestNoticeVisibilityRevisionAndPagination(t *testing.T) {
	pool, ctx := testdb.Open(t)
	actor := testdb.Learner(t, ctx, pool)
	s := NewService(pool, []byte("test-notices-key"))
	input := Input{Title: business.Bilingual{EN: text("News")}, Body: business.Bilingual{EN: text("Full body")}, Visible: true, Remind: true}
	var ids []uuid.UUID
	for i := 0; i < 3; i++ {
		n, _, err := s.Save(ctx, actor, uuid.Nil, "", input)
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, n.ID)
	}
	if _, err := pool.Exec(ctx, `UPDATE wordweave.platform_notices SET published_at='2026-01-01T00:00:00Z'`); err != nil {
		t.Fatal(err)
	}
	seen := map[uuid.UUID]bool{}
	var cursor *Cursor
	for i := 0; i < 3; i++ {
		rows, more, err := s.List(ctx, "en-US", true, cursor, 1)
		if err != nil {
			t.Fatal(err)
		}
		if len(rows) != 1 || seen[rows[0].ID] || more != (i < 2) {
			t.Fatalf("unstable page: %+v %v", rows, more)
		}
		n := rows[0]
		seen[n.ID] = true
		cursor = &Cursor{PublishedAt: n.PublishedAt, ID: n.ID, Remind: n.Remind}
	}
	before, rev, err := s.AdminGet(ctx, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	input.Visible = false
	n, _, err := s.Save(ctx, actor, ids[0], rev, input)
	if err != nil {
		t.Fatal(err)
	}
	if !n.PublishedAt.Equal(before.PublishedAt) {
		t.Fatal("edit changed publication time")
	}
	if _, err = s.Get(ctx, ids[0], "en-US"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("hidden notice visible: %v", err)
	}
	_, _, err = s.Save(ctx, actor, ids[0], rev, input)
	var conflict *business.RevisionConflict
	if !errors.As(err, &conflict) {
		t.Fatalf("stale write accepted: %v", err)
	}
	rows, _, err := s.List(ctx, "en-US", true, nil, 10)
	if err != nil || len(rows) != 2 {
		t.Fatalf("reminder visibility: %d %v", len(rows), err)
	}
}

func TestNoticeOnceConfiguration(t *testing.T) {
	pool, ctx := testdb.Open(t)
	actor := testdb.Learner(t, ctx, pool)
	s := NewService(pool, []byte("once-key"))
	in := Input{Title: business.Bilingual{EN: text("Once")}, Body: business.Bilingual{EN: text("Body")}, Visible: true, Remind: true}
	n, rev, err := s.Save(ctx, actor, uuid.Nil, "", in)
	if err != nil {
		t.Fatal(err)
	}
	if n.RemindOnce {
		t.Fatal("old/default input must remain repeatable")
	}
	var dbDefault bool
	if err := pool.QueryRow(ctx, `INSERT INTO wordweave.platform_notices(title_en,body_en,published_at) VALUES('Legacy','Body',now()) RETURNING remind_once`).Scan(&dbDefault); err != nil {
		t.Fatal(err)
	}
	if dbDefault {
		t.Fatal("database default must be false")
	}
	for _, once := range []bool{true, false, true} {
		in.RemindOnce = once
		updated, next, err := s.Save(ctx, actor, n.ID, rev, in)
		if err != nil {
			t.Fatal(err)
		}
		if updated.RemindOnce != once || !updated.PublishedAt.Equal(n.PublishedAt) {
			t.Fatal("save changed identity or once setting")
		}
		fetched, _, err := s.AdminGet(ctx, n.ID)
		if err != nil || fetched.RemindOnce != once {
			t.Fatalf("admin roundtrip: %+v %v", fetched, err)
		}
		public, err := s.Get(ctx, n.ID, "en-US")
		if err != nil || public.RemindOnce != once {
			t.Fatalf("public roundtrip: %+v %v", public, err)
		}
		list, _, err := s.List(ctx, "en-US", true, nil, 10)
		if err != nil || len(list) != 1 || list[0].RemindOnce != once {
			t.Fatalf("reminder projection: %+v %v", list, err)
		}
		if _, _, err := s.Save(ctx, actor, n.ID, rev, in); err == nil {
			t.Fatal("stale revision accepted")
		}
		rev = next
	}
	in.Remind = false
	_, rev, err = s.Save(ctx, actor, n.ID, rev, in)
	if err != nil {
		t.Fatal(err)
	}
	list, _, err := s.List(ctx, "en-US", true, nil, 10)
	if err != nil || len(list) != 0 {
		t.Fatal("disabled reminder leaked")
	}
	manual, err := s.Get(ctx, n.ID, "en-US")
	if err != nil || !manual.RemindOnce {
		t.Fatal("switch lost value or manual notice hidden")
	}
	in.Visible = false
	_, _, err = s.Save(ctx, actor, n.ID, rev, in)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Get(ctx, n.ID, "en-US"); !errors.Is(err, ErrNotFound) {
		t.Fatal("hidden notice accessible")
	}
}
