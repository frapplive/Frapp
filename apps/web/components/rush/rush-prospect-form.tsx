"use client";

import { useCandidateForm } from "@repo/hooks";
import { FieldRow, StaticValue } from "@/components/tasks/task-panel";

/**
 * What a prospect gave on the chapter's interest form (#5977): how to reach
 * them and their answers, for `rush:view` (`ifc-recruitment.md` § Permission
 * map, "form answers"). Only for a prospect whose own form created them;
 * nothing for one a member added by hand.
 */
export function RushProspectForm({
  candidateId,
  fromForm,
}: {
  candidateId: string;
  fromForm: boolean;
}) {
  const form = useCandidateForm(candidateId, { enabled: fromForm });
  const submission = form.data;
  if (!fromForm || !submission) return null;
  return (
    <dl className="space-y-1 border-t border-border pt-4">
      <FieldRow label="Email">
        <StaticValue>
          <a
            href={`mailto:${submission.email}`}
            className="underline underline-offset-2"
          >
            {submission.email}
          </a>
        </StaticValue>
      </FieldRow>
      {submission.phone ? (
        <FieldRow label="Phone">
          <StaticValue>
            <a
              href={`tel:${submission.phone}`}
              className="underline underline-offset-2"
            >
              {submission.phone}
            </a>
          </StaticValue>
        </FieldRow>
      ) : null}
      {submission.class_year ? (
        <FieldRow label="Class year">
          <StaticValue>{String(submission.class_year)}</StaticValue>
        </FieldRow>
      ) : null}
      {submission.source_label ? (
        <FieldRow label="QR code">
          <StaticValue>{submission.source_label}</StaticValue>
        </FieldRow>
      ) : null}
      {submission.referrer_text ? (
        <FieldRow label="Referred by">
          <StaticValue>
            {submission.referrer_suggestion?.display_name ??
              submission.referrer_text}
          </StaticValue>
        </FieldRow>
      ) : null}
      {submission.answers.map((line) => (
        <FieldRow key={line.question} label={line.question} alignTop>
          <StaticValue>{line.answer}</StaticValue>
        </FieldRow>
      ))}
    </dl>
  );
}
