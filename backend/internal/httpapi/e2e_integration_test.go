//go:build integration

package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
	"wordweave/internal/ai"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"wordweave/internal/maintenance"
	"wordweave/internal/platform/config"
	"wordweave/internal/platform/postgres"
	"wordweave/internal/platform/security"
	"wordweave/internal/review"
)

func TestM001EndToEnd(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	testURL, cleanupDatabase := createTestDatabase(t, ctx, databaseURL)
	defer cleanupDatabase()
	pool, err := postgres.Open(ctx, testURL, "wordweave-e2e", 4)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := postgres.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	assertSeedBaseline(t, ctx, pool)

	provider := newFakeOpenRouter(t)
	defer provider.Close()
	cfg := integrationConfig(testURL, provider.URL)
	api, err := integrationServer(t, cfg, pool)
	if err != nil {
		t.Fatal(err)
	}
	api.SetReady(true)
	application := httptest.NewServer(api.Handler())
	defer application.Close()

	adminPassword := "admin-password-123"
	adminHash, err := security.HashPassword(adminPassword)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.accounts(username,password_hash,role,group_code) VALUES ('root_admin',$1,'admin',NULL)`, adminHash); err != nil {
		t.Fatal(err)
	}

	adminClient := newBrowserClient(t)
	adminCSRF := bootstrap(t, adminClient, application.URL)
	login := postJSON(t, adminClient, application.URL+"/api/v1/auth/login", adminCSRF, map[string]any{
		"username": "root_admin", "password": adminPassword, "browser_ui_locale": "en-US",
	})
	requireStatus(t, login, http.StatusOK)
	adminCSRF = dataString(t, login.body, "csrf_token")

	// The global credential endpoint has been replaced. Seed the migrated
	// fixture connection; all model operations below use the unified HTTP API.
	var fixtureAdmin uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM wordweave.accounts WHERE role='admin' LIMIT 1`).Scan(&fixtureAdmin); err != nil {
		t.Fatal(err)
	}
	if err := api.credentials.Put(ctx, fixtureAdmin, "integration-secret-key"); err != nil {
		t.Fatal(err)
	}
	createdModel := postJSON(t, adminClient, application.URL+"/api/v1/admin/models", adminCSRF, map[string]any{
		"display_name": "Integration model", "description": nil, "provider_model_id": "provider/integration", "connection_id": ai.LegacyProviderID, "output_mode": "json_schema", "expected_revision": configurationRevisionHTTP(t, adminClient, application.URL),
	})
	requireStatus(t, createdModel, http.StatusCreated)
	modelID := nestedString(t, createdModel.body, "data", "model", "id")
	enabledModel := postJSON(t, adminClient, application.URL+"/api/v1/admin/models/"+modelID+"/enable", adminCSRF, map[string]any{"expected_revision": configurationRevisionHTTP(t, adminClient, application.URL)})
	requireStatus(t, enabledModel, http.StatusOK)
	if !nestedBool(t, enabledModel.body, "data", "model", "enabled") {
		t.Fatal("model was not enabled")
	}
	group := putJSON(t, adminClient, application.URL+"/api/v1/admin/groups/basic", adminCSRF, map[string]any{
		"expected_revision": configurationRevisionHTTP(t, adminClient, application.URL), "priority": 1, "rolling_24h_limit": nil, "max_entries": 5, "allowed_lengths": []string{"short", "medium", "long", "xlong"}, "model_ids": []string{modelID},
	})
	requireStatus(t, group, http.StatusOK)
	visitorGroup := putJSON(t, adminClient, application.URL+"/api/v1/admin/groups/visitor", adminCSRF, map[string]any{
		"expected_revision": configurationRevisionHTTP(t, adminClient, application.URL), "priority": 0, "rolling_24h_limit": 1, "max_entries": 5, "allowed_lengths": []string{"short"}, "model_ids": []string{modelID},
	})
	requireStatus(t, visitorGroup, http.StatusOK)

	visitorClient := newBrowserClient(t)
	visitorCSRF := bootstrap(t, visitorClient, application.URL)
	visitorStream := rawJSONRequest(t, visitorClient, http.MethodPost, application.URL+"/api/v1/generations/stream", visitorCSRF, map[string]any{
		"model_id": modelID, "meaning_language": "en", "scenario": "discussion", "length": "short", "entries": []string{"learn"},
	}, nil)
	if visitorStream.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(visitorStream.Body)
		visitorStream.Body.Close()
		t.Fatalf("visitor generation status=%d body=%s", visitorStream.StatusCode, raw)
	}
	visitorRunID, visitorGenerationToken, visitorValidated := readGenerationSSE(t, visitorStream.Body)
	visitorStream.Body.Close()
	if !visitorValidated {
		t.Fatal("visitor generation did not validate")
	}
	visitorClaimResponse := rawJSONRequest(t, visitorClient, http.MethodPost, application.URL+"/api/v1/generations/"+visitorRunID+"/visitor-claim", visitorCSRF, map[string]any{}, map[string]string{"X-Generation-Token": visitorGenerationToken})
	visitorClaim := decodeResponse(t, visitorClaimResponse)
	requireStatus(t, visitorClaim, http.StatusOK)
	claimToken := dataString(t, visitorClaim.body, "claim_token")
	quotaResponse := rawJSONRequest(t, visitorClient, http.MethodPost, application.URL+"/api/v1/generations/stream", visitorCSRF, map[string]any{
		"model_id": modelID, "meaning_language": "en", "scenario": "discussion", "length": "short", "entries": []string{"learn"},
	}, nil)
	quotaProblem := decodeResponse(t, quotaResponse)
	requireStatus(t, quotaProblem, http.StatusTooManyRequests)
	if quotaProblem.body["code"] != "quota_exhausted" {
		t.Fatalf("unexpected visitor quota response: %s", quotaProblem.raw)
	}
	visitorRegistered := postJSON(t, visitorClient, application.URL+"/api/v1/auth/register", visitorCSRF, map[string]any{
		"username": "visitor_reader", "password": "visitor-password-123", "password_confirmation": "visitor-password-123", "ui_locale": "en-US",
	})
	requireStatus(t, visitorRegistered, http.StatusCreated)
	visitorAccountCSRF := dataString(t, visitorRegistered.body, "csrf_token")
	consumeRequest := func() testResponse {
		response := rawJSONRequest(t, visitorClient, http.MethodPost, application.URL+"/api/v1/visitor-claims/consume", visitorAccountCSRF, map[string]any{}, map[string]string{"X-Claim-Token": claimToken})
		return decodeResponse(t, response)
	}
	firstClaimConsumption := consumeRequest()
	requireStatus(t, firstClaimConsumption, http.StatusCreated)
	claimedBatchID := dataString(t, firstClaimConsumption.body, "batch_id")
	secondClaimConsumption := consumeRequest()
	requireStatus(t, secondClaimConsumption, http.StatusOK)
	if dataString(t, secondClaimConsumption.body, "batch_id") != claimedBatchID {
		t.Fatal("claim retry did not return the same batch")
	}

	learnerClient := newBrowserClient(t)
	learnerCSRF := bootstrap(t, learnerClient, application.URL)
	registered := postJSON(t, learnerClient, application.URL+"/api/v1/auth/register", learnerCSRF, map[string]any{
		"username": "reader_01", "password": "learner-password-123", "password_confirmation": "learner-password-123", "ui_locale": "zh-CN",
	})
	requireStatus(t, registered, http.StatusCreated)
	learnerCSRF = dataString(t, registered.body, "csrf_token")

	options := getJSON(t, learnerClient, application.URL+"/api/v1/generation-options")
	requireStatus(t, options, http.StatusOK)
	if nestedFloat(t, options.body, "data", "max_entries") != 5 {
		t.Fatalf("unexpected generation options: %s", options.raw)
	}

	streamRequestBody := map[string]any{"model_id": modelID, "meaning_language": "en", "scenario": "discussion", "length": "short", "entries": []string{"learn"}}
	streamResponse := rawJSONRequest(t, learnerClient, http.MethodPost, application.URL+"/api/v1/generations/stream", learnerCSRF, streamRequestBody, nil)
	if streamResponse.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(streamResponse.Body)
		streamResponse.Body.Close()
		t.Fatalf("generation status=%d body=%s", streamResponse.StatusCode, raw)
	}
	runID, generationToken, validated := readGenerationSSE(t, streamResponse.Body)
	streamResponse.Body.Close()
	if !validated {
		t.Fatal("generation did not reach validated terminal event")
	}

	saved := rawJSONRequest(t, learnerClient, http.MethodPost, application.URL+"/api/v1/generations/"+runID+"/save", learnerCSRF, map[string]any{}, map[string]string{"X-Generation-Token": generationToken})
	savedResponse := decodeResponse(t, saved)
	requireStatus(t, savedResponse, http.StatusCreated)
	batchID := dataString(t, savedResponse.body, "batch_id")
	var hintOccurrenceCount int
	if err := pool.QueryRow(ctx, `
		SELECT count(*)
		FROM wordweave.hint_occurrences occurrence
		JOIN wordweave.batch_targets target ON target.id=occurrence.target_id
		WHERE target.batch_id=$1`, batchID).Scan(&hintOccurrenceCount); err != nil {
		t.Fatal(err)
	}
	if hintOccurrenceCount != 3 {
		t.Fatalf("saved hint occurrence count=%d want=3", hintOccurrenceCount)
	}

	batches := getJSON(t, learnerClient, application.URL+"/api/v1/me/batches")
	requireStatus(t, batches, http.StatusOK)
	if !strings.Contains(batches.raw, batchID) {
		t.Fatalf("saved batch missing from learning history: %s", batches.raw)
	}
	batchDetail := getJSON(t, learnerClient, application.URL+"/api/v1/me/batches/"+batchID)
	requireStatus(t, batchDetail, http.StatusOK)
	if !strings.Contains(batchDetail.raw, `"hint_blanks":[`) || strings.Contains(batchDetail.raw, `"hint_blank":`) {
		t.Fatalf("batch detail did not use the API v1.3 plural hint contract: %s", batchDetail.raw)
	}

	session := postJSON(t, learnerClient, application.URL+"/api/v1/me/review-sessions", learnerCSRF, map[string]any{
		"mode": "single_batch", "batch_id": batchID,
	})
	requireStatus(t, session, http.StatusCreated)
	sessionID := nestedString(t, session.body, "data", "session", "session_id")
	attempt := postJSON(t, learnerClient, application.URL+"/api/v1/me/review-sessions/"+sessionID+"/attempts", learnerCSRF, map[string]any{})
	requireStatus(t, attempt, 201)
	rawAttempt, _ := json.Marshal(attempt.body["data"].(map[string]any)["attempt"])
	var draft review.DraftAttempt
	if err := json.Unmarshal(rawAttempt, &draft); err != nil {
		t.Fatal(err)
	}
	if len(draft.Words) != 1 {
		t.Fatal("missing spelling question")
	}
	hints := 0
	for _, segment := range draft.Words[0].Hint.Segments {
		if segment.Kind == "blank" {
			hints++
		}
	}
	if hints != 3 {
		t.Fatal("hint did not mask every occurrence")
	}
	answers := []review.PassageAnswer{}
	answerGroup := ""
	for _, segment := range draft.Passage.Segments {
		if segment.Kind == "blank" {
			if answerGroup != "" && answerGroup != segment.GroupKey {
				t.Fatal("inflections lost shared target identity")
			}
			answerGroup = segment.GroupKey
			answers = append(answers, review.PassageAnswer{BlankID: segment.BlankID, Answer: "wrong"})
		}
	}
	if len(answers) != 3 {
		t.Fatal("passage did not mask every occurrence")
	}
	endpoint := application.URL + "/api/v1/me/review-attempts/" + draft.ID.String()
	requireStatus(t, postJSON(t, learnerClient, endpoint+"/actions", learnerCSRF, map[string]any{}), 404)
	input := review.SubmitInput{ExpectedRevision: draft.Revision, Words: []review.WordAnswer{{QuestionID: draft.Words[0].QuestionID, Answer: ""}}, Passage: answers}
	submitted := decodeResponse(t, rawJSONRequest(t, learnerClient, http.MethodPost, endpoint+"/submit", learnerCSRF, input, map[string]string{"X-Review-Attempt-Token": draft.Token}))
	requireStatus(t, submitted, 200)
	if nestedBool(t, submitted.body, "data", "receipt", "successful") || nestedString(t, submitted.body, "data", "session", "status") != "completed" || submitted.body["data"].(map[string]any)["comparison"] == nil {
		t.Fatal("wrong answers prevented final submission or lost comparison")
	}
	retried := decodeResponse(t, rawJSONRequest(t, learnerClient, http.MethodPost, endpoint+"/submit", learnerCSRF, input, map[string]string{"X-Review-Attempt-Token": draft.Token}))
	requireStatus(t, retried, 200)
	if retried.body["data"].(map[string]any)["comparison"] != nil {
		t.Fatal("retry retained answer history")
	}
	loaded := getJSON(t, learnerClient, endpoint)
	requireStatus(t, loaded, 200)
	if strings.Contains(loaded.raw, `"comparison"`) || strings.Contains(loaded.raw, `"words"`) {
		t.Fatal("history returned private answers")
	}

	users := getJSON(t, adminClient, application.URL+"/api/v1/admin/users?username=reader")
	requireStatus(t, users, http.StatusOK)
	learnerID := nestedString(t, users.body, "data", "items", "0", "id")
	adminBatches := getJSON(t, adminClient, application.URL+"/api/v1/admin/users/"+learnerID+"/batches")
	requireStatus(t, adminBatches, http.StatusOK)
	if strings.Contains(adminBatches.raw, "single_batch_review") || !strings.Contains(adminBatches.raw, batchID) {
		t.Fatalf("admin batch projection contains actions or misses data: %s", adminBatches.raw)
	}
	deleted := decodeResponse(t, rawJSONRequest(
		t, learnerClient, http.MethodDelete, application.URL+"/api/v1/me/batches/"+batchID,
		learnerCSRF, nil, nil,
	))
	requireStatus(t, deleted, http.StatusNoContent)
	deletedDetail := getJSON(t, learnerClient, application.URL+"/api/v1/me/batches/"+batchID)
	requireStatus(t, deletedDetail, http.StatusNotFound)

	var slowModelID uuid.UUID
	if err := pool.QueryRow(ctx, `
		INSERT INTO wordweave.ai_models(display_name,provider_model_id,enabled)
		VALUES ('Slow integration model','provider/slow',true) RETURNING id`).Scan(&slowModelID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wordweave.group_models(group_code,model_id) VALUES ('registered',$1)`, slowModelID); err != nil {
		t.Fatal(err)
	}
	slowResponse := rawJSONRequest(t, learnerClient, http.MethodPost, application.URL+"/api/v1/generations/stream", learnerCSRF, map[string]any{
		"model_id": slowModelID.String(), "meaning_language": "en", "scenario": "discussion", "length": "short", "entries": []string{"learn"},
	}, nil)
	if slowResponse.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(slowResponse.Body)
		slowResponse.Body.Close()
		t.Fatalf("slow generation status=%d body=%s", slowResponse.StatusCode, raw)
	}
	slowScanner := bufio.NewScanner(slowResponse.Body)
	slowRunID, slowToken := readGenerationStarted(t, slowScanner)
	cancelResponse := rawJSONRequest(t, learnerClient, http.MethodPost, application.URL+"/api/v1/generations/"+slowRunID+"/cancel", learnerCSRF, map[string]any{}, map[string]string{"X-Generation-Token": slowToken})
	cancelled := decodeResponse(t, cancelResponse)
	requireStatus(t, cancelled, http.StatusOK)
	if dataString(t, cancelled.body, "status") != "cancelled" || dataBool(t, cancelled.body, "quota_refunded") {
		t.Fatalf("unexpected cancel projection: %s", cancelled.raw)
	}
	if !scanForSSEEvent(slowScanner, "generation.cancelled") {
		t.Fatal("generation stream did not emit its cancelled terminal event")
	}
	slowResponse.Body.Close()
	cancelRetry := rawJSONRequest(t, learnerClient, http.MethodPost, application.URL+"/api/v1/generations/"+slowRunID+"/cancel", learnerCSRF, map[string]any{}, map[string]string{"X-Generation-Token": slowToken})
	cancelledAgain := decodeResponse(t, cancelRetry)
	requireStatus(t, cancelledAgain, http.StatusOK)
	if dataString(t, cancelledAgain.body, "status") != "cancelled" || dataBool(t, cancelledAgain.body, "quota_refunded") {
		t.Fatalf("cancel retry changed terminal projection: %s", cancelledAgain.raw)
	}
	var orphanedRunID uuid.UUID
	if err := pool.QueryRow(ctx, `
		INSERT INTO wordweave.generation_runs(
			account_id,credited_account_id,group_code_snapshot,model_id,model_display_name_snapshot,
			provider_model_id_snapshot,meaning_language,scenario,length_code,minimum_words_snapshot,
			quota_limit_snapshot,max_entries_snapshot
		) VALUES ($1,$1,'registered',$2,'Integration model','provider/integration','en','discussion','short',50,NULL,5)
		RETURNING id`, learnerID, modelID).Scan(&orphanedRunID); err != nil {
		t.Fatal(err)
	}
	fixtureRunCharges(t, ctx, pool)
	settled, err := maintenance.SettleActiveGenerations(ctx, pool, "integration_startup_recovery")
	if err != nil || settled != 1 {
		t.Fatalf("startup settlement count=%d err=%v", settled, err)
	}
	var recoveredStatus string
	var quotaCharged bool
	if err := pool.QueryRow(ctx, `SELECT call_status,quota_charged FROM wordweave.generation_runs WHERE id=$1`, orphanedRunID).Scan(&recoveredStatus, &quotaCharged); err != nil {
		t.Fatal(err)
	}
	if recoveredStatus != "server_failed" || quotaCharged {
		t.Fatalf("orphan recovery status=%s quota_charged=%v", recoveredStatus, quotaCharged)
	}

	missingCSRF := rawJSONRequest(t, learnerClient, http.MethodPut, application.URL+"/api/v1/me/ui-locale", "", map[string]any{"ui_locale": "en-US"}, nil)
	missingCSRFResponse := decodeResponse(t, missingCSRF)
	requireStatus(t, missingCSRFResponse, http.StatusForbidden)
}

func integrationConfig(databaseURL, providerURL string) config.Config {
	secret := []byte(strings.Repeat("s", 32))
	return config.Config{
		HTTPAddr: ":0", MetricsAddr: ":0", PublicOrigin: "http://wordweave.test", OpenRouterBaseURL: providerURL,
		AppDatabaseURL: databaseURL, AIDatabaseURL: databaseURL, SessionPepper: secret,
		CapabilityKey: []byte(strings.Repeat("a", 32)), CSRFKey: []byte(strings.Repeat("c", 32)), CursorKey: []byte(strings.Repeat("u", 32)),
		MasterKeys: map[int][]byte{1: []byte(strings.Repeat("m", 32))}, CurrentKey: 1,
		CookieSecure: false, AppDBMaxConns: 4, AIDBMaxConns: 4, DraftTTL: 30 * time.Minute,
		ClaimTTL: 30 * time.Minute, AttemptTTL: 2 * time.Hour, ShutdownTimeout: 5 * time.Second,
	}
}

func createTestDatabase(t *testing.T, ctx context.Context, rawURL string) (string, func()) {
	t.Helper()
	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	databaseName := "wordweave_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	adminConnection, err := pgx.Connect(ctx, rawURL)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := adminConnection.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{databaseName}.Sanitize()); err != nil {
		adminConnection.Close(ctx)
		t.Fatal(err)
	}
	parsed.Path = "/" + databaseName
	return parsed.String(), func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_, _ = adminConnection.Exec(cleanupCtx, "DROP DATABASE "+pgx.Identifier{databaseName}.Sanitize()+" WITH (FORCE)")
		_ = adminConnection.Close(cleanupCtx)
	}
}

func assertSeedBaseline(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	var entries, groups int
	if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM wordweave.vocabulary_entries),(SELECT count(*) FROM wordweave.entitlement_groups)`).Scan(&entries, &groups); err != nil {
		t.Fatal(err)
	}
	if entries != 13860 || groups != 4 {
		t.Fatalf("seed baseline entries=%d groups=%d", entries, groups)
	}
}

