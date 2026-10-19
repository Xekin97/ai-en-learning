package capacity

import (
	"errors"
	"sync"
	"testing"
	"time"
)

func testGate(t *testing.T) *Gate {
	t.Helper()
	g, err := New(Config{Global: 2, Preview: 1, Probe: 1, Preflight: 2, Connection: 1, RetryAfter: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func TestGateAllOrNoneAndReleaseOnce(t *testing.T) {
	g := testGate(t)
	a, err := g.TryAcquire(Generation, "account-a")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = g.TryAcquire(Preview, "account-a"); !errors.Is(err, ErrBusy) {
		t.Fatalf("connection limit did not reject: %v", err)
	}
	if got := g.Snapshot(); got.Global != 1 || got.Preview != 0 {
		t.Fatalf("partial counters leaked: %+v", got)
	}
	a.Release()
	a.Release()
	if got := g.Snapshot(); got.Global != 0 {
		t.Fatalf("release was not once-only: %+v", got)
	}
}

func TestGateConcurrentAdmissionNeverExceedsLimit(t *testing.T) {
	g := testGate(t)
	var wg sync.WaitGroup
	start := make(chan struct{})
	leases := make(chan *Lease, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			if l, err := g.TryAcquire(Generation, string(rune('a'+i))); err == nil {
				leases <- l
			}
		}(i)
	}
	close(start)
	wg.Wait()
	close(leases)
	if len(leases) != 2 {
		t.Fatalf("admitted %d, want 2", len(leases))
	}
	for l := range leases {
		l.Release()
	}
}

func TestGateUnknownClosesAdmissionBeforeRelease(t *testing.T) {
	g := testGate(t)
	l, _ := g.TryAcquire(Generation, "account-a")
	g.ReleaseUnknown(l, "generation:one")
	g.SetSettlementHealthy(true)
	if got := g.Snapshot(); got.Global != 0 || got.SettlementHealthy {
		t.Fatalf("unexpected snapshot: %+v", got)
	}
	if _, err := g.TryAcquire(Generation, "account-b"); !errors.Is(err, ErrBusy) {
		t.Fatalf("unhealthy gate admitted: %v", err)
	}
	g.ResolvePending("generation:one")
	g.SetSettlementHealthy(true)
	if l, err := g.TryAcquire(Generation, "account-b"); err != nil {
		t.Fatalf("resolved gate stayed closed: %v", err)
	} else {
		l.Release()
	}
}

func TestGateUnknownCannotRaceHealthyReopen(t *testing.T) {
	for i := 0; i < 100; i++ {
		g := testGate(t)
		lease, err := g.TryAcquire(Generation, "account-a")
		if err != nil {
			t.Fatal(err)
		}
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			g.ReleaseUnknown(lease, "generation:race")
		}()
		go func() {
			defer wg.Done()
			<-start
			g.SetSettlementHealthy(true)
		}()
		close(start)
		wg.Wait()
		if snapshot := g.Snapshot(); snapshot.Global != 0 || snapshot.SettlementHealthy || snapshot.PendingUnknown != 1 {
			t.Fatalf("unknown release reopened admission: %+v", snapshot)
		}
	}
}

func TestGateReleaseAndReleaseUnknownCannotDeadlockOrReopen(t *testing.T) {
	for i := 0; i < 500; i++ {
		g := testGate(t)
		lease, err := g.TryAcquire(Generation, "account-a")
		if err != nil {
			t.Fatal(err)
		}
		start := make(chan struct{})
		done := make(chan struct{}, 2)
		go func() {
			<-start
			lease.Release()
			done <- struct{}{}
		}()
		go func() {
			<-start
			g.ReleaseUnknown(lease, "generation:release-race")
			done <- struct{}{}
		}()
		close(start)
		for completed := 0; completed < 2; completed++ {
			select {
			case <-done:
			case <-time.After(time.Second):
				t.Fatal("Release and ReleaseUnknown deadlocked")
			}
		}
		if snapshot := g.Snapshot(); snapshot.Global != 0 || snapshot.SettlementHealthy || snapshot.PendingUnknown != 1 {
			t.Fatalf("release race lost the unknown health fact: %+v", snapshot)
		}
		if _, err := g.TryAcquire(Generation, "account-b"); !errors.Is(err, ErrBusy) {
			t.Fatalf("release race reopened admission: %v", err)
		}
	}
}

func TestGateConnectionCooldownOnlyRejectsNewAdmission(t *testing.T) {
	g := testGate(t)
	active, _ := g.TryAcquire(Generation, "account-a")
	g.Cooldown("account-a", time.Minute)
	active.Release()
	if _, err := g.TryAcquire(Generation, "account-a"); !errors.Is(err, ErrBusy) {
		t.Fatalf("cooldown did not reject: %v", err)
	}
	if other, err := g.TryAcquire(Generation, "account-b"); err != nil {
		t.Fatalf("unrelated connection rejected: %v", err)
	} else {
		other.Release()
	}
}

func TestGateGroupsAliasedConnectionsAndConservativelyGroupsUnknown(t *testing.T) {
	g, err := New(Config{
		Global: 4, Preview: 1, Probe: 1, Preflight: 4, Connection: 1, RetryAfter: time.Second,
		ConnectionGroups:       map[string]string{"connection-a": "account-a", "connection-b": "account-a"},
		DefaultConnectionGroup: "unmapped",
	})
	if err != nil {
		t.Fatal(err)
	}
	a, err := g.TryAcquire(Generation, "connection-a")
	if err != nil {
		t.Fatal(err)
	}
	defer a.Release()
	if _, err = g.TryAcquire(Generation, "connection-b"); !errors.Is(err, ErrBusy) {
		t.Fatalf("aliased provider account bypassed its group limit: %v", err)
	}
	unknown, err := g.TryAcquire(Generation, "connection-c")
	if err != nil {
		t.Fatal(err)
	}
	defer unknown.Release()
	if _, err = g.TryAcquire(Generation, "connection-d"); !errors.Is(err, ErrBusy) {
		t.Fatalf("unmapped connections bypassed conservative group limit: %v", err)
	}
}

func TestGateSnapshotReportsBoundedBusyReasonsAndPreflightDuration(t *testing.T) {
	g := testGate(t)
	first, err := g.TryAcquire(Generation, "account-a")
	if err != nil {
		t.Fatal(err)
	}
	defer first.Release()
	if _, err = g.TryAcquire(Generation, "account-a"); !errors.Is(err, ErrBusy) {
		t.Fatalf("connection limit did not reject: %v", err)
	}
	preflight, err := g.TryAcquire(Preflight, "")
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(time.Millisecond)
	preflight.Release()
	snapshot := g.Snapshot()
	if snapshot.Connection != 1 || snapshot.ConnectionGroups != 1 || snapshot.Rejected.Connection != 1 {
		t.Fatalf("capacity snapshot lost active/rejection facts: %+v", snapshot)
	}
	if snapshot.PreflightCompleted != 1 || snapshot.PreflightDuration <= 0 {
		t.Fatalf("preflight duration not recorded: %+v", snapshot)
	}
}
