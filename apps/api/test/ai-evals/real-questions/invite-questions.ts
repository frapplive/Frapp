/**
 * Event requests whose right card invites the right people (#5853).
 *
 * Paul made "FSL Leaders Reception" with Ask on 2026-11-22; the card
 * invited the whole chapter, and he ended with the cabinet tier required
 * and nobody else invited. These ask the same kind of thing of the term
 * chapter, by its own tiers (`SYNTHETIC_TIERS`): leaders' events go to
 * leaders, a chapter meeting to everyone, a social to everyone as optional,
 * and an event the chapter has held before follows its last invite list.
 *
 * They are not in `REAL_QUESTIONS`: they grade a card, not an answer, and
 * the scripted loop proposes no card. `npm run ai:bake-off -- --task
 * ask.invites --models <id>` asks them of a real model, on the loop.
 */
import { TERM_CHAPTER, TERM_EVENT_TYPES, type TermChapter } from '../synthetic-chapter/term';
import type { RealQuestion } from './types';

const EXEC = [
  'President',
  'Vice President',
  'Treasurer',
  'Secretary',
  'Risk Manager',
];
const CHAIRS = ['Social Chair', 'House Manager', 'Philanthropy Chair'];

/**
 * The term chapter with its event types and one earlier officers-only
 * event, so "like last time" has something to follow.
 */
export const INVITE_CHAPTER: TermChapter = {
  ...TERM_CHAPTER,
  eventTypes: TERM_EVENT_TYPES,
  events: [
    ...TERM_CHAPTER.events,
    {
      id: 'syn-event-officer-training',
      name: 'Officer training',
      start: '2026-09-19T17:00:00Z',
      place: 'Library room 2',
      required: true,
      points: 5,
      invites: {
        required: ['Exec board', 'Chairs'],
        everyoneElse: 'not_invited',
      },
    },
  ],
};

const PRESIDENT = 'syn-owen-hale';

const ask = (
  id: string,
  question: string,
  invite: NonNullable<RealQuestion['expect']['invite']>,
  rightAnswer: string,
): RealQuestion => ({
  id: `invite-${id}`,
  group: 'exec',
  origin: id === 'leaders-reception' ? 'miss' : 'plan',
  askerId: PRESIDENT,
  chapter: INVITE_CHAPTER,
  question,
  expect: {
    facts: [],
    tools: [['propose_event']],
    maxWords: 80,
    cards: { min: 1, max: 1 },
    invite,
  },
  rightAnswer,
});

export const INVITE_QUESTIONS: readonly RealQuestion[] = [
  ask(
    'leaders-reception',
    'FSL emailed: the FSL Leaders Reception is Tuesday, January 19 from 5 to 6 PM in the Union Theater. Put it on the calendar.',
    { everyone: 'not_invited', required: EXEC },
    'One event card for the reception, inviting the Exec board tier (required) and nobody else: it is a reception for chapter leaders, not the whole chapter.',
  ),
  ask(
    'exec-meeting',
    'Set up an exec board meeting next Wednesday at 8 PM in the chapter room.',
    { everyone: 'not_invited', required: EXEC },
    'One event card on Wednesday, November 18 at 8 PM for the Exec board tier, required, nobody else invited.',
  ),
  ask(
    'chapter-meeting',
    'Add a chapter meeting on Sunday, November 22 at 7 PM in the chapter room.',
    { everyone: 'required', required: [], type: 'Chapter meeting', points: 5 },
    'One event card, the Chapter meeting type, required for everyone, 5 points.',
  ),
  ask(
    'social',
    'Put a glow party on the calendar for Friday, November 20 at 9 PM at the house.',
    { everyone: 'optional', required: [], type: 'Social' },
    'One event card, the Social type, optional for everyone; nobody required.',
  ),
  ask(
    'officer-transition',
    "Schedule the officer transition dinner for Sunday, December 13 at 6 PM at Rossi's. All exec and chairs need to be there.",
    { everyone: 'not_invited', required: [...EXEC, ...CHAIRS] },
    'One event card inviting the Exec board and Chairs tiers, required, and nobody else.',
  ),
  ask(
    'officer-training-again',
    'Set up officer training again for Saturday, January 23 at 1 PM in Library room 2.',
    { everyone: 'not_invited', required: [...EXEC, ...CHAIRS] },
    "One event card that follows September's Officer training: Exec board and Chairs required, nobody else invited.",
  ),
  ask(
    'alumni-dinner',
    'Host the alumni dinner on Saturday, November 21 at 6 PM in the dining hall. It is for our alumni, and both the alumni and the exec board are expected there.',
    { everyone: 'not_invited', required: ['Alumni', ...EXEC] },
    'One event card inviting the Alumni and the Exec board (required) and nobody else.',
  ),
  ask(
    'study-hours',
    'Add study hours on Monday, November 16 from 8 to 10 PM in the library.',
    { everyone: 'optional', required: [] },
    'One event card, optional for everyone; study hours are not only for some members.',
  ),
  ask(
    'risk-training',
    'Put risk management training on the calendar for Thursday, November 19 at 7 PM in the chapter room. It is mandatory for every officer and chair.',
    { everyone: 'not_invited', required: [...EXEC, ...CHAIRS] },
    'One event card: Exec board and Chairs tiers required, nobody else invited.',
  ),
  ask(
    'chairs-meeting',
    'Set up a chairs meeting Tuesday, November 17 at 9 PM on Zoom.',
    { everyone: 'not_invited', required: CHAIRS },
    'One event card for the Chairs tier, required, nobody else invited.',
  ),
  // Written after the prompt was tuned on the ten above, and never tuned
  // on: whether the rules carry to requests they were not shaped by.
  ask(
    'consultant-visit',
    'Our national consultant visits on Wednesday, December 2. Set up a 4 PM meeting with him in the chapter room for the exec board.',
    { everyone: 'not_invited', required: EXEC },
    'One event card for the Exec board, required, nobody else invited.',
  ),
  ask(
    'bonfire',
    'Brotherhood bonfire on Friday, December 4 at 8 PM at the lake. Can you add it?',
    { everyone: 'optional', required: [] },
    'One event card, optional for everyone.',
  ),
  ask(
    'house-walkthrough',
    'Book a house walkthrough for the house manager and the treasurer on Thursday, December 3 at 5 PM at the chapter house.',
    { everyone: 'not_invited', required: ['House Manager', 'Treasurer'] },
    'One event card for the House Manager and Treasurer roles, required, nobody else invited.',
  ),
  ask(
    'composites-retake',
    'Add a composite photos retake on Tuesday, December 1 at 6 PM in the chapter room.',
    { everyone: 'optional', required: [] },
    'One event card, optional for everyone, as the first composite photos were.',
  ),
  ask(
    'mandatory-run',
    'Put the winter philanthropy run on the calendar for Sunday, December 6 at 9 AM at the college track. It is mandatory for the whole chapter.',
    { everyone: 'required', required: [], type: 'Philanthropy' },
    'One event card, the Philanthropy type, required for everyone.',
  ),
];
