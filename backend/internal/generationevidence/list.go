package generationevidence

import (
	"sort"
	"time"
)

// List exposes manifests only, never raw model content. Expired bundles are
// omitted without changing timestamps; the active manager owns TTL cleanup.
func List(path string, now time.Time) ([]Manifest, error) {
	d, err := openDisk(path)
	if err != nil {
		return nil, err
	}
	defer d.close()
	if err = d.acquire(); err != nil {
		return nil, err
	}
	defer d.release()
	if d.blocked() {
		return nil, ErrCleanup
	}
	items, err := d.manifests()
	if err != nil {
		return nil, err
	}
	if len(items) > MaxBundles {
		return nil, ErrUnsafe
	}
	out := make([]Manifest, 0, len(items))
	for _, m := range items {
		if now.Before(m.ExpiresAt) && !now.Before(m.CreatedAt) {
			out = append(out, m)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Admission > out[j].Admission })
	return out, nil
}
