const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createStartupWindows } = require("./startup.cjs");

function setup(loadMain = () => Promise.resolve()) {
  const windows = [];
  const failures = [];
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new EventEmitter(); this.visible = false; this.destroyed = false; windows.push(this); }
    center() { this.centered = true; }
    loadFile(file) { this.file = file; return Promise.resolve(); }
    isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; }
    show() { this.visible = true; }
    destroy() { this.destroyed = true; this.emit("closed"); }
  }
  const main = createStartupWindows({ BrowserWindow: Window, mainOptions: { webPreferences: { sandbox: true } }, loadMain, onFailure: (error) => failures.push(error) });
  return { main, splash: windows[0], failures };
}

test("main stays hidden until ready, splash is centered and closes on reveal", () => {
  const { main, splash } = setup();
  assert.equal(main.options.show, false);
  assert.equal(main.visible, false);
  assert.equal(splash.options.frame, false);
  assert.equal(splash.options.movable, false);
  assert.equal(splash.options.resizable, false);
  assert.equal(splash.centered, true);
  splash.emit("ready-to-show");
  assert.equal(splash.visible, true);
  assert.equal(main.visible, false);
  main.emit("ready-to-show");
  assert.equal(main.visible, false);
  main.webContents.emit("ipc-message", {}, "checkstation:startupReady");
  assert.equal(main.visible, true);
  assert.equal(splash.destroyed, true);
});

test("fast startup never shows an orphan late splash", () => {
  const { main, splash } = setup();
  main.webContents.emit("ipc-message", {}, "checkstation:startupReady");
  main.emit("ready-to-show");
  splash.emit("ready-to-show");
  assert.equal(splash.visible, false);
  assert.equal(splash.destroyed, true);
});

test("startup failure destroys both windows and reports failure once", async () => {
  const { main, splash, failures } = setup(() => Promise.reject(new Error("load failed")));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(main.destroyed, true);
  assert.equal(splash.destroyed, true);
  assert.equal(failures.length, 1);
  main.emit("ready-to-show");
  assert.equal(main.visible, false);
});

test("closing main or renderer crash cleans up splash", () => {
  const closed = setup();
  closed.main.destroy();
  assert.equal(closed.splash.destroyed, true);
  const crashed = setup();
  crashed.main.webContents.emit("render-process-gone", {}, { reason: "crashed" });
  assert.equal(crashed.splash.destroyed, true);
  assert.equal(crashed.main.destroyed, true);
});
