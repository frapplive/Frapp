import { RushPage } from "@/components/rush/rush-page";

/*
 * No `metadata.title`: the page is named in the chapter's own word (Rush,
 * Recruitment, Intake; `spec/behavior/rush.md` § Vocabulary), which a static
 * title can't know. The page header names it from the nav row
 * (`page-title.ts`, `vocabLabel`).
 */
export default function Rush() {
  return <RushPage />;
}
