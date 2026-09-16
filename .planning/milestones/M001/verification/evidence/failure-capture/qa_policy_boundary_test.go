package ai

import (
 "context"
 "encoding/json"
 "errors"
 "reflect"
 "strings"
 "testing"
)

// QA-only thought experiment, NOT an approved policy or production fix.
// Retain existing schema/relationship checks; only remove known-but-absent
// declarations when a nonempty set of valid declarations remains in that section.
func qaPruneKnownAbsent(ctx context.Context, l *Lexicon, spec GenerationSpec, in Candidate) (Candidate, error) {
 raw, err := json.Marshal(in)
 if err != nil { return Candidate{}, err }
 var out Candidate
 if err := decodeCandidateStrict(raw,&out); err != nil { return Candidate{}, err }
 if len(out.Targets)!=len(spec.Entries) { return Candidate{}, errors.New("target_count") }
 for i:=range out.Targets {
  target:=&out.Targets[i]
  if target.SourceEntry!=spec.Entries[i] { return Candidate{}, errors.New("target_entry") }
  for _, section:=range []struct{text string; forms *[]string}{{out.Passage,&target.PassageForms},{target.HintPhrase,&target.HintForms}} {
   if err:=ctx.Err(); err!=nil { return Candidate{},err }
   if !validMappingForms(*section.forms) { return Candidate{},errors.New("schema_error") }
   index,err:=newTextIndex(ctx,section.text)
   if err!=nil { return Candidate{},err }
   var keep []string
   for _, form:=range *section.forms {
    _,status:=l.Analyze(target.SourceEntry,form)
    if status!=RelationKnown { return Candidate{},errors.New("unverified_relationship") }
    occurrences,err:=index.find(ctx,strings.ToLower(form))
    if err!=nil { return Candidate{},err }
    if len(occurrences)>0 { keep=append(keep,form) }
   }
   if len(keep)==0 { return Candidate{},errors.New("no_retained_declaration") }
   *section.forms=keep
  }
 }
 return out,nil
}

