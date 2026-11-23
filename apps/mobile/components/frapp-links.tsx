import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { randomClientId, statusOf } from "@repo/api-sdk";
import {
  selectDownloadUrl,
  useDocumentDownloadUrl,
  useFrappLinkCandidates,
  useFrappLinks,
} from "@repo/hooks";
import {
  FRAPP_LINK_COPY,
  FRAPP_LINK_TITLE_MAX,
  FRAPP_LINKS_MAX,
  frappLinkKey,
  frappLinkRow,
  frappLinksHold,
  frappLinkCandidateDetail,
  frappLinkUrlProblem,
  frappWebLinkTitle,
  normalizeFrappLinkUrl,
  parseFrappAppLink,
  withFrappLink,
  type FrappLink,
  type FrappLinkKind,
  type FrappLinkTarget,
  type FrappRecordLinkKind,
} from "@repo/validation";
import type { SignetTokens } from "@repo/theme/signet";
import { IconButton } from "@/components/icon-button";
import { CloseGlyph, LinkGlyph } from "@/components/control-glyphs";
import { TextAction } from "@/components/events/event-excuses";
import { DocumentsGlyph, MinutesGlyph } from "@/components/more/more-glyphs";
import { ChatGlyph, EventsGlyph } from "@/components/tab-glyphs";
import { sheetFieldStyles } from "@/components/sheet-scaffold";
import { useChapterBranding } from "@/lib/chapter-branding";
import { useKeepAboveKeyboard } from "@/lib/keep-above-keyboard";
import { webAppOrigin } from "@/lib/onboarding/chapter-wizard/invite-link";
import { typeRole, useFrappTheme } from "@/lib/theme";

/**
 * A list of Frapp links (`spec/behavior/frapp-links.md`), web's
 * `components/shared/frapp-links.tsx` on the phone: an event's attachments
 * and a task's Attached row draw these rows and this picker.
 *
 * A record row reads its name live for the member looking, or says "You
 * don't have access" or "Removed" and doesn't open. A document opens to read
 * in the in-app browser, as Documents opens one; minutes, an event and a
 * chat message open their own screens; a web link opens in the browser.
 */

function KindGlyph({ kind, color }: { kind: FrappLinkKind; color: string }) {
  switch (kind) {
    case "link":
      return <LinkGlyph color={color} />;
    case "document":
      return <DocumentsGlyph color={color} size={20} />;
    case "minutes":
      return <MinutesGlyph color={color} size={20} />;
    case "event":
      return (
        <EventsGlyph focused={false} accent={color} muted={color} size={20} />
      );
    case "message":
      return (
        <ChatGlyph focused={false} accent={color} muted={color} size={20} />
      );
  }
}

export type FrappLinksChange = (
  update: (current: FrappLink[]) => FrappLink[],
) => void;

/**
 * Open a link where it belongs. One browser at a time: iOS refuses a second
 * over the first. A document deleted since it was attached says so.
 */
function useOpenFrappLink() {
  const router = useRouter();
  const signedLinks = useDocumentDownloadUrl();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const presenting = useRef(false);

  async function browse(url: string) {
    presenting.current = true;
    try {
      await WebBrowser.openBrowserAsync(url);
    } finally {
      presenting.current = false;
    }
  }

  async function open(link: FrappLink) {
    if (presenting.current || openingId) return;
    setProblem(null);
    switch (link.kind) {
      case "link":
        try {
          await browse(link.url);
        } catch {
          setProblem("Couldn't open that link. Try again in a moment.");
        }
        return;
      case "minutes":
        router.push({
          pathname: "/minutes-details",
          params: { id: link.meeting_id },
        });
        return;
      case "event":
        router.push({
          pathname: "/event-details",
          params: { id: link.event_id },
        });
        return;
      case "message":
        router.push({
          pathname: "/chat-thread",
          params: {
            channelId: link.channel_id,
            focusMessageId: link.message_id,
          },
        });
        return;
      case "document":
        setOpeningId(link.id);
        try {
          const url = selectDownloadUrl(
            await signedLinks.mutateAsync(link.document_id),
          );
          if (!url) throw new Error("No link to the file came back.");
          await browse(url);
        } catch (error) {
          setProblem(
            statusOf(error) === 404
              ? "That file is gone from Chapter Files. Someone removed it after it was attached."
              : "Couldn't open that file. Try again in a moment.",
          );
        } finally {
          setOpeningId(null);
        }
    }
  }
  return { open, openingId, problem };
}

