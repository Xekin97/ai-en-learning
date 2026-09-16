package generationevidence

import (
	"time"
	"unicode/utf8"

	gt "wordweave/internal/generationtrace"
)

// Material is private and ephemeral. It is neither a normal log DTO nor an
// export format. A command must Recheck the manifest immediately before output.
type Material struct {
	Spec       gt.EffectiveSpec
	Chunks     []string
	Summary    gt.Summary
	Processing map[string]string
}

// Reconstruct requires every original delta, with its exact byte boundary.
// A missing record is not repaired, inferred or accepted as a successful replay.
func Reconstruct(view View, current Fingerprint, now time.Time) (Material, string) {
	if !current.Valid() || view.Manifest.Fingerprint != current {
		return Material{}, "fingerprint_mismatch"
	}
	if !now.Before(view.Manifest.ExpiresAt) || now.Before(view.Manifest.CreatedAt) {
		return Material{}, "expired"
	}
	if view.Incomplete {
		return Material{}, "incomplete_journal"
	}
	// The private inspector can show both responses with their stage boundaries.
	// This single-response replay must not concatenate them or report corruption.
	// Multi-attempt replay is deliberately outside this bounded generation fix.
	for _, record := range view.Records {
		if record.Event != nil && record.Event.Fact.Check == "correction_started" {
			return Material{}, "multiple_model_attempts"
		}
	}
	m := Material{Processing: make(map[string]string)}
	var end *gt.ModelEnd
	specs, summaries := 0, 0
	total := int64(0)
	var index uint64
	originalBytes := 0
	currentText := ""
	for _, r := range view.Records {
		if r.State != nil && (r.State.Truncated || r.State.DroppedRecords > 0 || r.State.IOFailed || r.State.Redacted || r.State.Unavailable) {
			return Material{}, "capture_not_exact"
		}
		if r.Spec != nil {
			specs++
			m.Spec = *r.Spec
		}
		if r.Summary != nil {
			summaries++
			m.Summary = *r.Summary
		}
		if r.Processing != nil {
			p := r.Processing
			if (p.Kind != "candidate" && p.Kind != "validated" && p.Kind != "passage_deltas") || !digestValid(p.SHA256) || m.Processing[p.Kind] != "" {
				return Material{}, "invalid_processing"
			}
			m.Processing[p.Kind] = p.SHA256
		}
		if r.ModelEnd != nil {
			if end != nil || r.ModelEnd.Redacted || r.ModelEnd.Unavailable {
				return Material{}, "capture_not_exact"
			}
			end = r.ModelEnd
		}
		if r.Chunk == nil {
			continue
		}
		c := r.Chunk
		if c.Redacted {
			return Material{}, "capture_not_exact"
		}
		if end != nil || c.Index == 0 || c.OriginalBytes <= 0 || c.OriginalBytes > MaxBytes || len(c.Text) == 0 || !utf8.ValidString(c.Text) {
			return Material{}, "invalid_chunk"
		}
		if c.Index != index {
			if c.Index != index+1 || len(currentText) != originalBytes {
				return Material{}, "missing_chunk"
			}
			if index > 0 {
				m.Chunks = append(m.Chunks, currentText)
			}
			index = c.Index
			originalBytes = c.OriginalBytes
			currentText = ""
		}
		if c.OriginalBytes != originalBytes || c.Offset != len(currentText) || len(currentText)+len(c.Text) > originalBytes {
			return Material{}, "invalid_offset"
		}
		total += int64(len(c.Text))
		if total > MaxBytes {
			return Material{}, "capture_not_exact"
		}
		currentText += c.Text
	}
	if end == nil || end.Chunks != index || end.Bytes != total || len(currentText) != originalBytes {
		return Material{}, "missing_model_end_or_content"
	}
	if index > 0 {
		m.Chunks = append(m.Chunks, currentText)
	}
	if specs != 1 || summaries != 1 {
		return Material{}, "missing_spec_or_summary"
	}
	m.Spec.Entries = append([]string(nil), m.Spec.Entries...)
	return m, ""
}
