/**
 * The school layer's rows (`spec/architecture/school-layer.md` § 2.1, § 2.2
 * and a minimal § 2.4; `20261123220535_school_layer_schools_and_membership.sql`,
 * #5929). Every table is RLS on with no policies, reached only through the
 * service-role client.
 */

export type SchoolStatus = 'unverified' | 'verified' | 'suspended';

/** A row of `schools`. */
export interface School {
  id: string;
  name: string;
  short_name: string;
  aliases: string[];
  /** Only a verified school lets its students verify. */
  status: SchoolStatus;
  /** The `chapter_directory.university` it was seeded from, or null. */
  directory_university: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SchoolEmailDomainStatus = 'proposed' | 'verified' | 'rejected';

/** A row of `school_email_domains`. A verified domain belongs to one school. */
export interface SchoolEmailDomain {
  id: string;
  school_id: string;
  domain: string;
  include_subdomains: boolean;
  status: SchoolEmailDomainStatus;
  verified_via: 'edu_match' | 'staff' | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
}

/** A row of `school_slugs` (ADR-27 decision 5). Staff rename only. */
export interface SchoolSlug {
  slug: string;
  /** Null once the school is deleted: the slug stays taken. */
  school_id: string | null;
  retired_at: string | null;
  created_at: string;
}

export type SchoolMemberStatus = 'pnm' | 'member' | 'alum';

/**
 * A row of `school_members`: a person's own record at a school, apart from
 * `members` (D4). Exists only once they proved a school address.
 */
export interface SchoolMember {
  id: string;
  school_id: string;
  user_id: string;
  status: SchoolMemberStatus;
  verified_via: 'email_code' | 'sso' | 'staff';
  verified_email: string | null;
  verified_at: string;
  directory_visibility: 'hidden' | 'officers' | 'school';
  /** Set when they transferred out; the row then grants nothing. */
  left_at: string | null;
  created_at: string;
}

/**
 * A row of `school_email_verifications`: one code sent to a school address.
 * Holds a salted hash of the code, never the code.
 */
export interface SchoolEmailVerification {
  id: string;
  user_id: string;
  school_id: string;
  email: string;
  code_salt: string;
  code_hash: string;
  ip_hash: string | null;
  attempts: number;
  expires_at: string;
  closed_at: string | null;
  outcome: 'verified' | 'superseded' | 'exhausted' | null;
  created_at: string;
}

/** A row of `school_chapters`, minimal for #5929: proposed or active. */
export interface SchoolChapter {
  id: string;
  school_id: string;
  chapter_id: string;
  is_primary: boolean;
  /** § 2.4's full set since #5974: an officer confirms, declines or ends. */
  status: SchoolChapterStatus;
  proposed_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export type SchoolChapterStatus = 'proposed' | 'active' | 'declined' | 'ended';

/** A row `search_schools` returns. */
export interface SchoolSearchRow {
  id: string;
  name: string;
  short_name: string;
  slug: string | null;
  /** Verified, with at least one verified domain: a student can verify today. */
  verifiable: boolean;
  email_domains: string[];
}

/** What `start_school_email_verification` answers. */
export interface StartSchoolVerificationResult {
  ok: boolean;
  reason?:
    | 'school_not_verifiable'
    | 'wrong_domain'
    | 'cooldown'
    | 'address_limit'
    | 'ip_limit'
    | 'account_limit';
  id?: string;
  expires_at?: string;
  retry_after_seconds?: number;
}

/** What `confirm_school_email_verification` answers. */
export interface ConfirmSchoolVerificationResult {
  ok: boolean;
  reason?:
    | 'no_code'
    | 'expired'
    | 'too_many_attempts'
    | 'wrong_code'
    | 'address_taken'
    | 'school_not_verifiable';
  attempts_left?: number;
  member_id?: string;
}
