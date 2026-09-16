package ai

import (
 "context"
 "crypto/sha256"
 "encoding/hex"
 "encoding/json"
 "errors"
 "os"
 "reflect"
 "testing"
)

func TestQARealFailure114Replay(t *testing.T) {
 raw, err := os.ReadFile("/capture/failure.json")
 if err != nil { t.Fatal("Private sample unavailable") }
 digest := sha256.Sum256(raw)
 if hex.EncodeToString(digest[:]) != "337205cd561d170d481e041223d70f4a1f00068c5278a86caaf5278600973e36" { t.Fatal("Sample hash changed") }
 var sample struct {
  RunID string `json:"run_id"`
  PromptVersion string `json:"prompt_version"`
  ValidatorVersion string `json:"validator_version"`
  Reason string `json:"reason"`
  TargetIndex int `json:"target_index"`
  Configuration struct {
   ModelID string `json:"model_id"`
   MeaningLanguage string `json:"meaning_language"`
   Scenario string `json:"scenario"`
   Length string `json:"length"`
   MinimumWords int `json:"minimum_words"`
   Entries []string `json:"entries"`
  } `json:"configuration"`
  Candidate Candidate `json:"candidate"`
 }
 if json.Unmarshal(raw, &sample) != nil { t.Fatal("Invalid private sample") }
 if sample.RunID != "01a0855e-2c7e-7059-bd88-1460b7ea4d1f" || sample.PromptVersion != PromptVersion || sample.ValidatorVersion != ValidatorVersion || sample.Reason != "mapping_surface_absent" || sample.TargetIndex != 3 { t.Fatal("Capture identity/version/error differs") }
 cfg := sample.Configuration
 spec := GenerationSpec{RunID:sample.RunID, ModelID:cfg.ModelID, MeaningLanguage:cfg.MeaningLanguage, Scenario:cfg.Scenario, LengthCode:cfg.Length, MinimumWords:cfg.MinimumWords, Entries:cfg.Entries, PromptVersion:sample.PromptVersion}
 lexicon, err := LoadEmbeddedLexicon()
 if err != nil { t.Fatal(err) }
 validator := NewValidator(lexicon)
 ctx := context.Background()
 type defect struct {
  Target int `json:"target_index"`
  Entry string `json:"entry"`
  Section string `json:"section"`
  Form string `json:"form"`
  Reason string `json:"reason"`
  Relation RelationStatus `json:"relation"`
 }
 var defects []defect
 passage, err := newTextIndex(ctx, sample.Candidate.Passage)
 if err != nil { t.Fatal(err) }
 for i, target := range sample.Candidate.Targets {
  hint, err := newTextIndex(ctx, target.HintPhrase)
  if err != nil { t.Fatal(err) }
  for _, section := range []struct{name string; text *textIndex; forms []string}{{"passage_forms",passage,target.PassageForms},{"hint_forms",hint,target.HintForms}} {
   for _, form := range section.forms {
    err := validator.validateDeclarations(ctx,section.text,target.SourceEntry,[]string{form},lexicon.knownForms(target.SourceEntry),i)
    if err == nil { continue }
    var mapped *MappingValidationError
    if !errors.As(err,&mapped) { t.Fatal("Unexpected declaration error") }
    _, relation := lexicon.Analyze(target.SourceEntry,form)
    defects=append(defects,defect{i,target.SourceEntry,section.name,form,mapped.Reason,relation})
   }
  }
 }
 expected:=[]defect{{3,"seed","hint_forms","seeds","mapping_surface_absent",RelationKnown},{4,"read","hint_forms","reading","mapping_surface_absent",RelationKnown}}
 if !reflect.DeepEqual(defects,expected) { t.Fatal("Declaration defect set differs") }
 details,_:=json.Marshal(defects);t.Log("DECLARATION_DEFECTS "+string(details))
 clone:=func() Candidate { b,_:=json.Marshal(sample.Candidate);var out Candidate;if json.Unmarshal(b,&out)!=nil {t.Fatal("Clone failed")};return out }
 for _, check:=range []struct{name string; correctSeed bool; correctRead bool; expectedTarget int}{{"original",false,false,3},{"seed_hint_only_corrected",true,false,4},{"both_hint_arrays_corrected",true,true,-1}} {
  t.Run(check.name,func(t *testing.T){
   candidate:=clone()
   if check.correctSeed {candidate.Targets[3].HintForms=[]string{"seed"}}
   if check.correctRead {candidate.Targets[4].HintForms=[]string{"read"}}
   batch,err:=validator.Validate(ctx,spec,candidate)
   if check.expectedTarget>=0 {
    var mapped *MappingValidationError
    if !errors.As(err,&mapped)||mapped.Reason!="mapping_surface_absent"||mapped.Target!=check.expectedTarget {t.Fatal("Replay result differs")}
    t.Logf("mapping_surface_absent target_index=%d",mapped.Target)
    return
   }
   if err!=nil {t.Fatal("Counterfactual remains invalid:",err)}
   if candidate.Passage!=sample.Candidate.Passage {t.Fatal("Passage changed")}
   if len(batch.Targets[3].HintOccurrences)!=2 || len(batch.Targets[3].PassageOccurrences)!=2 || len(batch.Targets[4].HintOccurrences)!=1 || len(batch.Targets[4].PassageOccurrences)!=2 {t.Fatal("Expected complete seed/read occurrences not recovered")}
   t.Logf("VALID word_count=%d seed_hint=2 seed_passage=2 read_hint=1 read_passage=2; only two hint_forms arrays changed in memory",batch.WordCount)
  })
 }
 t.Log("No model calls, no database access, no production source edits, no raw candidate printed or persisted")
}
