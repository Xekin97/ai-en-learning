package business

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"unicode/utf8"
)

type Bilingual struct {
	ZH *string `json:"zh_CN" nullable:"true"`
	EN *string `json:"en_US" nullable:"true"`
}

func (value *Bilingual) UnmarshalJSON(raw []byte) error {
	var keys map[string]json.RawMessage
	if err := json.Unmarshal(raw, &keys); err != nil {
		return err
	}
	if len(keys) != 2 || keys["zh_CN"] == nil || keys["en_US"] == nil {
		return errors.New("both language slots are required")
	}
	type plain Bilingual
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	return decoder.Decode((*plain)(value))
}

func NormalizeText(value *string, trim bool, maximum int, byteLimit bool) (*string, error) {
	if value == nil {
		return nil, nil
	}
	if !utf8.ValidString(*value) {
		return nil, errors.New("invalid UTF-8")
	}
	normalized := *value
	if strings.TrimSpace(normalized) == "" {
		return nil, nil
	}
	if trim {
		normalized = strings.TrimSpace(normalized)
	}
	size := utf8.RuneCountInString(normalized)
	if byteLimit {
		size = len(normalized)
	}
	if size > maximum {
		return nil, errors.New("text exceeds maximum length")
	}
	return &normalized, nil
}
func (value Bilingual) Localized(locale string) *string {
	if locale == "en-US" {
		if value.EN != nil {
			return value.EN
		}
		return value.ZH
	}
	if value.ZH != nil {
		return value.ZH
	}
	return value.EN
}
