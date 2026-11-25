import { chapterTextMark } from '@repo/validation';
import { orgHidingGreekLettersIn } from '@repo/org-archetypes';

/**
 * The text mark a card a visitor sees before joining shows for a chapter:
 * the invite card (#5625) and the public interest form (#5977). An
 * organization that never displays its letters (FIJI) keeps them off even
 * when the chapter's stored switch was never turned off, as for one created
 * before its org profile knew to (#3421). The match reads the organization's
 * name inside the chapter's ("Phi Gamma Delta Tau Nu"), the override web's
 * nav crest and mobile's Chat home also apply. Done on the API so every
 * client gets it.
 */
export function chapterCardMarkText(chapter: {
  name: string;
  branding?: Record<string, unknown>;
}): string | null {
  const branding = orgHidingGreekLettersIn(chapter.name)
    ? { ...chapter.branding, show_greek_letters: false }
    : chapter.branding;
  return chapterTextMark(branding)?.text ?? null;
}
