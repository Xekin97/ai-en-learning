package portability

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"
)

func modelFixture() File {
	name, modelName, key := "fixture", "fixture-model", "synthetic-key-only"
	return File{Format: "wordweave-config", Version: 1, Category: Models, CredentialMode: "included", Data: Data{Connections: []Connection{{
		ID: uuid.New(), Protocol: "openai_chat", BaseURL: "https://fixture.invalid/v1", Name: &name, APIKey: &key,
		Models: []Model{{ID: uuid.New(), ProviderModelID: "fixture/model", DisplayName: &modelName, OutputMode: "prompt", Enabled: false, CustomParameters: json.RawMessage("{}")}},
	}}}}
}

func TestEncryptedModelFileRoundTripAndTamper(t *testing.T) {
	file := modelFixture()
	passphrase := "correct horse battery staple"
	raw, err := EncryptFile(file, passphrase)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseFile(raw, Models, &passphrase, true)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Data.Connections[0].APIKey == nil || *parsed.Data.Connections[0].APIKey != *file.Data.Connections[0].APIKey {
		t.Fatal("encrypted key did not round trip")
	}
	var envelope map[string]any
	if err = json.Unmarshal(raw, &envelope); err != nil {
		t.Fatal(err)
	}
	ciphertext := envelope["ciphertext"].(string)
	replacement := "A"
	if ciphertext[0] == 'A' {
		replacement = "B"
	}
	envelope["ciphertext"] = replacement + ciphertext[1:]
	tampered, _ := json.Marshal(envelope)
	if _, err = ParseFile(tampered, Models, &passphrase, true); err != ErrDecryption {
		t.Fatalf("tamper error=%v", err)
	}
	wrong := "incorrect horse battery staple"
	if _, err = ParseFile(raw, Models, &wrong, true); err != ErrDecryption {
		t.Fatalf("wrong password error=%v", err)
	}
}

func TestPlainModelFileNeverAcceptsCredentialOrTargetReuse(t *testing.T) {
	id := uuid.New()
	raw := []byte("{\"format\":\"wordweave-config\",\"version\":1,\"category\":\"models\",\"credential_mode\":\"none\",\"data\":{\"connections\":[{\"id\":\"" + id.String() + "\",\"protocol\":\"openai_chat\",\"base_url\":\"https://fixture.invalid/v1\",\"models\":[]}]}}")
	if _, err := ParseFile(raw, Models, nil, true); err != ErrCredentialsRequired {
		t.Fatalf("error=%v", err)
	}
	withKey := []byte(strings.Replace(string(raw), "\"models\":[]", "\"api_key\":\"synthetic\",\"models\":[]", 1))
	if _, err := ParseFile(withKey, Models, nil, true); err == nil {
		t.Fatal("plaintext api_key was accepted")
	}
	empty := []byte("{\"format\":\"wordweave-config\",\"version\":1,\"category\":\"models\",\"credential_mode\":\"none\",\"data\":{\"connections\":[]}}")
	if _, err := ParseFile(empty, Models, nil, true); err != nil {
		t.Fatalf("empty model category: %v", err)
	}
}

func TestPlanPresenceDistinguishesNullZeroFalseAndEmpty(t *testing.T) {
	base := "{\"format\":\"wordweave-config\",\"version\":1,\"category\":\"plans\",\"credential_mode\":\"none\",\"data\":{\"plans\":[" +
		"{\"code\":\"visitor\",\"priority\":0,\"rolling_24h_limit\":0,\"max_entries\":1,\"allowed_lengths\":[],\"model_ids\":[],\"content_review_enabled\":false,\"content_repair_limit\":0}," +
		"{\"code\":\"basic\",\"priority\":1,\"rolling_24h_limit\":null,\"max_entries\":1,\"allowed_lengths\":[],\"model_ids\":[],\"content_review_enabled\":false,\"content_repair_limit\":0}," +
		"{\"code\":\"pro\",\"priority\":2,\"rolling_24h_limit\":0,\"max_entries\":1,\"allowed_lengths\":[],\"model_ids\":[],\"content_review_enabled\":true,\"content_repair_limit\":1}," +
		"{\"code\":\"plus\",\"priority\":3,\"rolling_24h_limit\":null,\"max_entries\":1,\"allowed_lengths\":[],\"model_ids\":[],\"content_review_enabled\":false,\"content_repair_limit\":0}]}}"
	if _, err := ParseFile([]byte(base), Plans, nil, true); err != nil {
		t.Fatal(err)
	}
	for _, changed := range []string{
		strings.Replace(base, "\"content_review_enabled\":false,", "", 1),
		strings.Replace(base, "\"rolling_24h_limit\":0,", "", 1),
		strings.Replace(base, "\"priority\":0", "\"priority\":0,\"priority\":3", 1),
	} {
		if _, err := ParseFile([]byte(changed), Plans, nil, true); err == nil {
			t.Fatal("invalid presence or duplicate key was accepted")
		}
	}
}

