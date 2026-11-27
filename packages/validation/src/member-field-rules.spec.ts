import { describe, expect, it } from "vitest";
import { CreateCustomFieldSchema } from "./chapter-config";
import { MEMBER_FIELDS_COPY } from "./people-settings-copy";
import {
  addChoice,
  choiceProblem,
  createFieldBody,
  EMPTY_FIELD_DRAFT,
    moveChoice,
  moveFieldPatches,
  newFieldBlocker,
  parseMaxLength,
  withChoices,
  withMaxLength,
} from "./member-field-rules";

describe("a new member field (#6029)", () => {
  it("says why Add field waits: a name, then a pick-one field's option", () => {
    expect(newFieldBlocker(EMPTY_FIELD_DRAFT)).toBe(
      MEMBER_FIELDS_COPY.needsName,
    );
    const named = { ...EMPTY_FIELD_DRAFT, label: "Shirt size" };
    expect(newFieldBlocker(named)).toBeNull();
    expect(newFieldBlocker({ ...named, type: "select" })).toBe(
      MEMBER_FIELDS_COPY.needsOption,
    );
    expect(
      newFieldBlocker({ ...named, type: "select", choices: ["S"] }),
    ).toBeNull();
    expect(newFieldBlocker({ ...named, maxLength: "ten" })).toBe(
      MEMBER_FIELDS_COPY.maxLengthFloor,
    );
  });

  it("reads the longest answer as typed", () => {
    expect(parseMaxLength("")).toBeNull();
    expect(parseMaxLength(" 40 ")).toBe(40);
    expect(parseMaxLength("0")).toBeUndefined();
    expect(parseMaxLength("4.5")).toBeUndefined();
  });

  it("makes a body the API takes, its key from the name, at the end", () => {
    const body = createFieldBody(
      {
        ...EMPTY_FIELD_DRAFT,
        label: " Shirt size ",
        type: "select",
        choices: ["S", "M"],
        maxLength: "30",
      },
      [
        { key: "shirt_size", sort: 0 },
        { key: "major", sort: 3 },
      ],
    );
    expect(body).toMatchObject({
      key: "shirt_size_2",
      label: "Shirt size",
      type: "select",
      options: { choices: ["S", "M"] },
    });
    // The API puts it last; a sort worked out from a stale list could tie.
    expect(body).not.toHaveProperty("sort");
    expect(CreateCustomFieldSchema.safeParse(body).success).toBe(true);
    const text = createFieldBody(
      { ...EMPTY_FIELD_DRAFT, label: "Bio", maxLength: "200" },
      [],
    );
    expect(text.options).toEqual({ max_length: 200 });
    expect(
      createFieldBody({ ...EMPTY_FIELD_DRAFT, label: "Bio" }, []).options,
    ).toBeUndefined();
  });
});

describe("moving and editing fields", () => {
  const fields = [
    { id: "a", sort: 0 },
    { id: "b", sort: 0 },
    { id: "c", sort: 0 },
  ];

  it("writes the sorts a move needs, and nothing at an end", () => {
    expect(moveFieldPatches(fields, "c", -1)).toEqual([
      { id: "c", sort: 1 },
      { id: "b", sort: 2 },
    ]);
    expect(moveFieldPatches(fields, "a", -1)).toEqual([]);
  });

  it("adds, refuses a repeat of, and moves an option", () => {
    expect(addChoice(["S"], " M ")).toEqual(["S", "M"]);
    expect(addChoice(["S"], "s")).toEqual(["S"]);
    expect(choiceProblem(["S"], "s")).toBe("“s” is already an option.");
    expect(choiceProblem(["S"], "M")).toBeNull();
    expect(moveChoice(["S", "M", "L"], 2, -1)).toEqual(["S", "L", "M"]);
    expect(moveChoice(["S"], 0, 1)).toBeNull();
  });

  it("keeps the other stored options when one changes", () => {
    expect(withChoices({ max_length: 5 }, ["A"])).toEqual({
      max_length: 5,
      choices: ["A"],
    });
    expect(withMaxLength({ max_length: 5 }, null)).toBeNull();
    expect(withMaxLength(null, 9)).toEqual({ max_length: 9 });
  });
});
