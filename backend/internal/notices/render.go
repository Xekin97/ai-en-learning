package notices

import (
	"bytes"
	"errors"
	"github.com/microcosm-cc/bluemonday"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"unicode/utf8"
)

var markdown = goldmark.New(goldmark.WithExtensions(extension.Table, extension.Strikethrough))
var safeHTML = func() *bluemonday.Policy {
	p := bluemonday.NewPolicy()
	p.AllowElements("p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "strong", "em", "del", "code", "pre", "a", "table", "thead", "tbody", "tr", "th", "td")
	p.AllowAttrs("href", "title").OnElements("a")
	p.AllowURLSchemes("http", "https").RequireParseableURLs(true).AllowRelativeURLs(false)
	p.RequireNoReferrerOnLinks(true).AddTargetBlankToFullyQualifiedLinks(true)
	return p
}()

func Render(body string) (string, error) {
	if !utf8.ValidString(body) || len(body) > 64<<10 {
		return "", errors.New("notice body is too large or invalid")
	}
	var output bytes.Buffer
	if err := markdown.Convert([]byte(body), &output); err != nil {
		return "", err
	}
	return safeHTML.Sanitize(output.String()), nil
}
