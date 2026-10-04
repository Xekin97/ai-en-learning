package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"strings"

	"github.com/google/uuid"
	"wordweave/internal/growth"
	"wordweave/internal/platform/business"
)

// Configuration commands distinguish structural transport errors (400) from
// editable missing/range fields (422), retaining original JSON Pointer indexes.
func decodeConfiguration(w http.ResponseWriter, r *http.Request, target any) bool {
	var raw json.RawMessage
	if !decodeOrProblem(w, r, &raw, 2<<20) {
		return false
	}
	validation := &growth.ValidationError{}
	if err := inspectConfiguration(raw, reflect.TypeOf(target).Elem(), "", false, validation); err != nil {
		writeProblem(w, r, 400, "malformed_request", "Malformed request", "The request body is not valid for this operation.")
		return false
	}
	if len(validation.Fields) > 0 {
		writeConfigurationValidation(w, r, validation)
		return false
	}
	if err := json.Unmarshal(raw, target); err != nil {
		writeProblem(w, r, 400, "malformed_request", "Malformed request", "The request body is not valid for this operation.")
		return false
	}
	return true
}
func writeConfigurationValidation(w http.ResponseWriter, r *http.Request, v *growth.ValidationError) {
	fields := make([]fieldError, len(v.Fields))
	for i, f := range v.Fields {
		fields[i] = fieldError{f.Field, f.Code}
	}
	writeProblem(w, r, 422, "validation_failed", "Request could not be accepted", "One or more fields need attention.", fields...)
}
func jsonFields(t reflect.Type) []reflect.StructField {
	var out []reflect.StructField
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		if field.Anonymous {
			out = append(out, jsonFields(field.Type)...)
		} else if field.Tag.Get("json") != "-" {
			out = append(out, field)
		}
	}
	return out
}
func inspectConfiguration(raw json.RawMessage, t reflect.Type, path string, nullable bool, v *growth.ValidationError) error {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		if len(raw) == 0 || !nullable {
			v.Add(path, "required")
		}
		return nil
	}
	if t.Kind() == reflect.Pointer {
		return inspectConfiguration(raw, t.Elem(), path, false, v)
	}
	if t == reflect.TypeFor[growth.EffectInput]() {
		var shape struct {
			Kind string `json:"kind"`
		}
		if err := json.Unmarshal(raw, &shape); err != nil {
			return err
		}
		fields := map[string]reflect.Type{"kind": reflect.TypeFor[string]()}
		switch shape.Kind {
		case "makeup":
		case "extra_credit":
			fields["extra_count"] = reflect.TypeFor[int64]()
		case "model_trial":
			fields["model_ids"] = reflect.TypeFor[[]uuid.UUID]()
			fields["trial_seconds"] = reflect.TypeFor[int64]()
			fields["retirement_points"] = reflect.TypeFor[business.Amount]()
		case "plan_trial":
			fields["target_plan_code"] = reflect.TypeFor[string]()
			fields["trial_seconds"] = reflect.TypeFor[int64]()
		default:
			v.Add(path+"/kind", "out_of_range")
			return nil
		}
		var object map[string]json.RawMessage
		if err := json.Unmarshal(raw, &object); err != nil {
			return err
		}
		for key, kind := range fields {
			if err := inspectConfiguration(object[key], kind, path+"/"+key, false, v); err != nil {
				return err
			}
		}
		for key := range object {
			if _, ok := fields[key]; !ok {
				return errors.New("field is not supported by this item type")
			}
		}
		return nil
	}
	if t == reflect.TypeFor[business.Amount]() {
		var value string
		if err := json.Unmarshal(raw, &value); err != nil {
			return err
		}
		var parsed business.Amount
		if err := json.Unmarshal(raw, &parsed); err != nil {
			v.Add(path, "out_of_range")
		}
		return nil
	}
	if t == reflect.TypeFor[uuid.UUID]() {
		var value string
		if err := json.Unmarshal(raw, &value); err != nil {
			return err
		}
		if id, err := uuid.Parse(value); err != nil || id == uuid.Nil {
			v.Add(path, "invalid_reference")
		}
		return nil
	}
	switch t.Kind() {
	case reflect.Struct:
		var object map[string]json.RawMessage
		if err := json.Unmarshal(raw, &object); err != nil {
			return err
		}
		if object == nil {
			return errors.New("object required")
		}
		fields := jsonFields(t)
		known := map[string]bool{}
		for _, field := range fields {
			name, options, _ := strings.Cut(field.Tag.Get("json"), ",")
			if name == "" {
				name = field.Name
			}
			known[name] = true
			value := object[name]
			if len(value) == 0 && strings.Contains(options, "omitempty") {
				continue
			}
			if err := inspectConfiguration(value, field.Type, path+"/"+name, field.Tag.Get("nullable") == "true", v); err != nil {
				return err
			}
		}
		for key := range object {
			if !known[key] {
				return errors.New("unknown field")
			}
		}
	case reflect.Slice:
		var entries []json.RawMessage
		if err := json.Unmarshal(raw, &entries); err != nil {
			return err
		}
		for i, entry := range entries {
			if err := inspectConfiguration(entry, t.Elem(), fmt.Sprintf("%s/%d", path, i), false, v); err != nil {
				return err
			}
		}
	default:
		value := reflect.New(t).Interface()
		if err := json.Unmarshal(raw, value); err != nil {
			return err
		}
	}
	return nil
}
