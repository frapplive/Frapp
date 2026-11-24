import { describe, expect, it } from "vitest";
import { councilHomeSteps } from "./home";

describe("councilHomeSteps", () => {
  it("gives the Council admin both, invites first", () => {
    expect(councilHomeSteps(["*"])).toEqual(["invite", "titles"]);
  });

  it("gives each step only to whoever its route lets act", () => {
    expect(councilHomeSteps(["members:view", "members:invite"])).toEqual([
      "invite",
    ]);
    expect(councilHomeSteps(["members:view", "roles:manage"])).toEqual([
      "titles",
    ]);
  });

  it("gives a delegate none", () => {
    expect(councilHomeSteps(["members:view"])).toEqual([]);
    expect(councilHomeSteps([])).toEqual([]);
  });
});