func newFakeOpenRouter(t *testing.T) *httptest.Server {
	t.Helper()
	passage := "A thoughtful student learns(learn) by building a steady learning(learn) routine through daily reading and discussion. Each morning the student reviews a few ideas, connects them with practical examples, and writes a short reflection. Friends later compare their observations, ask clear questions, and share useful explanations about what they learned(learn). This patient practice makes new knowledge easier to remember and apply with confidence."
	candidate := map[string]any{
		"passage": passage, "tags": []string{"study"},
		"targets": map[string]any{"learn": map[string]any{
			"entry_meaning": "gain knowledge through study",
			"hint_phrase":   "learning(learn) through learned(learn) examples while learning(learn)",
		}},
	}
	candidateJSON, _ := json.Marshal(candidate)
	probeCandidate := map[string]any{
		"passage": passage + " The group also discussed vulnerability(vulnerable) with empathy.", "tags": []string{"study"},
		"targets": map[string]any{
			"learn":      candidate["targets"].(map[string]any)["learn"],
			"vulnerable": map[string]any{"entry_meaning": "open to harm", "hint_phrase": "vulnerable(vulnerable) communities"},
		},
	}
	probeJSON, _ := json.Marshal(probeCandidate)
	return httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer integration-secret-key" {
			http.Error(writer, "unauthorized", http.StatusUnauthorized)
			return
		}
		switch {
		case request.Method == http.MethodGet && request.URL.Path == "/models":
			writer.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(writer, `{"data":[{"id":"provider/integration","supported_parameters":["structured_outputs"]}]}`)
		case request.Method == http.MethodPost && request.URL.Path == "/chat/completions":
			var providerRequest struct {
				Model    string `json:"model"`
				Messages []struct {
					Content string `json:"content"`
				} `json:"messages"`
			}
			if err := json.NewDecoder(request.Body).Decode(&providerRequest); err != nil {
				http.Error(writer, "bad request", http.StatusBadRequest)
				return
			}
			writer.Header().Set("Content-Type", "text/event-stream")
			if providerRequest.Model == "provider/slow" {
				writer.WriteHeader(http.StatusOK)
				if flusher, ok := writer.(http.Flusher); ok {
					flusher.Flush()
				}
				<-request.Context().Done()
				return
			}
			responseCandidate := candidateJSON
			for _, message := range providerRequest.Messages {
				if strings.Contains(message.Content, "fixed compatibility probe") {
					responseCandidate = probeJSON
				}
			}
			chunk, _ := json.Marshal(map[string]any{"choices": []map[string]any{{"delta": map[string]string{"content": string(responseCandidate)}}}})
			_, _ = fmt.Fprintf(writer, "data: %s\n\ndata: [DONE]\n\n", chunk)
		default:
			http.NotFound(writer, request)
		}
	}))
}

