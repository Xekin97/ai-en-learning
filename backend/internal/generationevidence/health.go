package generationevidence

import "sync/atomic"

type counters struct {
	admitted, rejected, complete, incomplete, metadataOnly              atomic.Uint64
	droppedRecords, droppedBytes, truncated, writeFailed, cleanupFailed atomic.Uint64
}
type Health struct {
	Admitted, Rejected, Complete, Incomplete, MetadataOnly              uint64
	DroppedRecords, DroppedBytes, Truncated, WriteFailed, CleanupFailed uint64
}

func (m *Manager) Health() Health {
	if m == nil {
		return Health{}
	}
	c := &m.counters
	return Health{c.admitted.Load(), c.rejected.Load(), c.complete.Load(), c.incomplete.Load(), c.metadataOnly.Load(), c.droppedRecords.Load(), c.droppedBytes.Load(), c.truncated.Load(), c.writeFailed.Load(), c.cleanupFailed.Load()}
}

// Caller holds only the bundle's memory mutex, never the IO/admission lock.
func (b *Bundle) dropped(bytes uint64, truncated bool) {
	b.state.DroppedRecords++
	b.state.DroppedBytes += bytes
	b.manager.counters.droppedRecords.Add(1)
	b.manager.counters.droppedBytes.Add(bytes)
	if truncated && !b.state.Truncated {
		b.manager.counters.truncated.Add(1)
	}
	b.state.Truncated = b.state.Truncated || truncated
}