export function FrappLinkRows({
  links,
  canEdit,
  onChange,
}: {
  links: readonly FrappLink[];
  canEdit: boolean;
  onChange: FrappLinksChange;
}) {
  const { tokens } = useFrappTheme();
  const styles = createStyles(tokens);
  const muted = tokens.color.text.mutedForeground;
  const { resolved } = useFrappLinks(links);
  const { open, openingId, problem } = useOpenFrappLink();
  if (links.length === 0) return null;
  return (
    <>
      {links.map((link, index) => {
        const row = frappLinkRow(
          link,
          link.kind === "link" ? undefined : resolved.get(frappLinkKey(link)),
        );
        const disabled = !row.opens || openingId !== null;
        return (
          <View key={link.id} style={styles.line}>
            <Pressable
              accessibilityRole={link.kind === "link" ? "link" : "button"}
              accessibilityLabel={
                row.detail ? `${row.name}, ${row.detail}` : row.name
              }
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => void open(link)}
              style={({ pressed }) => [
                styles.row,
                pressed ? styles.pressed : null,
              ]}
            >
              {openingId === link.id ? (
                <ActivityIndicator size="small" color={muted} />
              ) : (
                <KindGlyph kind={link.kind} color={muted} />
              )}
              {/* The name over its quiet line, so a long name ("Chapter
                  Meeting Minutes, Week 9") keeps the words that tell it
                  apart at phone width. */}
              <View style={styles.textColumn}>
                <Text
                  style={[
                    styles.text,
                    !row.opens || row.pending ? styles.textMuted : null,
                  ]}
                  numberOfLines={2}
                >
                  {row.name}
                </Text>
                {row.detail ? (
                  <Text style={styles.caption} numberOfLines={1}>
                    {row.detail}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            {canEdit ? (
              <IconButton
                label={
                  row.opens
                    ? FRAPP_LINK_COPY.remove(row.name)
                    : FRAPP_LINK_COPY.removeUnnamed(
                        FRAPP_LINK_COPY.kindNames[
                          link.kind as FrappRecordLinkKind
                        ],
                        index + 1,
                      )
                }
                onPress={() =>
                  onChange((current) =>
                    current.filter((entry) => entry.id !== link.id),
                  )
                }
              >
                <CloseGlyph color={muted} />
              </IconButton>
            ) : null}
          </View>
        );
      })}
      {problem ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {problem}
        </Text>
      ) : null}
    </>
  );
}

/**
 * The attach picker, web's on the phone: one field searches Chapter Files,
 * minutes and the calendar, and takes a pasted address. A pasted Frapp
 * address attaches the record it names; any other http(s) address attaches
 * as a web link, with an optional title.
 */
export function FrappLinkPicker({
  links,
  documentsOn = null,
  onChange,
  onDone,
}: {
  links: readonly FrappLink[];
  documentsOn?: boolean | null;
  onChange: FrappLinksChange;
  onDone: () => void;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  const muted = tokens.color.text.mutedForeground;
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [focused, setFocused] = useState<"search" | "title" | null>(null);
  // Low on the screen: the field and the first matches keep above the keyboard.
  const { hold, ...keep } = useKeepAboveKeyboard();
  const typed = text.trim();
  const looksLikeAddress = /^(https?:\/\/|www\.)/i.test(typed);
  const appTarget = useMemo(
    // This build's own web origin too, as chat's links read (a staging
    // build's links name staging's records).
    () =>
      looksLikeAddress ? parseFrappAppLink(typed, [webAppOrigin()]) : null,
    [looksLikeAddress, typed],
  );
  const { candidates, isLoading, isError } = useFrappLinkCandidates(
    looksLikeAddress ? "" : typed,
    { enabled: !looksLikeAddress, documents: documentsOn !== false },
  );
  const offered = candidates.filter(
    (candidate) => !frappLinksHold(links, candidate.target),
  );

  function attach(target: FrappLinkTarget) {
    onChange((current) => withFrappLink(current, target, randomClientId));
    onDone();
  }

  function attachAddress() {
    if (appTarget) {
      if (frappLinksHold(links, appTarget)) {
        setProblem("That is attached already.");
        return;
      }
      attach(appTarget);
      return;
    }
    const refused = frappLinkUrlProblem(typed);
    const url = normalizeFrappLinkUrl(typed);
    if (refused || !url) {
      setProblem(refused ?? "Paste a web address.");
      return;
    }
    if (frappLinksHold(links, { kind: "link", url })) {
      setProblem("That is attached already.");
      return;
    }
    onChange((current) =>
      withFrappLink(
        current,
        { kind: "link", url, title: frappWebLinkTitle(title, url) },
        randomClientId,
      ),
    );
    onDone();
  }

  const field = (which: "search" | "title", input: ReactNode): ReactNode => (
    <View style={[styles.ring, focused === which ? styles.ringActive : null]}>
      {input}
    </View>
  );

  return (
    <View ref={hold} onLayout={keep.onLayout} style={styles.form}>
      {field(
        "search",
        <TextInput
          value={text}
          onChangeText={(next) => {
            setText(next);
            setProblem(null);
            keep.onType();
          }}
          onFocus={() => {
            setFocused("search");
            keep.onFocus();
          }}
          onBlur={() => {
            setFocused(null);
            keep.onBlur();
          }}
          placeholder={FRAPP_LINK_COPY.pickerPlaceholder}
          placeholderTextColor={tokens.color.text.muted}
          accessibilityLabel={FRAPP_LINK_COPY.attach}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType={looksLikeAddress ? "done" : "search"}
          onSubmitEditing={() => {
            if (looksLikeAddress) attachAddress();
          }}
          style={[
            styles.field,
            focused === "search" ? styles.fieldFocused : null,
            problem ? styles.fieldError : null,
          ]}
        />,
      )}
      {looksLikeAddress && !appTarget
        ? field(
            "title",
            <TextInput
              value={title}
              onChangeText={(next) => {
                setTitle(next);
                keep.onType();
              }}
              onFocus={() => {
                setFocused("title");
                keep.onFocus();
              }}
              onBlur={() => {
                setFocused(null);
                keep.onBlur();
              }}
              placeholder="Title (optional)"
              placeholderTextColor={tokens.color.text.muted}
              accessibilityLabel="Title"
              maxLength={FRAPP_LINK_TITLE_MAX}
              returnKeyType="done"
              onSubmitEditing={attachAddress}
              style={[
                styles.field,
                focused === "title" ? styles.fieldFocused : null,
              ]}
            />,
          )
        : null}
      {problem ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {problem}
        </Text>
      ) : null}
      {looksLikeAddress ? null : isLoading ? (
        <Text style={styles.caption}>Loading…</Text>
      ) : isError && offered.length === 0 ? (
        <Text style={styles.caption}>{FRAPP_LINK_COPY.loadFailed}</Text>
      ) : offered.length === 0 ? (
        <Text style={styles.caption}>{FRAPP_LINK_COPY.noMatches}</Text>
      ) : (
        offered.map((candidate) => (
          <Pressable
            key={frappLinkKey(candidate.target)}
            accessibilityRole="button"
            accessibilityLabel={`${FRAPP_LINK_COPY.attach} ${candidate.name}`}
            onPress={() => attach(candidate.target)}
            style={({ pressed }) => [
              styles.row,
              pressed ? styles.pressed : null,
            ]}
          >
            <KindGlyph kind={candidate.kind} color={muted} />
            <View style={styles.textColumn}>
              <Text style={styles.text} numberOfLines={2}>
                {candidate.name}
              </Text>
              <Text style={styles.caption} numberOfLines={1}>
                {frappLinkCandidateDetail(candidate.kind, candidate.date)}
              </Text>
            </View>
          </Pressable>
        ))
      )}
      <View style={styles.actions}>
        {looksLikeAddress ? (
          <TextAction
            label={appTarget ? FRAPP_LINK_COPY.attach : "Add link"}
            color={accent}
            onPress={attachAddress}
          />
        ) : null}
        <TextAction label="Cancel" onPress={onDone} />
      </View>
    </View>
  );
}

