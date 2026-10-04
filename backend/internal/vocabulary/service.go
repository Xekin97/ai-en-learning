package vocabulary

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/dbgen"
	"wordweave/internal/entitlement"
	"wordweave/internal/identity"
	"wordweave/internal/platform/business"
)

var ErrInvalidQuery = errors.New("invalid vocabulary query")

type Service struct {
	pool    *pgxpool.Pool
	queries *dbgen.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{queries: dbgen.New(pool), pool: pool}
}

type RandomResult struct {
	Entry  *string `json:"entry"`
	Reason *string `json:"reason"`
}

func (s *Service) Random(ctx context.Context, actor identity.Actor, selected []string) (RandomResult, error) {
	var result RandomResult
	if actor.IsAdmin() {
		return result, entitlement.ErrForbidden
	}
	seen := make(map[string]bool, len(selected))
	entries := make([]string, 0, len(selected))
	for _, entry := range selected {
		entry = strings.ToLower(strings.TrimSpace(entry))
		if entry == "" || !utf8.ValidString(entry) {
			return result, ErrInvalidQuery
		}
		if !seen[entry] {
			seen[entry] = true
			entries = append(entries, entry)
		}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return result, err
	}
	plan, err := entitlement.Resolve(ctx, tx, actor, c.Now)
	if err != nil {
		return result, err
	}
	if len(entries) > plan.MaxEntries {
		return result, ErrInvalidQuery
	}
	var count int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM wordweave.vocabulary_entries v JOIN wordweave.vocabulary_snapshots s ON s.id=v.snapshot_id WHERE s.version='m001' AND v.entry=ANY($1)`, entries).Scan(&count); err != nil {
		return result, err
	}
	if count != len(entries) {
		return result, ErrInvalidQuery
	}
	if len(entries) == plan.MaxEntries {
		reason := "limit_reached"
		result.Reason = &reason
		return result, nil
	}
	var entry string
	err = tx.QueryRow(ctx, randomCandidateSQL, entries, actor.ID, actor.IsLearner()).Scan(&entry)
	if errors.Is(err, pgx.ErrNoRows) {
		reason := "no_candidates"
		result.Reason = &reason
		return result, nil
	}
	if err != nil {
		return result, err
	}
	result.Entry = &entry
	return result, nil
}

type SearchResult struct {
	Items   []string
	Version string
}

func (s *Service) Search(ctx context.Context, query string, limit int32) (SearchResult, error) {
	if !utf8.ValidString(query) || utf8.RuneCountInString(query) < 1 || utf8.RuneCountInString(query) > 64 || limit < 1 || limit > 20 {
		return SearchResult{}, ErrInvalidQuery
	}
	rows, err := s.queries.SearchVocabulary(ctx, dbgen.SearchVocabularyParams{Query: query, ResultLimit: limit})
	if err != nil {
		return SearchResult{}, fmt.Errorf("search vocabulary: %w", err)
	}
	snapshot, err := s.queries.GetVocabularySnapshot(ctx)
	if err != nil {
		return SearchResult{}, fmt.Errorf("read vocabulary snapshot: %w", err)
	}
	return SearchResult{Items: rows, Version: "sha256:" + snapshot.Sha256}, nil
}

const randomCandidateSQL = `SELECT v.entry FROM wordweave.vocabulary_entries v JOIN wordweave.vocabulary_snapshots s ON s.id=v.snapshot_id WHERE s.version='m001' AND NOT(v.entry=ANY($1))
	 AND (NOT $3 OR NOT EXISTS(SELECT 1 FROM wordweave.batch_targets t JOIN wordweave.vocabulary_entries member ON member.id=t.vocabulary_entry_id WHERE t.owner_id=$2 AND member.lexeme_id=v.lexeme_id)) ORDER BY random() LIMIT 1`