func TestQAKnownAbsentPolicyBoundary(t *testing.T) {
 lexicon,err:=LoadEmbeddedLexicon();if err!=nil {t.Fatal(err)}
 validator:=NewValidator(lexicon)
 makeCase:=func()(GenerationSpec,Candidate){
  return GenerationSpec{Entries:[]string{"seed","read"},MeaningLanguage:"en",MinimumWords:50,PromptVersion:PromptVersion},
   Candidate{Passage:"🙂 Seed, seeds and SEED are on the table. We read a page while reading together. "+strings.TrimSpace(strings.Repeat("Neighbors share helpful ideas and discuss practical plans together. ",6)),
    Tags:[]string{"learning"},Targets:[]CandidateTarget{
     {SourceEntry:"seed",EntryMeaning:"a plant structure that can grow into a new plant",HintPhrase:"plant a seed beside another seed",PassageForms:[]string{"seed"},HintForms:[]string{"seed"}},
     {SourceEntry:"read",EntryMeaning:"look at and understand written words",HintPhrase:"read a book",PassageForms:[]string{"read"},HintForms:[]string{"read"}},
   }}
 }
 type scenario struct{name string; modify func(*GenerationSpec,*Candidate); accept bool; removesDefect bool}
 cases:=[]scenario{
  {"valid_unchanged",func(*GenerationSpec,*Candidate){},true,false},
  {"two_hint_extras",func(_ *GenerationSpec,c *Candidate){c.Targets[0].HintForms=append(c.Targets[0].HintForms,"seeds");c.Targets[1].HintForms=append(c.Targets[1].HintForms,"reading")},true,true},
  {"passage_extra",func(_ *GenerationSpec,c *Candidate){c.Targets[0].PassageForms=append(c.Targets[0].PassageForms,"seeding")},true,true},
  {"case_repetition_and_unicode",func(_ *GenerationSpec,c *Candidate){c.Targets[0].HintForms=[]string{"SEED","seed","SEEDS"}},true,true},
  {"ordinary_unknown_word",func(_ *GenerationSpec,c *Candidate){c.Passage+=" Quuxblorf is a fictional place.";c.Targets[0].HintForms=append(c.Targets[0].HintForms,"seeds")},true,true},
  {"unrelated_absent",func(_ *GenerationSpec,c *Candidate){c.Targets[0].HintForms=append(c.Targets[0].HintForms,"banana")},false,false},
  {"unknown_absent",func(_ *GenerationSpec,c *Candidate){c.Targets[0].HintForms=append(c.Targets[0].HintForms,"zznotawordzz")},false,false},
  {"unrelated_present",func(_ *GenerationSpec,c *Candidate){c.Targets[0].HintPhrase+=" with a banana";c.Targets[0].HintForms=append(c.Targets[0].HintForms,"banana")},false,false},
  {"unknown_present",func(_ *GenerationSpec,c *Candidate){c.Targets[0].HintPhrase+=" beside zznotawordzz";c.Targets[0].HintForms=append(c.Targets[0].HintForms,"zznotawordzz")},false,false},
  {"misspelled_inflection",func(_ *GenerationSpec,c *Candidate){c.Targets[1].HintForms=append(c.Targets[1].HintForms,"readed")},false,false},
  {"empty_array",func(_ *GenerationSpec,c *Candidate){c.Targets[0].HintForms=[]string{}},false,false},
  {"nil_array",func(_ *GenerationSpec,c *Candidate){c.Targets[0].HintForms=nil},false,false},
  {"empty_after_prune_even_if_scan_could_recover",func(_ *GenerationSpec,c *Candidate){c.Targets[0].HintForms=[]string{"seeds"}},false,false},
  {"hint_target_missing",func(_ *GenerationSpec,c *Candidate){c.Targets[0].HintPhrase="a quiet garden";c.Targets[0].HintForms=[]string{"seed","seeds"}},false,false},
  {"passage_target_missing",func(_ *GenerationSpec,c *Candidate){c.Passage=strings.TrimSpace(strings.Repeat("We read books and share useful plans with neighbors. ",6))},false,false},
  {"substring_not_a_word",func(_ *GenerationSpec,c *Candidate){c.Targets[1].HintPhrase="fresh bread"},false,false},
  {"occurs_only_in_another_hint",func(_ *GenerationSpec,c *Candidate){c.Targets[1].HintPhrase="a quiet hour";c.Targets[0].HintPhrase+=" while we read"},false,false},
  {"whitespace_form",func(_ *GenerationSpec,c *Candidate){c.Targets[0].HintForms=append(c.Targets[0].HintForms," seeds")},false,false},
  {"excessive_form_array",func(_ *GenerationSpec,c *Candidate){c.Targets[0].HintForms=make([]string,129);for i:=range c.Targets[0].HintForms{c.Targets[0].HintForms[i]="seed"}},false,false},
  {"target_count_mismatch",func(_ *GenerationSpec,c *Candidate){c.Targets=c.Targets[:1]},false,false},
  {"target_entry_mismatch",func(_ *GenerationSpec,c *Candidate){c.Targets[0].SourceEntry="banana"},false,false},
  {"cross_target_collision",func(s *GenerationSpec,c *Candidate){
    s.Entries=append(s.Entries,"vulnerable","vulnerability");c.Passage+=" Vulnerable communities discussed vulnerability.";
    c.Targets=append(c.Targets,CandidateTarget{"vulnerable","easily harmed","vulnerable communities",[]string{"vulnerable"},[]string{"vulnerable","vulnerabilities"}},CandidateTarget{"vulnerability","exposure to harm","vulnerability to flooding",[]string{"vulnerability"},[]string{"vulnerability"}})
   },false,true},
 }
 for _,tc:=range cases{
  t.Run(tc.name,func(t *testing.T){
   spec,candidate:=makeCase();tc.modify(&spec,&candidate)
   originalBytes,_:=json.Marshal(candidate)
   originalBatch,originalErr:=validator.Validate(context.Background(),spec,candidate)
   filtered,filterErr:=qaPruneKnownAbsent(context.Background(),lexicon,spec,candidate)
   if filterErr!=nil {
    if tc.accept {t.Fatal(filterErr)}
    t.Log("REJECTED by guarded QA-only filtering");return
   }
   afterBytes,_:=json.Marshal(candidate);if string(originalBytes)!=string(afterBytes){t.Fatal("Input mutated")}
   batch,validateErr:=validator.Validate(context.Background(),spec,filtered)
   if !tc.accept {if validateErr==nil {t.Fatal("Unsafe acceptance")};t.Log("REJECTED by unchanged validator:",validateErr);return}
   if validateErr!=nil {t.Fatal(validateErr)}
   if tc.removesDefect && originalErr==nil {t.Fatal("Counterfactual did not exercise rejection")}
   if !tc.removesDefect && originalErr!=nil {t.Fatal(originalErr)}
   if !tc.removesDefect && !reflect.DeepEqual(batch,originalBatch){t.Fatal("Existing valid output changed")}
   if candidate.Passage!=filtered.Passage||!reflect.DeepEqual(candidate.Tags,filtered.Tags){t.Fatal("Text changed")}
   for i,target:=range candidate.Targets {
    got:=filtered.Targets[i];if target.SourceEntry!=got.SourceEntry||target.EntryMeaning!=got.EntryMeaning||target.HintPhrase!=got.HintPhrase {t.Fatal("Learning content rewritten")}
   }
   if len(batch.Targets[0].PassageOccurrences)!=3||len(batch.Targets[0].HintOccurrences)!=2||len(batch.Targets[1].PassageOccurrences)!=2||len(batch.Targets[1].HintOccurrences)!=1 {t.Fatal("Known omitted/repeated forms not fully scanned")}
   encoded,_:=json.Marshal(batch);decoded,err:=DecodeSnapshot(encoded)
   if err!=nil||!reflect.DeepEqual(batch,decoded){t.Fatal("Current snapshot invariants failed")}
   if strings.Contains(string(encoded),"hint_forms")||strings.Contains(string(encoded),"passage_forms"){t.Fatal("Untrusted declarations leaked downstream")}
   t.Log("ACCEPTED in hypothetical policy only; text unchanged; all known repeats and original-rune spans retained; current snapshot roundtrip valid")
  })
 }
 t.Run("cancellation",func(t *testing.T){spec,candidate:=makeCase();ctx,cancel:=context.WithCancel(context.Background());cancel();_,err:=qaPruneKnownAbsent(ctx,lexicon,spec,candidate);if !errors.Is(err,context.Canceled){t.Fatal("Cancellation ignored")}})
 t.Run("naive_presence_only_filter_hides_unrelated_claim",func(t *testing.T){
  spec,candidate:=makeCase();candidate.Targets[0].HintForms=append(candidate.Targets[0].HintForms,"banana")
  if _,err:=validator.Validate(context.Background(),spec,candidate);err==nil{t.Fatal("Original should reject")}
  if _,err:=qaPruneKnownAbsent(context.Background(),lexicon,spec,candidate);err==nil{t.Fatal("Guard should reject")}
  candidate.Targets[0].HintForms=[]string{"seed"}
  if _,err:=validator.Validate(context.Background(),spec,candidate);err!=nil{t.Fatal(err)}
  t.Log("COUNTEREXAMPLE: blindly deleting absent strings masks an unrelated declaration; relationship must be checked before filtering")
 })
}
