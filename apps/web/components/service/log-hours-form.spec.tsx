import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseDateEntry } from "@repo/formatting";
import { MAX_UPLOAD_LABEL } from "@repo/validation";
import {
  expectClearingEntriesEmpty,
  expectRefusedEntriesKeep,
} from "@/tests/numeric-input";
import type { SubscriptionGate } from "@/components/shared/subscription-gate";
import type { DispatchResult, HoursInput } from "@repo/chat-core/dispatch";

const { mockCreateEntry, mockRequestProofUpload, mockToast } = vi.hoisted(
  () => ({
    mockCreateEntry: vi.fn().mockResolvedValue({}),
    mockRequestProofUpload: vi.fn(),
    mockToast: vi.fn(),
  }),
);

// `putSignedUpload` stays real, so the upload specs assert on the PUT it
// actually sends.
vi.mock("@repo/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/hooks")>()),
  useCreateServiceEntry: () => ({ mutateAsync: mockCreateEntry }),
  useRequestServiceProofUploadUrl: () => ({
    mutateAsync: mockRequestProofUpload,
  }),
  useOrgConfig: () => ({ data: undefined }),
}));

// The notice has its own spec; here it only shows whether the form renders it.
vi.mock("@/components/shared/subscription-gate", () => ({
  SubscriptionNotice: () => <p role="status">blocked</p>,
}));

vi.mock("@/lib/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const { LogHoursForm } = await import("./log-hours-form");

// An open gate: the form only reads `controlProps`, and the notice renders
// nothing while `allowed`.
const OPEN_GATE = {
  allowed: true,
  isOffline: false,
  controlProps: (busy?: boolean) => ({
    disabled: Boolean(busy),
    title: undefined,
    "aria-describedby": undefined,
  }),
} as unknown as SubscriptionGate;

function renderInCard(
  submitToChannel: (input: HoursInput) => Promise<DispatchResult>,
) {
  const onDone = vi.fn();
  render(
    <LogHoursForm
      layout="card"
      gate={OPEN_GATE}
      submitToChannel={submitToChannel}
      onDone={onDone}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Hours"), {
    target: { value: "1.5" },
  });
  fireEvent.change(screen.getByLabelText("What did you do?"), {
    target: { value: "Food bank" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));
  return onDone;
}

describe("LogHoursForm in the + card (#3865, #3983)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs through chat, not the Service page's write, and is done", async () => {
    const submitToChannel = vi.fn().mockResolvedValue({ ok: true });
    const onDone = renderInCard(submitToChannel);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(submitToChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        duration_minutes: 90,
        description: "Food bank",
        proof_path: undefined,
      }),
    );
    expect(mockCreateEntry).not.toHaveBeenCalled();
  });

  it("reads a day without a year as one already worked (#3937)", async () => {
    const submitToChannel = vi.fn().mockResolvedValue({ ok: true });
    render(
      <LogHoursForm
        layout="card"
        gate={OPEN_GATE}
        submitToChannel={submitToChannel}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // Last Friday, never next Friday: service is logged after it happens.
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "fri" },
    });
    fireEvent.change(screen.getByLabelText("Hours"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("What did you do?"), {
      target: { value: "Food bank" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );
    await waitFor(() =>
      expect(submitToChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          date: parseDateEntry("fri", new Date(), "back"),
        }),
      ),
    );
  });

  it("stays open with the draft when chat refuses it", async () => {
    const submitToChannel = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "Proof is required" });
    const onDone = renderInCard(submitToChannel);
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Proof is required" }),
      ),
    );
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByLabelText("What did you do?")).toHaveValue("Food bank");
  });

  it("names a missing field in place and focuses it, with no toast", async () => {
    const submitToChannel = vi.fn();
    render(
      <LogHoursForm
        layout="card"
        gate={OPEN_GATE}
        submitToChannel={submitToChannel}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Hours"), {
      target: { value: "0" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );
    expect(
      await screen.findByText("Enter at least one minute of time."),
    ).toBeInTheDocument();
    expect(screen.getByText("Say what you did.")).toBeInTheDocument();
    expect(screen.getByLabelText("Hours")).toHaveFocus();
    expect(screen.getByLabelText("Hours")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(submitToChannel).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });
});

