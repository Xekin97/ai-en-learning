//go:build integration

package httpapi

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"wordweave/internal/ai"
	"wordweave/internal/generation"
	"wordweave/internal/identity"
)

// Local synthetic PostgreSQL proxy: withhold one matching CommandComplete,
// wait for ReadyForQuery (transaction has ended), then drop the connection.
// Unlike a failing trigger, the database has actually committed the write.
type commitAckProxy struct {
	listener    net.Listener
	target, tag string
	armed       atomic.Bool
	dropped     atomic.Int32
	mu          sync.Mutex
	clients     map[net.Conn]struct{}
	wg          sync.WaitGroup
}

func newCommitAckProxy(t *testing.T, pool *pgxpool.Pool, tag string) (*commitAckProxy, *pgxpool.Pool) {
	t.Helper()
	cfg := pool.Config()
	if !strings.HasPrefix(cfg.ConnConfig.Database, "wordweave_test_") {
		t.Fatal("proxy only supports disposable test databases")
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	proxy := &commitAckProxy{listener: listener, target: net.JoinHostPort(cfg.ConnConfig.Host, fmt.Sprint(cfg.ConnConfig.Port)), tag: tag, clients: make(map[net.Conn]struct{})}
	proxy.wg.Add(1)
	go func() {
		defer proxy.wg.Done()
		for {
			client, err := listener.Accept()
			if err != nil {
				return
			}
			proxy.mu.Lock()
			proxy.clients[client] = struct{}{}
			proxy.mu.Unlock()
			proxy.wg.Add(1)
			go proxy.forward(client)
		}
	}()
	t.Cleanup(func() {
		listener.Close()
		proxy.mu.Lock()
		for client := range proxy.clients {
			client.Close()
		}
		proxy.mu.Unlock()
		proxy.wg.Wait()
	})
	address := listener.Addr().(*net.TCPAddr)
	cfg.ConnConfig.Host = "127.0.0.1"
	cfg.ConnConfig.Port = uint16(address.Port)
	proxied, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(proxied.Close)
	return proxy, proxied
}

func (p *commitAckProxy) forward(client net.Conn) {
	defer p.wg.Done()
	defer func() { client.Close(); p.mu.Lock(); delete(p.clients, client); p.mu.Unlock() }()
	remote, err := net.DialTimeout("tcp", p.target, time.Second)
	if err != nil {
		return
	}
	defer remote.Close()
	p.wg.Add(1)
	go func() { defer p.wg.Done(); io.Copy(remote, client); remote.Close() }()
	holding := false
	for {
		var header [5]byte
		if _, err := io.ReadFull(remote, header[:]); err != nil {
			return
		}
		length := int(binary.BigEndian.Uint32(header[1:])) - 4
		if length < 0 || length > 32<<20 {
			return
		}
		body := make([]byte, length)
		if _, err := io.ReadFull(remote, body); err != nil {
			return
		}
		if header[0] == 'C' && string(body) == p.tag+"\x00" && p.armed.CompareAndSwap(true, false) {
			holding = true
		}
		if holding {
			if header[0] == 'Z' {
				p.dropped.Add(1)
				return
			}
			continue
		}
		if _, err := client.Write(header[:]); err != nil {
			return
		}
		if _, err := client.Write(body); err != nil {
			return
		}
	}
}

func TestMixedCommitAcknowledgementHTTP(t *testing.T) {
	for _, mode := range []string{"valid_commit", "failure_update"} {
		t.Run(mode, func(t *testing.T) {
			var proxy *commitAckProxy
			candidate := ai.Candidate{
				Passage: "Young(young) people share grapes(grape). " + strings.TrimSpace(strings.Repeat("Neighbors offer practical ideas and helpful support. ", 9)),
				Tags:    []string{"fruit"},
				Targets: []ai.CandidateTarget{{SourceEntry: "grape", EntryMeaning: "a small fruit", HintPhrase: "fresh grapes(grape)"}, {SourceEntry: "young", EntryMeaning: "not old", HintPhrase: "young(young) children"}},
			}
			tag := "COMMIT"
			if mode == "failure_update" {
				tag = "UPDATE 1"
				candidate.Passage = "Young(young) people share grapes(grape)."
			}
			f := newBoundaryHTTPFixtureWithPool(t, func(w http.ResponseWriter, r *http.Request) {
				// Preflight COMMIT and credential reads already finished before Open.
				proxy.armed.Store(true)
				w.Header().Set("Content-Type", "text/event-stream")
				fmt.Fprint(w, p0HTTPWire(candidate))
			}, func(pool *pgxpool.Pool) *pgxpool.Pool {
				var wrapped *pgxpool.Pool
				proxy, wrapped = newCommitAckProxy(t, pool, tag)
				return wrapped
			})
			response := f.start(t)
			raw, err := io.ReadAll(response.Body)
			response.Body.Close()
			if err != nil {
				t.Fatal(err)
			}
			if proxy.dropped.Load() != 1 {
				t.Fatal("acknowledgement fault did not fire exactly once")
			}
			if mode == "valid_commit" {
				f.assertSettled(t, "valid", true, 1)
				if strings.Count(string(raw), "event: generation.validated") != 1 || strings.Contains(string(raw), "event: generation.failed") {
					t.Fatal("committed draft was projected as failure")
				}
			} else {
				f.assertSettled(t, "validation_failed", false, 0)
				if strings.Count(string(raw), "event: generation.failed") != 1 || !strings.Contains(string(raw), "\"quota_refunded\":true") || strings.Contains(string(raw), "event: generation.validated") {
					t.Fatal("committed refund was not recovered")
				}
			}
			if len(f.api.generation.Registry().PendingFailures(10)) != 0 {
				t.Fatal("confirmed terminal still pending")
			}
		})
	}
}

func TestMixedCancelledWriteAcknowledgement(t *testing.T) {
	var proxy *commitAckProxy
	f := newBoundaryHTTPFixtureWithPool(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}, func(pool *pgxpool.Pool) *pgxpool.Pool {
		var wrapped *pgxpool.Pool
		proxy, wrapped = newCommitAckProxy(t, pool, "UPDATE 1")
		return wrapped
	})
	response := f.start(t)
	defer response.Body.Close()
	scanner := bufio.NewScanner(response.Body)
	var started struct {
		RunID string `json:"run_id"`
		Token string `json:"generation_token"`
	}
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data: ") {
			if err := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &started); err != nil {
				t.Fatal(err)
			}
		}
		if line == "" && started.RunID != "" {
			break
		}
	}
	if started.Token == "" {
		t.Fatal("missing capability")
	}
	actor := identity.Actor{Kind: "account", Role: "learner", GroupCode: "registered"}
	if err := f.pool.QueryRow(f.ctx, "SELECT account_id FROM wordweave.generation_runs WHERE id=$1", started.RunID).Scan(&actor.ID); err != nil {
		t.Fatal(err)
	}
	proxy.armed.Store(true)
	// Exercise exactly the cancel service write, without an unrelated HTTP
	// session Touch UPDATE consuming the one-shot wire fault first.
	out, err := f.api.generation.Cancel(f.ctx, actor, started.RunID, started.Token)
	if proxy.dropped.Load() != 1 {
		t.Fatal("cancel acknowledgement was not dropped")
	}
	if err != nil || out.Status != "cancelled" || out.QuotaRefunded {
		t.Fatalf("committed cancellation not reconciled: %+v / %v", out, err)
	}
	finished := make(chan string, 1)
	go func() {
		var wire strings.Builder
		for scanner.Scan() {
			wire.WriteString(scanner.Text())
			wire.WriteByte('\n')
		}
		finished <- wire.String()
	}()
	select {
	case wire := <-finished:
		if strings.Count(wire, "event: generation.cancelled") != 1 || strings.Contains(wire, "event: generation.failed") {
			t.Fatal("wrong stream terminal after confirmed cancel")
		}
	case <-time.After(2 * time.Second):
		response.Body.Close()
		<-finished
		t.Fatal("confirmed cancellation did not stop silent upstream")
	}
	f.assertSettled(t, "user_cancelled", true, 0)
}

