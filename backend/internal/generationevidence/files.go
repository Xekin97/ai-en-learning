package generationevidence

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sys/unix"
)

type disk struct {
	root *os.Root
	lock *os.File
}

func openDisk(path string) (*disk, error) {
	if !filepath.IsAbs(path) || filepath.Clean(path) == string(filepath.Separator) {
		return nil, ErrUnsafe
	}
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil || canonical != path {
		return nil, ErrUnsafe
	}
	info, err := os.Lstat(path)
	if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 || !owned(info) {
		return nil, ErrUnsafe
	}
	root, err := os.OpenRoot(path)
	if err != nil {
		return nil, ErrUnsafe
	}
	d := &disk{root: root}
	lock, err := root.OpenFile(".lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		root.Close()
		return nil, ErrUnsafe
	}
	d.lock = lock
	if !d.validFile(".lock", lock) {
		d.close()
		return nil, ErrUnsafe
	}
	return d, nil
}
func owned(info os.FileInfo) bool {
	s, ok := info.Sys().(*syscall.Stat_t)
	return ok && s.Uid == uint32(os.Geteuid())
}
func (d *disk) validFile(name string, f *os.File) bool {
	before, err := d.root.Lstat(name)
	if err != nil || !before.Mode().IsRegular() || before.Mode().Perm() != 0600 || !owned(before) {
		return false
	}
	actual, err := f.Stat()
	if err != nil || !os.SameFile(before, actual) {
		return false
	}
	s, ok := actual.Sys().(*syscall.Stat_t)
	return ok && s.Nlink == 1
}
func (d *disk) acquire() error {
	if unix.Flock(int(d.lock.Fd()), unix.LOCK_EX|unix.LOCK_NB) != nil {
		return ErrBusy
	}
	return nil
}
func (d *disk) release() { _ = unix.Flock(int(d.lock.Fd()), unix.LOCK_UN) }
func (d *disk) close() {
	if d.lock != nil {
		_ = d.lock.Close()
	}
	if d.root != nil {
		_ = d.root.Close()
	}
}
func filename(id string) (string, error) {
	u, err := uuid.Parse(id)
	if err != nil || u == uuid.Nil || u.String() != id {
		return "", ErrUnsafe
	}
	return id + ".jsonl", nil
}
func (d *disk) open(name string) (*os.File, error) {
	info, err := d.root.Lstat(name)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrUnavailable
	}
	if err != nil || !info.Mode().IsRegular() {
		return nil, ErrUnsafe
	}
	f, err := d.root.Open(name)
	if err != nil {
		return nil, ErrUnavailable
	}
	if !d.validFile(name, f) {
		f.Close()
		return nil, ErrUnsafe
	}
	return f, nil
}
func parseManifest(first []byte) (Manifest, error) {
	var row line
	var record Record
	if json.Unmarshal(first, &row) != nil || row.Sequence != 1 || row.Previous != "" || row.Digest != Digest(row.Record) || json.Unmarshal(row.Record, &record) != nil || record.Manifest == nil {
		return Manifest{}, ErrUnsafe
	}
	m := *record.Manifest
	if m.Schema != SchemaVersion || m.AccountID != DedicatedAccountID || m.Admission == 0 || m.ExpiresAt.Sub(m.CreatedAt) != Retention || !m.Fingerprint.Valid() {
		return Manifest{}, ErrUnsafe
	}
	if _, err := filename(m.ID); err != nil {
		return Manifest{}, err
	}
	return m, nil
}
func (d *disk) manifest(name string) (Manifest, error) {
	f, err := d.open(name)
	if err != nil {
		return Manifest{}, err
	}
	defer f.Close()
	raw, err := bufio.NewReaderSize(f, 16<<10).ReadSlice('\n')
	if err != nil {
		return Manifest{}, ErrUnsafe
	}
	m, err := parseManifest(raw)
	if err != nil || name != m.ID+".jsonl" {
		return Manifest{}, ErrUnsafe
	}
	return m, nil
}
func (d *disk) manifests() ([]Manifest, error) {
	dir, err := d.root.Open(".")
	if err != nil {
		return nil, ErrUnsafe
	}
	entries, err := dir.ReadDir(-1)
	dir.Close()
	if err != nil {
		return nil, ErrUnsafe
	}
	var out []Manifest
	for _, entry := range entries {
		name := entry.Name()
		if name == ".lock" || name == ".owner" || name == ".blocked" {
			continue
		}
		if !strings.HasSuffix(name, ".jsonl") {
			return nil, ErrUnsafe
		}
		m, err := d.manifest(name)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}
func (d *disk) remove(m Manifest) error {
	name, _ := filename(m.ID)
	info, err := d.root.Lstat(name)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm() != 0600 || !owned(info) {
		return ErrCleanup
	}
	if err := d.root.Remove(name); err != nil {
		return ErrCleanup
	}
	return nil
}

func (d *disk) blocked() bool {
	_, err := d.root.Lstat(".blocked")
	if !errors.Is(err, os.ErrNotExist) {
		return true
	}
	f, err := d.open(".owner")
	if errors.Is(err, ErrUnavailable) {
		return false
	}
	if err != nil {
		return true
	}
	defer f.Close()
	var flag [1]byte
	n, err := f.ReadAt(flag[:], 0)
	return err != nil && !errors.Is(err, io.EOF) || n > 0 && flag[0] != 0
}

type View struct {
	Manifest   Manifest
	Records    []Record
	Incomplete bool
	Bytes      int
}

// Read is for one explicitly selected bundle; never creates files or extends TTL.
// Call Recheck before publishing content or replay output after expensive work.
func Read(path, id string, now time.Time) (View, error) {
	d, err := openDisk(path)
	if err != nil {
		return View{}, err
	}
	defer d.close()
	if err = d.acquire(); err != nil {
		return View{}, err
	}
	defer d.release()
	if d.blocked() {
		return View{}, ErrCleanup
	}
	name, err := filename(id)
	if err != nil {
		return View{}, err
	}
	m, err := d.manifest(name)
	if err != nil {
		return View{}, err
	}
	if !now.Before(m.ExpiresAt) || now.Before(m.CreatedAt) {
		return View{}, ErrUnavailable
	}
	f, err := d.open(name)
	if err != nil {
		return View{}, err
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, MaxBytes+1))
	if err != nil || len(raw) > MaxBytes {
		return View{}, ErrUnsafe
	}
	defer clear(raw)
	view := View{Manifest: m, Bytes: len(raw)}
	previous := ""
	sequence := uint64(0)
	for len(raw) > 0 {
		end := bytes.IndexByte(raw, '\n')
		if end < 0 {
			view.Incomplete = true
			break
		}
		var row line
		var record Record
		if json.Unmarshal(raw[:end], &row) != nil || row.Sequence != sequence+1 || row.Previous != previous || row.Digest != Digest(append([]byte(previous), row.Record...)) || json.Unmarshal(row.Record, &record) != nil {
			return View{}, ErrUnsafe
		}
		view.Records = append(view.Records, record)
		sequence = row.Sequence
		previous = row.Digest
		raw = raw[end+1:]
	}
	foundSummary := false
	for _, r := range view.Records {
		if r.Summary != nil {
			foundSummary = true
		}
	}
	view.Incomplete = view.Incomplete || !foundSummary
	return view, nil
}
func Recheck(path string, m Manifest, now time.Time) error {
	if !now.Before(m.ExpiresAt) || now.Before(m.CreatedAt) {
		return ErrUnavailable
	}
	d, err := openDisk(path)
	if err != nil {
		return err
	}
	defer d.close()
	if err = d.acquire(); err != nil {
		return err
	}
	defer d.release()
	if d.blocked() {
		return ErrCleanup
	}
	current, err := d.manifest(m.ID + ".jsonl")
	if err != nil || current != m {
		return ErrUnavailable
	}
	return nil
}

// Clear removes only a validated, explicitly named bundle. Writers never recreate
// an existing bundle, so clearing also revokes future asynchronous appends.
func Clear(path, id string) error {
	d, err := openDisk(path)
	if err != nil {
		return err
	}
	defer d.close()
	if err = d.acquire(); err != nil {
		return err
	}
	defer d.release()
	name, err := filename(id)
	if err != nil {
		return err
	}
	m, err := d.manifest(name)
	if err != nil {
		return err
	}
	return d.remove(m)
}
