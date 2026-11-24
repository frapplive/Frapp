import { render, screen, fireEvent } from "@testing-library/react";
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
  onSaveProfile: () => {},
  onPatchConfig: () => {},
};

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

  it("saves the order and tier words with the other three, and a cleared field as blank (#3939)", () => {
    const onPatchConfig = vi.fn();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        vocabulary={{
          recruitment: "Rush",
          pledge: "New member",
          class: "Pledge class",
          order: "Fraternal order",
        }}
        onPatchConfig={onPatchConfig}
        page="vocabulary"
      />,
    );
    // What the chapter calls a tier of roles (#4068 decision 5).
    fireEvent.change(screen.getByLabelText("Role tier"), {
      target: { value: "Level" },
    });
    fireEvent.change(screen.getByLabelText("Member order number"), {
      target: { value: " Roll number " },
    });
    // The PATCH merges, so a key left out would keep its stored word.
    fireEvent.change(screen.getByLabelText("Cohort label"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save vocabulary/i }));

    expect(onPatchConfig).toHaveBeenCalledWith({
      vocabulary: {
        recruitment: "Rush",
        pledge: "New member",
        class: "",
        order: "Roll number",
        tier: "Level",
      },
    });
  });

  it("confirming an archetype switch patches org_archetype + resets vocab and modules", () => {
    const onPatchConfig = vi.fn();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        onPatchConfig={onPatchConfig}
        page="type"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /NPHC/i }));
    fireEvent.click(screen.getByRole("button", { name: /switch archetype/i }));

    expect(onPatchConfig).toHaveBeenCalledTimes(1);
    const diff = onPatchConfig.mock.calls[0]![0] as {
      org_archetype: string;
      vocabulary: Record<string, string>;
      enabled_modules: Record<string, boolean>;
    };
    expect(diff.org_archetype).toBe("nphc");
    expect(diff.vocabulary).toMatchObject({
      recruitment: "Intake",
      class: "Line",
    });
    // NPHC seeds points off by default — proves modules reset to the new archetype.
    expect(diff.enabled_modules.chat).toBe(true);
    expect(diff.enabled_modules.points).toBe(false);
  });

  it("saves the chapter profile through onSaveProfile", () => {
    const onSaveProfile = vi.fn();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        onSaveProfile={onSaveProfile}
      />,
    );
    // Save profile waits for a change to save.
    fireEvent.change(screen.getByLabelText(/chapter name/i), {
      target: { value: "Test Chapter II" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    expect(onSaveProfile).toHaveBeenCalledWith({
      name: "Test Chapter II",
      university: "State U",
      donation_url: "",
    });
  });

  it("patches branding through onPatchConfig when identity is saved", () => {
    const onPatchConfig = vi.fn();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΣΦΕ", designation: "Cal Eta" }}
        onPatchConfig={onPatchConfig}
        page="identity"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save identity/i }));
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: { greek_letters: "ΣΦΕ", designation: "Cal Eta" },
    });
  });

  it("gates Save profile on the profile permission, not on config", () => {
    // `PATCH /v1/chapters/current` guards on `CHAPTER_PROFILE_PERMISSIONS`, so
    // the profile save follows `canEditProfile`; the config saves follow
    // `canManage` (#2575). Each save reads the gate its own route checks.
    const { rerender } = render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        canManage={false}
        canEditProfile
      />,
    );
    // Save profile waits for a change, so make one: what's left is the gate.
    fireEvent.change(screen.getByLabelText(/university/i), {
      target: { value: "State University" },
    });
    expect(screen.getByRole("button", { name: /save profile/i })).toBeEnabled();
    rerender(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        canManage
        canEditProfile={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: /save profile/i }),
    ).toBeDisabled();
  });

  it("keeps an unsaved short name when the officer leaves the mark page and comes back", () => {
    const { rerender } = render(
      <SettingsOrgTab archetypeKey="ifc" {...baseProps} page="mark" />,
    );
    fireEvent.change(screen.getByLabelText("Short name"), {
      target: { value: "Fiji draft" },
    });
    rerender(<SettingsOrgTab archetypeKey="ifc" {...baseProps} page={null} />);
    rerender(<SettingsOrgTab archetypeKey="ifc" {...baseProps} page="mark" />);
    expect(screen.getByLabelText("Short name")).toHaveValue("Fiji draft");
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
    // Once under the profile save, and once under the Chapter mark's logo
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

  it("sends an emptied identity field as an empty string, so the clear saves", () => {
    // The config PATCH deep-merges: leaving the key out would keep the stored
    // letters, and the field the officer emptied would come back on reload.
    const onPatchConfig = vi.fn();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΦΓΔ", designation: "Tau Nu" }}
        onPatchConfig={onPatchConfig}
        page="identity"
      />,
    );
    fireEvent.change(screen.getByLabelText(/^greek letters$/i), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save identity/i }));
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: { greek_letters: "", designation: "Tau Nu" },
    });
  });
});