type testResponse struct {
	status int
	raw    string
	body   map[string]any
}

type testReviewPassageBlank struct {
	blankID  string
	groupKey string
}

func reviewPassageBlanks(t *testing.T, body map[string]any) []testReviewPassageBlank {
	t.Helper()
	segments, ok := nestedValue(t, body, "data", "item", "passage_segments").([]any)
	if !ok {
		t.Fatalf("passage_segments is not an array: %#v", body)
	}
	result := make([]testReviewPassageBlank, 0)
	for _, rawSegment := range segments {
		segment, ok := rawSegment.(map[string]any)
		if !ok {
			t.Fatalf("passage segment is %T, want object", rawSegment)
		}
		if segment["kind"] != "blank" {
			continue
		}
		blankID, blankOK := segment["blank_id"].(string)
		groupKey, groupOK := segment["group_key"].(string)
		if !blankOK || blankID == "" || !groupOK || groupKey == "" {
			t.Fatalf("invalid passage blank projection: %#v", segment)
		}
		result = append(result, testReviewPassageBlank{blankID: blankID, groupKey: groupKey})
	}
	return result
}

func isV13ReviewGroupKey(value string) bool {
	if len(value) != len("grp_")+22 || !strings.HasPrefix(value, "grp_") {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(value, "grp_"))
	return err == nil && len(raw) == 16
}

