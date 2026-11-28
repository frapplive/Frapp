import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MAX_UPLOAD_LABEL } from "@repo/validation";
import { SettingsOrgTab } from "./settings-org-tab";

const baseMark = {
  logoUrl: null,
  onUploadLogo: async () => {},
  onRemoveLogo: async () => {},
};

const baseProps = {
  vocabulary: {} as Record<string, string>,
  branding: {},
  profile: { name: "Test Chapter", university: "State U", donation_url: "" },
  mark: baseMark,
  canManage: true,
  canEditProfile: true,
  onSaveProfileField: async () => true,
  onPatchConfig: async () => true,
};

/** A save that lands, so the field says "Saved". */
const landing = () => vi.fn().mockResolvedValue(true);

/** The quiet "Saved" beside a field's label, wherever it shows. */
const savedNotes = () => screen.queryAllByText("Saved");

const PAGES = [
  null,
  "mark",
  "accent",
  "identity",
  "type",
  "vocabulary",
] as const;

describe("SettingsOrgTab", () => {
  it("falls back to the IFC archetype for an unknown key (no crash)", () => {
    render(
      <SettingsOrgTab archetypeKey="bogus-key" {...baseProps} page="type" />,
    );
    expect(
      screen.getByRole("button", { name: /IFC Fraternity/i }),
    ).toHaveTextContent("Current");
  });

  it("shows archetype-appropriate vocabulary placeholders (IFC vs NPHC)", () => {
    const { rerender } = render(
      <SettingsOrgTab archetypeKey="ifc" {...baseProps} page="vocabulary" />,
    );
    expect(screen.getByPlaceholderText("Rush")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Pledge class")).toBeInTheDocument();

    rerender(
      <SettingsOrgTab archetypeKey="nphc" {...baseProps} page="vocabulary" />,
    );
    expect(screen.getByPlaceholderText("Intake")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Line")).toBeInTheDocument();
  });

  it("saves each word on its own with the other four as stored, and a cleared word as blank (#3939)", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    const stored = {
      recruitment: "Rush",
      pledge: "New member",
      class: "Pledge class",
      order: "Fraternal order",
    };
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        vocabulary={stored}
        onPatchConfig={onPatchConfig}
        page="vocabulary"
      />,
    );
    // What the chapter calls a tier of roles (#4068 decision 5).
    await user.type(screen.getByLabelText("Role tier"), "Level");
    await user.tab();
    // The PATCH merges, so a word left out would keep its stored value: each
    // save sends all five, the other four as stored.
    expect(onPatchConfig).toHaveBeenLastCalledWith({
      vocabulary: { ...stored, tier: "Level" },
    });
    expect(savedNotes()).toHaveLength(1);

    await user.clear(screen.getByLabelText("Member order number"));
    await user.type(
      screen.getByLabelText("Member order number"),
      " Roll number ",
    );
    await user.keyboard("{Enter}");
    expect(onPatchConfig).toHaveBeenLastCalledWith({
      vocabulary: { ...stored, order: "Roll number", tier: "" },
    });

    await user.clear(screen.getByLabelText("Cohort label"));
    await user.tab();
    expect(onPatchConfig).toHaveBeenLastCalledWith({
      vocabulary: { ...stored, class: "", tier: "" },
    });
    expect(onPatchConfig).toHaveBeenCalledTimes(3);
  });

  it("confirming an archetype switch patches org_archetype + resets vocab and modules", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        onPatchConfig={onPatchConfig}
        page="type"
      />,
    );
    await user.click(screen.getByRole("button", { name: /NPHC/i }));
    await user.click(screen.getByRole("button", { name: /switch archetype/i }));

    expect(onPatchConfig).toHaveBeenCalledTimes(1);
    const [diff, title] = onPatchConfig.mock.calls[0]! as [
      {
        org_archetype: string;
        vocabulary: Record<string, string>;
        enabled_modules: Record<string, boolean>;
      },
      string,
    ];
    // The one Chapter save that still toasts: it has no field to say "Saved".
    expect(title).toBe("Organization type switched");
    expect(diff.org_archetype).toBe("nphc");
    expect(diff.vocabulary).toMatchObject({
      recruitment: "Intake",
      class: "Line",
    });
    // NPHC seeds points off by default — proves modules reset to the new archetype.
    expect(diff.enabled_modules.chat).toBe(true);
    expect(diff.enabled_modules.points).toBe(false);
  });

  it("saves a profile field on Enter, says Saved, and sends it once when the field is then left", async () => {
    const user = userEvent.setup();
    const onSaveProfileField = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        onSaveProfileField={onSaveProfileField}
      />,
    );
    expect(savedNotes()).toHaveLength(0);
    await user.type(screen.getByLabelText(/chapter name/i), " II ");
    await user.keyboard("{Enter}");
    expect(onSaveProfileField).toHaveBeenCalledWith("name", "Test Chapter II");
    expect(await screen.findByText("Saved")).toBeInTheDocument();

    // The stored name hasn't caught up yet: leaving the field sends nothing more.
    await user.tab();
    expect(onSaveProfileField).toHaveBeenCalledTimes(1);

    await user.clear(screen.getByLabelText(/university/i));
    await user.type(screen.getByLabelText(/university/i), "State University");
    await user.tab();
    expect(onSaveProfileField).toHaveBeenLastCalledWith(
      "university",
      "State University",
    );
  });

  it("says nothing was saved when the save fails, and keeps the typed text for another try", async () => {
    const user = userEvent.setup();
    const onSaveProfileField = vi.fn().mockResolvedValue(false);
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        onSaveProfileField={onSaveProfileField}
      />,
    );
    await user.type(screen.getByLabelText(/chapter name/i), " II");
    await user.tab();
    expect(onSaveProfileField).toHaveBeenCalledWith("name", "Test Chapter II");
    expect(savedNotes()).toHaveLength(0);
    expect(screen.getByLabelText(/chapter name/i)).toHaveValue(
      "Test Chapter II",
    );

    // Another try sends it again.
    await user.click(screen.getByLabelText(/chapter name/i));
    await user.keyboard("{Enter}");
    expect(onSaveProfileField).toHaveBeenCalledTimes(2);
  });

  it("sends nothing for an unchanged field, and puts back a name left blank", async () => {
    const user = userEvent.setup();
    const onSaveProfileField = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        onSaveProfileField={onSaveProfileField}
      />,
    );
    await user.click(screen.getByLabelText(/university/i));
    await user.tab();
    await user.clear(screen.getByLabelText(/chapter name/i));
    await user.tab();
    expect(screen.getByLabelText(/chapter name/i)).toHaveValue("Test Chapter");
    expect(onSaveProfileField).not.toHaveBeenCalled();
  });

  it("puts the saved text back on Escape, and sends nothing", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ designation: "Tau Nu" }}
        onPatchConfig={onPatchConfig}
        page="identity"
      />,
    );
    const field = screen.getByLabelText(/chapter designation/i);
    await user.type(field, " II");
    await user.keyboard("{Escape}");
    expect(field).toHaveValue("Tau Nu");
    await user.tab();
    expect(onPatchConfig).not.toHaveBeenCalled();
  });

  it("saves one identity field through onPatchConfig, the others as stored", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΣΦΕ", designation: "Cal Eta" }}
        onPatchConfig={onPatchConfig}
        page="identity"
      />,
    );
    await user.type(screen.getByLabelText(/school \(short\)/i), "UCLA");
    await user.tab();
    // No success title: the field says "Saved" itself.
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: {
        greek_letters: "ΣΦΕ",
        designation: "Cal Eta",
        school_short: "UCLA",
      },
    });
    expect(onPatchConfig.mock.calls[0]).toHaveLength(1);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("gates the profile fields on the profile permission, and the config pages on config:manage", () => {
    // `PATCH /v1/chapters/current` guards on `CHAPTER_PROFILE_PERMISSIONS`, so
    // the profile fields follow `canEditProfile`; the config pages follow
    // `canManage` (#2575). Each field reads the gate its own route checks.
    const { rerender } = render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        canManage={false}
        canEditProfile
      />,
    );
    expect(screen.getByLabelText(/chapter name/i)).toBeEnabled();
    expect(screen.getByLabelText(/university/i)).toBeEnabled();
    expect(screen.getByLabelText(/donation link/i)).toBeEnabled();

    rerender(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        canManage
        canEditProfile={false}
      />,
    );
    expect(screen.getByLabelText(/chapter name/i)).toBeDisabled();
    expect(screen.getByLabelText(/university/i)).toBeDisabled();
    expect(screen.getByLabelText(/donation link/i)).toBeDisabled();

    for (const page of ["identity", "vocabulary"] as const) {
      rerender(
        <SettingsOrgTab
          archetypeKey="ifc"
          {...baseProps}
          canManage={false}
          page={page}
        />,
      );
      for (const input of screen.getAllByRole("textbox")) {
        expect(input).toBeDisabled();
      }
      // The mark page stays mounted, hidden, so count only what shows.
      expect(
        screen
          .getAllByText("Your role can't change chapter settings.")
          .filter((node) => !node.closest("[hidden]")),
      ).toHaveLength(1);
    }
  });

  it("says the role can't change settings, never which permission key it lacks", () => {
    // The mark page stays mounted, hidden, while another page shows, so
    // count only what is on screen.
    const hints = () =>
      screen
        .getAllByText(
          (_, node) =>
            node?.tagName === "P" &&
            node.textContent === "Your role can't change chapter settings.",
        )
        .filter((node) => !node.closest("[hidden]"));
    const { rerender } = render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        canEditProfile={false}
      />,
    );
    // Once under the profile fields, and once under the Chapter mark's logo
    // controls (on its own page), which the same routes' permissions gate.
    expect(hints()).toHaveLength(1);
    rerender(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        canEditProfile={false}
        page="mark"
      />,
    );
    expect(hints()).toHaveLength(1);
  });

  it("sends an emptied identity field as an empty string, so the clear saves", async () => {
    // The config PATCH deep-merges: leaving the key out would keep the stored
    // letters, and the field the officer emptied would come back on reload.
    const user = userEvent.setup();
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΦΓΔ", designation: "Tau Nu" }}
        onPatchConfig={onPatchConfig}
        page="identity"
      />,
    );
    await user.clear(screen.getByLabelText(/^greek letters/i));
    await user.tab();
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: { greek_letters: "", designation: "Tau Nu" },
    });
  });

  it("has no Save button on any Chapter page: every field saves on its own (#6033)", () => {
    const { rerender } = render(
      <SettingsOrgTab archetypeKey="ifc" {...baseProps} />,
    );
    for (const page of PAGES) {
      rerender(
        <SettingsOrgTab archetypeKey="ifc" {...baseProps} page={page} />,
      );
      expect(
        screen.queryAllByRole("button", { name: /^Save/i, hidden: true }),
      ).toHaveLength(0);
    }
  });
});