describe("SettingsOrgTab's root page", () => {
  it("links a row to each page and holds Save profile until a field changes", () => {
    render(<SettingsOrgTab archetypeKey="ifc" {...baseProps} />);
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
    // The pages' own forms stay on their pages.
    expect(
      screen.queryByRole("button", { name: /save identity/i }),
    ).not.toBeInTheDocument();

    const save = screen.getByRole("button", { name: /save profile/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/donation link/i), {
      target: { value: "https://give.example.edu" },
    });
    expect(save).toBeEnabled();
    // Back to the stored (empty) link: nothing to save again.
    fireEvent.change(screen.getByLabelText(/donation link/i), {
      target: { value: "" },
    });
    expect(save).toBeDisabled();
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

  it("previews initials, not the stored letters, once the letters are turned off", async () => {
    const user = userEvent.setup();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΦΓΔ" }}
        page="mark"
      />,
    );
    expect(tile()).toHaveTextContent("ΦΓΔ");
    await user.click(
      screen.getByRole("switch", { name: /show greek letters/i }),
    );
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

  it("saves the short name and the opt-out through the config PATCH", async () => {
    const user = userEvent.setup();
    const onPatchConfig = vi.fn();
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
    await user.click(
      screen.getByRole("switch", { name: /show greek letters/i }),
    );
    await user.click(screen.getByRole("button", { name: /save mark/i }));
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: { short_name: "FIJI", show_greek_letters: false },
    });
  });

  it("clears a stored short name with an empty string", async () => {
    const user = userEvent.setup();
    const onPatchConfig = vi.fn();
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
    await user.click(screen.getByRole("button", { name: /save mark/i }));
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

  it("refuses an oversized file with the shared size label, keeping other drafts", async () => {
    const user = userEvent.setup();
    const onUploadLogo = vi.fn(async () => {});
    const props = {
      ...baseProps,
      branding: { designation: "Tau Nu" },
      mark: { ...baseMark, onUploadLogo },
    };
    // The designation is typed on its own page, then the officer goes to the
    // mark's page to pick the logo.
    const { rerender } = render(
      <SettingsOrgTab archetypeKey="ifc" {...props} page="identity" />,
    );
    await user.clear(screen.getByLabelText(/chapter designation/i));
    await user.type(screen.getByLabelText(/chapter designation/i), "Tau Nu II");
    rerender(<SettingsOrgTab archetypeKey="ifc" {...props} page="mark" />);
    await user.type(screen.getByLabelText(/short name/i), "FIJI");
    const huge = new File(["x"], "crest.png", { type: "image/png" });
    Object.defineProperty(huge, "size", { value: 26 * 1024 * 1024 });
    await user.upload(screen.getByLabelText(/^logo$/i), huge);

    expect(onUploadLogo).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        `That file is too large. Logos can be up to ${MAX_UPLOAD_LABEL}.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/short name/i)).toHaveValue("FIJI");

    rerender(<SettingsOrgTab archetypeKey="ifc" {...props} page="identity" />);
    expect(screen.getByLabelText(/chapter designation/i)).toHaveValue(
      "Tau Nu II",
    );
  });

  it("keeps unsaved drafts when the page re-renders with the same stored values", async () => {
    // The page rebuilds `branding` and `profile` on every render. A logo
    // upload starting re-renders it; that must not throw away typed edits.
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
    await user.click(
      screen.getByRole("switch", { name: /show greek letters/i }),
    );
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
    expect(
      screen.getByRole("switch", { name: /show greek letters/i }),
    ).toHaveAttribute("aria-checked", "false");
    markPage.unmount();

    // The profile's fields are on the tab's own page.
    const rootPage = render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ greek_letters: "ΦΓΔ" }}
      />,
    );
    await user.type(screen.getByLabelText(/chapter name/i), " II");
    rootPage.rerender(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        profile={{ ...baseProps.profile }}
        branding={{ greek_letters: "ΦΓΔ" }}
        mark={{ ...baseMark, logoPending: true }}
      />,
    );
    expect(screen.getByLabelText(/chapter name/i)).toHaveValue(
      "Test Chapter II",
    );
  });

  it("keeps unsaved identity and vocabulary drafts across a re-render with equal values", async () => {
    // The page rebuilds `branding` and `vocabulary` (`config?.vocabulary ?? {}`)
    // every render, so each effect must key on values, not the object.
    const user = userEvent.setup();
    const stored = {
      greek_letters: "ΦΓΔ",
      designation: "Tau Nu",
      founded_at: 1893,
    };
    const { rerender } = render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ ...stored }}
        vocabulary={{ recruitment: "Rush" }}
        page="identity"
      />,
    );
    await user.clear(screen.getByLabelText(/chapter designation/i));
    await user.type(screen.getByLabelText(/chapter designation/i), "Tau Nu II");
    await user.clear(screen.getByLabelText(/founded year/i));
    await user.type(screen.getByLabelText(/founded year/i), "1894");

    rerender(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ ...stored }}
        vocabulary={{ recruitment: "Rush" }}
        page="vocabulary"
      />,
    );
    await user.clear(screen.getByLabelText(/recruitment process/i));
    await user.type(
      screen.getByLabelText(/recruitment process/i),
      "Recruitment",
    );

    rerender(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ ...stored }}
        vocabulary={{ recruitment: "Rush" }}
        page="vocabulary"
      />,
    );
    expect(screen.getByLabelText(/recruitment process/i)).toHaveValue(
      "Recruitment",
    );

    rerender(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{ ...stored }}
        vocabulary={{ recruitment: "Rush" }}
        page="identity"
      />,
    );
    expect(screen.getByLabelText(/chapter designation/i)).toHaveValue(
      "Tau Nu II",
    );
    expect(screen.getByLabelText(/founded year/i)).toHaveValue(1894);
  });

  it("refuses to save an emptied founded year instead of silently keeping it", async () => {
    const user = userEvent.setup();
    const onPatchConfig = vi.fn();
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

    await user.click(screen.getByRole("button", { name: /save identity/i }));

    expect(
      screen.getByText(/A founded year can't be removed once saved/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/founded year/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(onPatchConfig).not.toHaveBeenCalled();
  });

  it("waits for the member to leave the founded year before refusing it", async () => {
    const user = userEvent.setup();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...baseProps}
        branding={{}}
        page="identity"
      />,
    );
    const field = screen.getByLabelText(/founded year/i);

    await user.type(field, "18");
    expect(screen.queryByText(/Enter a year between/)).not.toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "false");

    await user.tab();
    expect(screen.getByText(/Enter a year between/)).toBeInTheDocument();

    await user.click(field);
    await user.type(field, "93");
    expect(screen.queryByText(/Enter a year between/)).not.toBeInTheDocument();
  });

  it("re-seeds the drafts when the stored values really change", () => {
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

  it("gates the logo on the profile permissions and the mark save on config:manage", () => {
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
    expect(screen.getByRole("button", { name: /save mark/i })).toBeEnabled();

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
    expect(screen.getByRole("button", { name: /save mark/i })).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: /show greek letters/i }),
    ).toBeDisabled();
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
    expect(screen.queryByLabelText(/^greek letters$/i)).not.toBeInTheDocument();
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
    expect(screen.queryByLabelText(/^greek letters$/i)).not.toBeInTheDocument();
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

  it("writes the letters off on the next mark save", async () => {
    const user = userEvent.setup();
    const onPatchConfig = vi.fn();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...fiji}
        onPatchConfig={onPatchConfig}
        page="mark"
      />,
    );
    await user.type(screen.getByLabelText(/short name/i), "FIJI");
    await user.click(screen.getByRole("button", { name: /save mark/i }));
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: { short_name: "FIJI", show_greek_letters: false },
    });
  });

  it("saves identity with the stored letters unchanged", () => {
    const onPatchConfig = vi.fn();
    render(
      <SettingsOrgTab
        archetypeKey="ifc"
        {...fiji}
        onPatchConfig={onPatchConfig}
        page="identity"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /save identity/i }));
    expect(onPatchConfig).toHaveBeenCalledWith({
      branding: expect.objectContaining({
        greek_letters: "ΦΓΔ",
        designation: "Tau Nu",
      }),
    });
  });
});
