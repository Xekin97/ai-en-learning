//go:build linux

package diagnostics

import "golang.org/x/sys/unix"

func privateMemoryFilesystem(path string) bool {
	var stat unix.Statfs_t
	return unix.Statfs(path, &stat) == nil && stat.Type == 0x01021994
}
