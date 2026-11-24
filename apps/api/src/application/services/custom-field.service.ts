import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ChapterCustomField,
  CustomFieldVisibility,
  MemberCustomFieldValue,
} from '#domain/entities/chapter-custom-field.entity';
import {
  CUSTOM_FIELD_REPOSITORY,
  CustomFieldKeyConflictError,
  type ICustomFieldRepository,
} from '#domain/repositories/custom-field.repository.interface';
import {
  checkCustomFieldValue,
  PROFILE_OWNED_CUSTOM_FIELD_KEYS,
  type CreateCustomField,
  type UpdateCustomField,
} from '@repo/validation';
import { normalizePhone } from '@repo/formatting';
import {
  ChapterAuditLogService,
  type AuditDiff,
} from './chapter-audit-log.service';

/**
 * What `create` and `update` accept.
 *
 * Reused from `@repo/validation` rather than restated: `CreateCustomFieldSchema`
 * is what the web Fields tab already validates its POST body with, so binding
 * the service to the same declaration is what keeps the client's idea of the
 * payload and the server's from drifting. The interface layer's
 * `CreateCustomFieldDto` / `UpdateCustomFieldDto` remain the request-time
 * class-validator surface — the application layer may not import them
 * (dependency-cruiser `api-application-not-to-interface`), and
 * `CustomFieldController` is where the two meet. That call site checks
 * assignability, which is **one-directional**: it catches a field these types
 * require that a DTO stopped supplying, and it does not catch a field added to
 * a DTO and never added to the schema — that one validates on the wire and is
 * silently dropped before it reaches this service. Widen the schema and the DTO
 * together.
 */
export type CreateCustomFieldInput = CreateCustomField;
export type UpdateCustomFieldInput = UpdateCustomField;

/**
 * `chapter_audit_log.target_type` for every row this service writes. Paired
 * with the field id as `target_id`, it is what lets the audit log filter by
 * entity.
 */
const AUDIT_TARGET_TYPE = 'chapter_custom_field';

/**
 * One of the chapter's fields as its own member sees it on their profile
 * (#581): the definition they need to draw the right control, and their value.
 * Carries every tier, `exec` and `president` included, because a member always
 * reads and writes their own values; who *else* sees each one is the
 * `visibility` the form shows beside it.
 */
export type OwnCustomField = {
  field_id: string;
  key: string;
  label: string;
  type: ChapterCustomField['type'];
  visibility: CustomFieldVisibility;
  required: boolean;
  /** A `select` field's choices; null for every other type. */
  choices: string[] | null;
  /** A `text` field's own length cap, when it sets one. */
  max_length: number | null;
  value: string | null;
};

/** One value a member sends for one of their fields; null or "" clears it. */
export type OwnCustomFieldValueInput = {
  field_id: string;
  value: string | null;
};

/**
 * CRUD over `chapter_custom_fields`, scoped to the active chapter (Settings →
 * Fields). Part of the settings family: every mutation appends a
 * `chapter_audit_log` row (mirrored to `#chapter-audit` by the ChatBridgeWorker,
 * ADR-08) like the other audited settings saves. The configured `visibility` /
 * `sensitive` flags are stored here and enforced server-side by
 * `findVisibleValuesForMember` when the member directory renders values.
 */
@Injectable()
export class CustomFieldService {
  constructor(
    @Inject(CUSTOM_FIELD_REPOSITORY)
    private readonly fields: ICustomFieldRepository,
    private readonly auditLog: ChapterAuditLogService,
  ) {}

  async findByChapter(chapterId: string): Promise<ChapterCustomField[]> {
    return this.fields.findByChapter(chapterId);
  }