func newBrowserClient(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Client{Jar: jar, Timeout: 20 * time.Second}
}

func bootstrap(t *testing.T, client *http.Client, baseURL string) string {
	response := getJSON(t, client, baseURL+"/api/v1/bootstrap")
	requireStatus(t, response, http.StatusOK)
	return dataString(t, response.body, "csrf_token")
}

func getJSON(t *testing.T, client *http.Client, endpoint string) testResponse {
	t.Helper()
	response, err := client.Get(endpoint)
	if err != nil {
		t.Fatal(err)
	}
	return decodeResponse(t, response)
}

func postJSON(t *testing.T, client *http.Client, endpoint, csrf string, body any) testResponse {
	t.Helper()
	return decodeResponse(t, rawJSONRequest(t, client, http.MethodPost, endpoint, csrf, body, nil))
}

func putJSON(t *testing.T, client *http.Client, endpoint, csrf string, body any) testResponse {
	t.Helper()
	return decodeResponse(t, rawJSONRequest(t, client, http.MethodPut, endpoint, csrf, body, nil))
}

func rawJSONRequest(t *testing.T, client *http.Client, method, endpoint, csrf string, body any, headers map[string]string) *http.Response {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(method, endpoint, bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "http://wordweave.test")
	request.Header.Set("Sec-Fetch-Site", "same-origin")
	if csrf != "" {
		request.Header.Set("X-CSRF-Token", csrf)
	}
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func decodeResponse(t *testing.T, response *http.Response) testResponse {
	t.Helper()
	defer response.Body.Close()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &body); err != nil {
			t.Fatalf("decode status %d response %q: %v", response.StatusCode, raw, err)
		}
	}
	return testResponse{status: response.StatusCode, raw: string(raw), body: body}
}

