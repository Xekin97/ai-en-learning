//go:build integration

package business

import (
	"testing"
	"time"
	"wordweave/internal/testdb"
)

func TestM002BusinessClockIsSampledAfterWaitingForConfiguration(t *testing.T) {
	pool, ctx := testdb.Open(t)
	held, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Rollback(ctx)
	if _, err = LockConfiguration(ctx, held, true); err != nil {
		t.Fatal(err)
	}
	pid := make(chan int, 1)
	type outcome struct {
		c   Configuration
		err error
	}
	done := make(chan outcome, 1)
	go func() {
		tx, err := pool.Begin(ctx)
		if err != nil {
			done <- outcome{err: err}
			return
		}
		defer tx.Rollback(ctx)
		var n int
		if err = tx.QueryRow(ctx, `SELECT pg_backend_pid()`).Scan(&n); err != nil {
			done <- outcome{err: err}
			return
		}
		pid <- n
		c, err := LockConfiguration(ctx, tx, false)
		done <- outcome{c, err}
	}()
	var blockedPID int
	select {
	case blockedPID = <-pid:
	case result := <-done:
		t.Fatal(result.err)
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	deadline := time.NewTimer(2 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(5 * time.Millisecond)
	defer tick.Stop()
	blocked := false
	for !blocked {
		select {
		case <-deadline.C:
			t.Fatal("configuration lock was not waited on")
		case <-tick.C:
			if err = pool.QueryRow(ctx, `SELECT wait_event_type='Lock' FROM pg_stat_activity WHERE pid=$1`, blockedPID).Scan(&blocked); err != nil {
				t.Fatal(err)
			}
		}
	}
	var released time.Time
	if err = held.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&released); err != nil {
		t.Fatal(err)
	}
	if err = held.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	result := <-done
	if result.err != nil || result.c.Now.Before(released) {
		t.Fatalf("business clock precedes acquired lock: sampled=%s release=%s %v", result.c.Now, released, result.err)
	}
}