/**
 * Rows plus the quiet Attach action and its picker, for a list edited in
 * place. Full, the action gives way to a line saying so.
 */
export function FrappLinksEditor({
  links,
  canEdit,
  documentsOn = null,
  onChange,
}: {
  links: readonly FrappLink[];
  canEdit: boolean;
  documentsOn?: boolean | null;
  onChange: FrappLinksChange;
}) {
  const { tokens } = useFrappTheme();
  const { accent } = useChapterBranding();
  const styles = createStyles(tokens, accent);
  const [picking, setPicking] = useState(false);
  const full = links.length >= FRAPP_LINKS_MAX;
  return (
    <>
      <FrappLinkRows links={links} canEdit={canEdit} onChange={onChange} />
      {canEdit && full ? (
        <Text style={styles.caption}>{FRAPP_LINK_COPY.full}</Text>
      ) : null}
      {canEdit && !full && picking ? (
        <FrappLinkPicker
          links={links}
          documentsOn={documentsOn}
          onChange={onChange}
          onDone={() => setPicking(false)}
        />
      ) : null}
      {canEdit && !full && !picking ? (
        <View style={styles.actions}>
          <TextAction
            label={FRAPP_LINK_COPY.attach}
            color={accent}
            onPress={() => setPicking(true)}
          />
        </View>
      ) : null}
    </>
  );
}

function createStyles(tokens: SignetTokens, accent?: string) {
  const fieldStyles = sheetFieldStyles(
    tokens,
    accent ?? tokens.color.text.foreground,
  );
  return StyleSheet.create({
    line: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    row: {
      flex: 1,
      minHeight: tokens.touch.minimum,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
    },
    textColumn: {
      flex: 1,
      gap: 2,
      paddingVertical: tokens.spacing.xs,
    },
    text: {
      ...typeRole(tokens.typography.role.body),
      color: tokens.color.text.foreground,
    },
    textMuted: {
      color: tokens.color.text.mutedForeground,
    },
    caption: {
      flexShrink: 1,
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.text.mutedForeground,
    },
    error: {
      ...typeRole(tokens.typography.role.caption),
      color: tokens.color.semantic.destructive,
    },
    form: {
      gap: tokens.spacing.sm,
    },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: tokens.spacing.lg,
    },
    pressed: {
      opacity: 0.7,
    },
    ring: fieldStyles.ring,
    ringActive: fieldStyles.ringActive,
    field: fieldStyles.field,
    fieldFocused: fieldStyles.fieldFocused,
    fieldError: {
      borderColor: tokens.color.semantic.destructive,
    },
  });
}
