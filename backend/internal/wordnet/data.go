// Package wordnet contains the versioned, offline WordNet projection format.
// It intentionally has no dependency on WordWeave's input vocabulary or database.
package wordnet

const (
	BuilderGoVersion = "go1.26.7"
	ParserVersion    = "wn31-word-level-r1"
	SourceURL        = "https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz"
	SourceSHA256     = "3f7d8be8ef6ecc7167d39b10d66954ec734280b5bdcd57f7d9eafe429d11c22a"
)

type Lexeme struct {
	Word string `json:"word"`
	POS  string `json:"pos"`
}

type Edge struct {
	From Lexeme `json:"from"`
	To   Lexeme `json:"to"`
	// ID retains both synset offsets and the 1-based word indices. Only the
	// specified words participate; other words in either synset do not.
	ID string `json:"id"`
}

type Exception struct {
	Surface string `json:"surface"`
	Lemma   Lexeme `json:"lemma"`
}

type Data struct {
	Version    string      `json:"version"`
	Lemmas     []Lexeme    `json:"lemmas"`
	Edges      []Edge      `json:"edges"`
	Exceptions []Exception `json:"exceptions"`
}

type Manifest struct {
	BuilderGoVersion string `json:"builder_go_version"`
	ParserVersion    string `json:"parser_version"`
	SourceURL        string `json:"source_url"`
	SourceSHA256     string `json:"source_sha256"`
	AssetSHA256      string `json:"asset_sha256"`
	AssetBytes       int    `json:"asset_bytes"`
	Lemmas           int    `json:"lemmas"`
	Edges            int    `json:"edges"`
	Exceptions       int    `json:"exceptions"`
}
