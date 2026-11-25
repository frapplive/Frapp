/**
 * The board's geometry, shared by the board and its skeleton so the loading
 * state draws the loaded layout's shape (rulebook § 5). The columns sit side
 * by side and the board scrolls sideways inside the page, as a Pipedrive or
 * Linear board does, so the page itself never scrolls past the 375px floor.
 *
 * Beside chat the page can be 600px wide or less, so the columns share the
 * width rather than each taking a fixed 256px (Paul, 2026-11-24, on four
 * fixed columns that cut the one holding prospects off mid-card): a column
 * with prospects grows to fill the row up to 20rem and gives way down to
 * 12rem before the board scrolls, and an empty stage folds to its label
 * (`RUSH_EMPTY_COLUMN_CLASS`), the way Jira folds a column, so the stages
 * that hold people get the room. A pipeline early in rush is mostly empty
 * stages, and it was those that pushed the full one off the edge.
 */
export const RUSH_BOARD_CLASS =
  "-mx-1 flex snap-x scroll-px-1 gap-3 overflow-x-auto px-1 pb-2";

/**
 * One stage column holding prospects: shares the row's width between 12rem
 * and 20rem, so long names truncate rather than stretch.
 */
export const RUSH_COLUMN_CLASS =
  "flex min-w-48 max-w-80 flex-1 basis-0 snap-start flex-col gap-3";

/**
 * A stage with nobody in it: as wide as its label (at most 10rem, where a
 * long stage name truncates), still a column a card can be dropped on.
 */
export const RUSH_EMPTY_COLUMN_CLASS =
  "flex w-max max-w-40 shrink-0 snap-start flex-col gap-3";
