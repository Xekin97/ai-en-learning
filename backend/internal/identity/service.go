package identity

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/dbgen"
	"wordweave/internal/platform/security"
)

const (
	learnerAbsolute = 30 * 24 * time.Hour
	learnerIdle     = 7 * 24 * time.Hour
	adminAbsolute   = 8 * time.Hour
	adminIdle       = 30 * time.Minute
)

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_]{3,32}$`)

var (
	ErrAuthentication = errors.New("authentication failed")
	ErrUnauthorized   = errors.New("authentication required")
	ErrForbidden      = errors.New("forbidden")
	ErrUsernameTaken  = errors.New("username unavailable")
	ErrValidation     = errors.New("validation failed")
)

type Actor struct {
	Kind             string
	ID               uuid.UUID
	SessionID        uuid.UUID
	Username         string
	Role             string
	GroupCode        string
	UILocale         *string
	SessionCreatedAt time.Time
	LastSeenAt       time.Time
}

func (a Actor) IsVisitor() bool { return a.Kind == "visitor" }
func (a Actor) IsLearner() bool { return a.Kind == "account" && a.Role == "learner" }
func (a Actor) IsAdmin() bool   { return a.Kind == "account" && a.Role == "admin" }
func (a Actor) CSRFSubject() string {
	return a.Kind + ":" + a.ID.String()
}

type Credential struct {
	Token     string
	ExpiresAt time.Time
}

type Service struct {
	pool          *pgxpool.Pool
	queries       *dbgen.Queries
	sessionPepper []byte
	now           func() time.Time
}

func NewService(pool *pgxpool.Pool, sessionPepper []byte) *Service {
	return &Service{
		pool:          pool,
		queries:       dbgen.New(pool),
		sessionPepper: append([]byte(nil), sessionPepper...),
		now:           time.Now,
	}
}

func (s *Service) ResolveSession(ctx context.Context, token string) (Actor, error) {
	if token == "" {
		return Actor{}, ErrUnauthorized
	}
	row, err := s.queries.FindAccountSession(ctx, security.Digest(s.sessionPepper, "account-session-v1", token))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Actor{}, ErrUnauthorized
		}
		return Actor{}, fmt.Errorf("resolve account session: %w", err)
	}
	now := s.now()
	idle := learnerIdle
	absolute := learnerAbsolute
	if row.Role == "admin" {
		idle = adminIdle
		absolute = adminAbsolute
	}
	if !row.ExpiresAt.Valid || !row.SessionCreatedAt.Valid || !row.LastSeenAt.Valid ||
		now.After(row.ExpiresAt.Time) || now.After(row.SessionCreatedAt.Time.Add(absolute)) || now.After(row.LastSeenAt.Time.Add(idle)) {
		_, _ = s.queries.DeleteAccountSession(ctx, dbgen.DeleteAccountSessionParams{SessionID: row.SessionID, AccountID: row.AccountID})
		return Actor{}, ErrUnauthorized
	}
	_ = s.queries.TouchAccountSession(ctx, row.SessionID)
	return actorFromSession(row), nil
}

func (s *Service) ResolveVisitor(ctx context.Context, token string) (Actor, error) {
	if token == "" {
		return Actor{}, ErrUnauthorized
	}
	row, err := s.queries.FindVisitorIdentity(ctx, security.Digest(s.sessionPepper, "visitor-session-v1", token))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Actor{}, ErrUnauthorized
		}
		return Actor{}, fmt.Errorf("resolve visitor identity: %w", err)
	}
	_ = s.queries.TouchVisitorIdentity(ctx, row.ID)
	return Actor{Kind: "visitor", ID: row.ID}, nil
}

func (s *Service) CreateVisitor(ctx context.Context) (Actor, Credential, error) {
	token, err := security.RandomToken()
	if err != nil {
		return Actor{}, Credential{}, err
	}
	row, err := s.queries.CreateVisitorIdentity(ctx, security.Digest(s.sessionPepper, "visitor-session-v1", token))
	if err != nil {
		return Actor{}, Credential{}, fmt.Errorf("create visitor identity: %w", err)
	}
	return Actor{Kind: "visitor", ID: row.ID}, Credential{Token: token, ExpiresAt: s.now().Add(30 * 24 * time.Hour)}, nil
}

type RegisterInput struct {
	Username             string
	Password             string
	PasswordConfirmation string
	UILocale             string
}

func (s *Service) Register(ctx context.Context, actor Actor, input RegisterInput) (Actor, Credential, error) {
	if !actor.IsVisitor() {
		return Actor{}, Credential{}, ErrForbidden
	}
	if !validUsername(input.Username) || input.Password != input.PasswordConfirmation || !validLocale(input.UILocale) {
		return Actor{}, Credential{}, ErrValidation
	}
	if err := security.ValidatePassword(input.Password); err != nil {
		return Actor{}, Credential{}, ErrValidation
	}
	hash, err := security.HashPassword(input.Password)
	if err != nil {
		return Actor{}, Credential{}, fmt.Errorf("hash registration password: %w", err)
	}
	credential, err := s.newAccountCredential("learner")
	if err != nil {
		return Actor{}, Credential{}, err
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Actor{}, Credential{}, fmt.Errorf("begin registration: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := s.queries.WithTx(tx)
	account, err := queries.CreateAccount(ctx, dbgen.CreateAccountParams{
		Username:     input.Username,
		PasswordHash: hash,
		Role:         "learner",
		GroupCode:    pgtype.Text{String: "registered", Valid: true},
		UiLocale:     pgtype.Text{String: input.UILocale, Valid: true},
	})
	if err != nil {
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) && postgresError.Code == "23505" {
			return Actor{}, Credential{}, ErrUsernameTaken
		}
		return Actor{}, Credential{}, fmt.Errorf("create account: %w", err)
	}
	session, err := queries.CreateAccountSession(ctx, dbgen.CreateAccountSessionParams{
		AccountID: account.ID,
		TokenHash: security.Digest(s.sessionPepper, "account-session-v1", credential.Token),
		ExpiresAt: pgtype.Timestamptz{Time: credential.ExpiresAt, Valid: true},
	})
	if err != nil {
		return Actor{}, Credential{}, fmt.Errorf("create registration session: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Actor{}, Credential{}, fmt.Errorf("commit registration: %w", err)
	}
	locale := input.UILocale
	return Actor{
		Kind: "account", ID: account.ID, SessionID: session.ID, Username: account.Username,
		Role: "learner", GroupCode: "registered", UILocale: &locale,
		SessionCreatedAt: session.CreatedAt.Time, LastSeenAt: session.LastSeenAt.Time,
	}, credential, nil
}

type LoginInput struct {
	Username        string
	Password        string
	BrowserUILocale string
}

func (s *Service) Login(ctx context.Context, input LoginInput) (Actor, Credential, error) {
	if !validLocale(input.BrowserUILocale) || input.Username == "" || input.Password == "" {
		return Actor{}, Credential{}, ErrAuthentication
	}
	account, err := s.queries.FindAccountByUsername(ctx, input.Username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			_, _ = security.VerifyPassword(security.DummyHash(), input.Password)
			return Actor{}, Credential{}, ErrAuthentication
		}
		return Actor{}, Credential{}, fmt.Errorf("find login account: %w", err)
	}
	valid, verifyErr := security.VerifyPassword(account.PasswordHash, input.Password)
	if verifyErr != nil || !valid {
		return Actor{}, Credential{}, ErrAuthentication
	}
	credential, err := s.newAccountCredential(account.Role)
	if err != nil {
		return Actor{}, Credential{}, err
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Actor{}, Credential{}, fmt.Errorf("begin login: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := s.queries.WithTx(tx)
	locale := account.UiLocale
	if !locale.Valid {
		locale = pgtype.Text{String: input.BrowserUILocale, Valid: true}
		if _, err := queries.UpdateAccountLocale(ctx, dbgen.UpdateAccountLocaleParams{UiLocale: locale, AccountID: account.ID}); err != nil {
			return Actor{}, Credential{}, fmt.Errorf("merge account locale: %w", err)
		}
	}
	if security.NeedsRehash(account.PasswordHash) {
		newHash, hashErr := security.HashPassword(input.Password)
		if hashErr != nil {
			return Actor{}, Credential{}, fmt.Errorf("rehash login password: %w", hashErr)
		}
		if err := queries.UpdateAccountPassword(ctx, dbgen.UpdateAccountPasswordParams{PasswordHash: newHash, AccountID: account.ID}); err != nil {
			return Actor{}, Credential{}, fmt.Errorf("update login password hash: %w", err)
		}
	}
	session, err := queries.CreateAccountSession(ctx, dbgen.CreateAccountSessionParams{
		AccountID: account.ID,
		TokenHash: security.Digest(s.sessionPepper, "account-session-v1", credential.Token),
		ExpiresAt: pgtype.Timestamptz{Time: credential.ExpiresAt, Valid: true},
	})
	if err != nil {
		return Actor{}, Credential{}, fmt.Errorf("create login session: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Actor{}, Credential{}, fmt.Errorf("commit login: %w", err)
	}
	groupCode := ""
	if account.GroupCode.Valid {
		groupCode = account.GroupCode.String
	}
	localeString := locale.String
	return Actor{
		Kind: "account", ID: account.ID, SessionID: session.ID, Username: account.Username,
		Role: account.Role, GroupCode: groupCode, UILocale: &localeString,
		SessionCreatedAt: session.CreatedAt.Time, LastSeenAt: session.LastSeenAt.Time,
	}, credential, nil
}

func (s *Service) Logout(ctx context.Context, actor Actor) error {
	if actor.Kind != "account" {
		return ErrUnauthorized
	}
	_, err := s.queries.DeleteAccountSession(ctx, dbgen.DeleteAccountSessionParams{SessionID: actor.SessionID, AccountID: actor.ID})
	if err != nil {
		return fmt.Errorf("delete current account session: %w", err)
	}
	return nil
}

func (s *Service) SetLocale(ctx context.Context, actor Actor, locale string) error {
	if actor.Kind != "account" {
		return ErrUnauthorized
	}
	if !validLocale(locale) {
		return ErrValidation
	}
	if _, err := s.queries.UpdateAccountLocale(ctx, dbgen.UpdateAccountLocaleParams{UiLocale: pgtype.Text{String: locale, Valid: true}, AccountID: actor.ID}); err != nil {
		return fmt.Errorf("update account locale: %w", err)
	}
	return nil
}

type ChangePasswordInput struct {
	CurrentPassword         string
	NewPassword             string
	NewPasswordConfirmation string
}

func (s *Service) ChangePassword(ctx context.Context, actor Actor, input ChangePasswordInput) error {
	if !actor.IsLearner() {
		return ErrForbidden
	}
	if input.NewPassword != input.NewPasswordConfirmation || security.ValidatePassword(input.NewPassword) != nil {
		return ErrValidation
	}
	account, err := s.queries.FindAccountByID(ctx, actor.ID)
	if err != nil {
		return ErrAuthentication
	}
	valid, _ := security.VerifyPassword(account.PasswordHash, input.CurrentPassword)
	if !valid {
		return ErrValidation
	}
	hash, err := security.HashPassword(input.NewPassword)
	if err != nil {
		return fmt.Errorf("hash new password: %w", err)
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin password change: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := s.queries.WithTx(tx)
	if err := queries.UpdateAccountPassword(ctx, dbgen.UpdateAccountPasswordParams{PasswordHash: hash, AccountID: actor.ID}); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if _, err := queries.DeleteOtherAccountSessions(ctx, dbgen.DeleteOtherAccountSessionsParams{AccountID: actor.ID, CurrentSessionID: actor.SessionID}); err != nil {
		return fmt.Errorf("invalidate other sessions: %w", err)
	}
	return tx.Commit(ctx)
}

func (s *Service) DeleteAccount(ctx context.Context, actor Actor, password string, confirmed bool) error {
	if !actor.IsLearner() {
		return ErrForbidden
	}
	if !confirmed {
		return ErrValidation
	}
	account, err := s.queries.FindAccountByID(ctx, actor.ID)
	if err != nil {
		return ErrAuthentication
	}
	valid, _ := security.VerifyPassword(account.PasswordHash, password)
	if !valid {
		return ErrValidation
	}
	rows, err := s.queries.DeleteAccount(ctx, actor.ID)
	if err != nil {
		return fmt.Errorf("delete account: %w", err)
	}
	if rows != 1 {
		return ErrAuthentication
	}
	return nil
}

func (s *Service) newAccountCredential(role string) (Credential, error) {
	token, err := security.RandomToken()
	if err != nil {
		return Credential{}, err
	}
	duration := learnerAbsolute
	if role == "admin" {
		duration = adminAbsolute
	}
	return Credential{Token: token, ExpiresAt: s.now().Add(duration)}, nil
}

func actorFromSession(row dbgen.FindAccountSessionRow) Actor {
	actor := Actor{
		Kind: "account", ID: row.AccountID, SessionID: row.SessionID, Username: row.Username,
		Role: row.Role, SessionCreatedAt: row.SessionCreatedAt.Time, LastSeenAt: row.LastSeenAt.Time,
	}
	if row.GroupCode.Valid {
		actor.GroupCode = row.GroupCode.String
	}
	if row.UiLocale.Valid {
		locale := row.UiLocale.String
		actor.UILocale = &locale
	}
	return actor
}

func validUsername(username string) bool {
	return usernamePattern.MatchString(username)
}

func validLocale(locale string) bool {
	return locale == "zh-CN" || locale == "en-US"
}

func PlanCode(groupCode string) *string {
	var value string
	switch strings.ToLower(groupCode) {
	case "registered":
		value = "basic"
	case "pro":
		value = "pro"
	case "plus":
		value = "plus"
	default:
		return nil
	}
	return &value
}
