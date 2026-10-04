package analytics

import (
	"context"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"net/url"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/platform/business"
)

var ErrValidation = errors.New("analytics validation failed")

type browserContextKey struct{}

func WithBrowser(ctx context.Context, hash []byte) context.Context {
	return context.WithValue(ctx, browserContextKey{}, append([]byte(nil), hash...))
}
func Browser(ctx context.Context) []byte {
	v, _ := ctx.Value(browserContextKey{}).([]byte)
	if len(v) != 32 {
		return nil
	}
	return v
}
func enabled(c business.Configuration) bool {
	return c.ActivatedAt != nil && !c.Now.Before(*c.ActivatedAt)
}

type Source struct {
	UTMSource    *string `json:"utm_source,omitempty"`
	UTMMedium    *string `json:"utm_medium,omitempty"`
	UTMCampaign  *string `json:"utm_campaign,omitempty"`
	ReferrerHost *string `json:"referrer_host,omitempty"`
}
type Event struct {
	ID     uuid.UUID `json:"event_id"`
	Kind   string    `json:"kind"`
	Page   string    `json:"page"`
	Action *string   `json:"action,omitempty"`
	Source *Source   `json:"source,omitempty"`
}

var frontendPages = map[string]bool{"PAGE-002": true, "PAGE-003": true, "PAGE-005": true, "PAGE-006": true, "PAGE-007": true, "PAGE-008": true, "PAGE-201": true, "PAGE-202": true, "PAGE-203": true, "PAGE-204": true, "PAGE-205": true, "PAGE-206": true, "PAGE-207": true, "PAGE-214": true, "PAGE-215": true, "PAGE-216": true, "PAGE-217": true}

func Validate(event *Event) error {
	if event.ID == uuid.Nil || !frontendPages[event.Page] {
		return ErrValidation
	}
	if event.Kind == "page_view" {
		if event.Action != nil {
			return ErrValidation
		}
	} else if event.Kind == "key_action" {
		if event.Action == nil || event.Source != nil {
			return ErrValidation
		}
		switch *event.Action {
		case "select_word", "start_generation", "submit_registration", "start_review":
		default:
			return ErrValidation
		}
	} else {
		return ErrValidation
	}
	if event.Source != nil {
		for _, value := range []**string{&event.Source.UTMSource, &event.Source.UTMMedium, &event.Source.UTMCampaign, &event.Source.ReferrerHost} {
			if *value == nil {
				continue
			}
			if !utf8.ValidString(**value) || utf8.RuneCountInString(**value) > 128 {
				return ErrValidation
			}
			clean := strings.TrimSpace(strings.Map(func(r rune) rune {
				if unicode.IsControl(r) {
					return -1
				}
				return r
			}, **value))
			if clean == "" {
				*value = nil
			} else {
				*value = &clean
			}
		}
		if event.Source.ReferrerHost != nil {
			host := strings.ToLower(*event.Source.ReferrerHost)
			u, err := url.Parse("https://" + host)
			if err != nil || u.Host != host || u.Hostname() == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || strings.ContainsAny(host, "\\?#/") {
				return ErrValidation
			}
			event.Source.ReferrerHost = &host
		}
	}
	return nil
}

type Service struct {
	pool       *pgxpool.Pool
	publicHost string
	clarityURL *string
}

