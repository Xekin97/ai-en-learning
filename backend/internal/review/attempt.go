package review

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/identity"
	"wordweave/internal/platform/security"
)

const (
	reviewHintLengthHint          = 8
	reviewGroupKeyAttempts        = 8
	reviewGroupKeyEncodedLength   = 22
	reviewGroupKeyRandomByteCount = 16
)

type Segment struct {
	Kind       string
	Text       string
	LengthHint int
	BlankID    string
	GroupKey   string
}

type Item struct {
	Stage           string
	ID              string
	EntryMeaning    string
	HintSegments    []Segment
	PassageSegments []Segment
}

type ItemProgress struct {
	Stage        string
	ItemNumber   int
	ItemsInStage int
}

type AttemptView struct {
	ID       string
	Token    string
	Item     Item
	Progress ItemProgress
}

type BlankAnswer struct {
	BlankID string
	Answer  string
}

type Action struct {
	ActionID string
	ItemID   string
	Kind     string
	Answer   *string
	Answers  []BlankAnswer
}

type BatchResult struct {
	BatchID    uuid.UUID
	Successful bool
	ErrorCount int
	SkipCount  int
}

type Outcome struct {
	Kind              string
	Result            string
	Item              *Item
	Progress          *ItemProgress
	IncorrectBlankIDs []string
	BatchResult       *BatchResult
	SessionProgress   *Progress
	NextBatch         *BatchProjection
	SessionSummary    *Summary
}

type spellingState struct {
	view   Item
	answer string
}

type passageState struct {
	view    Item
	answers map[string]string
}

type passageOccurrence struct {
	targetID uuid.UUID
	surface  string
	start    int
	end      int
	blankID  string
	groupKey string
}

type attemptState struct {
	mutex          sync.Mutex
	ID             string
	actorID        uuid.UUID
	actorSessionID uuid.UUID
	sessionID      uuid.UUID
	batchID        uuid.UUID
	tokenDigest    []byte
	updatedAt      time.Time
	spelling       []spellingState
	passage        passageState
	stage          string
	index          int
	errorCount     int
	skipCount      int
	completed      bool
	actions        map[string]Outcome
}

type AttemptRegistry struct {
	pool    *pgxpool.Pool
	key     []byte
	ttl     time.Duration
	mutex   sync.Mutex
	byID    map[string]*attemptState
	byBatch map[string]string
}

func (registry *AttemptRegistry) PurgeExpired(now time.Time) {
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	registry.purgeExpiredLocked(now)
}

func NewAttemptRegistry(pool *pgxpool.Pool, key []byte, ttl time.Duration) *AttemptRegistry {
	return &AttemptRegistry{
		pool: pool, key: append([]byte(nil), key...), ttl: ttl,
		byID: make(map[string]*attemptState), byBatch: make(map[string]string),
	}
}

func (registry *AttemptRegistry) Start(ctx context.Context, actor identity.Actor, sessionID, batchID uuid.UUID) (AttemptView, error) {
	state, token, err := registry.loadAttempt(ctx, actor, sessionID, batchID)
	if err != nil {
		return AttemptView{}, err
	}
	registry.mutex.Lock()
	defer registry.mutex.Unlock()
	registry.purgeExpiredLocked(time.Now())
	key := attemptBatchKey(actor.ID, sessionID, batchID)
	if existingID := registry.byBatch[key]; existingID != "" {
		delete(registry.byID, existingID)
	}
	registry.byID[state.ID] = state
	registry.byBatch[key] = state.ID
	item, progress := state.current()
	return AttemptView{ID: state.ID, Token: token, Item: item, Progress: progress}, nil
}

