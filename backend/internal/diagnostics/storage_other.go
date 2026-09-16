//go:build !linux

package diagnostics

// Local UAT uses the non-root Linux container's private tmpfs, not a host disk.
func privateMemoryFilesystem(string) bool { return false }