func TestMixedTerminalCompetition(t *testing.T) {
	for _, pair := range []string{"cancel_valid", "cancel_failure", "valid_failure"} {
		for _, order := range []string{"left_first", "right_first", "simultaneous"} {
			t.Run(pair+"/"+order, func(t *testing.T) {
				ctx, api, pool, actor, model, _ := cr039Harness(t)
				snapshot := cr039Snapshot(t)
				repeat := 1
				if order == "simultaneous" {
					repeat = 12
				}
				for iteration := 0; iteration < repeat; iteration++ {
					run := cr039SeedRun(t, ctx, api, pool, actor, model, "learn")
					cancelled := atomic.Int32{}
					api.generation.Registry().SetCancel(run.ID, func() { cancelled.Add(1) })
					action := func(kind string) error {
						switch kind {
						case "cancel":
							_, err := api.generation.Cancel(ctx, actor, run.ID.String(), run.Token)
							return err
						case "valid":
							return api.generation.CompleteValid(ctx, run, snapshot)
						default:
							_, err := api.generation.ReconcileFailure(ctx, run.ID, "validation_failed", "content_validation_failed")
							return err
						}
					}
					parts := strings.Split(pair, "_")
					failures := make(chan error, 2)
					if order == "simultaneous" {
						start := make(chan struct{})
						for _, kind := range parts {
							go func() { <-start; failures <- action(kind) }()
						}
						close(start)
					} else {
						if order == "right_first" {
							parts[0], parts[1] = parts[1], parts[0]
						}
						failures <- action(parts[0])
						failures <- action(parts[1])
					}
					for i := 0; i < 2; i++ {
						if err := <-failures; err != nil && !errors.Is(err, generation.ErrTerminalRace) {
							t.Fatal(err)
						}
					}
					var status string
					var charged, cumulative bool
					var drafts int
					if err := pool.QueryRow(ctx, "SELECT call_status,quota_charged,counts_toward_cumulative,(SELECT count(*) FROM wordweave.generation_drafts WHERE run_id=r.id) FROM wordweave.generation_runs r WHERE id=$1", run.ID).Scan(&status, &charged, &cumulative, &drafts); err != nil {
						t.Fatal(err)
					}
					if order != "simultaneous" {
						expected := map[string]string{"cancel": "user_cancelled", "valid": "valid", "failure": "validation_failed"}[parts[0]]
						if status != expected {
							t.Fatalf("winner overwritten: %s instead of %s", status, expected)
						}
					}
					switch status {
					case "valid":
						if !charged || !cumulative || drafts != 1 || cancelled.Load() != 0 {
							t.Fatal("invalid valid outcome")
						}
					case "user_cancelled":
						if !charged || !cumulative || drafts != 0 || cancelled.Load() != 1 {
							t.Fatal("invalid cancelled outcome")
						}
					case "validation_failed":
						if charged || cumulative || drafts != 0 || cancelled.Load() != 0 {
							t.Fatal("invalid failure outcome")
						}
					default:
						t.Fatalf("no unique terminal: %s", status)
					}
					for i := 0; i < 2; i++ {
						out, err := api.generation.Cancel(ctx, actor, run.ID.String(), run.Token)
						want := map[string]string{"valid": "valid", "user_cancelled": "cancelled", "validation_failed": "failed"}[status]
						if err != nil || out.Status != want || out.QuotaRefunded != (status == "validation_failed") {
							t.Fatal("duplicate cancel changed terminal")
						}
					}
					api.generation.RetryPendingFailures(ctx, 200)
					assertRefundRow(t, ctx, pool, run.ID, status, charged, cumulative)
					if len(api.generation.Registry().PendingFailures(10)) != 0 {
						t.Fatal("terminal remained pending")
					}
				}
			})
		}
	}
}

