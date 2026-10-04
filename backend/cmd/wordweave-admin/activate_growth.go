package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"os"

	"wordweave/internal/growth"
	"wordweave/internal/platform/postgres"
)

func runActivateGrowth(ctx context.Context, args []string, databaseURL string) error {
	flags := flag.NewFlagSet("activate-growth", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	confirmed := flags.Bool("confirm", false, "activate configured growth once")
	database := flags.String("database", "", "expected database")
	role := flags.String("role", "", "expected controlled operator role")
	if flags.Parse(args) != nil || flags.NArg() != 0 || !*confirmed || *database == "" || *role == "" || databaseURL == "" {
		return errors.New("activate-growth requires MAINTENANCE_DATABASE_URL and --database, --role, --confirm")
	}
	pool, err := postgres.Open(ctx, databaseURL, "wordweave-growth-activation", 1)
	if err != nil {
		return errors.New("cannot open explicit maintenance connection")
	}
	defer pool.Close()
	var actualDB, actualRole string
	if err = pool.QueryRow(ctx, `SELECT current_database(),current_user`).Scan(&actualDB, &actualRole); err != nil {
		return err
	}
	if actualDB != *database || actualRole != *role {
		return errors.New("growth activation target does not match the explicit database and role")
	}
	if err = postgres.VerifyMaintenance(ctx, pool); err != nil {
		return err
	}
	at, err := growth.Activate(ctx, pool)
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(struct {
		ActivatedAt string `json:"activated_at"`
	}{at.UTC().Format("2006-01-02T15:04:05.999999999Z07:00")})
}
