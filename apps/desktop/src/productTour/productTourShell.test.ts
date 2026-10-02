import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tour = readFileSync(join(here, "DesktopProductTour.tsx"), "utf8");
const visuals = readFileSync(join(here, "ProductTourVisuals.tsx"), "utf8");
const css = readFileSync(join(here, "productTour.css"), "utf8");

test("product tour uses a light fixed header/main/footer shell", () => {
  assert.match(tour, /className="product-tour-header"/);
  assert.match(tour, /className="product-tour-main"/);
  assert.match(tour, /className="product-tour-footer"/);
  assert.match(css, /\.product-tour-header\s*\{[\s\S]*flex:\s*none/);
  assert.match(css, /\.product-tour-footer\s*\{[\s\S]*flex:\s*none/);
  assert.match(css, /\.product-tour-main\s*\{[\s\S]*flex:\s*1/);
  assert.match(css, /--pt-bg:\s*#f5f7fb/);
  assert.doesNotMatch(css, /linear-gradient\(155deg,\s*var\(--pt-navy\)/);
});

test("product tour footer keeps stable nav slots for Back and Next", () => {
  assert.match(tour, /product-tour-nav-start/);
  assert.match(tour, /product-tour-nav-end/);
  assert.match(tour, /product-tour-nav-spacer/);
  assert.match(css, /\.product-tour-nav-end\s*\{[\s\S]*margin-left:\s*auto/);
});

test("product tour uses optimized final slide images with contain fit", () => {
  for (const n of ["01", "02", "03", "04", "05", "06", "07"]) {
    assert.equal(existsSync(join(here, "assets", `slide-${n}.webp`)), true);
    assert.match(visuals, new RegExp(`slide-${n}\\.webp`));
  }
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /\.product-tour-image-frame/);
  assert.doesNotMatch(css, /\.ptv-/);
  assert.doesNotMatch(visuals, /ptv-platforms|PlansVisual|PlatformsVisual/);
});