  /**
   * Return a member's custom-field values, restricted to the fields whose
   * `visibility` is in `allowed` (Chunk 09 — the member directory renders these
   * with server-side visibility enforcement). Starting from the (already
   * visibility-filtered) definitions means out-of-tier and `sensitive` field
   * values are never even looked up, so they cannot leak. Fields with no value
   * set for this member are returned with `value: null`; the directory leaves
   * those out (`spec/behavior/members.md` § Custom Fields, #1749).
   */
  async findVisibleValuesForMember(
    chapterId: string,
    memberId: string,
    allowed: Set<CustomFieldVisibility>,
  ): Promise<MemberCustomFieldValue[]> {
    if (allowed.size === 0) return [];

    const defs = await this.fields.findByVisibility(
      chapterId,
      Array.from(allowed),
    );
    if (defs.length === 0) return [];

    // Restrict the value lookup to the already visibility-filtered field IDs so
    // out-of-tier / `sensitive` values are never even selected server-side —
    // not merely dropped after the fact (spec/behavior/members.md: values are
    // queried against the allowed tiers, never post-fetch scrubbed).
    const visibleFieldIds = defs.map((def) => def.id);
    const values = await this.fields.findValuesForMember(
      memberId,
      visibleFieldIds,
    );

    const valueByFieldId = new Map(
      values.map((row) => [row.field_id, row.value]),
    );

    return defs.map((def) => ({
      field_id: def.id,
      key: def.key,
      label: def.label,
      type: def.type,
      visibility: def.visibility,
      value: valueByFieldId.get(def.id) ?? null,
    }));
  }

  /**
   * Field ids + visibility for a chapter's fields whose `visibility` is in
   * `allowed`, with no value lookup — the search path (#579/#588) needs the
   * visibility tag alongside each id to scope `self`-tier matches to one
   * member, which {@link findVisibleValuesForMember}'s single-member shape
   * doesn't carry.
   */
  async findFieldIdsByVisibility(
    chapterId: string,
    allowed: Set<CustomFieldVisibility>,
  ): Promise<{ id: string; visibility: CustomFieldVisibility }[]> {
    if (allowed.size === 0) return [];
    return this.fields.findIdsByVisibility(chapterId, Array.from(allowed));
  }

  /**
   * Raw `member_custom_field_values` rows for a set of field ids, across
   * every member holding one — the caller (search) already restricted
   * `fieldIds` to what the requesting viewer may see via
   * {@link findFieldIdsByVisibility}, so this performs no visibility check of
   * its own.
   */
  async findValuesByFieldIds(
    fieldIds: string[],
  ): Promise<{ member_id: string; field_id: string; value: string | null }[]> {
    return this.fields.findValuesByFieldIds(fieldIds);
  }

  /**
   * Every field the chapter keeps on a member, with that member's own value
   * (#581), for the member themselves to read and edit. Leaves out the seeded
   * fields the profile already owns (`PROFILE_OWNED_CUSTOM_FIELD_KEYS`).
   *
   * Callers pass the caller's own membership id only: this reads every tier,
   * so it is never a path to another member's values.
   */
  async findOwnFields(
    chapterId: string,
    memberId: string,
  ): Promise<OwnCustomField[]> {
    const defs = await this.ownEditableFields(chapterId);
    if (defs.length === 0) return [];
    const values = await this.fields.findValuesForMember(
      memberId,
      defs.map((def) => def.id),
    );
    const valueByFieldId = new Map(
      values.map((row) => [row.field_id, row.value]),
    );
    return defs.map((def) => toOwnField(def, valueByFieldId.get(def.id)));
  }

