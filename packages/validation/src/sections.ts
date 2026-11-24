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
 * "Calendar". A place is named here once, and what draws its name on a screen
 * reads it from here: web's nav rows, and the phone's tab and screen titles,
 * back labels and You rows.
 *
 * Not yet read from here, and why: web's page metadata titles (checked
 * against the nav rows by `page-title.spec.ts` instead), and web's Events
 * and Direct messages rows, which take the phone's words with the steps of
 * #5943 that rebuild them (#5946, #5948).
 */
export const SECTION_NAMES = {
  activity: "Activity",
  calendar: "Calendar",
  directory: "Directory",
  messages: "Messages",
  /** Documents, with meetings' minutes filed inside, and Backwork (#5949). */
  resources: "Resources",
  search: "Search",
} as const;

/**
 * What New starts, in the order a member who never rearranges them sees.
 * Its one reader today is the phone's + panel
 * (`apps/mobile/lib/quick-actions.ts`); web's New page becomes the second
 * with #5946, and until then a change here changes only the phone. The order's reasons are the phone's and are recorded
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
