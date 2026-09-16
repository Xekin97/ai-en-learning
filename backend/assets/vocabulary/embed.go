package vocabularyasset

import _ "embed"

const (
	Version       = "m001"
	ExpectedSHA   = "de75e77fdff529b4e6726730c80c11415abbce215ec7852a6c4a670b061dea75"
	ExpectedBytes = 144527
	ExpectedCount = 13860
)

// M001 is the exact immutable vocabulary snapshot approved for this milestone.
//
//go:embed english-words.json
var M001 []byte
