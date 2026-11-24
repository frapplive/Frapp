/**
 * The names of the app's places and of what New starts, one list for web and
 * the phone (`principles.md` P6.1; Paul, 2026-11-24, #5943).
 *
 * The product answers three questions, each in one place
 * (`spec/product/positioning.md` § Three questions): what is being said
 * (channels, Messages), what is on me and what is happening (Activity,
 * Calendar), and where is it and who is it (Resources, Directory). Before
 * this file each app kept its own words, and they had drifted: web said
 * "Direct messages" and "Events" where the phone said "Messages" and
 * "Calendar". A place is named here once; an app that draws it reads the
 * name from here.
 *
 * A name is added here when an app first draws the place under it. Web's
 * Events and Direct messages rows take theirs with the steps of #5943 that
 * rebuild those rows (#5946, #5948).
 */
export const SECTION_NAMES = {
  activity: "Activity",
  calendar: "Calendar",
  directory: "Directory",
  messages: "Messages",
  search: "Search",
} as const;

export type SectionKey = keyof typeof SECTION_NAMES;

/**
 * What New starts, in the order a member who never rearranges them sees
 * (the phone's + panel today, `apps/mobile/lib/quick-actions.ts`; web's New
 * page with #5946). The order's reasons are the phone's and are recorded
 * there. Who may use each is still decided where it is drawn, by the same
 * checks the API makes.
 */
export const NEW_ACTION_ORDER = [
  "newMinutes",
  "search",
  "newEvent",
  "newTask",
  "invite",
  "message",
  "hostCheckIn",
  "logHours",
  "study",
  "upload",
] as const;

export type NewActionKey = (typeof NEW_ACTION_ORDER)[number];

export const NEW_ACTION_LABELS: Record<NewActionKey, string> = {
  newMinutes: "New minutes",
  search: SECTION_NAMES.search,
  newEvent: "New event",
  newTask: "New task",
  invite: "Invite",
  message: "Message",
  hostCheckIn: "Host check-in",
  logHours: "Log hours",
  study: "Study",
  upload: "Upload",
};
