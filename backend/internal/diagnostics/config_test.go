package diagnostics

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
)

func TestOBS042CActualServerFingerprint(t *testing.T) {
	server := os.Getenv("TEST_SERVER_BINARY")
	if server == "" {
		t.Skip("isolated compiled server artifact not supplied")
	}
	// This test executable is linked with the same build-manifest values as
	// the admin; Fingerprint reads and checks the real generating server file.
	fp, err := Fingerprint(server)
	if err != nil {
		t.Fatal(err)
	}
	if fp.Source != os.Getenv("TEST_SOURCE_SHA256") || fp.Validator != os.Getenv("TEST_VALIDATOR_SHA256") || !fp.Valid() {
		t.Fatal("runtime provenance differs")
	}
	raw, err := json.Marshal(fp)
	if err != nil {
		t.Fatal(err)
	}
	t.Log(string(raw))
}

func lookup(values map[string]string) func(string) (string, bool) {
	return func(k string) (string, bool) { v, ok := values[k]; return v, ok }
}
func TestOBS042CConfigurationAndRetiredModes(t *testing.T) {
	c, err := Parse(lookup(nil), "http://localhost:6001")
	if err != nil || c.Enabled {
		t.Fatal("default must be off")
	}
	for _, name := range LegacyVariables {
		for _, value := range []string{"", "/private/not-printed"} {
			t.Run(name+value, func(t *testing.T) {
				_, err := Parse(lookup(map[string]string{name: value}), "http://localhost:6001")
				if !errors.Is(err, ErrLegacy) || strings.Contains(err.Error(), value) && value != "" {
					t.Fatal("old mode silently accepted or reflected")
				}
			})
		}
	}
	values := map[string]string{EnableVariable: "1", DirectoryVariable: "/run/evidence"}
	c, err = Parse(lookup(values), "http://localhost:6001")
	if !EnabledBuild {
		if !errors.Is(err, ErrDisabled) {
			t.Fatal("normal build enabled")
		}
		return
	}
	if err != nil || !c.Enabled {
		t.Fatal("diagnostic build not accepted", err)
	}
	for _, origin := range []string{"https://example.com", "http://localhost@evil.test", "http://private:secret@localhost", "file:///run/evidence", "http://localhost/path", "http://localhost?q=private"} {
		if _, err = Parse(lookup(values), origin); !errors.Is(err, ErrConfiguration) {
			t.Fatal("unsafe origin", err)
		}
	}
	for _, origin := range []string{"http://127.0.0.1:6001", "https://localhost", "http://[::1]:6001"} {
		if _, err = Parse(lookup(values), origin); err != nil {
			t.Fatal(err)
		}
	}
}
func TestOBS042CCommandRejectsBeforeReadingConfigurationOrSecrets(t *testing.T) {
	t.Setenv("APP_DATABASE_URL", "postgres://unreachable.invalid/never-connect")
	t.Setenv("OPENROUTER_MASTER_KEYS", "not-valid-and-never-loaded")
	var out bytes.Buffer
	if err := Run(context.Background(), []string{"inspect", "--dir", t.TempDir()}, &out); err == nil {
		t.Fatal("host directory accepted")
	}
	const secret = "sk-synthetic-argument"
	err := Run(context.Background(), []string{"inspect", "--" + secret}, &out)
	if !errors.Is(err, ErrUsage) || strings.Contains(err.Error(), secret) || strings.Contains(out.String(), secret) {
		t.Fatal("CLI echoed an unsafe argument")
	}
	if out.Len() != 0 {
		t.Fatal("unexpected content")
	}
}
