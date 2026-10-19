package portability

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"
	"wordweave/internal/ai"
)

const (
	MaxFileBytes      = 8 << 20
	MaxPlaintextBytes = 5 << 20
	maxPrimaryItems   = 10000
	maxConnections    = 1000
	maxModelsPerConn  = 1000
	maxReferences     = 50000
)

var maskPattern = regexp.MustCompile(`(?i)^(configured|已配置|[*.•·…]{4,})$`)

type encryptedFile struct {
	Format         string   `json:"format"`
	Version        int      `json:"version"`
	Category       Category `json:"category"`
	CredentialMode string   `json:"credential_mode"`
	KDF            struct {
		Name        string `json:"name"`
		Version     int    `json:"version"`
		MemoryKiB   uint32 `json:"memory_kib"`
		Iterations  uint32 `json:"iterations"`
		Parallelism uint8  `json:"parallelism"`
		Salt        string `json:"salt"`
	} `json:"kdf"`
	Cipher struct {
		Name  string `json:"name"`
		Nonce string `json:"nonce"`
	} `json:"cipher"`
	Ciphertext string `json:"ciphertext"`
}

func ValidatePassphrase(value string) error {
	if !utf8.ValidString(value) || len(value) > 512 || strings.ContainsRune(value, 0) {
		return errors.New("invalid passphrase")
	}
	count := utf8.RuneCountInString(value)
	if count < 12 || count > 128 || strings.IndexFunc(value, func(r rune) bool { return !unicode.IsSpace(r) }) < 0 {
		return errors.New("invalid passphrase")
	}
	return nil
}

func EncryptFile(file File, passphrase string) ([]byte, error) {
	if file.Category != Models || file.CredentialMode != "included" || ValidatePassphrase(passphrase) != nil {
		return nil, errors.New("invalid encrypted export")
	}
	plain, err := json.Marshal(file)
	if err != nil || len(plain) > MaxPlaintextBytes {
		return nil, errors.New("configuration is too large")
	}
	salt, nonce := make([]byte, 16), make([]byte, 12)
	if _, err = rand.Read(salt); err != nil {
		return nil, err
	}
	if _, err = rand.Read(nonce); err != nil {
		return nil, err
	}
	key := argon2.IDKey([]byte(passphrase), salt, 3, 65536, 4, 32)
	defer clear(key)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	aad := encryptedAAD(salt, nonce)
	sealed := gcm.Seal(nil, nonce, plain, aad)
	var out encryptedFile
	out.Format, out.Version, out.Category, out.CredentialMode = "wordweave-config-encrypted", 1, Models, "encrypted"
	out.KDF.Name, out.KDF.Version, out.KDF.MemoryKiB, out.KDF.Iterations, out.KDF.Parallelism = "argon2id", 19, 65536, 3, 4
	out.KDF.Salt = base64.RawURLEncoding.EncodeToString(salt)
	out.Cipher.Name, out.Cipher.Nonce = "AES-256-GCM", base64.RawURLEncoding.EncodeToString(nonce)
	out.Ciphertext = base64.RawURLEncoding.EncodeToString(sealed)
	return json.Marshal(out)
}

