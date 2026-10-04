package observability

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type httpKey struct {
	method string
	route  string
	status int
}

type httpValue struct {
	count       uint64
	durationSum float64
}

type Metrics struct {
	generation generationMetrics
	inFlight   atomic.Int64
	mutex      sync.Mutex
	http       map[httpKey]httpValue
}

func NewMetrics() *Metrics { return &Metrics{http: make(map[httpKey]httpValue)} }

func (metrics *Metrics) Begin() func(method, route string, status int) {
	metrics.inFlight.Add(1)
	started := time.Now()
	return func(method, route string, status int) {
		metrics.inFlight.Add(-1)
		if route == "" {
			route = "unmatched"
		}
		key := httpKey{method: method, route: route, status: status}
		metrics.mutex.Lock()
		value := metrics.http[key]
		value.count++
		value.durationSum += time.Since(started).Seconds()
		metrics.http[key] = value
		metrics.mutex.Unlock()
	}
}

func (metrics *Metrics) Handler(pool *pgxpool.Pool) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		writer.Header().Set("Cache-Control", "no-store")
		_, _ = fmt.Fprintln(writer, "# HELP wordweave_up Whether the process is serving metrics.")
		_, _ = fmt.Fprintln(writer, "# TYPE wordweave_up gauge")
		_, _ = fmt.Fprintln(writer, "wordweave_up 1")
		_, _ = fmt.Fprintln(writer, "# TYPE wordweave_http_requests_in_flight gauge")
		_, _ = fmt.Fprintf(writer, "wordweave_http_requests_in_flight %d\n", metrics.inFlight.Load())
		metrics.writeHTTP(writer)
		metrics.writeGeneration(writer)
		writeOperations(request.Context(), writer, pool)
		stats := pool.Stat()
		_, _ = fmt.Fprintln(writer, "# TYPE wordweave_db_pool_connections gauge")
		_, _ = fmt.Fprintf(writer, "wordweave_db_pool_connections{state=\"acquired\"} %d\n", stats.AcquiredConns())
		_, _ = fmt.Fprintf(writer, "wordweave_db_pool_connections{state=\"idle\"} %d\n", stats.IdleConns())
		_, _ = fmt.Fprintf(writer, "wordweave_db_pool_connections{state=\"total\"} %d\n", stats.TotalConns())
		_, _ = fmt.Fprintln(writer, "# TYPE wordweave_db_pool_acquire_total counter")
		_, _ = fmt.Fprintf(writer, "wordweave_db_pool_acquire_total %d\n", stats.AcquireCount())
		_, _ = fmt.Fprintln(writer, "# TYPE wordweave_db_pool_acquire_duration_seconds counter")
		_, _ = fmt.Fprintf(writer, "wordweave_db_pool_acquire_duration_seconds %g\n", stats.AcquireDuration().Seconds())
	})
}

func (metrics *Metrics) writeHTTP(writer http.ResponseWriter) {
	metrics.mutex.Lock()
	keys := make([]httpKey, 0, len(metrics.http))
	values := make(map[httpKey]httpValue, len(metrics.http))
	for key, value := range metrics.http {
		keys = append(keys, key)
		values[key] = value
	}
	metrics.mutex.Unlock()
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].route != keys[j].route {
			return keys[i].route < keys[j].route
		}
		if keys[i].method != keys[j].method {
			return keys[i].method < keys[j].method
		}
		return keys[i].status < keys[j].status
	})
	_, _ = fmt.Fprintln(writer, "# TYPE wordweave_http_requests_total counter")
	_, _ = fmt.Fprintln(writer, "# TYPE wordweave_http_request_duration_seconds counter")
	for _, key := range keys {
		labels := "method=" + strconv.Quote(key.method) + ",route=" + strconv.Quote(key.route) + ",status=" + strconv.Quote(strconv.Itoa(key.status))
		_, _ = fmt.Fprintf(writer, "wordweave_http_requests_total{%s} %d\n", labels, values[key].count)
		_, _ = fmt.Fprintf(writer, "wordweave_http_request_duration_seconds{%s} %g\n", labels, values[key].durationSum)
	}
}