describe("LogHoursForm's subscription notice", () => {
  it("leaves the notice to the host unless asked, so the Service page shows one", () => {
    const props = {
      layout: "dialog" as const,
      gate: OPEN_GATE,
      onDone: vi.fn(),
      onCancel: vi.fn(),
    };
    const { rerender } = render(<LogHoursForm {...props} />);
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<LogHoursForm {...props} showSubscriptionNotice />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

/**
 * The direct path: no `submitToChannel`, so the entry is created by
 * `POST /v1/service-entries` with no chat card, as Log hours on the Service
 * hours panel does (#5950).
 */
function renderDirect() {
  const onDone = vi.fn();
  render(
    <LogHoursForm
      layout="dialog"
      gate={OPEN_GATE}
      onDone={onDone}
      onCancel={vi.fn()}
    />,
  );
  return onDone;
}

const describe_ = (text: string) =>
  fireEvent.change(screen.getByLabelText("What did you do?"), {
    target: { value: text },
  });
const submitForm = () =>
  fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));

/**
 * #2130: the proof mint returns a snake_case ticket, read through
 * `readSignedUpload`, the same helper Backwork and Documents use. Nothing else
 * covers this path, so a wire-name change would regress it silently.
 */
describe("LogHoursForm proof upload ticket contract", () => {
  const TICKET = {
    upload_url: "https://storage.example/put",
    storage_path: "chapters/chap-1/service/proof-1/receipt.pdf",
    proof_id: "proof-1",
  };

  const attachProof = () =>
    fireEvent.change(screen.getByTestId("proof-file-input"), {
      target: {
        files: [
          new File(["%PDF-1.4"], "receipt.pdf", { type: "application/pdf" }),
        ],
      },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateEntry.mockResolvedValue({});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch,
    );
  });

  // Nothing in this app's vitest config restores stubbed globals, so a stubbed
  // `fetch` would otherwise outlive this block.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for an upload, PUTs the proof to upload_url, and sends storage_path as proof_path", async () => {
    mockRequestProofUpload.mockResolvedValue(TICKET);
    const onDone = renderDirect();
    describe_("Campus cleanup");
    attachProof();
    submitForm();

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockRequestProofUpload).toHaveBeenCalledWith({
      filename: "receipt.pdf",
      content_type: "application/pdf",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://storage.example/put",
      expect.objectContaining({
        method: "PUT",
        headers: { "content-type": "application/pdf", "x-upsert": "true" },
      }),
    );
    expect(mockCreateEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Campus cleanup",
        duration_minutes: 60,
        proof_path: "chapters/chap-1/service/proof-1/receipt.pdf",
      }),
    );
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Service entry submitted" }),
    );
  });

  it("sends no proof and asks for no upload when none is attached", async () => {
    const onDone = renderDirect();
    describe_("Campus cleanup");
    submitForm();

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockRequestProofUpload).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mockCreateEntry).toHaveBeenCalledWith(
      expect.objectContaining({ proof_path: undefined }),
    );
  });

  it("rejects a camelCase-only ticket rather than uploading to undefined", async () => {
    mockRequestProofUpload.mockResolvedValue({
      signedUrl: TICKET.upload_url,
      storagePath: TICKET.storage_path,
      proofId: TICKET.proof_id,
    });
    const onDone = renderDirect();
    describe_("Campus cleanup");
    attachProof();
    submitForm();

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Couldn't log service entry",
          description: expect.not.stringMatching(/signed URL|storage path/i),
        }),
      ),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(mockCreateEntry).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  // A refusal the house copy names by status keeps that sentence (413); any
  // other refusal says the proof didn't upload, in the service form's words.
  it.each([
    [413, "That file is too large."],
    [400, `The proof didn't upload. Use a photo or PDF up to ${MAX_UPLOAD_LABEL}.`],
  ])(
    "says why when storage refuses the proof (%i), and keeps the draft",
    async (status, description) => {
      mockRequestProofUpload.mockResolvedValue(TICKET);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: false, status })) as unknown as typeof fetch,
      );
      const onDone = renderDirect();
      describe_("Campus cleanup");
      attachProof();
      submitForm();

      await waitFor(() =>
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Couldn't log service entry",
            description,
          }),
        ),
      );
      expect(mockCreateEntry).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
      expect(screen.getByLabelText("What did you do?")).toHaveValue(
        "Campus cleanup",
      );
    },
  );
});