  /**
   * Set or clear the caller's own values (#581). Each value is checked against
   * its field's type and `required` (`checkCustomFieldValue`, the rule both
   * forms check too); one refused value refuses the whole save, so a save
   * never lands half-done. A required field can't be cleared once it has a
   * value, and clearing one that has none is a no-op.
   *
   * Own values only, by construction: `memberId` is the caller's membership
   * from `ChapterGuard`, never a request parameter. Every write is one
   * upsert, a cleared field stored as null, so a save lands whole or not at
   * all. Logged as `member_custom_fields_updated` naming the fields that
   * changed and never their values, since the chapter's Logs are read by
   * officers a sensitive field's tier may exclude.
   */
  async updateOwnValues(
    chapterId: string,
    memberId: string,
    actorUserId: string,
    entries: OwnCustomFieldValueInput[],
  ): Promise<OwnCustomField[]> {
    const defs = await this.ownEditableFields(chapterId);
    const defById = new Map(defs.map((def) => [def.id, def]));

    const seen = new Set<string>();
    const pairs: { def: ChapterCustomField; value: string | null }[] = [];
    for (const entry of entries) {
      if (seen.has(entry.field_id)) {
        throw new BadRequestException('Each field may appear once per save');
      }
      seen.add(entry.field_id);
      const def = defById.get(entry.field_id);
      if (!def) {
        throw new BadRequestException(
          "That field isn't one of your chapter's profile fields",
        );
      }
      pairs.push({ def, value: entry.value });
    }

    // Every field's stored value, read once: it decides whether a required
    // field may stay empty, and the answer is built from it after the write.
    const stored = defs.length
      ? await this.fields.findValuesForMember(
          memberId,
          defs.map((def) => def.id),
        )
      : [];
    const valueByFieldId = new Map(
      stored.map((row) => [row.field_id, row.value]),
    );
    const storedBefore = new Map(valueByFieldId);

    const rows: {
      chapter_id: string;
      member_id: string;
      field_id: string;
      value: string | null;
    }[] = [];
    for (const { def, value } of pairs) {
      const before = valueByFieldId.get(def.id) ?? null;
      const blank = (value ?? '').trim() === '';
      if (blank && def.required && before === null) continue;
      const checked = checkCustomFieldValue(def, value);
      if (!checked.ok) throw new BadRequestException(checked.message);
      // Stored E.164 when it is a whole number, as the profile's own Phone
      // is (#5798), so every screen formats it alike. A cleared field is
      // stored as null in the same write, so a save is one statement.
      const next =
        checked.value !== null && def.type === 'phone'
          ? normalizePhone(checked.value)
          : checked.value;
      if (next === before) continue;
      rows.push({
        chapter_id: chapterId,
        member_id: memberId,
        field_id: def.id,
        value: next,
      });
    }

    if (rows.length > 0) {
      await this.fields.upsertValues(rows);
      for (const row of rows) valueByFieldId.set(row.field_id, row.value);
      // Which fields changed, never their values: a sensitive field's value
      // must not reach the officers who read Logs when its tier excludes
      // them. Each key is a changed field, `{ set }` before and after.
      const diff: AuditDiff = {};
      for (const row of rows) {
        const def = defById.get(row.field_id);
        if (!def) continue;
        diff[def.key] = {
          from: { set: (storedBefore.get(row.field_id) ?? null) !== null },
          to: { set: row.value !== null },
        };
      }
      await this.auditLog.record({
        chapterId,
        actorUserId,
        action: 'member_custom_fields_updated',
        targetType: 'member',
        targetId: memberId,
        diff,
      });
    }
    return defs.map((def) => toOwnField(def, valueByFieldId.get(def.id)));
  }

  async create(
    chapterId: string,
    actorUserId: string,
    dto: CreateCustomFieldInput,
  ): Promise<ChapterCustomField> {
    // Major and Graduation year are the profile's own fields (#581): a field
    // keyed for them would be one no member is ever asked for.
    if (PROFILE_OWNED_CUSTOM_FIELD_KEYS.includes(dto.key)) {
      throw new BadRequestException(
        'Major and graduation year are already on every profile. Name this field something else.',
      );
    }

    // Defense-in-depth: a select field is meaningless without choices (the
    // shared zod schema enforces the same on the client/contract boundary).
    if (dto.type === 'select' && !(dto.options?.choices?.length ?? 0)) {
      throw new BadRequestException(
        'A select field requires a non-empty options.choices list',
      );
    }

    const row: Partial<ChapterCustomField> = {
      chapter_id: chapterId,
      key: dto.key,
      label: dto.label,
      type: dto.type,
      required: dto.required ?? false,
      visibility: dto.visibility ?? 'chapter',
      sensitive: dto.sensitive ?? false,
      // Options are deep-cloned so the persisted jsonb never shares a
      // reference with the request payload — each chapter owns its own
      // options list (spec: "options lists are deep-cloned per chapter").
      options: dto.options ? structuredClone(dto.options) : null,
      // Append, rather than default to 0. `findByChapter` orders by `sort` then
      // `created_at`, so a hardcoded 0 put every hand-added field *ahead* of the
      // archetype fields seeded at onboarding (#572) instead of at the bottom —
      // the Fields tab sends no `sort`, so that was every field an officer adds.
      sort: dto.sort ?? (await this.nextSort(chapterId)),
    };
    let field: ChapterCustomField;
    try {
      field = await this.fields.create(row);
    } catch (error) {
      if (error instanceof CustomFieldKeyConflictError) {
        throw new ConflictException(
          'A custom field with this key already exists in this chapter',
        );
      }
      throw error;
    }

    await this.auditLog.record({
      chapterId,
      actorUserId,
      action: 'chapter_custom_field_created',
      targetType: AUDIT_TARGET_TYPE,
      targetId: field.id,
      diff: { field: { from: null, to: field } } satisfies AuditDiff,
    });
    return field;
  }

