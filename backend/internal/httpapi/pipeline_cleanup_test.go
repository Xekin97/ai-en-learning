package httpapi

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestReleasePipelineAfterJoinWaitsForDelayedExit(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	var released, timedOut atomic.Bool
	returned := make(chan struct{})
	go func() {
		releasePipelineAfterJoin(cancel, done, 20*time.Millisecond, func() { released.Store(true) }, func() { timedOut.Store(true) })
		close(returned)
	}()
	select {
	case <-ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("pipeline cancellation was not delivered")
	}
	select {
	case <-returned:
	case <-time.After(time.Second):
		t.Fatal("bounded join did not return")
	}
	if !timedOut.Load() {
		t.Fatal("delayed pipeline did not close admission")
	}
	if released.Load() {
		t.Fatal("capacity released before pipeline exit")
	}
	close(done)
	deadline := time.After(time.Second)
	for !released.Load() {
		select {
		case <-deadline:
			t.Fatal("capacity was not released after pipeline exit")
		default:
			time.Sleep(time.Millisecond)
		}
	}
}

func TestReleasePipelineAfterJoinReleasesSynchronouslyAfterExit(t *testing.T) {
	done := make(chan struct{})
	close(done)
	var released, timedOut atomic.Bool
	releasePipelineAfterJoin(func() {}, done, time.Second, func() { released.Store(true) }, func() { timedOut.Store(true) })
	if !released.Load() || timedOut.Load() {
		t.Fatalf("unexpected cleanup state: released=%t timed_out=%t", released.Load(), timedOut.Load())
	}
}