func requireStatus(t *testing.T, response testResponse, expected int) {
	t.Helper()
	if response.status != expected {
		t.Fatalf("status=%d want=%d body=%s", response.status, expected, response.raw)
	}
}

func dataString(t *testing.T, body map[string]any, key string) string {
	t.Helper()
	return nestedString(t, body, "data", key)
}

func dataBool(t *testing.T, body map[string]any, key string) bool {
	t.Helper()
	return nestedBool(t, body, "data", key)
}

func nestedString(t *testing.T, value any, path ...string) string {
	t.Helper()
	resolved := nestedValue(t, value, path...)
	result, ok := resolved.(string)
	if !ok {
		t.Fatalf("%v at %v is not a string", resolved, path)
	}
	return result
}

func nestedBool(t *testing.T, value any, path ...string) bool {
	t.Helper()
	resolved := nestedValue(t, value, path...)
	result, ok := resolved.(bool)
	if !ok {
		t.Fatalf("%v at %v is not a bool", resolved, path)
	}
	return result
}

func nestedFloat(t *testing.T, value any, path ...string) float64 {
	t.Helper()
	resolved := nestedValue(t, value, path...)
	result, ok := resolved.(float64)
	if !ok {
		t.Fatalf("%v at %v is not a number", resolved, path)
	}
	return result
}