func ParseFile(raw []byte, category Category, passphrase *string, requireCredentials bool) (File, error) {
	if len(raw) == 0 || len(raw) > MaxFileBytes || !utf8.Valid(raw) {
		return File{}, validation("/", "invalid_json")
	}
	if err := inspectJSON(raw, 32); err != nil {
		return File{}, validation("/", "invalid_json")
	}
	var head struct {
		Format         string `json:"format"`
		CredentialMode string `json:"credential_mode"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return File{}, validation("/", "invalid_json")
	}
	if head.Format == "wordweave-config-encrypted" {
		if category != Models || passphrase == nil || ValidatePassphrase(*passphrase) != nil {
			return File{}, ErrDecryption
		}
		plain, err := decryptFile(raw, *passphrase)
		if err != nil {
			return File{}, ErrDecryption
		}
		defer clear(plain)
		file, err := decodePlain(plain, category)
		if err != nil {
			return File{}, err
		}
		if file.CredentialMode != "included" {
			return File{}, ErrDecryption
		}
		file, err = validateFile(file, true)
		if err == nil {
			file.rawDigest = sha256.Sum256(raw)
			file.hasRawDigest = true
		}
		return file, err
	}
	if passphrase != nil {
		return File{}, validation("/passphrase", "protected_field")
	}
	file, err := decodePlain(raw, category)
	if err != nil {
		return File{}, err
	}
	if file.CredentialMode != "none" {
		return File{}, validation("/credential_mode", "unsupported_format")
	}
	file, err = validateFile(file, false)
	if err == nil && requireCredentials && category == Models && len(file.Data.Connections) > 0 {
		return File{}, ErrCredentialsRequired
	}
	if err == nil {
		file.rawDigest = sha256.Sum256(raw)
		file.hasRawDigest = true
	}
	return file, err
}

var ErrDecryption = errors.New("decryption failed")
var ErrCredentialsRequired = errors.New("credentials required")

func decryptFile(raw []byte, passphrase string) ([]byte, error) {
	if err := validateEncryptedPresence(raw); err != nil {
		return nil, err
	}
	var in encryptedFile
	if err := strictDecode(raw, &in); err != nil {
		return nil, err
	}
	if in.Format != "wordweave-config-encrypted" || in.Version != 1 || in.Category != Models || in.CredentialMode != "encrypted" || in.KDF.Name != "argon2id" || in.KDF.Version != 19 || in.KDF.MemoryKiB != 65536 || in.KDF.Iterations != 3 || in.KDF.Parallelism != 4 || in.Cipher.Name != "AES-256-GCM" {
		return nil, errors.New("unsupported envelope")
	}
	salt, err := base64.RawURLEncoding.Strict().DecodeString(in.KDF.Salt)
	if err != nil || len(salt) != 16 {
		return nil, errors.New("invalid salt")
	}
	nonce, err := base64.RawURLEncoding.Strict().DecodeString(in.Cipher.Nonce)
	if err != nil || len(nonce) != 12 {
		return nil, errors.New("invalid nonce")
	}
	sealed, err := base64.RawURLEncoding.Strict().DecodeString(in.Ciphertext)
	if err != nil || len(sealed) < 16 || len(sealed) > MaxPlaintextBytes+16 {
		return nil, errors.New("invalid ciphertext")
	}
	key := argon2.IDKey([]byte(passphrase), salt, 3, 65536, 4, 32)
	defer clear(key)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, nonce, sealed, encryptedAAD(salt, nonce))
}

func encryptedAAD(salt, nonce []byte) []byte {
	base := []byte("wordweave/config-portability/v1\nmodels\nargon2id-v19-m65536-t3-p4\nAES-256-GCM\n")
	return append(append(base, salt...), nonce...)
}

func decodePlain(raw []byte, category Category) (File, error) {
	if err := inspectJSON(raw, 32); err != nil {
		return File{}, validation("/", "invalid_json")
	}
	var presence map[string]json.RawMessage
	if err := json.Unmarshal(raw, &presence); err != nil {
		return File{}, validation("/", "invalid_json")
	}
	if err := exactKeys(presence, []string{"format", "version", "category", "credential_mode", "source", "references", "data"}, "/"); err != nil {
		return File{}, err
	}
	for _, key := range []string{"format", "version", "category", "credential_mode", "data"} {
		if _, ok := presence[key]; !ok {
			return File{}, validation("/"+key, "required")
		}
	}
	var file File
	if err := strictDecode(raw, &file); err != nil {
		return File{}, validation("/", "invalid_json")
	}
	if file.Format != "wordweave-config" || file.Version != 1 {
		return File{}, validation("/format", "unsupported_format")
	}
	if file.Category != category {
		return File{}, validation("/category", "category_mismatch")
	}
	if err := validateDataPresence(presence["data"], category); err != nil {
		return File{}, err
	}
	capturePortablePresence(&file, presence["data"], category)
	if err := validateMetadataPresence(presence); err != nil {
		return File{}, err
	}
	return file, nil
}

func validateDataPresence(raw json.RawMessage, category Category) error {
	var object map[string]json.RawMessage
	if json.Unmarshal(raw, &object) != nil {
		return validation("/data", "object_required")
	}
	required := map[Category][]string{Models: {"connections"}, Plans: {"plans"}, Items: {"items"}, Growth: {"mastery_experience", "checkin", "levels", "achievements"}}[category]
	if err := exactKeys(object, required, "/data"); err != nil {
		return err
	}
	for _, key := range required {
		if value, ok := object[key]; !ok {
			return validation("/data/"+key, "required")
		} else if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return validation("/data/"+key, "null_not_allowed")
		}
	}
	switch category {
	case Models:
		return validateModelsPresence(object["connections"])
	case Plans:
		return validatePlansPresence(object["plans"])
	case Items:
		return validateItemsPresence(object["items"])
	case Growth:
		return validateGrowthPresence(object)
	}
	return nil
}

func capturePortablePresence(file *File, raw json.RawMessage, category Category) {
	if category != Growth {
		return
	}
	file.rewardCountSet = map[string]bool{}
	var data map[string]json.RawMessage
	if json.Unmarshal(raw, &data) != nil {
		return
	}
	var levels []map[string]json.RawMessage
	_ = json.Unmarshal(data["levels"], &levels)
	for _, level := range levels {
		var number int
		_ = json.Unmarshal(level["level_number"], &number)
		var reward map[string]json.RawMessage
		_ = json.Unmarshal(level["reward"], &reward)
		_, file.rewardCountSet[fmt.Sprintf("level:%d", number)] = reward["item_count"]
	}
	var achievements map[string][]map[string]json.RawMessage
	_ = json.Unmarshal(data["achievements"], &achievements)
	for _, rows := range achievements {
		for _, achievement := range rows {
			var id uuid.UUID
			_ = json.Unmarshal(achievement["id"], &id)
			var reward map[string]json.RawMessage
			_ = json.Unmarshal(achievement["reward"], &reward)
			_, file.rewardCountSet["achievement:"+id.String()] = reward["item_count"]
		}
	}
}

func exactKeys(object map[string]json.RawMessage, allowed []string, path string) error {
	set := make(map[string]bool, len(allowed))
	for _, key := range allowed {
		set[key] = true
	}
	for key := range object {
		if !set[key] {
			return validation(path, "invalid_json")
		}
	}
	return nil
}
func requiredKeys(object map[string]json.RawMessage, keys []string, nullable map[string]bool, path string) error {
	for _, key := range keys {
		raw, ok := object[key]
		if !ok {
			return validation(path+"/"+key, "required")
		}
		if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) && !nullable[key] {
			return validation(path+"/"+key, "null_not_allowed")
		}
	}
	return nil
}
func rawObjects(raw json.RawMessage, path string) ([]map[string]json.RawMessage, error) {
	var rows []map[string]json.RawMessage
	if json.Unmarshal(raw, &rows) != nil {
		return nil, validation(path, "invalid_json")
	}
	return rows, nil
}
func rawObject(raw json.RawMessage, path string) (map[string]json.RawMessage, error) {
	var row map[string]json.RawMessage
	if json.Unmarshal(raw, &row) != nil {
		return nil, validation(path, "object_required")
	}
	return row, nil
}

func validateMetadataPresence(top map[string]json.RawMessage) error {
	if raw, ok := top["source"]; ok && !bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		o, e := rawObject(raw, "/source")
		if e != nil {
			return e
		}
		if e = exactKeys(o, []string{"exported_at", "revision"}, "/source"); e != nil {
			return e
		}
	}
	if raw, ok := top["references"]; ok {
		rows, e := rawObjects(raw, "/references")
		if e != nil {
			return e
		}
		for i, o := range rows {
			p := fmt.Sprintf("/references/%d", i)
			if e = exactKeys(o, []string{"kind", "id", "label"}, p); e != nil {
				return e
			}
			if e = requiredKeys(o, []string{"kind", "id"}, nil, p); e != nil {
				return e
			}
		}
	}
	return nil
}
func validateEncryptedPresence(raw []byte) error {
	var top map[string]json.RawMessage
	if json.Unmarshal(raw, &top) != nil {
		return validation("/", "invalid_json")
	}
	if e := exactKeys(top, []string{"format", "version", "category", "credential_mode", "kdf", "cipher", "ciphertext"}, "/"); e != nil {
		return e
	}
	if e := requiredKeys(top, []string{"format", "version", "category", "credential_mode", "kdf", "cipher", "ciphertext"}, nil, ""); e != nil {
		return e
	}
	k, e := rawObject(top["kdf"], "/kdf")
	if e != nil {
		return e
	}
	if e = exactKeys(k, []string{"name", "version", "memory_kib", "iterations", "parallelism", "salt"}, "/kdf"); e != nil {
		return e
	}
	if e = requiredKeys(k, []string{"name", "version", "memory_kib", "iterations", "parallelism", "salt"}, nil, "/kdf"); e != nil {
		return e
	}
	c, e := rawObject(top["cipher"], "/cipher")
	if e != nil {
		return e
	}
	if e = exactKeys(c, []string{"name", "nonce"}, "/cipher"); e != nil {
		return e
	}
	return requiredKeys(c, []string{"name", "nonce"}, nil, "/cipher")
}

func validateModelsPresence(raw json.RawMessage) error {
	rows, e := rawObjects(raw, "/data/connections")
	if e != nil {
		return e
	}
	for i, o := range rows {
		p := fmt.Sprintf("/data/connections/%d", i)
		if e = exactKeys(o, []string{"id", "protocol", "base_url", "name", "api_key", "models"}, p); e != nil {
			return e
		}
		if e = requiredKeys(o, []string{"id", "protocol", "base_url", "models"}, nil, p); e != nil {
			return e
		}
		models, e := rawObjects(o["models"], p+"/models")
		if e != nil {
			return e
		}
		for j, m := range models {
			mp := fmt.Sprintf("%s/models/%d", p, j)
			if e = exactKeys(m, []string{"id", "provider_model_id", "display_name", "description", "max_output_tokens", "output_mode", "enabled", "custom_parameters"}, mp); e != nil {
				return e
			}
			if e = requiredKeys(m, []string{"id", "provider_model_id", "output_mode", "enabled", "custom_parameters"}, nil, mp); e != nil {
				return e
			}
		}
	}
	return nil
}
func validatePlansPresence(raw json.RawMessage) error {
	rows, e := rawObjects(raw, "/data/plans")
	if e != nil {
		return e
	}
	keys := []string{"code", "priority", "rolling_24h_limit", "max_entries", "allowed_lengths", "model_ids", "content_review_enabled", "content_repair_limit"}
	for i, o := range rows {
		p := fmt.Sprintf("/data/plans/%d", i)
		if e = exactKeys(o, keys, p); e != nil {
			return e
		}
		if e = requiredKeys(o, keys, map[string]bool{"rolling_24h_limit": true}, p); e != nil {
			return e
		}
	}
	return nil
}
func validateItemsPresence(raw json.RawMessage) error {
	rows, e := rawObjects(raw, "/data/items")
	if e != nil {
		return e
	}
	keys := []string{"id", "kind", "name", "description", "exchange_price", "activation_ttl_seconds", "listed", "effect"}
	for i, o := range rows {
		p := fmt.Sprintf("/data/items/%d", i)
		if e = exactKeys(o, keys, p); e != nil {
			return e
		}
		if e = requiredKeys(o, keys, nil, p); e != nil {
			return e
		}
		for _, name := range []string{"name", "description"} {
			b, e := rawObject(o[name], p+"/"+name)
			if e != nil {
				return e
			}
			if e = exactKeys(b, []string{"zh_CN", "en_US"}, p+"/"+name); e != nil {
				return e
			}
		}
		effect, e := rawObject(o["effect"], p+"/effect")
		if e != nil {
			return e
		}
		if e = exactKeys(effect, []string{"kind", "extra_count", "model_ids", "trial_seconds", "retirement_points", "target_plan_code"}, p+"/effect"); e != nil {
			return e
		}
		if e = requiredKeys(effect, []string{"kind"}, nil, p+"/effect"); e != nil {
			return e
		}
	}
	return nil
}
func validateGrowthPresence(o map[string]json.RawMessage) error {
	check, e := rawObject(o["checkin"], "/data/checkin")
	if e != nil {
		return e
	}
	if e = exactKeys(check, []string{"current", "pending"}, "/data/checkin"); e != nil {
		return e
	}
	if e = requiredKeys(check, []string{"current"}, nil, "/data/checkin"); e != nil {
		return e
	}
	validateCheck := func(raw json.RawMessage, p string) error {
		x, e := rawObject(raw, p)
		if e != nil {
			return e
		}
		keys := []string{"base_points", "step_points", "cap_points", "normal_experience"}
		if e = exactKeys(x, keys, p); e != nil {
			return e
		}
		return requiredKeys(x, keys, nil, p)
	}
	if e = validateCheck(check["current"], "/data/checkin/current"); e != nil {
		return e
	}
	if pending, ok := check["pending"]; ok && !bytes.Equal(bytes.TrimSpace(pending), []byte("null")) {
		if e = validateCheck(pending, "/data/checkin/pending"); e != nil {
			return e
		}
	}
	levels, e := rawObjects(o["levels"], "/data/levels")
	if e != nil {
		return e
	}
	for i, x := range levels {
		p := fmt.Sprintf("/data/levels/%d", i)
		if e = exactKeys(x, []string{"source_id", "level_number", "min_experience", "reward_enabled", "reward"}, p); e != nil {
			return e
		}
		if e = requiredKeys(x, []string{"level_number", "min_experience", "reward_enabled", "reward"}, nil, p); e != nil {
			return e
		}
		if e = validateRewardPresence(x["reward"], p+"/reward", false); e != nil {
			return e
		}
	}
	ach, e := rawObject(o["achievements"], "/data/achievements")
	if e != nil {
		return e
	}
	kinds := []string{"checkin_streak", "review_streak", "mastered_words", "saved_passages"}
	if e = exactKeys(ach, kinds, "/data/achievements"); e != nil {
		return e
	}
	if e = requiredKeys(ach, kinds, nil, "/data/achievements"); e != nil {
		return e
	}
	for _, kind := range kinds {
		rows, e := rawObjects(ach[kind], "/data/achievements/"+kind)
		if e != nil {
			return e
		}
		for i, x := range rows {
			p := fmt.Sprintf("/data/achievements/%s/%d", kind, i)
			keys := []string{"id", "kind", "threshold", "enabled", "name", "title", "description", "reward"}
			if e = exactKeys(x, keys, p); e != nil {
				return e
			}
			if e = requiredKeys(x, []string{"id", "kind", "threshold", "enabled", "name", "title", "reward"}, nil, p); e != nil {
				return e
			}
			for _, name := range []string{"name", "title"} {
				b, e := rawObject(x[name], p+"/"+name)
				if e != nil {
					return e
				}
				if e = exactKeys(b, []string{"zh_CN", "en_US"}, p+"/"+name); e != nil {
					return e
				}
			}
			if desc, ok := x["description"]; ok && !bytes.Equal(bytes.TrimSpace(desc), []byte("null")) {
				b, e := rawObject(desc, p+"/description")
				if e != nil {
					return e
				}
				if e = exactKeys(b, []string{"zh_CN", "en_US"}, p+"/description"); e != nil {
					return e
				}
			}
			if e = validateRewardPresence(x["reward"], p+"/reward", true); e != nil {
				return e
			}
		}
	}
	return nil
}
func validateRewardPresence(raw json.RawMessage, p string, experience bool) error {
	o, e := rawObject(raw, p)
	if e != nil {
		return e
	}
	allowed := []string{"points", "item_definition_id", "item_count"}
	required := []string{"points"}
	if experience {
		allowed = append(allowed, "experience")
		required = append(required, "experience")
	}
	if e = exactKeys(o, allowed, p); e != nil {
		return e
	}
	return requiredKeys(o, required, nil, p)
}

func validateFile(file File, included bool) (File, error) {
	v := &ValidationError{}
	if file.generatedNames == nil {
		file.generatedNames = map[string]bool{}
	}
	seenRefs := map[string]bool{}
	if len(file.References) > maxReferences {
		v.Add("/references", "out_of_range")
	}
	for i, ref := range file.References {
		key := ref.Kind + ":" + ref.ID
		if seenRefs[key] {
			v.Add(fmt.Sprintf("/references/%d", i), "duplicate_id")
		}
		seenRefs[key] = true
	}
	switch file.Category {
	case Models:
		if len(file.Data.Connections) > maxConnections {
			v.Add("/data/connections", "out_of_range")
		}
		validateModels(&file, included, v)
	case Plans:
		if len(file.Data.PlanRows) > maxPrimaryItems {
			v.Add("/data/plans", "out_of_range")
		}
		validatePlans(&file, v)
	case Items:
		if len(file.Data.ItemRows) > maxPrimaryItems {
			v.Add("/data/items", "out_of_range")
		}
		validateItems(&file, v)
	case Growth:
		primary := len(file.Data.Levels)
		for _, rows := range file.Data.Achievements {
			primary += len(rows)
		}
		if primary > maxPrimaryItems {
			v.Add("/data", "out_of_range")
		}
		validateGrowth(&file, v)
	}
	if len(v.Fields) > 0 {
		return File{}, v
	}
	return file, nil
}

func validateModels(file *File, included bool, v *ValidationError) {
	ids, providerNames, displayNames := map[uuid.UUID]bool{}, map[string]bool{}, map[string]bool{}
	total := len(file.Data.Connections)
	for i := range file.Data.Connections {
		c := &file.Data.Connections[i]
		p := fmt.Sprintf("/data/connections/%d", i)
		total += len(c.Models)
		if len(c.Models) > maxModelsPerConn {
			v.Add(p+"/models", "out_of_range")
		}
		if c.ID == uuid.Nil || ids[c.ID] {
			v.Add(p+"/id", "duplicate_id")
		}
		ids[c.ID] = true
		if c.Name == nil || strings.TrimSpace(*c.Name) == "" {
			name := generatedConnectionName(c.BaseURL)
			c.Name = &name
			file.generatedNames["connection:"+c.ID.String()] = true
		} else {
			name := strings.TrimSpace(*c.Name)
			c.Name = &name
		}
		d := ai.ConnectionDraft{Name: value(c.Name), Protocol: c.Protocol, BaseURL: c.BaseURL, APIKey: value(c.APIKey)}
		if !ai.ValidConnection(d) {
			v.Add(p, "validation_failed")
		}
		if included && (c.APIKey == nil || strings.TrimSpace(*c.APIKey) == "" || strings.ContainsAny(*c.APIKey, "\r\n\x00") || len(*c.APIKey) > 8192 || maskPattern.MatchString(strings.TrimSpace(*c.APIKey))) {
			v.Add(p+"/api_key", "required")
		}
		if !included && c.APIKey != nil {
			v.Add(p+"/api_key", "protected_field")
		}
		modelIDs := map[uuid.UUID]bool{}
		providerNames = map[string]bool{}
		for j := range c.Models {
			m := &c.Models[j]
			mp := fmt.Sprintf("%s/models/%d", p, j)
			if m.ID == uuid.Nil || modelIDs[m.ID] || ids[m.ID] {
				v.Add(mp+"/id", "duplicate_id")
			}
			modelIDs[m.ID] = true
			ids[m.ID] = true
			if m.ProviderModelID == "" || strings.TrimSpace(m.ProviderModelID) != m.ProviderModelID || len(m.ProviderModelID) > 500 || providerNames[m.ProviderModelID] {
				v.Add(mp+"/provider_model_id", "duplicate_id")
			}
			providerNames[m.ProviderModelID] = true
			if m.DisplayName == nil || strings.TrimSpace(*m.DisplayName) == "" {
				x := []rune(m.ProviderModelID)
				if len(x) > 200 {
					x = x[:200]
				}
				name := string(x)
				m.DisplayName = &name
				file.generatedNames["model:"+m.ID.String()] = true
			} else {
				n := strings.TrimSpace(*m.DisplayName)
				m.DisplayName = &n
			}
			displayKey := strings.ToLower(*m.DisplayName)
			if displayNames[displayKey] {
				v.Add(mp+"/display_name", "duplicate_id")
			}
			displayNames[displayKey] = true
			if m.Description != nil {
				description := strings.TrimSpace(*m.Description)
				if description == "" {
					m.Description = nil
				} else {
					m.Description = &description
				}
			}
			if len([]rune(*m.DisplayName)) > 200 || (m.Description != nil && len([]rune(*m.Description)) > 1000) || (m.MaxOutputTokens != nil && (*m.MaxOutputTokens < 1 || *m.MaxOutputTokens > 1048576)) || (m.OutputMode != "prompt" && m.OutputMode != "json_schema") {
				v.Add(mp, "out_of_range")
			}
			canonical, err := ai.CanonicalCustomParameters(m.CustomParameters)
			if err != nil {
				v.Add(mp+"/custom_parameters", "object_required")
			} else {
				m.CustomParameters = canonical
			}
		}
	}
	if total > maxPrimaryItems {
		v.Add("/data/connections", "out_of_range")
	}
}

func validatePlans(file *File, v *ValidationError) {
	expected := []string{"visitor", "basic", "pro", "plus"}
	if len(file.Data.PlanRows) != 4 {
		v.Add("/data/plans", "required")
		return
	}
	seenP := map[int]bool{}
	seenC := map[string]bool{}
	for i, p := range file.Data.PlanRows {
		path := fmt.Sprintf("/data/plans/%d", i)
		if !slices.Contains(expected, p.Code) || seenC[p.Code] {
			v.Add(path+"/code", "duplicate_id")
		}
		seenC[p.Code] = true
		if p.Priority < 0 || seenP[p.Priority] {
			v.Add(path+"/priority", "duplicate_threshold")
		}
		seenP[p.Priority] = true
		if p.Rolling24hLimit != nil && *p.Rolling24hLimit < 0 || p.MaxEntries < 1 {
			v.Add(path, "out_of_range")
		}
		validReview := !p.ContentReviewEnabled && p.ContentRepairLimit == 0
		if (p.Code == "pro" || p.Code == "plus") && p.ContentReviewEnabled && p.ContentRepairLimit >= 1 && p.ContentRepairLimit <= 99 {
			validReview = true
		}
		if !validReview {
			v.Add(path+"/content_repair_limit", "out_of_range")
		}
		seenL := map[string]bool{}
		for _, x := range p.AllowedLengths {
			if !slices.Contains([]string{"short", "medium", "long", "xlong"}, x) || seenL[x] {
				v.Add(path+"/allowed_lengths", "duplicate_id")
			}
			seenL[x] = true
		}
		if duplicateUUID(p.ModelIDs) {
			v.Add(path+"/model_ids", "duplicate_id")
		}
	}
}

func validateItems(file *File, v *ValidationError) {
	seen := map[uuid.UUID]bool{}
	for i := range file.Data.ItemRows {
		x := &file.Data.ItemRows[i]
		p := fmt.Sprintf("/data/items/%d", i)
		if x.ID == uuid.Nil || seen[x.ID] {
			v.Add(p+"/id", "duplicate_id")
		}
		seen[x.ID] = true
		if !slices.Contains([]string{"makeup", "extra_credit", "model_trial", "plan_trial"}, x.Kind) || x.Effect.Kind != x.Kind || x.ExchangePrice < 0 || x.ActivationTTLSeconds < 1 {
			v.Add(p, "out_of_range")
		}
		normalizeLang(&x.Name, false, 200, p+"/name", v)
		normalizeLang(&x.Description, false, 2000, p+"/description", v)
		switch x.Kind {
		case "makeup":
			if x.Effect.ExtraCount != nil || x.Effect.TrialSeconds != nil || x.Effect.TargetPlanCode != nil || x.Effect.RetirementPoints != nil || len(x.Effect.ModelIDs) > 0 {
				v.Add(p+"/effect", "protected_field")
			}
		case "extra_credit":
			if x.Effect.ExtraCount == nil || *x.Effect.ExtraCount < 1 {
				v.Add(p+"/effect/extra_count", "required")
			}
		case "model_trial":
			if len(x.Effect.ModelIDs) == 0 || duplicateUUID(x.Effect.ModelIDs) || x.Effect.TrialSeconds == nil || *x.Effect.TrialSeconds < 1 || x.Effect.RetirementPoints == nil || *x.Effect.RetirementPoints < 0 {
				v.Add(p+"/effect", "required")
			}
		case "plan_trial":
			if x.Effect.TargetPlanCode == nil || !slices.Contains([]string{"basic", "pro", "plus"}, *x.Effect.TargetPlanCode) || x.Effect.TrialSeconds == nil || *x.Effect.TrialSeconds < 1 {
				v.Add(p+"/effect", "required")
			}
		}
	}
}

func validateGrowth(file *File, v *ValidationError) {
	if file.Data.Checkin == nil {
		v.Add("/data/checkin", "required")
		return
	}
	check := func(x CheckinValues, p string) {
		if x.BasePoints < 0 || x.StepPoints < 0 || x.CapPoints < x.BasePoints || x.NormalExperience < 0 {
			v.Add(p, "out_of_range")
		}
	}
	check(file.Data.Checkin.Current, "/data/checkin/current")
	if file.Data.Checkin.Pending != nil {
		check(*file.Data.Checkin.Pending, "/data/checkin/pending")
	}
	if file.Data.MasteryExperience < 0 {
		v.Add("/data/mastery_experience", "out_of_range")
	}
	if len(file.Data.Levels) == 0 {
		v.Add("/data/levels", "required")
	}
	for i, x := range file.Data.Levels {
		p := fmt.Sprintf("/data/levels/%d", i)
		if x.LevelNumber != i+1 || x.MinExperience < 0 || (i > 0 && x.MinExperience <= file.Data.Levels[i-1].MinExperience) {
			v.Add(p, "out_of_range")
		}
		validateReward(x.Reward, p+"/reward", v)
		if i == 0 && (x.MinExperience != 0 || x.RewardEnabled || x.Reward.Points != 0 || x.Reward.ItemDefinitionID != nil || x.Reward.ItemCount != 0) {
			v.Add(p, "out_of_range")
		}
	}
	kinds := []string{"checkin_streak", "review_streak", "mastered_words", "saved_passages"}
	if len(file.Data.Achievements) != 4 {
		v.Add("/data/achievements", "required")
	}
	ids := map[uuid.UUID]bool{}
	for _, kind := range kinds {
		rows, ok := file.Data.Achievements[kind]
		if !ok {
			v.Add("/data/achievements/"+kind, "required")
			continue
		}
		thresholds := map[int64]bool{}
		for i := range rows {
			x := &rows[i]
			p := fmt.Sprintf("/data/achievements/%s/%d", kind, i)
			if x.ID == uuid.Nil || ids[x.ID] {
				v.Add(p+"/id", "duplicate_id")
			}
			ids[x.ID] = true
			if x.Kind != kind || x.Threshold < 1 || x.Threshold > 9007199254740991 || thresholds[x.Threshold] {
				v.Add(p+"/threshold", "duplicate_threshold")
			}
			thresholds[x.Threshold] = true
			normalizeLang(&x.Name, false, 200, p+"/name", v)
			normalizeLang(&x.Title, false, 200, p+"/title", v)
			if x.Description == nil {
				x.Description = &Bilingual{}
			}
			normalizeLang(x.Description, true, 2000, p+"/description", v)
			validateReward(x.Reward, p+"/reward", v)
			if x.Reward.Experience < 0 {
				v.Add(p+"/reward/experience", "out_of_range")
			}
		}
		file.Data.Achievements[kind] = rows
	}
}

func validateReward(x Reward, p string, v *ValidationError) {
	if x.Points < 0 {
		v.Add(p+"/points", "out_of_range")
	}
	if x.ItemDefinitionID == nil && x.ItemCount != 0 || x.ItemDefinitionID != nil && x.ItemCount < 1 {
		v.Add(p+"/item_count", "out_of_range")
	}
}
func normalizeLang(x *Bilingual, optional bool, max int, p string, v *ValidationError) {
	for _, e := range []struct {
		n string
		s **string
	}{{"zh_CN", &x.ZH}, {"en_US", &x.EN}} {
		if *e.s != nil {
			n := strings.TrimSpace(**e.s)
			if n == "" {
				*e.s = nil
			} else if len([]rune(n)) > max {
				v.Add(p+"/"+e.n, "out_of_range")
			} else {
				*e.s = &n
			}
		}
	}
	if !optional && x.ZH == nil && x.EN == nil {
		v.Add(p, "required")
	}
}
func duplicateUUID(xs []uuid.UUID) bool {
	m := map[uuid.UUID]bool{}
	for _, x := range xs {
		if x == uuid.Nil || m[x] {
			return true
		}
		m[x] = true
	}
	return false
}
func value(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
func validation(field, code string) error {
	return &ValidationError{Fields: []FieldError{{field, code}}}
}

func strictDecode(raw []byte, target any) error {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err := d.Decode(target); err != nil {
		return err
	}
	if err := d.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("multiple json values")
	}
	return nil
}
func inspectJSON(raw []byte, maxDepth int) error {
	if err := validateJSONUnicodeEscapes(raw); err != nil {
		return err
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	var walk func(int) error
	walk = func(depth int) error {
		if depth > maxDepth {
			return errors.New("too deep")
		}
		t, err := d.Token()
		if err != nil {
			return err
		}
		if s, ok := t.(string); ok && strings.ContainsRune(s, 0) {
			return errors.New("nul")
		}
		delim, ok := t.(json.Delim)
		if !ok {
			return nil
		}
		if delim == '{' {
			seen := map[string]bool{}
			for d.More() {
				k, err := d.Token()
				if err != nil {
					return err
				}
				ks := k.(string)
				if seen[ks] || strings.ContainsRune(ks, 0) {
					return errors.New("duplicate key")
				}
				seen[ks] = true
				if err := walk(depth + 1); err != nil {
					return err
				}
			}
		} else if delim == '[' {
			for d.More() {
				if err := walk(depth + 1); err != nil {
					return err
				}
			}
		}
		_, err = d.Token()
		return err
	}
	if err := walk(0); err != nil {
		return err
	}
	if _, err := d.Token(); !errors.Is(err, io.EOF) {
		return errors.New("trailing json")
	}
	return nil
}

// encoding/json replaces isolated UTF-16 surrogate escapes with U+FFFD.
// Portable configuration instead rejects them so the signed/imported value is
// exactly the sequence the uploader supplied.
func validateJSONUnicodeEscapes(raw []byte) error {
	inString := false
	for i := 0; i < len(raw); i++ {
		switch raw[i] {
		case '"':
			inString = !inString
		case '\\':
			if !inString || i+1 >= len(raw) {
				continue
			}
			i++
			if raw[i] != 'u' {
				continue
			}
			code, ok := jsonHex4(raw, i+1)
			if !ok {
				continue // the JSON decoder reports malformed escapes
			}
			i += 4
			switch {
			case code >= 0xD800 && code <= 0xDBFF:
				if i+6 >= len(raw) || raw[i+1] != '\\' || raw[i+2] != 'u' {
					return errors.New("isolated high surrogate")
				}
				low, valid := jsonHex4(raw, i+3)
				if !valid || low < 0xDC00 || low > 0xDFFF {
					return errors.New("invalid surrogate pair")
				}
				i += 6
			case code >= 0xDC00 && code <= 0xDFFF:
				return errors.New("isolated low surrogate")
			}
		}
	}
	return nil
}

func jsonHex4(raw []byte, start int) (uint16, bool) {
	if start+4 > len(raw) {
		return 0, false
	}
	var value uint16
	for _, b := range raw[start : start+4] {
		value <<= 4
		switch {
		case b >= '0' && b <= '9':
			value |= uint16(b - '0')
		case b >= 'a' && b <= 'f':
			value |= uint16(b-'a') + 10
		case b >= 'A' && b <= 'F':
			value |= uint16(b-'A') + 10
		default:
			return 0, false
		}
	}
	return value, true
}

func generatedConnectionName(base string) string { u, _ := url.Parse(base); return u.Hostname() }
