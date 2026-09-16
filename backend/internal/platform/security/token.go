package security

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const randomTokenBytes = 32

func RandomToken() (string, error) {
	buffer := make([]byte, randomTokenBytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("read secure random bytes: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func RandomID(prefix string) (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("read secure random bytes: %w", err)
	}
	return prefix + base64.RawURLEncoding.EncodeToString(buffer), nil
}

func Digest(key []byte, purpose, token string) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(purpose))
	_, _ = mac.Write([]byte{0})
	_, _ = mac.Write([]byte(token))
	return mac.Sum(nil)
}

func EqualDigest(left, right []byte) bool {
	if len(left) != len(right) {
		return false
	}
	return subtle.ConstantTimeCompare(left, right) == 1
}

type CSRFSigner struct {
	key []byte
	ttl time.Duration
}

type csrfPayload struct {
	Subject string `json:"s"`
	Expires int64  `json:"e"`
}

func NewCSRFSigner(key []byte, ttl time.Duration) CSRFSigner {
	return CSRFSigner{key: append([]byte(nil), key...), ttl: ttl}
}

func (s CSRFSigner) Sign(subject string, now time.Time) (string, error) {
	payloadBytes, err := json.Marshal(csrfPayload{Subject: subject, Expires: now.Add(s.ttl).Unix()})
	if err != nil {
		return "", fmt.Errorf("encode CSRF payload: %w", err)
	}
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	signature := Digest(s.key, "csrf-v1", payload)
	return payload + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func (s CSRFSigner) Verify(token, subject string, now time.Time) bool {
	payloadEncoded, signatureEncoded, ok := strings.Cut(token, ".")
	if !ok {
		return false
	}
	signature, err := base64.RawURLEncoding.DecodeString(signatureEncoded)
	if err != nil || !EqualDigest(signature, Digest(s.key, "csrf-v1", payloadEncoded)) {
		return false
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(payloadEncoded)
	if err != nil {
		return false
	}
	var payload csrfPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return false
	}
	return payload.Subject == subject && payload.Expires >= now.Unix()
}

type CursorSigner struct {
	key []byte
}

func NewCursorSigner(key []byte) CursorSigner {
	return CursorSigner{key: append([]byte(nil), key...)}
}

func (s CursorSigner) Encode(scope string, payload any) (string, error) {
	encodedPayload, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode cursor: %w", err)
	}
	body := base64.RawURLEncoding.EncodeToString(encodedPayload)
	signature := Digest(s.key, "cursor-v1:"+scope, body)
	return body + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func (s CursorSigner) Decode(scope, cursor string, target any) error {
	body, signatureEncoded, ok := strings.Cut(cursor, ".")
	if !ok {
		return errors.New("invalid cursor")
	}
	signature, err := base64.RawURLEncoding.DecodeString(signatureEncoded)
	if err != nil || !EqualDigest(signature, Digest(s.key, "cursor-v1:"+scope, body)) {
		return errors.New("invalid cursor")
	}
	payload, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return errors.New("invalid cursor")
	}
	decoder := json.NewDecoder(strings.NewReader(string(payload)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return errors.New("invalid cursor")
	}
	return nil
}

func Fingerprint(secret string) string {
	if len(secret) <= 4 {
		return "..." + secret
	}
	return "..." + secret[len(secret)-4:]
}

func ParseKeyVersion(raw string) (int, error) {
	version, err := strconv.Atoi(raw)
	if err != nil || version < 1 {
		return 0, errors.New("invalid key version")
	}
	return version, nil
}