func TestMixedCancelUnconfirmedDoesNotStopOrRefund(t *testing.T) {
	ctx, api, pool, actor, model, _ := cr039Harness(t)
	run := cr039SeedRun(t, ctx, api, pool, actor, model, "learn")
	var cancelled atomic.Int32
	api.generation.Registry().SetCancel(run.ID, func() { cancelled.Add(1) })
	if _, err := pool.Exec(ctx, `CREATE FUNCTION wordweave.cancel_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic cancel failure'; END $$;
		CREATE TRIGGER cancel_fault BEFORE UPDATE ON wordweave.generation_runs FOR EACH ROW WHEN (NEW.call_status='user_cancelled') EXECUTE FUNCTION wordweave.cancel_fault()`); err != nil {
		t.Fatal(err)
	}
	out, err := api.generation.Cancel(ctx, actor, run.ID.String(), run.Token)
	if err == nil || out.QuotaRefunded || out.Status != "" || cancelled.Load() != 0 {
		t.Fatal("uncommitted cancellation reported or applied")
	}
	assertRefundRow(t, ctx, pool, run.ID, "active", true, false)
	if _, err := pool.Exec(ctx, "DROP TRIGGER cancel_fault ON wordweave.generation_runs"); err != nil {
		t.Fatal(err)
	}
	out, err = api.generation.Cancel(ctx, actor, run.ID.String(), run.Token)
	if err != nil || out.Status != "cancelled" || cancelled.Load() != 1 {
		t.Fatal("explicit retry did not cancel once")
	}
}

func TestMixedCancelReadbackIsBounded(t *testing.T) {
	ctx, api, pool, actor, model, _ := cr039Harness(t)
	run := cr039SeedRun(t, ctx, api, pool, actor, model, "learn")
	var cancelled atomic.Int32
	api.generation.Registry().SetCancel(run.ID, func() { cancelled.Add(1) })
	// Exhaust only this disposable pool: no query can reach PostgreSQL. The
	// failed write and bounded confirmation cannot imply a missing run/refund.
	var held []*pgxpool.Conn
	for i := int32(0); i < pool.Config().MaxConns; i++ {
		conn, err := pool.Acquire(ctx)
		if err != nil {
			t.Fatal(err)
		}
		held = append(held, conn)
	}
	release := func() {
		for _, conn := range held {
			conn.Release()
		}
		held = nil
	}
	defer release()
	writeCtx, cancel := context.WithTimeout(ctx, 30*time.Millisecond)
	defer cancel()
	start := time.Now()
	out, err := api.generation.Cancel(writeCtx, actor, run.ID.String(), run.Token)
	elapsed := time.Since(start)
	if err == nil || errors.Is(err, generation.ErrRunNotFound) || out.QuotaRefunded || out.Status != "" || cancelled.Load() != 0 || elapsed < 5*time.Second || elapsed > 7*time.Second {
		t.Fatalf("unknown readback mishandled: elapsed=%s outcome=%+v error=%v", elapsed, out, err)
	}
	release()
	assertRefundRow(t, ctx, pool, run.ID, "active", true, false)
	if _, err := api.generation.Cancel(ctx, actor, run.ID.String(), run.Token); err != nil {
		t.Fatal(err)
	}
}
