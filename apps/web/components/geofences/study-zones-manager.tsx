"use client";

import { describeLoadFailure } from "@repo/hooks/error-copy";
import {
  hasKeptDraft,
  readKeptPanel,
  useKeptDraftKeys,
  writeKeptPanel,
} from "@repo/hooks/kept-drafts";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { StudyZonesGlyph } from "@/components/events/chapter-ops-glyphs";
import {
  useCurrentChapter,
  useDeleteGeofence,
  useGeofences,
  useMyPermissions,
  useUpdateGeofence,
} from "@repo/hooks";
import { can, WEB_ADDRESS_PARAMS } from "@repo/validation";
import {
  closeAddress,
  pushAddress,
  replaceAddress,
} from "@/lib/address/address";
import {
  useAddressParams,
  useDeadAddressParam,
} from "@/lib/address/use-address-params";
import { NewButton } from "@/components/ui/new-button";
import { FOCUS_RING } from "@/components/ui/focus";
import { Badge } from "@/components/ui/badge";
import { useConfirmDialog } from "@/components/shared/confirm-dialog";
import { RowMenu, type RowMenuEntry } from "@/components/shared/row-menu";
import { studyZoneRulesLine } from "@repo/validation";
import {
  geofenceStatusKind,
  geofenceStatusLabel,
} from "@/components/geofences/geofence-status";
import {
  anyReadUncached,
  PermissionsOfflineSurface,
} from "@/components/shared/async-states";
import { NestedError, NestedOffline } from "@/components/shared/nested-states";
import { denseListClassName } from "@/components/shared/table-controls";
import { SectionLabel } from "@/components/shared/section-label";
import { Can } from "@/components/shared/can";
import {
  SubscriptionNotice,
  useGatedDialog,
  useSubscriptionGate,
} from "@/components/shared/subscription-gate";
import { useToast } from "@/lib/hooks/use-toast";
import { useNetwork } from "@/lib/providers/network-provider";
import { asArray, cn, getErrorMessage } from "@/lib/utils";
import { GeofenceRowsSkeleton } from "@/components/geofences/geofences-skeleton";
import { InlineNote } from "@/components/shared/inline-note";
import {
  StudyZoneEditor,
  zoneDraftName,
  type StudyZone,
} from "@/components/geofences/study-zone-editor";

/**
 * The chapter's study zones, inside Chapter settings' Study zones page.
 *
 * It used to be its own route, `/geofences`, which a row on this page linked
 * to: the click left Chapter settings, brought chat back beside it and opened
 * a settings drawer of its own (Paul, 2026-11-12: "I DO NOT WANT" that). The
 * list now lives where the officer is, the way Discord's Server Settings
 * keeps Roles, Emoji and Integrations as lists inside the one settings page.
 * New and Edit open the map editor in place of the page, with a back arrow.
 *
 * Who can manage zones is the page's own Who can section, so the drawer that
 * repeated it is gone.
 */
/** `&zone=<id>`: a study zone's editor, open in place of the page. */
const ZONE_PARAM = WEB_ADDRESS_PARAMS.settings.zone;