func (registry *AttemptRegistry) Act(ctx context.Context, actor identity.Actor, attemptID, token string, action Action) (Outcome, error) {
	registry.mutex.Lock()
	registry.purgeExpiredLocked(time.Now())
	state := registry.byID[attemptID]
	registry.mutex.Unlock()
	if state == nil || state.actorID != actor.ID || state.actorSessionID != actor.SessionID ||
		!security.EqualDigest(state.tokenDigest, security.Digest(registry.key, "review-attempt-v1", token)) {
		return Outcome{}, ErrAttemptExpired
	}
	state.mutex.Lock()
	defer state.mutex.Unlock()
	if time.Since(state.updatedAt) > registry.ttl {
		return Outcome{}, ErrAttemptExpired
	}
	state.updatedAt = time.Now()
	if action.ActionID == "" || len(action.ActionID) > 128 || (action.Kind != "answer" && action.Kind != "skip") {
		return Outcome{}, ErrValidation
	}
	if cached, ok := state.actions[action.ActionID]; ok {
		return cached, nil
	}
	if state.completed {
		return Outcome{}, ErrConflict
	}
	current, currentProgress := state.current()
	if action.ItemID != current.ID {
		return Outcome{}, ErrIncorrectAction
	}

	var outcome Outcome
	if state.stage == "spelling" {
		outcome = state.applySpelling(action, current, currentProgress)
	} else {
		outcome = state.applyPassage(action, current, currentProgress)
	}
	if outcome.Kind == "invalid" {
		return Outcome{}, ErrValidation
	}
	if outcome.Kind == "complete_pending" {
		completion, err := registry.completeBatch(ctx, state)
		if err != nil {
			return Outcome{}, err
		}
		outcome = completion
		state.completed = true
	}
	if len(state.actions) >= 128 {
		for key := range state.actions {
			delete(state.actions, key)
			break
		}
	}
	state.actions[action.ActionID] = outcome
	return outcome, nil
}

func (state *attemptState) applySpelling(action Action, current Item, progress ItemProgress) Outcome {
	if action.Kind == "answer" {
		if action.Answer == nil || len(action.Answers) != 0 {
			return Outcome{Kind: "invalid"}
		}
		if !answerEqual(*action.Answer, state.spelling[state.index].answer) {
			state.errorCount++
			return Outcome{Kind: "retry", Result: "incorrect", Item: &current, Progress: &progress}
		}
	} else {
		if action.Answer != nil || len(action.Answers) != 0 {
			return Outcome{Kind: "invalid"}
		}
		state.skipCount++
	}
	result := "correct"
	if action.Kind == "skip" {
		result = "skipped"
	}
	state.index++
	if state.index >= len(state.spelling) {
		state.stage = "passage_cloze"
		state.index = 0
	}
	next, nextProgress := state.current()
	return Outcome{Kind: "advanced", Result: result, Item: &next, Progress: &nextProgress}
}

func (state *attemptState) applyPassage(action Action, current Item, progress ItemProgress) Outcome {
	if action.Kind == "skip" {
		if action.Answer != nil || len(action.Answers) != 0 {
			return Outcome{Kind: "invalid"}
		}
		state.skipCount++
		return Outcome{Kind: "complete_pending"}
	}
	if action.Answer != nil || len(action.Answers) != len(state.passage.answers) {
		return Outcome{Kind: "invalid"}
	}
	provided := make(map[string]string, len(action.Answers))
	for _, answer := range action.Answers {
		if answer.BlankID == "" {
			return Outcome{Kind: "invalid"}
		}
		if _, duplicate := provided[answer.BlankID]; duplicate {
			return Outcome{Kind: "invalid"}
		}
		provided[answer.BlankID] = answer.Answer
	}
	var incorrect []string
	for blankID, expected := range state.passage.answers {
		providedAnswer, ok := provided[blankID]
		if !ok || !answerEqual(providedAnswer, expected) {
			incorrect = append(incorrect, blankID)
		}
	}
	if len(incorrect) > 0 {
		sort.Strings(incorrect)
		state.errorCount += len(incorrect)
		return Outcome{
			Kind: "retry", Result: "incorrect", Item: &current, Progress: &progress,
			IncorrectBlankIDs: incorrect,
		}
	}
	return Outcome{Kind: "complete_pending"}
}

