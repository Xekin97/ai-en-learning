package main

import (
	"context"
	"errors"
	"flag"
	"io"
	"log/slog"
	"time"

	"wordweave/internal/platform/postgres"
)

func runEntryMeaningCutover(ctx context.Context, args []string, maintenanceURL string) error {
	options, err := parseEntryMeaningCutoverOptions(args)
	if err != nil {
		return err
	}
	if maintenanceURL == "" {
		return errors.New("MAINTENANCE_DATABASE_URL is required; no application-credential fallback")
	}
	// Deliberately does not load app configuration, decrypt model credentials,
	// initialize a provider, start HTTP, or run background maintenance.
	pool, err := postgres.Open(ctx, maintenanceURL, "wordweave-entry-meaning-cutover", 1)
	if err != nil {
		return errors.New("cannot open explicit maintenance connection")
	}
	defer pool.Close()
	result, err := postgres.CutoverEntryMeaning(ctx, pool, options)
	if err != nil {
		return err // CutoverError exposes stage/outcome only, never database detail.
	}
	slog.Info("entry-meaning cutover finished", "outcome", result.Outcome, "deleted_counts", result.Deleted)
	return nil
}

func parseEntryMeaningCutoverOptions(args []string) (postgres.CutoverOptions, error) {
	var options postgres.CutoverOptions
	flags := flag.NewFlagSet("cutover-entry-meaning", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.StringVar(&options.ExpectedDatabase, "database", "", "verified exact database name")
	flags.StringVar(&options.ExpectedSystemID, "system-id", "", "verified PostgreSQL cluster system identifier")
	flags.StringVar(&options.ExpectedRole, "role", "", "verified controlled maintenance role")
	flags.BoolVar(&options.WritersStopped, "writers-stopped", false, "all application writers have been stopped")
	flags.DurationVar(&options.LockTimeout, "lock-timeout", 0, "rehearsed lock timeout")
	flags.DurationVar(&options.StatementTimeout, "statement-timeout", 0, "rehearsed statement timeout")
	if flags.Parse(args) != nil || flags.NArg() != 0 ||
		options.ExpectedDatabase == "" || options.ExpectedSystemID == "" || options.ExpectedRole == "" ||
		!options.WritersStopped || options.LockTimeout < time.Millisecond || options.StatementTimeout < time.Millisecond {
		return options, errors.New("cutover requires --database, --system-id, --role, --writers-stopped, --lock-timeout and --statement-timeout; no bypass or retry options")
	}
	return options, nil
}
