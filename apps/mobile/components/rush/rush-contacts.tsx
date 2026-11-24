import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRushContacts, type RushContact } from "@repo/hooks";
import { rushLocalDayKey } from "@repo/validation";
import { SignetTokens } from "@repo/theme/signet";
import { InlineNote } from "@/components/inline-note";
import { ListSection, SectionHeader } from "@/components/list-section";
import { SkeletonRegion, SkeletonText } from "@/components/state-block";
import { rushContactLine } from "@repo/hooks";
import { typeRole, useFrappTheme } from "@/lib/theme";

/** How many contacts show before "Show all". */
export const RUSH_CONTACTS_SHOWN = 5;

/**
 * A prospect's logged contacts (#5934), newest first: "Texted · Tue · by
 * Chris", and the note under it for a reader who may see it (the API leaves
 * it out otherwise). The newest {@link RUSH_CONTACTS_SHOWN} show, then Show
 * all, so a prospect worked all week doesn't push the notes off the screen;
 * Pipedrive's and HubSpot's activity timelines open on the latest few the
 * same way. A prospect nobody has reached has no section at all: the screen's
 * "No contact logged yet" already says so, so the read is skipped.
 */
export function RushContacts({
  candidateId,
  hasContacts,
}: {
  candidateId: string;
  /** The prospect has a last contact, so there is a history to read. */
  hasContacts: boolean;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const contacts = useRushContacts(candidateId, { enabled: hasContacts });
  const [all, setAll] = useState(false);
  if (!hasContacts) return null;

  const heading = <SectionHeader>Contacts</SectionHeader>;
  if (contacts.isPending) {
    return (
      <>
        {heading}
        <SkeletonRegion label="Loading contacts" flush>
          <ListSection>
            {[0, 1].map((index) => (
              <View key={index} style={styles.row}>
                <SkeletonText role={tokens.typography.role.body} width="60%" />
              </View>
            ))}
          </ListSection>
        </SkeletonRegion>
      </>
    );
  }
  if (contacts.isError && !contacts.data) {
    return (
      <>
        {heading}
        <InlineNote
          tone="warning"
          action={{
            label: "Try again",
            onPress: () => void contacts.refetch(),
          }}
        >
          {"Couldn't load contacts."}
        </InlineNote>
      </>
    );
  }
  const list = contacts.data ?? [];
  if (list.length === 0) return null;
  const today = rushLocalDayKey();
  const shown = all ? list : list.slice(0, RUSH_CONTACTS_SHOWN);
  const more = list.length - shown.length;
  return (
    <>
      {heading}
      <ListSection>
        {shown.map((contact) => (
          <ContactRow key={contact.id} contact={contact} today={today} />
        ))}
      </ListSection>
      {more > 0 ? (
        <InlineNote action={{ label: "Show all", onPress: () => setAll(true) }}>
          {`${more} more.`}
        </InlineNote>
      ) : null}
    </>
  );
}

function ContactRow({
  contact,
  today,
}: {
  contact: RushContact;
  today: string;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const line = rushContactLine(contact, today);
  return (
    <View
      accessible
      accessibilityLabel={contact.note ? `${line}. ${contact.note}` : line}
      style={styles.row}
    >
      <Text style={styles.line}>{line}</Text>
      {contact.note ? <Text style={styles.note}>{contact.note}</Text> : null}
    </View>
  );
}

function createStyles(tokens: SignetTokens) {
  return StyleSheet.create({
    row: {
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      gap: tokens.spacing.xs,
      minHeight: tokens.touch.minimum,
      justifyContent: "center",
    },
    line: {
      ...typeRole(tokens.typography.role.label),
      color: tokens.color.text.foreground,
    },
    note: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.mutedForeground,
    },
  });
}
