package security

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

const (
	argonMemory      = 64 * 1024
	argonIterations  = 3
	argonParallelism = 2
	argonSaltBytes   = 16
	argonKeyBytes    = 32
)

var (
	ErrPasswordLength = errors.New("password must contain 8 to 128 Unicode code points")
	ErrInvalidHash    = errors.New("invalid password hash")
)

func ValidatePassword(password string) error {
	if !utf8.ValidString(password) {
		return ErrPasswordLength
	}
	length := utf8.RuneCountInString(password)
	if length < 8 || length > 128 {
		return ErrPasswordLength
	}
	return nil
}

func HashPassword(password string) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
	}
	salt := make([]byte, argonSaltBytes)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate password salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, argonIterations, argonMemory, argonParallelism, argonKeyBytes)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		argonMemory,
		argonIterations,
		argonParallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

func VerifyPassword(encoded, password string) (bool, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, ErrInvalidHash
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, ErrInvalidHash
	}
	parameters := strings.Split(parts[3], ",")
	if len(parameters) != 3 {
		return false, ErrInvalidHash
	}
	memory, err := parseUintParameter(parameters[0], "m=")
	if err != nil {
		return false, ErrInvalidHash
	}
	iterations, err := parseUintParameter(parameters[1], "t=")
	if err != nil {
		return false, ErrInvalidHash
	}
	parallelism, err := parseUintParameter(parameters[2], "p=")
	if err != nil || parallelism > 255 {
		return false, ErrInvalidHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < 8 {
		return false, ErrInvalidHash
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) < 16 {
		return false, ErrInvalidHash
	}
	got := argon2.IDKey([]byte(password), salt, iterations, memory, uint8(parallelism), uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

func NeedsRehash(encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 {
		return true
	}
	return parts[3] != fmt.Sprintf("m=%d,t=%d,p=%d", argonMemory, argonIterations, argonParallelism)
}

func DummyHash() string {
	// Fixed valid hash used to equalize unknown-user login work. It is not an account credential.
	return "$argon2id$v=19$m=65536,t=3,p=2$AAAAAAAAAAAAAAAAAAAAAA$9guTwbUHhW4PkUwBCetwi8cBGr6bya36teMJiOX8H9M"
}

func parseUintParameter(raw, prefix string) (uint32, error) {
	if !strings.HasPrefix(raw, prefix) {
		return 0, ErrInvalidHash
	}
	value, err := strconv.ParseUint(strings.TrimPrefix(raw, prefix), 10, 32)
	if err != nil || value == 0 {
		return 0, ErrInvalidHash
	}
	return uint32(value), nil
}
