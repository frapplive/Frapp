import { describe, expect, it } from "vitest";
import {
  CHAT_BACKGROUND_KEYS,
  holidayFlairOn,
  isHolidaySeason,
  seasonalChapterDefault,
  withHolidaySeason,
} from "./chat-backgrounds";

/** The Holiday season (#6149): Dec 1 to 26 in the viewer's own local date. */
describe("isHolidaySeason", () => {
  // Local-time constructors: the season is the viewer's own calendar day.
  const day = (month: number, date: number, hour = 12) =>
    new Date(2026, month, date, hour);

  it("starts at the first minute of Dec 1", () => {
    expect(isHolidaySeason(new Date(2026, 10, 30, 23, 59))).toBe(false);
    expect(isHolidaySeason(new Date(2026, 11, 1, 0, 0))).toBe(true);
  });

  it("runs through the last minute of Dec 26 and ends on its own on Dec 27", () => {
    expect(isHolidaySeason(new Date(2026, 11, 26, 23, 59))).toBe(true);
    expect(isHolidaySeason(new Date(2026, 11, 27, 0, 0))).toBe(false);
  });

  it("comes back every year", () => {
    expect(isHolidaySeason(new Date(2027, 11, 15))).toBe(true);
    expect(isHolidaySeason(day(6, 4))).toBe(false);
  });
});

describe("withHolidaySeason", () => {
  const inSeason = new Date(2026, 11, 12);
  const after = new Date(2026, 11, 28);
  const plainDefault = {
    background: "plain",
    source: "chapter" as const,
    holiday_season: true,
  };

  it("shows Holiday for a Plain chapter default in the season", () => {
    expect(withHolidaySeason(plainDefault, inSeason).background).toBe(
      "holiday",
    );
  });

  it("is Plain again after the season", () => {
    expect(withHolidaySeason(plainDefault, after).background).toBe("plain");
  });

  it("keeps a chosen background, a channel's own Plain, and a DM", () => {
    expect(
      withHolidaySeason({ ...plainDefault, background: "midnight" }, inSeason)
        .background,
    ).toBe("midnight");
    expect(
      withHolidaySeason({ ...plainDefault, source: "channel" }, inSeason)
        .background,
    ).toBe("plain");
    expect(
      withHolidaySeason({ ...plainDefault, source: "none" }, inSeason)
        .background,
    ).toBe("plain");
  });

  it("stays Plain where an officer turned the season off", () => {
    expect(
      withHolidaySeason({ ...plainDefault, holiday_season: false }, inSeason)
        .background,
    ).toBe("plain");
  });

  it("previews a Plain chapter default as Holiday in the season, for the pickers", () => {
    const plain = { background: "plain", holiday_season: true };
    expect(seasonalChapterDefault(plain, inSeason)).toBe("holiday");
    expect(seasonalChapterDefault(plain, after)).toBe("plain");
    expect(
      seasonalChapterDefault({ ...plain, holiday_season: false }, inSeason),
    ).toBe("plain");
    expect(seasonalChapterDefault(undefined, inSeason)).toBeUndefined();
  });

  it("shows the flair in the season while the switch is on, whatever the background", () => {
    expect(holidayFlairOn({ holiday_season: true }, inSeason)).toBe(true);
    expect(holidayFlairOn({ holiday_season: true }, after)).toBe(false);
    expect(holidayFlairOn({ holiday_season: false }, inSeason)).toBe(false);
    // Not until the chapter's setting has loaded.
    expect(holidayFlairOn(undefined, inSeason)).toBe(false);
  });

  it("keeps Holiday selectable by hand all year", () => {
    expect(CHAT_BACKGROUND_KEYS).toContain("holiday");
  });
});
