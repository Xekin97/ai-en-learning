package notices

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/platform/business"
)

var ErrValidation = errors.New("notice validation failed")
var ErrNotFound = errors.New("notice not found")

type Service struct {
	pool *pgxpool.Pool
	key  []byte
}

func NewService(pool *pgxpool.Pool, key []byte) *Service {
	return &Service{pool: pool, key: append([]byte(nil), key...)}
}

type Input struct {
	Title      business.Bilingual `json:"title"`
	Body       business.Bilingual `json:"body_markdown"`
	Visible    bool               `json:"visible"`
	Remind     bool               `json:"remind"`
	RemindOnce bool               `json:"remind_once"`
}
type AdminNotice struct {
	Input
	ID          uuid.UUID `json:"id"`
	PublishedAt time.Time `json:"published_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	revision    int64
}
type Notice struct {
	ID            uuid.UUID `json:"id"`
	Title         string    `json:"title"`
	BodyHTML      string    `json:"body_html"`
	ContentLocale string    `json:"content_locale"`
	Remind        bool      `json:"remind"`
	RemindOnce    bool      `json:"remind_once"`
	PublishedAt   time.Time `json:"published_at"`
	Revision      string    `json:"revision"`
}
type Cursor struct {
	PublishedAt time.Time `json:"published_at"`
	ID          uuid.UUID `json:"id"`
	Remind      bool      `json:"remind"`
	Revision    string    `json:"revision,omitempty"`
}
type scanner interface{ Scan(...any) error }

func scan(row scanner) (AdminNotice, error) {
	var n AdminNotice
	err := row.Scan(&n.ID, &n.Title.ZH, &n.Title.EN, &n.Body.ZH, &n.Body.EN, &n.Visible, &n.Remind, &n.RemindOnce, &n.PublishedAt, &n.UpdatedAt, &n.revision)
	return n, err
}

const columns = `id,title_zh,title_en,body_zh,body_en,visible,remind,remind_once,published_at,updated_at,revision`

func normalize(in Input) (Input, error) {
	var err error
	for _, field := range []**string{&in.Title.ZH, &in.Title.EN} {
		*field, err = business.NormalizeText(*field, true, 200, false)
		if err != nil {
			return in, ErrValidation
		}
	}
	for _, field := range []**string{&in.Body.ZH, &in.Body.EN} {
		*field, err = business.NormalizeText(*field, false, 64<<10, true)
		if err != nil {
			return in, ErrValidation
		}
	}
	if (in.Title.ZH == nil || in.Body.ZH == nil) && (in.Title.EN == nil || in.Body.EN == nil) {
		return in, ErrValidation
	}
	return in, nil
}
func (s *Service) project(n AdminNotice, locale string) (Notice, error) {
	title, body := n.Title.ZH, n.Body.ZH
	chosen := "zh-CN"
	if locale == "en-US" {
		title, body = n.Title.EN, n.Body.EN
		chosen = "en-US"
	}
	if title == nil || body == nil {
		if chosen == "zh-CN" {
			title, body = n.Title.EN, n.Body.EN
			chosen = "en-US"
		} else {
			title, body = n.Title.ZH, n.Body.ZH
			chosen = "zh-CN"
		}
	}
	if title == nil || body == nil {
		return Notice{}, ErrValidation
	}
	rendered, err := Render(*body)
	if err != nil {
		return Notice{}, err
	}
	return Notice{ID: n.ID, Title: *title, BodyHTML: rendered, ContentLocale: chosen, Remind: n.Remind, RemindOnce: n.RemindOnce, PublishedAt: n.PublishedAt, Revision: business.Revision(s.key, "notice:"+n.ID.String(), n.revision)}, nil
}

func (s *Service) Save(ctx context.Context, actor, id uuid.UUID, expected string, input Input) (AdminNotice, string, error) {
	input, err := normalize(input)
	if err != nil {
		return AdminNotice{}, "", err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AdminNotice{}, "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, true)
	if err != nil {
		return AdminNotice{}, "", err
	}
	if id != uuid.Nil && !business.MatchRevision(s.key, "configuration", c.Revision, expected) {
		return AdminNotice{}, "", &business.RevisionConflict{Current: business.Revision(s.key, "configuration", c.Revision)}
	}
	var row pgx.Row
	if id == uuid.Nil {
		row = tx.QueryRow(ctx, `INSERT INTO wordweave.platform_notices(title_zh,title_en,body_zh,body_en,visible,remind,remind_once,updated_by,published_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING `+columns, input.Title.ZH, input.Title.EN, input.Body.ZH, input.Body.EN, input.Visible, input.Remind, input.RemindOnce, actor, c.Now)
	} else {
		row = tx.QueryRow(ctx, `UPDATE wordweave.platform_notices SET title_zh=$2,title_en=$3,body_zh=$4,body_en=$5,visible=$6,remind=$7,remind_once=$8,revision=revision+1,updated_by=$9,updated_at=$10 WHERE id=$1 RETURNING `+columns, id, input.Title.ZH, input.Title.EN, input.Body.ZH, input.Body.EN, input.Visible, input.Remind, input.RemindOnce, actor, c.Now)
	}
	result, err := scan(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, "", ErrNotFound
	}
	if err != nil {
		return result, "", err
	}
	revision, err := business.AdvanceConfiguration(ctx, tx)
	if err != nil {
		return result, "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return AdminNotice{}, "", err
	}
	return result, business.Revision(s.key, "configuration", revision), nil
}

func (s *Service) AdminGet(ctx context.Context, id uuid.UUID) (AdminNotice, string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return AdminNotice{}, "", err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return AdminNotice{}, "", err
	}
	n, err := scan(tx.QueryRow(ctx, `SELECT `+columns+` FROM wordweave.platform_notices WHERE id=$1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrNotFound
	}
	return n, business.Revision(s.key, "configuration", c.Revision), err
}
func (s *Service) Get(ctx context.Context, id uuid.UUID, locale string) (Notice, error) {
	n, err := scan(s.pool.QueryRow(ctx, `SELECT `+columns+` FROM wordweave.platform_notices WHERE id=$1 AND visible`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Notice{}, ErrNotFound
	}
	if err != nil {
		return Notice{}, err
	}
	return s.project(n, locale)
}

func (s *Service) List(ctx context.Context, locale string, reminders bool, cursor *Cursor, limit int) ([]Notice, bool, error) {
	rows, _, more, err := s.list(ctx, false, reminders, cursor, limit)
	if err != nil {
		return nil, false, err
	}
	result := make([]Notice, 0, len(rows))
	for _, row := range rows {
		n, err := s.project(row, locale)
		if err != nil {
			return nil, false, err
		}
		result = append(result, n)
	}
	return result, more, nil
}
func (s *Service) AdminList(ctx context.Context, cursor *Cursor, limit int) ([]AdminNotice, string, bool, error) {
	return s.list(ctx, true, false, cursor, limit)
}
func (s *Service) list(ctx context.Context, admin, reminders bool, cursor *Cursor, limit int) ([]AdminNotice, string, bool, error) {
	if limit < 1 || limit > 100 {
		return nil, "", false, ErrValidation
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, "", false, err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return nil, "", false, err
	}
	revision := business.Revision(s.key, "configuration", c.Revision)
	if admin && cursor != nil && cursor.Revision != revision {
		return nil, "", false, &business.RevisionConflict{Current: revision}
	}
	var at any
	var id any
	var remind any
	if cursor != nil {
		at = cursor.PublishedAt
		id = cursor.ID
		remind = cursor.Remind
	}
	rows, err := tx.Query(ctx, `SELECT `+columns+` FROM wordweave.platform_notices WHERE ($1 OR visible) AND (NOT $2 OR remind)
  AND ($3::timestamptz IS NULL OR ($1 AND (published_at<$3 OR (published_at=$3 AND id>$4))) OR
  (NOT $1 AND (remind<$5 OR (remind=$5 AND (published_at<$3 OR (published_at=$3 AND id>$4))))))
  ORDER BY CASE WHEN NOT $1 THEN remind END DESC,published_at DESC,id ASC LIMIT $6`, admin, reminders, at, id, remind, limit+1)
	if err != nil {
		return nil, "", false, err
	}
	defer rows.Close()
	result := make([]AdminNotice, 0, limit+1)
	for rows.Next() {
		n, err := scan(rows)
		if err != nil {
			return nil, "", false, err
		}
		result = append(result, n)
	}
	if err = rows.Err(); err != nil {
		return nil, "", false, err
	}
	more := len(result) > limit
	if more {
		result = result[:limit]
	}
	return result, revision, more, nil
}
