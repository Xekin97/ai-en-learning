//go:build integration

package admin

import (
	"errors"
	"testing"

	"github.com/google/uuid"
	"wordweave/internal/platform/business"
	"wordweave/internal/testdb"
)

func TestM003PlanContentServiceBoundariesImpactAndRevision(t *testing.T) {
	pool, ctx := testdb.Open(t)
	service := NewService(pool, nil, nil, nil, []byte("m003-plan-content-service"))
	groups, revision, err := service.ListGroups(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 4 {
		t.Fatalf("groups=%d", len(groups))
	}
	var pro, plus, basic Group
	for _, group := range groups {
		switch group.Code {
		case "pro":
			pro = group
		case "plus":
			plus = group
		case "basic":
			basic = group
		}
	}
	if !pro.ContentReviewEnabled || pro.ContentRepairLimit != 1 || !plus.ContentReviewEnabled || plus.ContentRepairLimit != 1 || basic.ContentReviewEnabled || basic.ContentRepairLimit != 0 {
		t.Fatalf("initial services: basic=%+v pro=%+v plus=%+v", basic, pro, plus)
	}
	inputFor := func(group Group, expected string, enabled bool, limit int) GroupInput {
		models := make([]uuid.UUID, 0, len(group.Models))
		for _, model := range group.Models {
			models = append(models, model.ID)
		}
		return GroupInput{Expected: expected, Priority: group.Priority, Limit: group.Rolling24hLimit, Maximum: group.MaxEntries, Lengths: append([]string(nil), group.AllowedLengths...), Models: models, ContentReviewEnabled: enabled, ContentRepairLimit: limit}
	}

	toNinetyNine := inputFor(pro, revision, true, 99)
	impact, err := service.GroupImpact(ctx, "pro", toNinetyNine)
	if err != nil || impact.ContentServiceChange.Before.ContentRepairLimit != 1 || impact.ContentServiceChange.After.ContentRepairLimit != 99 || impact.AppliesTo != "new_requests" || impact.InFlightPolicy != "accepted_snapshot" || impact.NativeCorrectionPolicy.MaxCalls != 2 {
		t.Fatalf("impact=%+v err=%v", impact, err)
	}
	saved, err := service.PutGroup(ctx, "pro", toNinetyNine)
	if err != nil || !saved.ContentReviewEnabled || saved.ContentRepairLimit != 99 {
		t.Fatalf("save 99=%+v err=%v", saved, err)
	}
	if _, err = service.PutGroup(ctx, "pro", toNinetyNine); err == nil {
		t.Fatal("stale revision was accepted")
	} else {
		var conflict *business.RevisionConflict
		if !errors.As(err, &conflict) {
			t.Fatalf("stale error=%v", err)
		}
	}

	disable := inputFor(saved, saved.Revision, false, 0)
	impact, err = service.GroupImpact(ctx, "pro", disable)
	if err != nil || len(impact.Warnings) == 0 || impact.Warnings[0] != "content_service_removed" {
		t.Fatalf("disable impact=%+v err=%v", impact, err)
	}
	saved, err = service.PutGroup(ctx, "pro", disable)
	if err != nil || saved.ContentReviewEnabled || saved.ContentRepairLimit != 0 {
		t.Fatalf("save zero=%+v err=%v", saved, err)
	}

	for _, tc := range []struct {
		name, code string
		group      Group
		enabled    bool
		limit      int
	}{
		{"negative", "plus", plus, true, -1},
		{"over upper boundary", "plus", plus, true, 100},
		{"enabled zero mismatch", "plus", plus, true, 0},
		{"disabled nonzero mismatch", "plus", plus, false, 1},
		{"basic cannot enable", "basic", basic, true, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, currentRevision, listErr := service.ListGroups(ctx)
			if listErr != nil {
				t.Fatal(listErr)
			}
			_, saveErr := service.PutGroup(ctx, tc.code, inputFor(tc.group, currentRevision, tc.enabled, tc.limit))
			if !errors.Is(saveErr, ErrValidation) {
				t.Fatalf("error=%v", saveErr)
			}
		})
	}
}