  async update(
    id: string,
    chapterId: string,
    actorUserId: string,
    dto: UpdateCustomFieldInput,
  ): Promise<ChapterCustomField> {
    const existing = await this.findOne(id, chapterId);

    // A `select` field must keep a non-empty choices list (same invariant
    // create() enforces). The shared zod schema can't check this — `type` is
    // immutable and absent from the update body — so guard it here when the
    // patch touches `options`.
    if (
      existing.type === 'select' &&
      dto.options !== undefined &&
      !(dto.options?.choices?.length ?? 0)
    ) {
      throw new BadRequestException(
        'A select field requires a non-empty options.choices list',
      );
    }

    // `key` and `type` are immutable — only presentation attrs and options are
    // patchable.
    const patch: Partial<ChapterCustomField> = {};
    if (dto.label !== undefined) patch.label = dto.label;
    if (dto.required !== undefined) patch.required = dto.required;
    if (dto.visibility !== undefined) patch.visibility = dto.visibility;
    if (dto.sensitive !== undefined) patch.sensitive = dto.sensitive;
    if (dto.sort !== undefined) patch.sort = dto.sort;
    if (dto.options !== undefined) {
      // Deep-clone (or null) so the row never shares a reference with the
      // request payload — see the create() rationale.
      patch.options = dto.options ? structuredClone(dto.options) : null;
    }

    if (Object.keys(patch).length === 0) {
      return existing;
    }

    const field = await this.fields.update(id, chapterId, patch);
    if (!field) throw new NotFoundException('Custom field not found');

    await this.auditLog.record({
      chapterId,
      actorUserId,
      action: 'chapter_custom_field_updated',
      targetType: AUDIT_TARGET_TYPE,
      targetId: id,
      diff: { field: { from: existing, to: field } } satisfies AuditDiff,
    });
    return field;
  }

  async remove(
    id: string,
    chapterId: string,
    actorUserId: string,
  ): Promise<{ success: true }> {
    // Custom fields have no `core` concept (unlike custom roles) — every field
    // is deletable. We still resolve the row first so the audit diff captures
    // what was removed and a stray id 404s.
    const existing = await this.findOne(id, chapterId);

    await this.fields.delete(id, chapterId);

    await this.auditLog.record({
      chapterId,
      actorUserId,
      action: 'chapter_custom_field_deleted',
      targetType: AUDIT_TARGET_TYPE,
      targetId: id,
      diff: { field: { from: existing, to: null } } satisfies AuditDiff,
    });
    return { success: true };
  }

  /**
   * Next free `sort` for a chapter — one past the highest in use, or 0 for a
   * chapter with no fields yet. Read-then-write rather than a DB-side default
   * because `sort` is chapter-scoped and freely reorderable; two fields racing
   * to the same value is a cosmetic tie that `created_at` already breaks.
   */
  private async nextSort(chapterId: string): Promise<number> {
    const max = await this.fields.findMaxSort(chapterId);
    return max === null ? 0 : max + 1;
  }

  /** The chapter's fields a member fills in themselves, in display order. */
  private async ownEditableFields(
    chapterId: string,
  ): Promise<ChapterCustomField[]> {
    const defs = await this.fields.findByChapter(chapterId);
    return defs.filter(
      (def) => !PROFILE_OWNED_CUSTOM_FIELD_KEYS.includes(def.key),
    );
  }

  private async findOne(
    id: string,
    chapterId: string,
  ): Promise<ChapterCustomField> {
    const field = await this.fields.findById(id, chapterId);
    if (!field) throw new NotFoundException('Custom field not found');
    return field;
  }
}

function toOwnField(
  def: ChapterCustomField,
  value: string | null | undefined,
): OwnCustomField {
  return {
    field_id: def.id,
    key: def.key,
    label: def.label,
    type: def.type,
    visibility: def.visibility,
    required: def.required,
    choices: def.type === 'select' ? (def.options?.choices ?? []) : null,
    max_length: def.type === 'text' ? (def.options?.max_length ?? null) : null,
    value: value ?? null,
  };
}
