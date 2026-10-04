package learning

import "testing"

func TestNormalizeEntryQuery(t *testing.T) {
	for _, test := range []struct {
		name  string
		query string
		want  string
	}{
		{name: "mixed case and outer whitespace", query: " \tLeArN\n", want: "learn"},
		{name: "unicode outer whitespace", query: "\u00a0LEARN\u00a0", want: "learn"},
		{name: "internal whitespace stays significant", query: " LE ARN ", want: "le arn"},
		{name: "apostrophe stays significant", query: " CAN'T ", want: "can't"},
		{name: "hyphen stays significant", query: " SELF-TAUGHT ", want: "self-taught"},
		{name: "no stemming", query: " LEARNED ", want: "learned"},
		{name: "no prefix matching", query: " LEAR ", want: "lear"},
		{name: "wildcard stays literal", query: " LEARN% ", want: "learn%"},
		{name: "empty", query: "", want: ""},
		{name: "whitespace only", query: " \t\n", want: ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := NormalizeEntryQuery(test.query); got != test.want {
				t.Errorf("NormalizeEntryQuery(%q) = %q, want %q", test.query, got, test.want)
			}
		})
	}
}
