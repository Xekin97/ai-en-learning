package notices

import (
	"strings"
	"testing"
	"wordweave/internal/platform/business"
)

func text(v string) *string { return &v }
func TestMarkdownDisallowsActiveContent(t *testing.T) {
	html, err := Render("# Hello\n\n<script>alert(1)</script>\n\n[bad](javascript:alert%281%29) [data](data:text/html,test) [local](/account) [safe](https://example.com)\n\n<img src=x onerror=alert(1)>\n\n**Useful** content")
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"<script", "<img", "javascript:", "data:", "onerror", "href=\"/account", "style="} {
		if strings.Contains(html, forbidden) {
			t.Fatalf("active content survived: %s", html)
		}
	}
	for _, expected := range []string{"<strong>Useful</strong>", "https://example.com", "noopener", "noreferrer"} {
		if !strings.Contains(html, expected) {
			t.Fatalf("missing %s: %s", expected, html)
		}
	}
}
func TestWholeLanguagePairFallback(t *testing.T) {
	s := NewService(nil, []byte("test-key"))
	input, err := normalize(Input{Title: business.Bilingual{ZH: text("中文标题"), EN: text("English")}, Body: business.Bilingual{EN: text("English body")}})
	if err != nil {
		t.Fatal(err)
	}
	n, err := s.project(AdminNotice{Input: input}, "zh-CN")
	if err != nil {
		t.Fatal(err)
	}
	if n.ContentLocale != "en-US" || n.Title != "English" || !strings.Contains(n.BodyHTML, "English body") {
		t.Fatalf("mixed pair: %+v", n)
	}
	_, err = normalize(Input{Title: business.Bilingual{ZH: text("标题")}, Body: business.Bilingual{EN: text("body")}})
	if err == nil {
		t.Fatal("accepted split language pair")
	}
}
