import { describe, expect, it } from "vitest";
import { rushDashboard } from "./rush-dashboard";
import {
  rushBoardColumns,
  rushCandidatesByColumn,
  type RushStageView,
} from "./rush-pipeline";
import type { RushPipelineCandidate } from "./use-rush-pipeline";

const stage = (
  key: string,
  category: RushStageView["category"],
  position: number,
  hidden = false,
): RushStageView => ({
  id: `id-${key}`,
  key,
  label: key.toUpperCase(),
  category,
  position,
  hidden,
});

const STAGES = [
  stage("new", "new", 0),
  stage("met", "met", 1),
  stage("old", "engaged", 2, true),
  stage("closed", "closed", 3),
  stage("passed", "closed", 4),
];

const TODAY = "2026-11-24";

const prospect = (
  id: string,
  over: Partial<RushPipelineCandidate> = {},
): RushPipelineCandidate =>
  ({
    id,
    display_name: id,
    user_id: null,
    stage: "new",
    closed_reason: null,
    bid_status: "none",
    created_by: "u",
    created_by_name: "U",
    created_at: `${TODAY}T10:00:00Z`,
    tag_ids: [],
    viewer_rating: null,
    viewer_has_voted: false,
    owner_id: null,
    owner_name: null,
    last_contact_on: TODAY,
    last_contact_by: null,
    last_contact_by_name: null,
    follow_up_on: null,
    follow_up_note: null,
    follow_up_user_id: null,
    follow_up_user_name: null,
    ...over,
  }) as RushPipelineCandidate;

const CANDIDATES = [
  prospect("ana", {
    owner_id: "me",
    rating_average: 4.5,
    rating_count: 2,
    vote_count: 3,
  }),
  prospect("ben", {
    stage: "met",
    last_contact_on: "2026-11-01",
    rating_average: 3,
    rating_count: 1,
    vote_count: 0,
  }),
  prospect("cal", {
    stage: "met",
    follow_up_on: TODAY,
    follow_up_user_id: "other",
    bid_status: "extended",
    owner_id: "me",
  }),
  prospect("dan", { stage: "old", follow_up_on: "2026-11-30" }),
  prospect("eve", {
    stage: "passed",
    closed_reason: "chapter_passed",
    owner_id: "me",
    rating_average: 5,
    rating_count: 4,
    vote_count: 9,
  }),
];

const options = {
  viewerId: "me",
  staleDays: 7,
  today: TODAY,
  viewResults: true,
};

describe("rushDashboard (#5973)", () => {
  it("counts each board column exactly as the board holds it", () => {
    const dashboard = rushDashboard(STAGES, CANDIDATES, options);
    const columns = rushBoardColumns(STAGES, CANDIDATES);
    const byColumn = rushCandidatesByColumn(columns, CANDIDATES);
    expect(dashboard.funnel).toEqual(
      columns.map((column) => ({
        id: column.id,
        label: column.label,
        category: column.category,
        count: byColumn.get(column.id)!.length,
      })),
    );
    // A hidden stage that still holds someone keeps its row, as its column.
    expect(dashboard.funnel.map((row) => [row.id, row.count])).toEqual([
      ["new", 1],
      ["met", 2],
      ["old", 1],
      ["closed", 1],
    ]);
  });

  it("counts open, follow-up, owned and bid numbers from the open prospects", () => {
    const dashboard = rushDashboard(STAGES, CANDIDATES, options);
    expect(dashboard).toMatchObject({
      open: 4,
      needsFollowUp: 1, // ben: 23 days without a contact
      followUpsDue: 1, // cal's, though it isn't the viewer's
      mine: 2, // ana and cal; eve is closed
      bidsExtended: 1,
    });
  });

  it("ranks the open prospects by average and by votes", () => {
    const { results } = rushDashboard(STAGES, CANDIDATES, options);
    expect(results?.topRated.map((r) => [r.id, r.value, r.count])).toEqual([
      ["ana", 4.5, 2],
      ["ben", 3, 1],
    ]);
    // A prospect with no votes isn't ranked; a closed one never is.
    expect(results?.mostVotes.map((r) => [r.id, r.value])).toEqual([
      ["ana", 3],
    ]);
  });

  it("shows no results without rush:view_results, or when the read left them out", () => {
    expect(
      rushDashboard(STAGES, CANDIDATES, { ...options, viewResults: false })
        .results,
    ).toBeNull();
    const blind = CANDIDATES.map((candidate) => {
      const rest: Partial<RushPipelineCandidate> = { ...candidate };
      delete rest.rating_average;
      delete rest.rating_count;
      delete rest.vote_count;
      return rest as RushPipelineCandidate;
    });
    expect(rushDashboard(STAGES, blind, options).results).toBeNull();
  });

  it("counts nothing as the viewer's before the viewer is known", () => {
    expect(
      rushDashboard(STAGES, CANDIDATES, { ...options, viewerId: null }).mine,
    ).toBe(0);
  });
});
