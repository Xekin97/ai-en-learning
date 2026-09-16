package wordnet

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"reflect"
	"testing"
)

func sourceFixture(t *testing.T, pointer string) []byte {
	t.Helper()
	var body bytes.Buffer
	z := gzip.NewWriter(&body)
	archive := tar.NewWriter(z)
	files := map[string]string{
		"data.adj":  "00000001 00 a 02 vulnerable 0 fragile 0 002 + 00000002 n " + pointer + " \\ 00000002 n 0101 | ignored definition\n",
		"data.noun": "00000002 00 n 02 vulnerability 0 weakness 0 000 | ignored synonyms\n",
		"data.verb": "00000003 00 v 01 study 0 001 ! 00000001 a 0101 | ignored antonym\n",
		"data.adv":  "00000004 00 r 01 vulnerably 0 001 \\ 00000001 a 0101 | permitted adverb derivation\n",
	}
	for _, pos := range []string{"noun", "verb", "adj", "adv"} {
		for _, name := range []string{"data." + pos, "index." + pos, pos + ".exc"} {
			text := files[name]
			if name != pos+".exc" {
				text = "  1 Princeton fixture notice\n" + text
			}
			if err := archive.WriteHeader(&tar.Header{Name: "dict/" + name, Mode: 0644, Size: int64(len(text))}); err != nil {
				t.Fatal(err)
			}
			if _, err := archive.Write([]byte(text)); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	return body.Bytes()
}

func TestLexicalWordIndicesAndPointerSemantics(t *testing.T) {
	data, notice, err := Build(bytes.NewReader(sourceFixture(t, "0101")))
	if err != nil {
		t.Fatal(err)
	}
	if len(data.Edges) != 2 {
		t.Fatalf("edges=%+v", data.Edges)
	}
	for _, edge := range data.Edges {
		if edge.From.Word == "fragile" || edge.To.Word == "weakness" || edge.From.POS == "v" {
			t.Fatalf("synset/pointer overreach: %+v", edge)
		}
	}
	if notice == "" {
		t.Fatal("notice lost")
	}
	if _, _, err := Build(bytes.NewReader(sourceFixture(t, "0203"))); err == nil {
		t.Fatal("invalid target index accepted")
	}
	if _, _, err := Build(bytes.NewReader(sourceFixture(t, "0301"))); err == nil {
		t.Fatal("invalid source index accepted")
	}
	semantic, _, err := Build(bytes.NewReader(sourceFixture(t, "0000")))
	if err != nil || len(semantic.Edges) != 1 {
		t.Fatal("semantic pointer treated as lexical")
	}
	again, _, err := Build(bytes.NewReader(sourceFixture(t, "0101")))
	if err != nil || !reflect.DeepEqual(data, again) {
		t.Fatal("nondeterministic projection")
	}
	a, _ := json.Marshal(data)
	b, _ := json.Marshal(again)
	if !bytes.Equal(a, b) {
		t.Fatal("non-reproducible encoding")
	}
}