func (state *attemptState) current() (Item, ItemProgress) {
	if state.stage == "spelling" {
		return state.spelling[state.index].view, ItemProgress{Stage: "spelling", ItemNumber: state.index + 1, ItemsInStage: len(state.spelling)}
	}
	return state.passage.view, ItemProgress{Stage: "passage_cloze", ItemNumber: 1, ItemsInStage: 1}
}

func (registry *AttemptRegistry) loadAttempt(ctx context.Context, actor identity.Actor, sessionID, batchID uuid.UUID) (*attemptState, string, error) {
	attemptID, err := security.RandomID("att_")
	if err != nil {
		return nil, "", err
	}
	token, err := security.RandomToken()
	if err != nil {
		return nil, "", err
	}
	rows, err := registry.pool.Query(ctx, `
		SELECT target.id,target.source_entry_snapshot,target.entry_meaning,target.hint_phrase,
			target.hint_surface,target.hint_start,target.hint_end
		FROM wordweave.review_session_targets ordering
		JOIN wordweave.batch_targets target ON target.id=ordering.target_id
		JOIN wordweave.review_sessions session ON session.id=ordering.session_id
		WHERE ordering.session_id=$1 AND ordering.batch_id=$2
		  AND session.owner_id=$3 AND session.status='in_progress'
		ORDER BY ordering.target_order`, sessionID, batchID, actor.ID)
	if err != nil {
		return nil, "", err
	}
	type targetResource struct {
		id                      uuid.UUID
		answer, meaning, phrase string
		shadowSurface           string
		shadowStart, shadowEnd  int
	}
	var resources []targetResource
	for rows.Next() {
		var resource targetResource
		if err := rows.Scan(
			&resource.id, &resource.answer, &resource.meaning, &resource.phrase,
			&resource.shadowSurface, &resource.shadowStart, &resource.shadowEnd,
		); err != nil {
			rows.Close()
			return nil, "", err
		}
		resources = append(resources, resource)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, "", err
	}
	rows.Close()
	state := &attemptState{
		ID: attemptID, actorID: actor.ID, actorSessionID: actor.SessionID,
		sessionID: sessionID, batchID: batchID,
		tokenDigest: security.Digest(registry.key, "review-attempt-v1", token),
		updatedAt:   time.Now(), stage: "spelling", actions: make(map[string]Outcome),
	}
	for _, resource := range resources {
		hintRows, err := registry.pool.Query(ctx, `
			SELECT surface,start_offset,end_offset
			FROM wordweave.hint_occurrences
			WHERE target_id=$1 ORDER BY occurrence_order`, resource.id)
		if err != nil {
			return nil, "", err
		}
		var spans []hintSpan
		var firstSurface string
		for hintRows.Next() {
			var surface string
			var span hintSpan
			if err := hintRows.Scan(&surface, &span.start, &span.end); err != nil {
				hintRows.Close()
				return nil, "", err
			}
			if len(spans) == 0 {
				firstSurface = surface
			}
			spans = append(spans, span)
		}
		if err := hintRows.Err(); err != nil {
			hintRows.Close()
			return nil, "", err
		}
		hintRows.Close()
		if len(spans) == 0 || firstSurface != resource.shadowSurface || spans[0].start != resource.shadowStart || spans[0].end != resource.shadowEnd {
			return nil, "", ErrNotFound
		}
		segments, err := blankSegments(resource.phrase, spans, reviewHintLengthHint, "")
		if err != nil {
			return nil, "", ErrNotFound
		}
		itemID, err := security.RandomID("itm_")
		if err != nil {
			return nil, "", err
		}
		state.spelling = append(state.spelling, spellingState{
			answer: resource.answer,
			view: Item{
				Stage: "spelling", ID: itemID, EntryMeaning: resource.meaning,
				HintSegments: segments,
			},
		})
	}
	if len(state.spelling) == 0 {
		return nil, "", ErrNotFound
	}
	var passage string
	if err := registry.pool.QueryRow(ctx, `SELECT passage FROM wordweave.learning_batches WHERE id=$1 AND owner_id=$2`, batchID, actor.ID).Scan(&passage); err != nil {
		return nil, "", ErrNotFound
	}
	occurrenceRows, err := registry.pool.Query(ctx, `
		SELECT occurrence.target_id,occurrence.surface,occurrence.start_offset,occurrence.end_offset
		FROM wordweave.passage_occurrences occurrence
		JOIN wordweave.review_session_targets ordering ON ordering.target_id=occurrence.target_id
		WHERE ordering.session_id=$1 AND ordering.batch_id=$2
		ORDER BY occurrence.start_offset,occurrence.end_offset`, sessionID, batchID)
	if err != nil {
		return nil, "", err
	}
	var occurrences []passageOccurrence
	for occurrenceRows.Next() {
		var current passageOccurrence
		if err := occurrenceRows.Scan(&current.targetID, &current.surface, &current.start, &current.end); err != nil {
			occurrenceRows.Close()
			return nil, "", err
		}
		current.blankID, err = security.RandomID("blank_")
		if err != nil {
			occurrenceRows.Close()
			return nil, "", err
		}
		occurrences = append(occurrences, current)
	}
	if err := occurrenceRows.Err(); err != nil {
		occurrenceRows.Close()
		return nil, "", err
	}
	occurrenceRows.Close()
	if err := assignPassageGroupKeys(occurrences, randomReviewGroupKey); err != nil {
		return nil, "", err
	}
	passageSegments, passageAnswers, err := buildPassageSegments(passage, occurrences)
	if err != nil {
		return nil, "", ErrNotFound
	}
	passageItemID, err := security.RandomID("itm_")
	if err != nil {
		return nil, "", err
	}
	state.passage = passageState{
		view: Item{
			Stage: "passage_cloze", ID: passageItemID,
			PassageSegments: passageSegments,
		},
		answers: passageAnswers,
	}
	return state, token, nil
}

