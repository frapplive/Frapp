/**
 * The board's geometry, shared by the board and its skeleton so the loading
 * state draws the loaded layout's shape (rulebook § 5). The columns sit side
 * by side and the board scrolls sideways inside the page, as a Pipedrive or
 * Linear board does, so the page itself never scrolls past the 375px floor.
 */
export const RUSH_BOARD_CLASS =
  "-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2";

/** One stage column: a fixed width, so long names truncate, not stretch. */
export const RUSH_COLUMN_CLASS = "flex w-64 shrink-0 snap-start flex-col gap-3";
