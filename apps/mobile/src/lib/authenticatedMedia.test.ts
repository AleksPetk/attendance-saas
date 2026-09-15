import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CookieJar } from "@checkstation/api";
import { createAppConfig } from "@checkstation/config";
import { ApiClient } from "@checkstation/api";
import {
  kioskAvatarToneStep,
  kioskPersonInitials,
  loadAuthenticatedMediaDataUri,
  resolveMobileMediaUrl,
} from "./authenticatedMedia";
import { buildKioskPersonAvatarHtml, buildKioskPreviewHtml, kioskPreviewGridOverrideCss } from "./kioskWebPreview/html";
import { normalizeKioskVisualDesign } from "./kioskVisualDesign";

const liveSource = readFileSync(
  fileURLToPath(new URL("../../app/kiosk/[groupId].tsx", import.meta.url)),
  "utf8",
);
const editorSource = readFileSync(
  fileURLToPath(new URL("../../app/(app)/group/[id]/kiosk-design.tsx", import.meta.url)),
  "utf8",
);

test("photo field survives Mobile kiosk mapping into WebView people", () => {
  assert.match(liveSource, /photo_url/);
  assert.match(liveSource, /resolvedPhotos/);
  assert.match(liveSource, /loadAuthenticatedMediaDataUri/);
  assert.match(liveSource, /photoUrl:\s*resolvedPhotos/);
});

test("protected kiosk logos are resolved before entering editor and live WebViews", () => {
  assert.match(editorSource, /loadAuthenticatedMediaDataUri/);
  assert.match(editorSource, /selectedMediaDataUri/);
  assert.match(editorSource, /media=\{resolvedPreviewMedia\}/);
  assert.match(liveSource, /resolvedKioskMedia/);
  assert.match(liveSource, /media=\{resolvedKioskMedia\}/);
  assert.match(liveSource, /url=\{resolvedKioskMedia\.headerLogoUrl\}/);
  assert.match(liveSource, /url=\{resolvedKioskMedia\.footerLogoUrl\}/);
  assert.match(liveSource, /imageUrl=\{resolvedKioskMedia\.backgroundUrl\}/);
  assert.doesNotMatch(liveSource, /const webMedia = useMemo/);
});

test("removed or failed logo media cannot emit a broken img placeholder", () => {
  const config = normalizeKioskVisualDesign({ header: { title: { text: "Cafe" } } });
  const withoutLogo = buildKioskPreviewHtml({ config, mode: "card", media: {}, people: [] });
  assert.doesNotMatch(withoutLogo, /class="kr-header-logo"/);
});

test("resolveMobileMediaUrl keeps absolute URLs and joins root-relative /media/", () => {
  assert.equal(
    resolveMobileMediaUrl("https://workspace.checkstation.app/media/members/1/2.jpg", "https://workspace.checkstation.app/api"),
    "https://workspace.checkstation.app/media/members/1/2.jpg",
  );
  assert.equal(
    resolveMobileMediaUrl("/media/members/1/2.jpg", "https://workspace.checkstation.app/api"),
    "https://workspace.checkstation.app/media/members/1/2.jpg",
  );
  assert.equal(resolveMobileMediaUrl(null, "https://workspace.checkstation.app/api"), "");
  assert.equal(resolveMobileMediaUrl("data:image/png;base64,abc", "https://x/api"), "data:image/png;base64,abc");
});

test("participant with photo uses image source; without photo uses fallback", () => {
  const withPhoto = buildKioskPersonAvatarHtml({
    name: "Budi Santoso",
    photoUrl: "data:image/jpeg;base64,/9j/fake",
  });
  assert.match(withPhoto, /kiosk-person-avatar--photo/);
  assert.match(withPhoto, /<img alt="" src="data:image\/jpeg;base64,/);
  assert.match(withPhoto, /onerror=/);
  assert.match(withPhoto, />BS</);

  const without = buildKioskPersonAvatarHtml({ name: "Ada Lovelace", photoUrl: null });
  assert.match(without, /kiosk-person-avatar--fallback/);
  assert.doesNotMatch(without, /<img /);
  assert.match(without, />AL</);
});

test("avatar photo CSS uses absolute cover fill like Desktop Electron", () => {
  const css = kioskPreviewGridOverrideCss(2);
  assert.match(css, /\.kiosk-person-avatar\s*\{\s*position:relative/);
  assert.match(css, /\.kiosk-person-avatar\s*>\s*img\s*\{[^}]*position:absolute/);
  assert.match(css, /inset:0/);
  assert.match(css, /object-fit:cover/);
  assert.match(css, /object-position:center/);
});

test("preview HTML includes photo markup when photoUrl is provided", () => {
  const config = normalizeKioskVisualDesign({ main: { card_template: "polaroid" } });
  const html = buildKioskPreviewHtml({
    config,
    mode: "card",
    people: [
      { name: "Priya Sharma", code: "P1", email: "", photoUrl: "data:image/png;base64,aaa" },
      { name: "No Photo", code: "P2", email: "" },
    ],
  });
  assert.match(html, /data-card-template="polaroid"/);
  assert.match(html, /kiosk-person-avatar--photo/);
  assert.match(html, /kiosk-person-avatar--fallback/);
  assert.doesNotMatch(html, /sessionid=/);
  assert.doesNotMatch(html, /Cookie:/);
});

test("loadAuthenticatedMediaDataUri uses Cookie header and returns data URI without leaking tokens in URL", async () => {
  const jar = new CookieJar();
  jar.set("checkstation_sessionid", "sess-secret");
  const api = new ApiClient(createAppConfig({ environment: "development", apiBaseUrl: "https://workspace.checkstation.app/api" }), jar);
  let sawCookie = "";
  const fakeFetch: typeof fetch = async (_input, init) => {
    sawCookie = String((init?.headers as Record<string, string> | undefined)?.Cookie || "");
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    return new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } });
  };
  const dataUri = await loadAuthenticatedMediaDataUri(
    api,
    "https://workspace.checkstation.app/media/members/1/2.jpg",
    fakeFetch,
  );
  assert.match(sawCookie, /checkstation_sessionid=sess-secret/);
  assert.match(dataUri, /^data:image\/jpeg;base64,/);
  assert.doesNotMatch(dataUri, /sess-secret/);
});

test("failed image load falls back via onerror markup", () => {
  const html = buildKioskPersonAvatarHtml({ name: "Takeshi Sato", photoUrl: "https://example.com/missing.jpg" });
  assert.match(html, /onerror=/);
  assert.match(html, /classList\.add\('kiosk-person-avatar--fallback'\)/);
  assert.match(html, />TS</);
});

test("initials and tone helpers match Desktop naming rules", () => {
  assert.equal(kioskPersonInitials("Budi Santoso"), "BS");
  assert.equal(kioskPersonInitials("Nami"), "N");
  assert.equal(typeof kioskAvatarToneStep("Michael Johnson"), "number");
  assert.ok(kioskAvatarToneStep("Michael Johnson") >= 0 && kioskAvatarToneStep("Michael Johnson") <= 4);
});
