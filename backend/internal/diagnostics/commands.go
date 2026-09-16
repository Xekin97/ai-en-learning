package diagnostics

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"os"
	"path/filepath"
	"time"

	"wordweave/internal/ai"
	evidence "wordweave/internal/generationevidence"
	gt "wordweave/internal/generationtrace"
)

var ErrUsage = errors.New("usage: diagnostics inspect|replay|clear --dir PRIVATE_DIR [--id EVIDENCE_ID] [--content] [--mode model|stream] [--server SERVER_BINARY]")
var ErrReplay = errors.New("diagnostic replay unavailable or differs; see safe report")

type commandDeps struct {
	storage     func(string) error
	fingerprint func(string) (evidence.Fingerprint, error)
	now         func() time.Time
}

func checkStorage(path string) error {
	if !EnabledBuild {
		return ErrDisabled
	}
	if os.Geteuid() == 0 || !privateMemoryFilesystem(path) {
		return ErrConfiguration
	}
	return nil
}

// Run is dispatched before ordinary application config/DB setup. This package
// has no DB, credential store, HTTP client or model call in its command path.
func Run(ctx context.Context, args []string, out io.Writer) error {
	return runCommand(ctx, args, out, commandDeps{checkStorage, Fingerprint, time.Now})
}

type inspected struct {
	Manifest   evidence.Manifest `json:"manifest"`
	Incomplete bool              `json:"incomplete"`
	Bytes      int               `json:"bytes"`
	Summary    *gt.Summary       `json:"summary,omitempty"`
	Capture    *evidence.State   `json:"capture_state,omitempty"`
}

func runCommand(ctx context.Context, args []string, out io.Writer, deps commandDeps) error {
	if len(args) == 0 {
		return ErrUsage
	}
	action := args[0]
	if action != "inspect" && action != "replay" && action != "clear" {
		return ErrUsage
	}
	fs := flag.NewFlagSet("diagnostics", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	dir := fs.String("dir", "", "")
	id := fs.String("id", "", "")
	content := fs.Bool("content", false, "")
	mode := fs.String("mode", "stream", "")
	server := fs.String("server", "", "")
	if fs.Parse(args[1:]) != nil || fs.NArg() != 0 || *dir == "" || action != "inspect" && *id == "" || *content && (action != "inspect" || *id == "") {
		return ErrUsage
	}
	if ctx.Err() != nil {
		return evidence.ErrUnavailable
	}
	if err := deps.storage(*dir); err != nil {
		return err
	}
	if *id == "" {
		items, err := evidence.List(*dir, deps.now())
		if err != nil {
			return err
		}
		// Recheck after enumeration, so inspection never extends retention.
		for _, item := range items {
			if err = evidence.Recheck(*dir, item, deps.now()); err != nil {
				return err
			}
		}
		return encodeSafe(out, items)
	}
	if action == "clear" {
		// Deletion also works for expired/blocked bundles; Clear validates the
		// fixed identity, filename and manifest without returning content.
		if err := evidence.Clear(*dir, *id); err != nil {
			return err
		}
		return encodeSafe(out, struct {
			ID      string `json:"evidence_id"`
			Cleared bool   `json:"cleared"`
		}{*id, true})
	}
	view, err := evidence.Read(*dir, *id, deps.now())
	if err != nil {
		return err
	}
	if action == "inspect" {
		if err = evidence.Recheck(*dir, view.Manifest, deps.now()); err != nil {
			return err
		}
		if *content {
			return encodeSafe(out, view)
		}
		safe := inspected{Manifest: view.Manifest, Incomplete: view.Incomplete, Bytes: view.Bytes}
		for _, r := range view.Records {
			if r.Summary != nil {
				safe.Summary = r.Summary
			}
			if r.State != nil {
				safe.Capture = r.State
			}
		}
		return encodeSafe(out, safe)
	}
	if *server == "" {
		executable, e := os.Executable()
		if e != nil {
			return evidence.ErrUnavailable
		}
		*server = filepath.Join(filepath.Dir(executable), "wordweave")
	}
	fp, err := deps.fingerprint(*server)
	if err != nil {
		return err
	}
	lexicon, err := ai.LoadEmbeddedLexicon()
	if err != nil {
		return evidence.ErrUnavailable
	}
	report := ai.ReplayEvidence(ctx, view, fp, ai.ReplayMode(*mode), ai.NewValidator(lexicon))
	if err = evidence.Recheck(*dir, view.Manifest, deps.now()); err != nil {
		return err
	}
	if ctx.Err() != nil {
		return evidence.ErrUnavailable
	}
	if err = encodeSafe(out, report); err != nil {
		return err
	}
	if report.Status != "reproduced" {
		return ErrReplay
	}
	return nil
}
func encodeSafe(out io.Writer, value any) error {
	if json.NewEncoder(out).Encode(value) != nil {
		return evidence.ErrUnavailable
	}
	return nil
}
