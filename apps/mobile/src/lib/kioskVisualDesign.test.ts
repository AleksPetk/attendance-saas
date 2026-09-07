import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeKioskVisualDesign } from "./kioskVisualDesign.js";

describe("normalizeKioskVisualDesign", () => {
  it("reads the saved config from the production visual_design envelope", () => {
    const design = normalizeKioskVisualDesign({
      config: {
        header: { background: { color: "#123456" }, title: { text: "Front desk", color: "#ABCDEF" } },
        main: { background: { color: "#654321" }, title: { text: "Welcome", color: "#FEDCBA" }, card_preset: "bordered" },
        footer: { background: { color: "#101010" }, text: { lines: ["Saved footer"], color: "#EEEEEE" } },
      },
      header_logo_url: "https://workspace.checkstation.app/media/header.png",
    });

    assert.equal(design.header.background.color, "#123456");
    assert.equal(design.header.title.text, "Front desk");
    assert.equal(design.main.background.color, "#654321");
    assert.equal(design.main.card_preset, "bordered");
    assert.equal(design.footer.background.color, "#101010");
    assert.deepEqual(design.footer.text.lines, ["Saved footer"]);
  });

  it("fills only missing nested design properties", () => {
    const design = normalizeKioskVisualDesign({
      config: {
        header: { enabled: false, background: { mode: "gradient", color: "#010203", color2: "#040506", gradient_angle: 0 } },
        main: { overlay: 0, title: {} },
        footer: {},
      },
    });

    assert.equal(design.header.enabled, false);
    assert.equal(design.header.background.color, "#010203");
    assert.equal(design.header.background.color2, "#040506");
    assert.equal(design.header.background.gradient_angle, 0);
    assert.equal(design.main.background.color, "#FFFFFF");
    assert.equal(design.main.overlay, 0);
    assert.deepEqual(design.footer.text.lines, []);
  });

  it("returns complete safe sections when visual_design or config is absent", () => {
    for (const input of [undefined, null, {}, { config: null }, { config: { main: null } }]) {
      const design = normalizeKioskVisualDesign(input);
      assert.equal(design.header.background.color, "#2563EB");
      assert.equal(design.main.background.color, "#FFFFFF");
      assert.equal(design.main.title.color, "#111827");
      assert.equal(design.footer.background.color, "#1E293B");
      assert.deepEqual(design.footer.text.lines, []);
    }
  });
});
