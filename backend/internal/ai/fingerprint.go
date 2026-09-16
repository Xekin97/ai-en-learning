package ai

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io/fs"

	asset "wordweave/assets/lexicon"
)

func fingerprintBytes(data []byte) string { h := sha256.Sum256(data); return hex.EncodeToString(h[:]) }

// Hash actual compiled prompt/schema material with fixed inert placeholders.
// Per-run input/configuration is separately recorded in EffectiveSpec.
func ContractFingerprints() (template, schema, lexical string, err error) {
	spec := GenerationSpec{ProviderModelID: "MODEL", Entries: []string{"ENTRY"}, MeaningLanguage: "LANGUAGE", Scenario: "SCENARIO", MinimumWords: 1, PromptVersion: PromptVersion}
	request := openRouterRequest(spec)
	messages := request["messages"]
	spec.CompatibilityProbe = true
	probeMessages := openRouterRequest(spec)["messages"]
	spec.CompatibilityProbe = false
	spec.continuation = &passageContinuation{Passage: "PASSAGE", Entries: spec.Entries, Missing: spec.Entries, MinimumWords: 1, AdditionalWords: 1}
	continuation := openRouterRequest(spec)
	spec.continuation = nil
	spec.correction = &contentCorrection{Passage: "PASSAGE", Entries: spec.Entries, Field: "passage", Reason: "annotation_source_unknown"}
	correction := openRouterRequest(spec)
	raw, e := json.Marshal([]any{messages, probeMessages, continuation["messages"], correction["messages"], maxCorrections})
	if e != nil {
		return "", "", "", e
	}
	template = fingerprintBytes(raw)
	raw, e = json.Marshal([]any{request["response_format"], continuation["response_format"], correction["response_format"]})
	if e != nil {
		return "", "", "", e
	}
	schema = fingerprintBytes(raw)
	// Include manifest and asset bytes, not just a version label or expected hash.
	h := sha256.New()
	for _, name := range []string{"manifest.json", "wordnet31.json.gz", "NOTICE.txt"} {
		content, e := fs.ReadFile(asset.Files, name)
		if e != nil {
			return "", "", "", e
		}
		_, _ = h.Write([]byte(name))
		_, _ = h.Write([]byte{0})
		_, _ = h.Write(content)
	}
	return template, schema, hex.EncodeToString(h.Sum(nil)), nil
}
