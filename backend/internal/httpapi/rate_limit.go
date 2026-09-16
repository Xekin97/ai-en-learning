package httpapi

import (
	"encoding/base64"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"wordweave/internal/platform/security"
)

type tokenBucket struct {
	tokens   float64
	updated  time.Time
	lastUsed time.Time
}

type authRateLimiter struct {
	mutex   sync.Mutex
	key     []byte
	buckets map[string]tokenBucket
	checks  uint64
}

func newAuthRateLimiter(key []byte) *authRateLimiter {
	return &authRateLimiter{key: append([]byte(nil), key...), buckets: make(map[string]tokenBucket)}
}

func (limiter *authRateLimiter) allow(operation, subject, source string, capacity int, refillInterval time.Duration) (bool, int) {
	now := time.Now()
	keyMaterial := operation + "\x00" + strings.ToLower(strings.TrimSpace(subject)) + "\x00" + source
	key := base64.RawURLEncoding.EncodeToString(security.Digest(limiter.key, "auth-rate-v1", keyMaterial))
	limiter.mutex.Lock()
	defer limiter.mutex.Unlock()
	limiter.checks++
	if limiter.checks%512 == 0 {
		for existingKey, bucket := range limiter.buckets {
			if now.Sub(bucket.lastUsed) > 24*time.Hour {
				delete(limiter.buckets, existingKey)
			}
		}
	}
	bucket, found := limiter.buckets[key]
	if !found {
		bucket = tokenBucket{tokens: float64(capacity), updated: now}
	}
	refillPerSecond := 1 / refillInterval.Seconds()
	bucket.tokens = math.Min(float64(capacity), bucket.tokens+now.Sub(bucket.updated).Seconds()*refillPerSecond)
	bucket.updated, bucket.lastUsed = now, now
	if bucket.tokens < 1 {
		limiter.buckets[key] = bucket
		retryAfter := int(math.Ceil((1 - bucket.tokens) / refillPerSecond))
		if retryAfter < 1 {
			retryAfter = 1
		}
		return false, retryAfter
	}
	bucket.tokens--
	limiter.buckets[key] = bucket
	return true, 0
}

func (server *Server) requireAuthRate(writer http.ResponseWriter, request *http.Request, operation, subject string, capacity int, refillInterval time.Duration) bool {
	allowed, retryAfter := server.authLimiter.allow(operation, subject, server.coarseRequestSource(request), capacity, refillInterval)
	if allowed {
		return true
	}
	writer.Header().Set("Retry-After", strconv.Itoa(retryAfter))
	writeProblem(writer, request, http.StatusTooManyRequests, "rate_limited", "Too many attempts", "Wait before trying this operation again.")
	return false
}

func (server *Server) coarseRequestSource(request *http.Request) string {
	remote := parseRemoteIP(request.RemoteAddr)
	client := remote
	if server.isTrustedProxy(remote) {
		chain := strings.Split(request.Header.Get("X-Forwarded-For"), ",")
		for index := len(chain) - 1; index >= 0; index-- {
			candidate := net.ParseIP(strings.TrimSpace(chain[index]))
			if candidate == nil {
				continue
			}
			client = candidate
			if !server.isTrustedProxy(candidate) {
				break
			}
		}
	}
	if client == nil {
		return "unknown"
	}
	return coarseIP(client)
}

func (server *Server) isTrustedProxy(ip net.IP) bool {
	if ip == nil {
		return false
	}
	for _, network := range server.cfg.TrustedProxyCIDRs {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

func coarseSource(remoteAddress string) string {
	ip := parseRemoteIP(remoteAddress)
	if ip == nil {
		return "unknown"
	}
	return coarseIP(ip)
}

func parseRemoteIP(remoteAddress string) net.IP {
	host, _, err := net.SplitHostPort(remoteAddress)
	if err != nil {
		host = remoteAddress
	}
	return net.ParseIP(strings.Trim(host, "[]"))
}

func coarseIP(ip net.IP) string {
	if ipv4 := ip.To4(); ipv4 != nil {
		return ipv4.Mask(net.CIDRMask(24, 32)).String() + "/24"
	}
	return ip.Mask(net.CIDRMask(64, 128)).String() + "/64"
}
