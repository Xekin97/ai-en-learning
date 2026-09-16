package httpapi

import (
	"net"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"wordweave/internal/platform/config"
)

func TestAuthRateLimiterSeparatesOperationSubjectAndSource(t *testing.T) {
	limiter := newAuthRateLimiter([]byte(strings.Repeat("r", 32)))
	for index := 0; index < 2; index++ {
		if allowed, _ := limiter.allow("login", "Reader", "192.0.2.0/24", 2, time.Hour); !allowed {
			t.Fatal("request inside capacity was rejected")
		}
	}
	if allowed, retry := limiter.allow("login", "reader", "192.0.2.0/24", 2, time.Hour); allowed || retry < 1 {
		t.Fatalf("exhausted bucket allowed=%v retry=%d", allowed, retry)
	}
	if allowed, _ := limiter.allow("register", "reader", "192.0.2.0/24", 2, time.Hour); !allowed {
		t.Fatal("another operation unexpectedly shared the bucket")
	}
	if allowed, _ := limiter.allow("login", "reader", "198.51.100.0/24", 2, time.Hour); !allowed {
		t.Fatal("another source unexpectedly shared the bucket")
	}
}

func TestCoarseSourceDoesNotRetainHostAddress(t *testing.T) {
	if got := coarseSource("192.0.2.123:443"); got != "192.0.2.0/24" {
		t.Fatalf("IPv4 coarse source = %q", got)
	}
	if got := coarseSource("[2001:db8:abcd:1234:5678::1]:443"); got != "2001:db8:abcd:1234::/64" {
		t.Fatalf("IPv6 coarse source = %q", got)
	}
}

func TestTrustedProxyUsesRightmostUntrustedForwardedAddress(t *testing.T) {
	_, trusted, _ := net.ParseCIDR("10.0.0.0/8")
	server := &Server{cfg: config.Config{TrustedProxyCIDRs: []*net.IPNet{trusted}}}
	request := httptest.NewRequest("POST", "/", nil)
	request.RemoteAddr = "10.0.0.2:443"
	request.Header.Set("X-Forwarded-For", "192.0.2.123, 10.0.0.3")
	if got := server.coarseRequestSource(request); got != "192.0.2.0/24" {
		t.Fatalf("trusted proxy source = %q", got)
	}
	request.RemoteAddr = "198.51.100.12:443"
	if got := server.coarseRequestSource(request); got != "198.51.100.0/24" {
		t.Fatalf("untrusted proxy header affected source: %q", got)
	}
}
