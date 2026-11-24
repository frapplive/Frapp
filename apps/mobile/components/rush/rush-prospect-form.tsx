import { Alert, Linking } from "react-native";
import { useCandidateForm } from "@repo/hooks";
import { ListRow, ListSection, SectionHeader } from "@/components/list-section";

/**
 * What a prospect gave on the chapter's interest form (#5977): how to reach
 * them and their answers, for `rush:view`, in the order web's prospect panel
 * shows them. A tap on the email or phone opens Mail or Phone. Nothing for a
 * prospect a member added by hand.
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
  // A phone with no mail app refuses a mailto: link; say so rather than
  // leaving the tap dead.
  const open = (url: string) =>
    void Linking.openURL(url).catch(() =>
      Alert.alert("Couldn't open that", "Copy it from here instead."),
    );
  return (
    <>
      <SectionHeader>Interest form</SectionHeader>
      <ListSection>
        <ListRow
          label="Email"
          value={submission.email}
          accessibilityHint="Opens Mail."
          onPress={() => open(`mailto:${submission.email}`)}
        />
        {submission.phone ? (
          <ListRow
            label="Phone"
            value={submission.phone}
            accessibilityHint="Calls or texts them."
            onPress={() =>
              open(`tel:${submission.phone?.replace(/[^\d+]/g, "")}`)
            }
          />
        ) : null}
        {submission.class_year ? (
          <ListRow
            label="Class year"
            variant="detail"
            value={String(submission.class_year)}
          />
        ) : null}
        {submission.source_label ? (
          <ListRow
            label="QR code"
            variant="detail"
            value={submission.source_label}
          />
        ) : null}
        {submission.referrer_text ? (
          <ListRow
            label="Referred by"
            variant="detail"
            value={
              submission.referrer_suggestion?.display_name ??
              submission.referrer_text
            }
          />
        ) : null}
        {submission.answers.map((line, index) => (
          <ListRow
            key={index}
            label={line.question}
            variant="detail"
            value={line.answer}
          />
        ))}
      </ListSection>
    </>
  );
}
