import type { ScriptedHandler } from './scripted-language-model';

/**
 * The scripted adapter's reply for `tasks.extension-reason` (#6096), so
 * asking for more time can be walked locally with no key
 * (`AI_ENABLED=true AI_PROVIDER=scripted`).
 *
 * It is not a model and proves nothing about one: a reason of four words or
 * more is valid, anything shorter invalid, so both paths can be seen.
 */
const FENCED = /<reason>\n([\s\S]*)\n<\/reason>/;

export function scriptedExtensionVerdict(reason: string): {
  verdict: 'valid' | 'invalid';
  note: string;
} {
  const words = reason.trim().split(/\s+/).filter(Boolean).length;
  return words >= 4
    ? { verdict: 'valid', note: 'Gives a concrete reason.' }
    : { verdict: 'invalid', note: 'Gives no real reason.' };
}

export const scriptedTaskExtensionReason: ScriptedHandler = (request) => {
  const prompt = request.messages.at(-1)?.content ?? '';
  const reason = FENCED.exec(prompt)?.[1] ?? '';
  const output = scriptedExtensionVerdict(reason);
  return { text: JSON.stringify(output), object: output };
};
