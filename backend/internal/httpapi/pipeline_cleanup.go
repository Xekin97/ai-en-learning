package httpapi

import (
	"context"
	"time"
)

const pipelineJoinTimeout = 5 * time.Second

// releasePipelineAfterJoin keeps the capacity lease until the provider and all
// usage callbacks have returned. A provider that ignores cancellation closes
// admission through onTimeout and transfers the eventual release to a waiter;
// it can never make the lease available while work is still running.
func releasePipelineAfterJoin(cancel context.CancelFunc, done <-chan struct{}, wait time.Duration, release, onTimeout func()) {
	cancel()
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-done:
		release()
	case <-timer.C:
		onTimeout()
		go func() {
			<-done
			release()
		}()
	}
}