func randomReviewGroupKey() (string, error) {
	return security.RandomID("grp_")
}

func validReviewGroupKey(value string) bool {
	if len(value) != len("grp_")+reviewGroupKeyEncodedLength || !strings.HasPrefix(value, "grp_") {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(value, "grp_"))
	return err == nil && len(raw) == reviewGroupKeyRandomByteCount
}

func assignPassageGroupKeys(occurrences []passageOccurrence, generate func() (string, error)) error {
	if generate == nil {
		return errors.New("review group key generator is nil")
	}
	byTarget := make(map[uuid.UUID]string)
	used := make(map[string]struct{})
	for index := range occurrences {
		if occurrences[index].targetID == uuid.Nil {
			return errors.New("passage occurrence has no target")
		}
		if groupKey, ok := byTarget[occurrences[index].targetID]; ok {
			occurrences[index].groupKey = groupKey
			continue
		}
		assigned := false
		for attempt := 0; attempt < reviewGroupKeyAttempts; attempt++ {
			groupKey, err := generate()
			if err != nil {
				return fmt.Errorf("generate review group key: %w", err)
			}
			if !validReviewGroupKey(groupKey) {
				return errors.New("generated review group key has invalid format")
			}
			if _, collision := used[groupKey]; collision {
				continue
			}
			byTarget[occurrences[index].targetID] = groupKey
			used[groupKey] = struct{}{}
			occurrences[index].groupKey = groupKey
			assigned = true
			break
		}
		if !assigned {
			return errors.New("could not generate a unique review group key")
		}
	}
	return nil
}

