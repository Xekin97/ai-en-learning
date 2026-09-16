package vocabulary

import (
	"context"
	"errors"
	"fmt"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/dbgen"
)

var ErrInvalidQuery = errors.New("invalid vocabulary query")

type Service struct {
	queries *dbgen.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{queries: dbgen.New(pool)}
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
