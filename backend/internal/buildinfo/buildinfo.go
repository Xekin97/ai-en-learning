// Package buildinfo reports build-time source digests and hashes the actual
// executable. Missing linker provenance is unknown, never a fabricated version.
package buildinfo

import (
	"crypto/sha256"
	"debug/buildinfo"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"strings"
)

var SourceSHA256 string
var ValidatorSHA256 string
var ErrUnavailable = errors.New("build provenance unavailable or mismatched")

type Info struct {
	Source    string `json:"source_sha256"`
	Validator string `json:"validator_sha256"`
	Binary    string `json:"binary_sha256"`
	GoVersion string `json:"go_version"`
}

func ValidDigest(value string) bool {
	raw, err := hex.DecodeString(value)
	return err == nil && len(raw) == 32 && hex.EncodeToString(raw) == value
}
func (i Info) Valid() bool {
	return ValidDigest(i.Source) && ValidDigest(i.Validator) && ValidDigest(i.Binary)
}
func Executable(path string, requireServer bool) (Info, error) {
	if path == "" {
		var err error
		path, err = os.Executable()
		if err != nil {
			return Info{}, ErrUnavailable
		}
	}
	before, err := os.Lstat(path)
	if err != nil || !before.Mode().IsRegular() {
		return Info{}, ErrUnavailable
	}
	f, err := os.Open(path)
	if err != nil {
		return Info{}, ErrUnavailable
	}
	defer f.Close()
	actual, err := f.Stat()
	if err != nil || !os.SameFile(before, actual) {
		return Info{}, ErrUnavailable
	}
	build, err := buildinfo.Read(f)
	if err != nil || requireServer && build.Path != "wordweave/cmd/wordweave" {
		return Info{}, ErrUnavailable
	}
	result := Info{GoVersion: build.GoVersion}
	for _, setting := range build.Settings {
		if setting.Key == "-ldflags" {
			for _, part := range strings.Fields(setting.Value) {
				if v, ok := strings.CutPrefix(part, "-X=wordweave/internal/buildinfo.SourceSHA256="); ok {
					result.Source = v
				}
				if v, ok := strings.CutPrefix(part, "-X=wordweave/internal/buildinfo.ValidatorSHA256="); ok {
					result.Validator = v
				}
			}
		}
	}
	hash := sha256.New()
	if _, err := io.Copy(hash, f); err != nil {
		return Info{}, ErrUnavailable
	}
	result.Binary = hex.EncodeToString(hash.Sum(nil))
	after, err := f.Stat()
	if err != nil || before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) {
		return Info{}, ErrUnavailable
	}
	if !result.Valid() {
		return Info{}, ErrUnavailable
	}
	return result, nil
}

// For replay, inspect the generating SERVER executable, not the admin binary.
// Both must be built from the same source tree and validator modules.
func MatchingServer(path string) (Info, error) {
	info, err := Executable(path, true)
	if err != nil || info.Source != SourceSHA256 || info.Validator != ValidatorSHA256 {
		return Info{}, ErrUnavailable
	}
	return info, nil
}