func buildPassageSegments(passage string, occurrences []passageOccurrence) ([]Segment, map[string]string, error) {
	if len(occurrences) == 0 {
		return nil, nil, errors.New("passage has no blank occurrence")
	}
	runes := []rune(passage)
	segments := make([]Segment, 0, len(occurrences)*2+1)
	answers := make(map[string]string, len(occurrences))
	targetGroups := make(map[uuid.UUID]string)
	groupTargets := make(map[string]uuid.UUID)
	position := 0
	for _, occurrence := range occurrences {
		if occurrence.targetID == uuid.Nil || occurrence.blankID == "" || !validReviewGroupKey(occurrence.groupKey) {
			return nil, nil, errors.New("passage occurrence has invalid identity")
		}
		if occurrence.start < position || occurrence.start < 0 || occurrence.start >= occurrence.end || occurrence.end > len(runes) {
			return nil, nil, errors.New("invalid or overlapping passage span")
		}
		if string(runes[occurrence.start:occurrence.end]) != occurrence.surface {
			return nil, nil, errors.New("passage occurrence surface does not match span")
		}
		if _, duplicate := answers[occurrence.blankID]; duplicate {
			return nil, nil, errors.New("duplicate passage blank identity")
		}
		if groupKey, ok := targetGroups[occurrence.targetID]; ok && groupKey != occurrence.groupKey {
			return nil, nil, errors.New("same passage target has inconsistent group keys")
		}
		if targetID, ok := groupTargets[occurrence.groupKey]; ok && targetID != occurrence.targetID {
			return nil, nil, errors.New("different passage targets share a group key")
		}
		targetGroups[occurrence.targetID] = occurrence.groupKey
		groupTargets[occurrence.groupKey] = occurrence.targetID
		if occurrence.start > position {
			segments = append(segments, Segment{Kind: "text", Text: string(runes[position:occurrence.start])})
		}
		segments = append(segments, Segment{Kind: "blank", BlankID: occurrence.blankID, GroupKey: occurrence.groupKey})
		answers[occurrence.blankID] = occurrence.surface
		position = occurrence.end
	}
	if position < len(runes) {
		segments = append(segments, Segment{Kind: "text", Text: string(runes[position:])})
	}
	return segments, answers, nil
}