func NewService(pool *pgxpool.Pool, origin string, clarityURL *string) *Service {
	u, _ := url.Parse(origin)
	host := ""
	if u != nil {
		host = strings.ToLower(u.Host)
	}
	return &Service{pool: pool, publicHost: host, clarityURL: clarityURL}
}
func lockBrowser(ctx context.Context, tx pgx.Tx, hash []byte) error {
	if len(hash) != 32 {
		return ErrValidation
	}
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, int64(binary.BigEndian.Uint64(hash[:8])))
	return err
}
func (s *Service) Record(ctx context.Context, owner *uuid.UUID, event Event) error {
	if err := Validate(&event); err != nil {
		return err
	}
	hash := Browser(ctx)
	if len(hash) == 0 {
		return ErrValidation
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return err
	}
	if !enabled(c) {
		return nil
	}
	if owner != nil {
		if err = business.LockLearner(ctx, tx, *owner); err != nil {
			return err
		}
	}
	if err = lockBrowser(ctx, tx, hash); err != nil {
		return err
	}
	key := "browser:" + hex.EncodeToString(hash) + ":" + event.ID.String()
	var duplicate bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wordweave.analytics_events WHERE event_key=$1)`, key).Scan(&duplicate); err != nil {
		return err
	}
	if duplicate {
		return nil
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.traffic_sessions SET ended_at=last_event_at+interval '30 minutes' WHERE browser_key_hash=$1 AND ended_at IS NULL AND (last_event_at<=$2::timestamptz-interval '30 minutes' OR started_at<=$2::timestamptz-interval '90 days')`, hash, c.Now); err != nil {
		return err
	}
	var session uuid.UUID
	err = tx.QueryRow(ctx, `SELECT id FROM wordweave.traffic_sessions WHERE browser_key_hash=$1 AND ended_at IS NULL FOR UPDATE`, hash).Scan(&session)
	if errors.Is(err, pgx.ErrNoRows) {
		source := Source{}
		if event.Source != nil {
			source = *event.Source
		}
		if source.ReferrerHost != nil && *source.ReferrerHost == s.publicHost {
			source.ReferrerHost = nil
		}
		kind := "direct_unknown"
		if source.UTMSource != nil || source.UTMMedium != nil || source.UTMCampaign != nil {
			kind = "utm"
		} else if source.ReferrerHost != nil {
			kind = "referrer"
		}
		err = tx.QueryRow(ctx, `INSERT INTO wordweave.traffic_sessions(browser_key_hash,started_at,last_event_at,entry_source_type,utm_source,utm_medium,utm_campaign,referrer_host) VALUES($1,$2,$2,$3,$4,$5,$6,$7) RETURNING id`, hash, c.Now, kind, source.UTMSource, source.UTMMedium, source.UTMCampaign, source.ReferrerHost).Scan(&session)
	} else if err == nil && event.Source != nil {
		return ErrValidation
	}
	if err != nil {
		return err
	}
	if owner != nil {
		if _, err = tx.Exec(ctx, `INSERT INTO wordweave.traffic_session_accounts(session_id,owner_id,linked_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, session, owner, c.Now); err != nil {
			return err
		}
	}
	pv := 0
	if event.Kind == "page_view" {
		pv = 1
	}
	outcome := "anonymous"
	if owner != nil {
		outcome = "account"
	}
	if _, err = tx.Exec(ctx, `INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,learning_day,traffic_session_id,browser_key_hash,owner_id,event_outcome,source_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'browser')`, key, event.Kind, c.Now, business.LearningDay(c.Now), session, hash, owner, outcome); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `UPDATE wordweave.traffic_sessions SET last_event_at=$2,pageviews=pageviews+$3,has_key_action=has_key_action OR $4 WHERE id=$1`, session, c.Now, pv, event.Kind == "key_action"); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Link is called inside explicit authentication transactions, never by matching
// IP addresses or unrelated devices. It does not create visits or page views.
func Link(ctx context.Context, tx pgx.Tx, owner uuid.UUID, c business.Configuration) (*uuid.UUID, []byte, error) {
	hash := Browser(ctx)
	if !enabled(c) || len(hash) == 0 {
		return nil, nil, nil
	}
	if err := lockBrowser(ctx, tx, hash); err != nil {
		return nil, nil, err
	}
	var session uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM wordweave.traffic_sessions WHERE browser_key_hash=$1 AND ended_at IS NULL AND last_event_at>$2::timestamptz-interval '30 minutes' AND started_at>$2::timestamptz-interval '90 days' FOR UPDATE`, hash, c.Now).Scan(&session)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO wordweave.traffic_session_accounts(session_id,owner_id,linked_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, session, owner, c.Now)
	return &session, hash, err
}
func Registered(ctx context.Context, tx pgx.Tx, owner uuid.UUID, c business.Configuration) error {
	if !enabled(c) {
		return nil
	}
	session, hash, err := Link(ctx, tx, owner, c)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO wordweave.analytics_accounts(owner_id,registered_learning_day,retention_due_at) VALUES($1,$2,$3::timestamptz+interval '90 days')`, owner, business.LearningDay(c.Now), c.Now); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,learning_day,owner_id,source_kind,reference_key,traffic_session_id,browser_key_hash) VALUES($1,'registered',$2,$3,$4,'account',$4,$5,$6)`, "registered:"+owner.String(), c.Now, business.LearningDay(c.Now), owner, session, hash)
	return err
}

// Erase removes the identifying browser chain, including unauthenticated
// events around explicit sign-in; other learners' business facts survive.
func Erase(ctx context.Context, tx pgx.Tx, owner uuid.UUID) error {
	rows, err := tx.Query(ctx, `SELECT DISTINCT t.browser_key_hash FROM wordweave.traffic_sessions t JOIN wordweave.traffic_session_accounts a ON a.session_id=t.id WHERE a.owner_id=$1 ORDER BY t.browser_key_hash`, owner)
	if err != nil {
		return err
	}
	var hashes [][]byte
	for rows.Next() {
		var h []byte
		if err = rows.Scan(&h); err != nil {
			rows.Close()
			return err
		}
		hashes = append(hashes, h)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return err
	}
	for _, hash := range hashes {
		if err = lockBrowser(ctx, tx, hash); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `DELETE FROM wordweave.analytics_events WHERE browser_key_hash=$1 AND source_kind='browser'`, hash); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `UPDATE wordweave.analytics_events SET browser_key_hash=NULL,traffic_session_id=NULL WHERE browser_key_hash=$1`, hash); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `DELETE FROM wordweave.traffic_sessions WHERE browser_key_hash=$1`, hash); err != nil {
			return err
		}
	}
	return nil
}
func (s *Service) Precheck(ctx context.Context, owner *uuid.UUID, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	c, err := business.LockConfiguration(ctx, tx, false)
	if err != nil {
		return err
	}
	if !enabled(c) {
		return nil
	}
	if owner != nil {
		if err = business.LockLearner(ctx, tx, *owner); err != nil {
			return err
		}
	}
	source := "visitor"
	if owner != nil {
		source = "account"
	}
	_, err = tx.Exec(ctx, `INSERT INTO wordweave.analytics_events(event_key,event_kind,occurred_at,learning_day,owner_id,source_kind) VALUES($1,'generation_precheck_rejected',$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING`, "generation-precheck:"+id, c.Now, business.LearningDay(c.Now), owner, source)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