describe("SettingsOrgTab's root page", () => {
  it("links a row to each page and saves the donation link when it is left", async () => {
    const user = userEvent.setup();
    const onSaveProfileField = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        onSaveProfileField={onSaveProfileField}
      />,
    );
    for (const [label, page] of [
      [/^chapter mark/i, "mark"],
      [/^accent color/i, "accent"],
      [/^identity & founding/i, "identity"],
      [/^organization type/i, "type"],
      [/^vocabulary/i, "vocabulary"],
    ] as const) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        `/settings?tab=org&page=${page}`,
      );
    }
    // The pages' own fields stay on their pages.
    expect(
      screen.queryByLabelText(/chapter designation/i),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/donation link/i),
      "https://give.example.edu",
    );
    expect(onSaveProfileField).not.toHaveBeenCalled();
    await user.tab();
    expect(onSaveProfileField).toHaveBeenCalledWith(
      "donation_url",
      "https://give.example.edu",
    );
  });
});

describe("SettingsOrgTab chapter mark (#2876, #2591)", () => {
  function tile() {
    return screen.getAllByTestId(/chapter-mark-/)[0]!;
  }

  it("previews the precedence: short name before Greek letters", () => {
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΦΓΔ", short_name: "FIJI" }}
        page="mark"
      />,
    );
    expect(tile()).toHaveTextContent("FIJI");
  });

  it("saves Show Greek letters when flipped, and previews initials once they are off", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    const { rerender } = render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΦΓΔ" }}
        onPatchConfig={onPatchConfig}
        page="mark"
      />,
    );
    expect(tile()).toHaveTextContent("ΦΓΔ");
    await user.click(
      screen.getByRole("switch", { name: /show greek letters/i }),
    );
    // No short name stored, so none goes with it.
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: { show_greek_letters: false },
    });

    rerender(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΦΓΔ", show_greek_letters: false }}
        onPatchConfig={onPatchConfig}
        page="mark"
      />,
    );
    expect(
      screen.getByRole("switch", { name: /show greek letters/i }),
    ).toHaveAttribute("aria-checked", "false");
    expect(tile()).toHaveTextContent("TC");
    expect(tile()).not.toHaveTextContent("ΦΓΔ");
  });

  it("previews the logo ahead of everything", () => {
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΦΓΔ", short_name: "FIJI" }}
        mark={{ ...baseMark, logoUrl: "https://storage.example/logo.png" }}
        page="mark"
      />,
    );
    expect(screen.getByTestId("chapter-mark-logo")).toHaveAttribute(
      "src",
      "https://storage.example/logo.png",
    );
  });

  it("previews the short name as typed and saves it, with the stored switch, when left", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΦΓΔ" }}
        onPatchConfig={onPatchConfig}
        page="mark"
      />,
    );
    await user.type(screen.getByLabelText(/short name/i), "FIJI");
    expect(tile()).toHaveTextContent("FIJI");
    expect(onPatchConfig).not.toHaveBeenCalled();
    await user.tab();
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: { short_name: "FIJI", show_greek_letters: true },
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("flips the switch with the stored short name, not one still being typed", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΦΓΔ", short_name: "FIJI" }}
        onPatchConfig={onPatchConfig}
        page="mark"
      />,
    );
    await user.click(
      screen.getByRole("switch", { name: /show greek letters/i }),
    );
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: { short_name: "FIJI", show_greek_letters: false },
    });
  });

  it("clears a stored short name with an empty string", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ short_name: "FIJI" }}
        onPatchConfig={onPatchConfig}
        page="mark"
      />,
    );
    await user.clear(screen.getByLabelText(/short name/i));
    await user.keyboard("{Enter}");
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: { short_name: "", show_greek_letters: true },
    });
  });

  it("uploads a picked image through onUploadLogo", async () => {
    const user = userEvent.setup();
    const onUploadLogo = vi.fn(async () => {});
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        mark={{ ...baseMark, onUploadLogo }}
        page="mark"
      />,
    );
    const file = new File(["png"], "crest.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/^logo$/i), file);
    expect(onUploadLogo).toHaveBeenCalledWith({
      body: file,
      filename: "crest.png",
      contentType: "image/png",
    });
  });

  it("refuses a file outside the image kind and says why, without uploading", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onUploadLogo = vi.fn(async () => {});
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        mark={{ ...baseMark, onUploadLogo }}
        page="mark"
      />,
    );
    await user.upload(
      screen.getByLabelText(/^logo$/i),
      new File(["<svg/>"], "crest.svg", { type: "image/svg+xml" }),
    );
    expect(onUploadLogo).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Choose an image file: .jpg, .jpeg, .png, .gif or .webp.",
      ),
    ).toBeInTheDocument();
  });

  it("refuses an oversized file with the shared size label, without saving anything", async () => {
    const user = userEvent.setup();
    const onUploadLogo = vi.fn(async () => {});
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        mark={{ ...baseMark, onUploadLogo }}
        onPatchConfig={onPatchConfig}
        page="mark"
      />,
    );
    const huge = new File(["x"], "crest.png", { type: "image/png" });
    Object.defineProperty(huge, "size", { value: 26 * 1024 * 1024 });
    await user.upload(screen.getByLabelText(/^logo$/i), huge);

    expect(onUploadLogo).not.toHaveBeenCalled();
    expect(onPatchConfig).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        `That file is too large. Logos can be up to ${MAX_UPLOAD_LABEL}.`,
      ),
    ).toBeInTheDocument();
  });

  it("doesn't overwrite a field being edited when the page re-renders with the same stored values", async () => {
    // The page rebuilds `branding`, `profile` and `vocabulary` on every
    // render. A logo upload starting re-renders it; that must not throw away
    // what is being typed.
    const user = userEvent.setup();
    const markPage = render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΦΓΔ" }}
        page="mark"
      />,
    );
    await user.type(screen.getByLabelText(/short name/i), "FIJI");
    markPage.rerender(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        profile={{ ...baseProps.profile }}
        branding={{ greek_letters: "ΦΓΔ" }}
        mark={{ ...baseMark, logoPending: true }}
        page="mark"
      />,
    );
    expect(screen.getByLabelText(/short name/i)).toHaveValue("FIJI");
    expect(tile()).toHaveTextContent("FIJI");
    markPage.unmount();

    const rootPage = render(
      <SettingsOrgTab archetypeKey="ifc" {...baseProps} />,
    );
    await user.type(screen.getByLabelText(/chapter name/i), " II");
    rootPage.rerender(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        profile={{ ...baseProps.profile }}
      />,
    );
    expect(screen.getByLabelText(/chapter name/i)).toHaveValue(
      "Test Chapter II",
    );
    rootPage.unmount();

    const vocabularyPage = render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        vocabulary={{ recruitment: "Rush" }}
        page="vocabulary"
      />,
    );
    await user.clear(screen.getByLabelText(/recruitment process/i));
    await user.type(
      screen.getByLabelText(/recruitment process/i),
      "Recruitment",
    );
    vocabularyPage.rerender(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        vocabulary={{ recruitment: "Rush" }}
        page="vocabulary"
      />,
    );
    expect(screen.getByLabelText(/recruitment process/i)).toHaveValue(
      "Recruitment",
    );
  });

  it("replaces an unfocused field when the stored value really changes", () => {
    const changed = {
      ...baseProps,
      profile: { ...baseProps.profile, name: "Tau Nu" },
      branding: {
        short_name: "FIJI",
        show_greek_letters: false,
        designation: "Tau Nu",
      },
      vocabulary: { recruitment: "Rush" },
    };
    // The values change while the mark's page is open; every page then shows
    // the new ones, though only the mark's page was drawn when they arrived.
    const { rerender } = render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{}}
        page="mark"
      />,
    );
    rerender(<SettingsOrgTab archetypeKey="ifc" {...changed} page="mark" />);
    expect(screen.getByLabelText(/short name/i)).toHaveValue("FIJI");
    expect(
      screen.getByRole("switch", { name: /show greek letters/i }),
    ).toHaveAttribute("aria-checked", "false");

    rerender(<SettingsOrgTab archetypeKey="ifc" {...changed} />);
    expect(screen.getByLabelText(/chapter name/i)).toHaveValue("Tau Nu");
    rerender(
      <SettingsOrgTab archetypeKey="ifc" {...changed} page="identity" />,
    );
    expect(screen.getByLabelText(/chapter designation/i)).toHaveValue("Tau Nu");
    rerender(
      <SettingsOrgTab archetypeKey="ifc" {...changed} page="vocabulary" />,
    );
    expect(screen.getByLabelText(/recruitment process/i)).toHaveValue("Rush");
  });

  it("refuses to save an emptied founded year instead of silently keeping it", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ founded_at: 1893 }}
        onPatchConfig={onPatchConfig}
        page="identity"
      />,
    );
    await user.clear(screen.getByLabelText(/founded year/i));
    // Still in the field: no error yet.
    expect(
      screen.queryByText(/A founded year can't be removed once saved/),
    ).not.toBeInTheDocument();

    await user.tab();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /A founded year can't be removed once saved/,
    );
    expect(screen.getByLabelText(/founded year/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(onPatchConfig).not.toHaveBeenCalled();
    expect(savedNotes()).toHaveLength(0);
  });

  it("waits for the member to leave the founded year before refusing it, and saves it once it's a year", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{}}
        onPatchConfig={onPatchConfig}
        page="identity"
      />,
    );
    const field = screen.getByLabelText(/founded year/i);

    await user.type(field, "18");
    expect(screen.queryByText(/Enter a year between/)).not.toBeInTheDocument();
    expect(field).not.toHaveAttribute("aria-invalid");

    await user.tab();
    expect(screen.getByRole("alert")).toHaveTextContent(/Enter a year between/);
    expect(field).toHaveAccessibleDescription(/Enter a year between/);
    expect(onPatchConfig).not.toHaveBeenCalled();

    await user.click(field);
    await user.type(field, "93");
    expect(screen.queryByText(/Enter a year between/)).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: { founded_at: 1893 },
    });
  });

  it("refuses a founded year out of range and sends nothing", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ founded_at: 1893 }}
        onPatchConfig={onPatchConfig}
        page="identity"
      />,
    );
    const field = screen.getByLabelText(/founded year/i);
    await user.clear(field);
    await user.type(field, "1066");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(/Enter a year between/);
    // The typed text stays for a fix.
    expect(field).toHaveValue("1066");
    expect(onPatchConfig).not.toHaveBeenCalled();
  });

  it("offers replace and remove once a logo is set", async () => {
    const user = userEvent.setup();
    const onRemoveLogo = vi.fn(async () => {});
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        mark={{
          ...baseMark,
          logoUrl: "https://storage.example/logo.png",
          onRemoveLogo,
        }}
        page="mark"
      />,
    );
    expect(
      screen.getByRole("button", { name: /replace logo/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /remove logo/i }));
    expect(onRemoveLogo).toHaveBeenCalledTimes(1);
  });

  it("gates the logo on the profile permissions and the short name and switch on config:manage", () => {
    // Two routes, two gates: the logo routes guard like the profile PATCH
    // (#2575), the short name and opt-out go through the config PATCH.
    const { rerender } = render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        canEditProfile={false}
        canManage
        page="mark"
      />,
    );
    expect(screen.getByRole("button", { name: /upload logo/i })).toBeDisabled();
    expect(screen.getByLabelText(/short name/i)).toBeEnabled();
    expect(
      screen.getByRole("switch", { name: /show greek letters/i }),
    ).toBeEnabled();

    rerender(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        canEditProfile
        canManage={false}
        page="mark"
      />,
    );
    expect(screen.getByRole("button", { name: /upload logo/i })).toBeEnabled();
    expect(screen.getByLabelText(/short name/i)).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: /show greek letters/i }),
    ).toBeDisabled();
    expect(
      screen.getByText("Your role can't change chapter settings."),
    ).toBeInTheDocument();
  });
});

