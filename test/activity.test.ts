import assert from "node:assert/strict";
import { test } from "node:test";

import {
    activityHeadline,
    formatElapsed,
    isActivity,
    makeActivity,
    mirrorText,
    parseActivityArgs,
} from "../src/activity.ts";

test("isActivity accepts a minimal and a full v1 document", () => {
    assert.ok(isActivity({ v: 1, type: "playing", name: "Chess" }));
    assert.ok(isActivity({ v: 1, type: "listening", name: "Lo-fi", details: "x", state: "y", startedAt: 1, emoji: "🎧" }));
});

test("isActivity rejects wrong versions, types and shapes", () => {
    for (const bad of [
        null, "Chess", [], {},
        { v: 2, type: "playing", name: "Chess" },
        { v: 1, type: "streaming", name: "Chess" },
        { v: 1, type: "playing", name: "   " },
        { v: 1, type: "playing", name: "x".repeat(129) },
        { v: 1, type: "playing", name: "Chess", details: 5 },
        { v: 1, type: "playing", name: "Chess", startedAt: "now" },
        { v: 1, type: "playing", name: "Chess", startedAt: Number.NaN },
        { v: 1, type: "playing", name: "Chess", emoji: "x".repeat(17) },
    ]) assert.equal(isActivity(bad), false, JSON.stringify(bad));
});

test("makeActivity trims and drops empty optionals, and throws on invalid input", () => {
    assert.deepEqual(makeActivity({ type: "watching", name: " Film ", details: " ", emoji: "" }), {
        v: 1, type: "watching", name: "Film",
    });
    assert.throws(() => makeActivity({ type: "playing", name: "" }));
});

test("headline and mirror text", () => {
    assert.equal(activityHeadline({ v: 1, type: "playing", name: "Chess" }), "Playing Chess");
    assert.equal(activityHeadline({ v: 1, type: "listening", name: "Lo-fi" }), "Listening to Lo-fi");
    assert.equal(activityHeadline({ v: 1, type: "custom", name: "Out to lunch" }), "Out to lunch");
    assert.equal(mirrorText({ v: 1, type: "watching", name: "Film", emoji: "🎬" }), "🎬 Watching Film");
});

test("formatElapsed", () => {
    assert.equal(formatElapsed(undefined, 0), "");
    assert.equal(formatElapsed(1000, 0), "");
    assert.equal(formatElapsed(0, 30_000), "just now");
    assert.equal(formatElapsed(0, 5 * 60_000), "5m");
    assert.equal(formatElapsed(0, 62 * 60_000), "1h 02m");
    assert.equal(formatElapsed(0, 27 * 3_600_000), "1d 3h");
});

test("parseActivityArgs", () => {
    assert.equal(parseActivityArgs("  "), null);
    assert.deepEqual(parseActivityArgs("clear"), { clear: true });
    const a = parseActivityArgs("listening 🎧 Lo-fi | Some Artist");
    assert.ok(a && !a.clear);
    assert.equal(a.input.type, "listening");
    assert.equal(a.input.emoji, "🎧");
    assert.equal(a.input.name, "Lo-fi ");
    assert.equal(a.input.details, "Some Artist");
    const b = parseActivityArgs("Chess");
    assert.ok(b && !b.clear);
    assert.equal(b.input.type, "playing");
    assert.equal(makeActivity(b.input).name, "Chess");
});