func nestedValue(t *testing.T, value any, path ...string) any {
	t.Helper()
	current := value
	for _, part := range path {
		switch typed := current.(type) {
		case map[string]any:
			current = typed[part]
		case []any:
			var index int
			if _, err := fmt.Sscanf(part, "%d", &index); err != nil || index < 0 || index >= len(typed) {
				t.Fatalf("invalid array path %q", part)
			}
			current = typed[index]
		default:
			t.Fatalf("cannot traverse %T at %q", current, part)
		}
	}
	return current
}

func readGenerationSSE(t *testing.T, body io.Reader) (string, string, bool) {
	t.Helper()
	scanner := bufio.NewScanner(body)
	var event string
	var runID, token string
	validated := false
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "event: ") {
			event = strings.TrimPrefix(line, "event: ")
			continue
		}
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &payload); err != nil {
			t.Fatal(err)
		}
		if event == "generation.started" {
			runID, _ = payload["run_id"].(string)
			token, _ = payload["generation_token"].(string)
		}
		if event == "generation.validated" {
			validated = true
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	return runID, token, validated
}

func readGenerationStarted(t *testing.T, scanner *bufio.Scanner) (string, string) {
	t.Helper()
	var event string
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "event: ") {
			event = strings.TrimPrefix(line, "event: ")
			continue
		}
		if event != "generation.started" || !strings.HasPrefix(line, "data: ") {
			continue
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &payload); err != nil {
			t.Fatal(err)
		}
		runID, _ := payload["run_id"].(string)
		token, _ := payload["generation_token"].(string)
		if runID == "" || token == "" {
			t.Fatal("generation.started omitted its capability")
		}
		return runID, token
	}
	t.Fatalf("generation stream ended before generation.started: %v", scanner.Err())
	return "", ""
}

func scanForSSEEvent(scanner *bufio.Scanner, wanted string) bool {
	for scanner.Scan() {
		if scanner.Text() == "event: "+wanted {
			return true
		}
	}
	return false
}
