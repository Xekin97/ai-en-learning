package diagnostics

import (
	"errors"
	"net"
	"net/url"
	"os"
	"sync"

	"wordweave/internal/ai"
	"wordweave/internal/buildinfo"
	evidence "wordweave/internal/generationevidence"
)

const EnableVariable = "WORDWEAVE_DIAGNOSTICS"
const DirectoryVariable = "WORDWEAVE_DIAGNOSTICS_DIR"

var ErrConfiguration = errors.New("invalid private diagnostics configuration")
var ErrDisabled = errors.New("private diagnostics require an explicit UAT diagnostic build")
var ErrLegacy = errors.New("obsolete UAT capture configuration; remove all UAT_*_CAPTURE_DIR variables")
var LegacyVariables = []string{"UAT_FAILURE_CAPTURE_DIR", "UAT_ANNOTATION_CAPTURE_DIR", "UAT_HINT_CAPTURE_DIR", "UAT_MINIMAL_CAPTURE_DIR"}

type Configuration struct {
	Directory string
	Enabled   bool
}

func Parse(lookup func(string) (string, bool), origin string) (Configuration, error) {
	for _, name := range LegacyVariables {
		if _, exists := lookup(name); exists {
			return Configuration{}, ErrLegacy
		}
	}
	enabled, _ := lookup(EnableVariable)
	directory, _ := lookup(DirectoryVariable)
	if (enabled == "" || enabled == "0") && directory == "" {
		return Configuration{}, nil
	}
	if !EnabledBuild {
		return Configuration{}, ErrDisabled
	}
	if enabled != "1" || directory == "" {
		return Configuration{}, ErrConfiguration
	}
	u, err := url.Parse(origin)
	if err != nil || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return Configuration{}, ErrConfiguration
	}
	host := u.Hostname()
	if host != "localhost" && !net.ParseIP(host).IsLoopback() {
		return Configuration{}, ErrConfiguration
	}
	return Configuration{directory, true}, nil
}

var localFingerprint = sync.OnceValues(func() (evidence.Fingerprint, error) { return Fingerprint("") })

func Fingerprint(serverExecutable string) (evidence.Fingerprint, error) {
	var info buildinfo.Info
	var err error
	if serverExecutable == "" {
		info, err = buildinfo.Executable("", true)
	} else {
		info, err = buildinfo.MatchingServer(serverExecutable)
	}
	if err != nil {
		return evidence.Fingerprint{}, buildinfo.ErrUnavailable
	}
	t, s, l, err := ai.ContractFingerprints()
	if err != nil {
		return evidence.Fingerprint{}, buildinfo.ErrUnavailable
	}
	fp := evidence.Fingerprint{Source: info.Source, Binary: info.Binary, Template: t, Schema: s, Validator: info.Validator, Lexicon: l}
	if !fp.Valid() {
		return evidence.Fingerprint{}, buildinfo.ErrUnavailable
	}
	return fp, nil
}
func Check(origin string) (Configuration, error) {
	c, err := Parse(os.LookupEnv, origin)
	if err != nil || !c.Enabled {
		return c, err
	}
	if os.Geteuid() == 0 || !privateMemoryFilesystem(c.Directory) {
		return Configuration{}, ErrConfiguration
	}
	if _, err = localFingerprint(); err != nil {
		return Configuration{}, err
	}
	return c, nil
}
func Open(origin string) (*evidence.Manager, error) {
	c, err := Check(origin)
	if err != nil || !c.Enabled {
		return nil, err
	}
	fp, err := localFingerprint()
	if err != nil {
		return nil, err
	}
	return evidence.Open(evidence.Options{Directory: c.Directory, Fingerprint: fp})
}
