import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatCurrency, formatDate, formatNumber } from "./format.js";

describe("formatCurrency", () => {
  it("formats Japanese locale with USD currency", () => {
    const formatted = formatCurrency(9.99, { locale: "ja", currency: "USD" });
    assert.match(formatted, /9\.99|9\.9/);
    assert.match(formatted, /(\$|USD)/);
  });

  it("formats English locale with JPY currency", () => {
    const formatted = formatCurrency(1200, { locale: "en", currency: "JPY" });
    assert.match(formatted, /1,200|1200/);
    assert.match(formatted, /(¥|JPY)/);
  });
});

describe("formatDate", () => {
  it("formats dates for English and Japanese locales", () => {
    const value = "2026-09-01T12:00:00.000Z";
    const en = formatDate(value, "en");
    const ja = formatDate(value, "ja");
    assert.ok(en.length > 0);
    assert.ok(ja.length > 0);
  });
});

describe("formatNumber", () => {
  it("formats grouped numbers per locale", () => {
    const en = formatNumber(1234567.89, "en");
    const ja = formatNumber(1234567.89, "ja");
    assert.match(en, /1,234,567\.89/);
    assert.match(ja, /1,234,567\.89/);
  });
});
