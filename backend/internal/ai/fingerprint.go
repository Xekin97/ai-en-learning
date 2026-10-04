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
	var requests, schemas []any
	for _, protocol := range []string{ProtocolChat, ProtocolResponses, ProtocolAnthropic} {
		for _, mode := range []string{"prompt", "json_schema"} {
			if protocol == ProtocolAnthropic && mode == "json_schema" {
				continue
			}
			snap := connectionSnapshot{connection: Connection{Protocol: protocol}, outputMode: mode}
			for _, phase := range []string{"initial", "probe", "continuation", "correction"} {
				current := spec
				switch phase {
				case "continuation":
					current.continuation = &passageContinuation{Passage: "PASSAGE", Entries: spec.Entries, Missing: spec.Entries, MinimumWords: 1, AdditionalWords: 1}
				case "correction":
					current.correction = &contentCorrection{Passage: "PASSAGE", Entries: spec.Entries, Field: "passage", Reason: "annotation_source_unknown"}
				}
				path, body := protocolRequest(current, snap, phase == "probe")
				requests = append(requests, []any{protocol, mode, phase, path, body})
				if phase != "probe" {
					schemas = append(schemas, []any{protocol, mode, phase, outputSchema(current), body["response_format"], body["text"]})
				}
			}
		}
	}
	requests = append(requests, maxCorrections)
	raw, e := json.Marshal(requests)
	if e != nil {
		return "", "", "", e
	}
	template = fingerprintBytes(raw)
	raw, e = json.Marshal(schemas)
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