export function StudyZonesManager() {
  const { toast } = useToast();
  const { isOffline } = useNetwork();
  // `StudyGeofenceController` carries no `@FreeTier`, so every write here is
  // paid-ops and mirrors the subscription gate (#841). Reads are untouched:
  // the server guard returns early for GET, so a lapsed chapter still sees its
  // zones.
  const gate = useSubscriptionGate();
  const { confirm, confirmDialog } = useConfirmDialog();
  const geofencesQuery = useGeofences();
  const chapterQuery = useCurrentChapter();
  const updateGeofence = useUpdateGeofence();
  const deleteGeofence = useDeleteGeofence();

  const zones = useMemo(
    () => asArray<StudyZone>(geofencesQuery.data),
    [geofencesQuery.data],
  );

  // One editor for New and Edit; `editingId` null is a new zone. Whether it
  // is open belongs to the gate, so a revoke mid-edit closes it.
  const editor = useGatedDialog(gate);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = useMemo(
    () => zones.find((zone) => zone.id === editingId) ?? null,
    [zones, editingId],
  );
  // A zone deleted elsewhere while its editor is open closes the editor,
  // rather than turning it into a blank New study zone.
  const { open: editorOpen, setOpen: setEditorOpen } = editor;
  useEffect(() => {
    if (editorOpen && editingId && !editing) setEditorOpen(false);
  }, [editorOpen, setEditorOpen, editingId, editing]);

  // The New button reads the permission as a boolean: the screen gate below
  // is this file's one `<Can permission="geofences:manage">`, which
  // `can-fallback.spec.tsx` finds by that string.
  const { data: permissionsPayload } = useMyPermissions();
  const canManageZones = can(
    "geofences:manage",
    permissionsPayload?.permissions,
  );

  // The editor the page was left with open (#4593): reopened on its draft
  // once the officer may still open it and, for an edit, the zone is still
  // there. Until then the mark that says so stays.
  const keptKeys = useKeptDraftKeys();
  const editorPanelKey = keptKeys.panel("study-zones");
  const [leftEditor, setLeftEditor] = useState<{ id: string | null } | null>(
    () => {
      const left = readKeptPanel<{ id: string | null }>(editorPanelKey);
      return left && hasKeptDraft(keptKeys.draft(zoneDraftName(left.id)))
        ? left
        : null;
    },
  );
  const zonesLoaded = geofencesQuery.data !== undefined;
  useEffect(() => {
    if (!leftEditor || !canManageZones || !gate.allowed) return;
    if (leftEditor.id !== null) {
      if (!zonesLoaded) return;
      if (!zones.some((zone) => zone.id === leftEditor.id)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- its zone is gone, so there is nothing to reopen
        setLeftEditor(null);
        writeKeptPanel(editorPanelKey, null);
        return;
      }
    }
    setLeftEditor(null);
    setEditingId(leftEditor.id);
    setEditorOpen(true);
  }, [
    leftEditor,
    canManageZones,
    gate.allowed,
    zonesLoaded,
    zones,
    editorPanelKey,
    setEditorOpen,
  ]);
  useEffect(() => {
    if (leftEditor && !editorOpen) return;
    writeKeptPanel(editorPanelKey, editorOpen ? { id: editingId } : null);
  }, [editorPanelKey, editorOpen, editingId, leftEditor]);

  /*
    A zone's editor is `&zone=<id>` (#6049), pushed, so Back closes it,
    Forward or a reload opens it again, and its back arrow closes by the
    address's rule. New study zone is a docked create panel, which has no
    address until #6157 decides those; the editor a page was left with
    (#4593) reopens without one, as Calendar's does.
  */
  const zoneParam = useAddressParams([ZONE_PARAM]).values[ZONE_PARAM];
  const deadZone = useDeadAddressParam(
    ZONE_PARAM,
    zoneParam,
    zonesLoaded && zoneParam !== null && !zones.some((z) => z.id === zoneParam),
  );
  const permissionsLoaded = permissionsPayload !== undefined;
  // Follows `zone=` only when the address moves it, never on a render where
  // the two merely differ: the editor's own close goes Back, which lands a
  // moment later.
  const [zoneWanted, setZoneWanted] = useState(zoneParam);
  const zoneSeen = useRef(zoneParam);
  useEffect(() => {
    if (zoneSeen.current === zoneParam) return;
    zoneSeen.current = zoneParam;
    setZoneWanted(zoneParam);
    if (zoneParam === null && editorOpen && editingId !== null) {
      setEditorOpen(false);
    }
    // Only a move of the address acts here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneParam]);
  // Waits for the zones and the permission, then opens once, for someone
  // who may manage zones; a `zone=` they may not use is taken out.
  useEffect(() => {
    if (!zoneWanted || !zonesLoaded || !permissionsLoaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- acted on once
    setZoneWanted(null);
    if (!zones.some((zone) => zone.id === zoneWanted)) return;
    if (!canManageZones || !gate.allowed) {
      replaceAddress({ [ZONE_PARAM]: null });
      return;
    }
    if (editorOpen && editingId === zoneWanted) return;
    setEditingId(zoneWanted);
    setEditorOpen(true);
    // The setters are stable in what they do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneWanted, zonesLoaded, permissionsLoaded]);

  function openEditor(zone: StudyZone | null) {
    if (zone) pushAddress({ [ZONE_PARAM]: zone.id });
    setEditingId(zone?.id ?? null);
    editor.setOpen(true);
  }

  function onEditorOpenChange(open: boolean) {
    editor.setOpen(open);
    if (!open && editingId !== null) closeAddress([ZONE_PARAM]);
  }

  async function toggleActive(zone: StudyZone) {
    try {
      await updateGeofence.mutateAsync({
        id: zone.id,
        body: { is_active: !zone.is_active },
      });
      toast({
        title: zone.is_active ? "Study zone disabled" : "Study zone enabled",
        description: `${zone.name} is ${
          zone.is_active ? "hidden from" : "available to"
        } study sessions.`,
      });
    } catch (error) {
      toast({
        title: "Couldn't update study zone",
        description: getErrorMessage(error, "Retry in a moment."),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(zone: StudyZone) {
    const confirmed = await confirm({
      title: `Delete "${zone.name}"?`,
      description:
        "Anyone studying there now has their session ended at the next check.",
      confirmLabel: "Delete study zone",
      tone: "destructive",
    });
    if (!confirmed) return;
    try {
      await deleteGeofence.mutateAsync(zone.id);
      toast({
        title: "Study zone deleted",
        description: `${zone.name} was removed.`,
      });
    } catch (error) {
      toast({
        title: "Couldn't delete study zone",
        description: getErrorMessage(error, "Retry in a moment."),
        variant: "destructive",
      });
    }
  }

  const labelId = "settings-module-geofences-zones-label";

  return (
    <section
      id="settings-module-geofences-zones"
      aria-labelledby={labelId}
      className="scroll-mt-16 space-y-4"
    >
      <div className="flex min-h-control-small items-center justify-between gap-3">
        <SectionLabel
          id={labelId}
          count={geofencesQuery.isSuccess ? zones.length : null}
        >
          Zones
        </SectionLabel>
        {canManageZones ? (
          <NewButton
            thing="study zone"
            {...gate.controlProps()}
            onClick={() => openEditor(null)}
          />
        ) : null}
      </div>
      <Can
        permission="geofences:manage"
        deniedFallback={
          <p className="text-sm text-muted-foreground">
            Your role can&apos;t manage study zones. Ask your chapter president
            for access.
          </p>
        }
        fallback={<GeofenceRowsSkeleton className="" />}
        offlineFallback={(retry) => (
          <PermissionsOfflineSurface
            description="Reconnect to check whether you can manage study zones."
            onRetry={retry}
          />
        )}
      >
        {/*
          Permission first, then network, then data: an officer without the
          permission offline is told they can't manage zones, not to
          reconnect to draw one.
        */}
        <div className="@container space-y-4">
          <SubscriptionNotice gate={gate} feature="managing study zones" />

          {deadZone ? (
            <InlineNote>
              That study zone isn&apos;t here anymore. It may have been deleted.
            </InlineNote>
          ) : null}
          {isOffline && anyReadUncached(geofencesQuery) ? (
            <NestedOffline
              sole
              title="Study zones unavailable offline"
              description="Reconnect to draw a zone or change what it earns."
              onRetry={() => {
                void geofencesQuery.refetch();
              }}
            />
          ) : geofencesQuery.isPending ? (
            <GeofenceRowsSkeleton className="" />
          ) : geofencesQuery.isError ? (
            <NestedError
              sole
              title="Couldn't load study zones"
              description={describeLoadFailure(geofencesQuery.error)}
              onRetry={() => void geofencesQuery.refetch()}
            />
          ) : zones.length === 0 ? (
            <InlineNote>
              No study zones yet. Add the library or wherever the chapter
              studies, and members can start a session there.
            </InlineNote>
          ) : (
            <ul aria-label="Study zones" className={denseListClassName}>
              {zones.map((zone) => {
                const blocked = !gate.allowed;
                const describedBy = gate.controlProps()["aria-describedby"];
                const entries: RowMenuEntry[] = [
                  {
                    type: "item",
                    key: "edit",
                    label: "Edit",
                    icon: Pencil,
                    disabled: blocked,
                    describedBy,
                    onSelect: () => openEditor(zone),
                  },
                  {
                    type: "item",
                    key: "active",
                    label: zone.is_active ? "Turn off" : "Turn on",
                    icon: zone.is_active ? PowerOff : Power,
                    disabled: blocked,
                    describedBy,
                    onSelect: () => void toggleActive(zone),
                  },
                  { type: "separator", key: "sep" },
                  {
                    type: "item",
                    key: "delete",
                    label: "Delete",
                    icon: Trash2,
                    destructive: true,
                    disabled: blocked,
                    describedBy,
                    onSelect: () => void handleDelete(zone),
                  },
                ];
                return (
                  <RowMenu
                    key={zone.id}
                    entries={entries}
                    label={`More for ${zone.name}`}
                  >
                    {(menuButton) => (
                      // The row opens the zone, as a row in iOS Settings or
                      // Discord's role list does; turning it off and deleting
                      // it sit on the ⋯ menu and right-click, out of the way.
                      // PATCH and DELETE sit behind the same guard as create,
                      // so they follow the same gate.
                      <li className="group flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditor(zone)}
                          {...gate.controlProps()}
                          className={cn(
                            "flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-card-hover disabled:cursor-not-allowed",
                            FOCUS_RING,
                          )}
                        >
                          <StudyZonesGlyph
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-muted-foreground"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-foreground">
                              {zone.name}
                            </span>
                            <span className="block truncate text-caption text-muted-foreground">
                              {studyZoneRulesLine(zone)}
                            </span>
                          </span>
                          {zone.is_active ? null : (
                            // Only the exception is marked: a list where
                            // every row says Active says nothing.
                            <Badge
                              className="shrink-0"
                              variant={geofenceStatusKind(false)}
                            >
                              {geofenceStatusLabel(false)}
                            </Badge>
                          )}
                        </button>
                        {menuButton}
                      </li>
                    )}
                  </RowMenu>
                );
              })}
            </ul>
          )}

          <StudyZoneEditor
            open={editor.open}
            onOpenChange={onEditorOpenChange}
            zone={editing}
            zones={zones}
            campus={chapterQuery.data?.university ?? null}
            gate={gate}
            contentProps={editor.contentProps}
          />
          {confirmDialog}
        </div>
      </Can>
    </section>
  );
}