func (registry *AttemptRegistry) completeBatch(ctx context.Context, state *attemptState) (Outcome, error) {
	tx, err := registry.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return Outcome{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var ownerID uuid.UUID
	if err := tx.QueryRow(ctx, `
		SELECT owner_id FROM wordweave.review_sessions
		WHERE id=$1 AND owner_id=$2 AND status='in_progress' FOR UPDATE`, state.sessionID, state.actorID).Scan(&ownerID); err != nil {
		return Outcome{}, ErrNotFound
	}
	successful := state.skipCount == 0
	var resultID uuid.UUID
	if err := tx.QueryRow(ctx, `
		INSERT INTO wordweave.review_results(
			owner_id,session_id,batch_id,successful,error_count,skip_count,stage1_completed,stage2_completed
		) VALUES ($1,$2,$3,$4,$5,$6,true,true)
		RETURNING id`, state.actorID, state.sessionID, state.batchID, successful, state.errorCount, state.skipCount).Scan(&resultID); err != nil {
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) && postgresError.Code == "23505" {
			return Outcome{}, ErrConflict
		}
		return Outcome{}, err
	}
	progress, err := progressTx(ctx, tx, state.sessionID)
	if err != nil {
		return Outcome{}, err
	}
	var next *BatchProjection
	var summary *Summary
	if progress.Completed == progress.Total {
		if _, err := tx.Exec(ctx, `
			UPDATE wordweave.review_sessions SET status='completed',completed_at=clock_timestamp()
			WHERE id=$1`, state.sessionID); err != nil {
			return Outcome{}, err
		}
		var skipped int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM wordweave.review_results WHERE session_id=$1 AND skip_count>0`, state.sessionID).Scan(&skipped); err != nil {
			return Outcome{}, err
		}
		summary = &Summary{Total: progress.Total, Successful: progress.Successful, Unsuccessful: progress.Unsuccessful, Skipped: skipped}
	} else {
		var batch BatchProjection
		if err := tx.QueryRow(ctx, `
			SELECT batch.id,batch.saved_at,batch.scenario
			FROM wordweave.review_session_batches relation
			JOIN wordweave.learning_batches batch ON batch.id=relation.batch_id
			LEFT JOIN wordweave.review_results result
			  ON result.session_id=relation.session_id AND result.batch_id=relation.batch_id
			WHERE relation.session_id=$1 AND result.id IS NULL
			ORDER BY relation.batch_order LIMIT 1`, state.sessionID).Scan(&batch.ID, &batch.SavedAt, &batch.Scenario); err != nil {
			return Outcome{}, err
		}
		next = &batch
	}
	if err := tx.Commit(ctx); err != nil {
		return Outcome{}, err
	}
	result := &BatchResult{BatchID: state.batchID, Successful: successful, ErrorCount: state.errorCount, SkipCount: state.skipCount}
	if summary != nil {
		return Outcome{Kind: "session_completed", BatchResult: result, SessionProgress: &progress, SessionSummary: summary}, nil
	}
	return Outcome{Kind: "batch_completed", BatchResult: result, SessionProgress: &progress, NextBatch: next}, nil
}

func progressTx(ctx context.Context, tx pgx.Tx, sessionID uuid.UUID) (Progress, error) {
	var progress Progress
	err := tx.QueryRow(ctx, `
		SELECT count(relation.batch_id),count(result.batch_id),
			count(result.batch_id) FILTER (WHERE result.successful),
			count(result.batch_id) FILTER (WHERE NOT result.successful)
		FROM wordweave.review_session_batches relation
		LEFT JOIN wordweave.review_results result
		  ON result.session_id=relation.session_id AND result.batch_id=relation.batch_id
		WHERE relation.session_id=$1`, sessionID).Scan(
		&progress.Total, &progress.Completed, &progress.Successful, &progress.Unsuccessful,
	)
	return progress, err
}

type hintSpan struct {
	start int
	end   int
}

func blankSegments(text string, spans []hintSpan, lengthHint int, blankID string) ([]Segment, error) {
	runes := []rune(text)
	segments := make([]Segment, 0, len(spans)*2+1)
	position := 0
	for _, span := range spans {
		if span.start < position || span.start < 0 || span.start >= span.end || span.end > len(runes) {
			return nil, errors.New("invalid or overlapping hint span")
		}
		if span.start > position {
			segments = append(segments, Segment{Kind: "text", Text: string(runes[position:span.start])})
		}
		segments = append(segments, Segment{Kind: "blank", LengthHint: lengthHint, BlankID: blankID})
		position = span.end
	}
	if position < len(runes) {
		segments = append(segments, Segment{Kind: "text", Text: string(runes[position:])})
	}
	if len(spans) == 0 {
		return nil, errors.New("hint has no blank span")
	}
	return segments, nil
}

func answerEqual(submitted, expected string) bool {
	return strings.EqualFold(strings.TrimSpace(submitted), strings.TrimSpace(expected))
}

func attemptBatchKey(actorID, sessionID, batchID uuid.UUID) string {
	return actorID.String() + ":" + sessionID.String() + ":" + batchID.String()
}

func (registry *AttemptRegistry) purgeExpiredLocked(now time.Time) {
	for attemptID, state := range registry.byID {
		state.mutex.Lock()
		expired := now.Sub(state.updatedAt) > registry.ttl
		state.mutex.Unlock()
		if expired {
			delete(registry.byID, attemptID)
			delete(registry.byBatch, attemptBatchKey(state.actorID, state.sessionID, state.batchID))
		}
	}
}