describe("SettingsOrgTab for an organization that hides its letters", () => {
  // FIJI chapters created before the profile turned the letters off still
  // store them, sometimes with the switch on.
  const fiji = {
    ...baseProps,
    profile: { name: "Phi Gamma Delta", university: "RPI", donation_url: "" },
    branding: {
      greek_letters: "ΦΓΔ",
      show_greek_letters: true,
      designation: "Tau Nu",
    },
  };

  it("draws neither for a chapter whose name adds to the organization's", () => {
    const props = {
      ...fiji,
      profile: { ...fiji.profile, name: "Phi Gamma Delta Tau Nu" },
    };
    const { rerender } = render(
      <SettingsOrgTab archetypeKey="ifc" {...props} page="identity" />,
    );
    expect(screen.queryByLabelText(/^greek letters/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ΦΓΔ/)).not.toBeInTheDocument();

    rerender(<SettingsOrgTab archetypeKey="ifc" {...props} page="mark" />);
    expect(
      screen.queryByRole("switch", { name: /show greek letters/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/ΦΓΔ/)).not.toBeInTheDocument();
  });

  it("draws neither the letters field nor the switch, and the mark skips them", () => {
    const { rerender } = render(
      <SettingsOrgTab archetypeKey="ifc" {...fiji} page="identity" />,
    );
    expect(screen.queryByLabelText(/^greek letters/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ΦΓΔ/)).not.toBeInTheDocument();

    rerender(<SettingsOrgTab archetypeKey="ifc" {...fiji} page="mark" />);
    expect(
      screen.queryByRole("switch", { name: /show greek letters/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/chapter-mark-/)[0]!).not.toHaveTextContent(
      "ΦΓΔ",
    );
    expect(screen.queryByText(/ΦΓΔ/)).not.toBeInTheDocument();
  });

  it("writes the letters off with the next short name save", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...fiji}
        onPatchConfig={onPatchConfig}
        page="mark"
      />,
    );
    await user.type(screen.getByLabelText(/short name/i), "FIJI");
    await user.tab();
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: { short_name: "FIJI", show_greek_letters: false },
    });
  });

  it("saves an identity field with the stored letters unchanged", async () => {
    const user = userEvent.setup();
    const onPatchConfig = landing();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...fiji}
        onPatchConfig={onPatchConfig}
        page="identity"
      />,
    );
    await user.type(screen.getByLabelText(/chapter designation/i), " II");
    await user.tab();
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: expect.objectContaining({
        greek_letters: "ΦΓΔ",
        designation: "Tau Nu II",
      }),
    });
  });
});