describe("LogHoursForm duration guard (#2206)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateEntry.mockResolvedValue({});
  });

  const fields = () => ({
    hours: screen.getByLabelText("Hours"),
    minutes: screen.getByLabelText("Minutes"),
  });

  it("keeps the last whole number of minutes through a negative or a decimal", () => {
    renderDirect();
    expectRefusedEntriesKeep(fields().minutes, "30");
  });

  it("keeps the last hours through a negative, but takes a decimal, as mobile does", () => {
    renderDirect();
    const { hours } = fields();
    fireEvent.change(hours, { target: { value: "2" } });
    fireEvent.change(hours, { target: { value: "-3" } });
    expect(hours).toHaveValue(2);
    fireEvent.change(hours, { target: { value: "1.5" } });
    expect(hours).toHaveValue(1.5);
    // A click on submit skips the browser's constraint validation here, so
    // pin it directly: without step="any" the default step of 1 makes 1.5 a
    // stepMismatch and a real submit is refused.
    expect((hours as HTMLInputElement).validity.stepMismatch).toBe(false);
  });

  it("reads an emptied or unparseable field as blank", () => {
    renderDirect();
    const { hours, minutes } = fields();
    expectClearingEntriesEmpty(hours, "2");
    expectClearingEntriesEmpty(minutes, "30");
  });

  it.each([
    ["1.5", "", 90],
    ["2", "15", 135],
    // 1.33 hours is 79.8 minutes; the API stores whole minutes.
    ["1.33", "", 80],
  ])(
    "submits %j hours and %j minutes as %i minutes, never NaN",
    async (h, m, expected) => {
      renderDirect();
      const { hours, minutes } = fields();
      describe_("Campus cleanup");
      fireEvent.change(hours, { target: { value: h } });
      fireEvent.change(minutes, { target: { value: m } });
      submitForm();

      await waitFor(() => expect(mockCreateEntry).toHaveBeenCalledTimes(1));
      expect(mockCreateEntry.mock.calls[0]![0].duration_minutes).toBe(expected);
    },
  );

  // Before #2206 an unparseable field summed to NaN, and `NaN === 0` is false,
  // so this refusal let a NaN duration through to the API.
  it("still refuses an empty duration, which NaN can no longer slip past", async () => {
    renderDirect();
    const { hours, minutes } = fields();
    describe_("Campus cleanup");
    fireEvent.change(hours, { target: { value: "" } });
    fireEvent.change(minutes, { target: { value: "" } });
    submitForm();

    expect(
      await screen.findByText("Enter at least one minute of time."),
    ).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockCreateEntry).not.toHaveBeenCalled();
  });
});

/* eslint-disable turbo/no-undeclared-env-vars -- the zone under test, not a
   build input: no turbo task's output depends on it. */
describe("LogHoursForm pre-filled date (#3167)", () => {
  const previousZone = process.env.TZ;

  beforeEach(() => {
    vi.clearAllMocks();
    // 20:00 on September 30 in Los Angeles, already October 1 in UTC. Only
    // `Date` is faked.
    process.env.TZ = "America/Los_Angeles";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T03:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    // Assigning `undefined` would set the string "undefined", not unset it.
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  });

  it("pre-fills the member's own calendar day, not UTC's", async () => {
    // A forks-pool worker re-reads TZ on assignment; a threads worker would
    // not, and this would pass in UTC without proving anything.
    expect(new Date().getDate()).toBe(30);
    mockCreateEntry.mockResolvedValue({});
    const onDone = renderDirect();
    expect(screen.getByLabelText("Date")).toHaveValue("Today");

    describe_("Campus cleanup");
    submitForm();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockCreateEntry).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-09-30" }),
    );
  });
});
/* eslint-enable turbo/no-undeclared-env-vars */