func TestPassphraseUsesUnicodeScalarsWithoutTrimming(t *testing.T) {
	if ValidatePassphrase("  twelve chars  ") != nil || ValidatePassphrase(strings.Repeat("🙂", 12)) != nil {
		t.Fatal("valid passphrase rejected")
	}
	for _, bad := range []string{"short", "            ", strings.Repeat("a", 129), "valid password\x00"} {
		if ValidatePassphrase(bad) == nil {
			t.Fatalf("accepted invalid password %q", bad)
		}
	}
}

func TestStrictJSONAppliesToAliasesDepthNULAndEncryptedPlaintext(t *testing.T) {
	file := modelFixture()
	plain, err := json.Marshal(file)
	if err != nil {
		t.Fatal(err)
	}
	invalid := [][]byte{
		[]byte(strings.Replace(string(plain), "\"format\"", "\"Format\"", 1)),
		[]byte(strings.Replace(string(plain), "fixture/model", "fixture/\\u0000model", 1)),
		[]byte(strings.Replace(string(plain), "fixture/model", "fixture/\\uD800model", 1)),
		[]byte(strings.Replace(string(plain), "fixture/model", "fixture/\\uDC00model", 1)),
		[]byte(strings.Replace(string(plain), "\"custom_parameters\":{}", "\"custom_parameters\":"+strings.Repeat("{\"x\":", 34)+"0"+strings.Repeat("}", 34), 1)),
	}
	for _, raw := range invalid {
		if _, err = ParseFile(raw, Models, nil, false); err == nil {
			t.Fatal("strict JSON violation was accepted")
		}
	}
	duplicateInner := strings.Replace(string(plain), "\"format\":\"wordweave-config\"", "\"format\":\"wordweave-config\",\"format\":\"wordweave-config\"", 1)
	passphrase := "encrypted strict json passphrase"
	encrypted := encryptRawFixture(t, []byte(duplicateInner), file, passphrase)
	if _, err = ParseFile(encrypted, Models, &passphrase, true); err == nil || errors.Is(err, ErrDecryption) {
		t.Fatalf("encrypted duplicate-key plaintext error=%v", err)
	}
	invalidUnicodeInner := strings.Replace(string(plain), "fixture/model", "fixture/\\uD800model", 1)
	encrypted = encryptRawFixture(t, []byte(invalidUnicodeInner), file, passphrase)
	if _, err = ParseFile(encrypted, Models, &passphrase, true); err == nil || errors.Is(err, ErrDecryption) {
		t.Fatalf("encrypted invalid-unicode plaintext error=%v", err)
	}
}

func encryptRawFixture(t *testing.T, plaintext []byte, file File, passphrase string) []byte {
	t.Helper()
	raw, err := EncryptFile(file, passphrase)
	if err != nil {
		t.Fatal(err)
	}
	var envelope encryptedFile
	if err = json.Unmarshal(raw, &envelope); err != nil {
		t.Fatal(err)
	}
	salt, _ := base64.RawURLEncoding.DecodeString(envelope.KDF.Salt)
	nonce, _ := base64.RawURLEncoding.DecodeString(envelope.Cipher.Nonce)
	derived := argon2.IDKey([]byte(passphrase), salt, 3, 65536, 4, 32)
	defer clear(derived)
	block, err := aes.NewCipher(derived)
	if err != nil {
		t.Fatal(err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	envelope.Ciphertext = base64.RawURLEncoding.EncodeToString(gcm.Seal(nil, nonce, plaintext, encryptedAAD(salt, nonce)))
	raw, err = json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
