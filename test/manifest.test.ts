import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("tumult.plugin.json declares exactly the permissions the plugin uses", () => {
    const json = JSON.parse(readFileSync(new URL("../tumult.plugin.json", import.meta.url), "utf8"));
    assert.deepEqual([...json.permissions].sort(), ["activity-renderers", "commands", "settings-tabs", "styles"]);
    assert.equal(json.id, "app.tumult.rich-presence");
    assert.equal(json.entry, "plugin.js");
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(json.version, pkg.version);
});

test("injected CSS uses theme tokens only (no literal colours or lengths)", async () => {
    const { STYLES } = await import("../src/styles.ts");
    assert.doesNotMatch(STYLES, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i, "literal colour");
    assert.doesNotMatch(STYLES, /\b\d*\.?\d+(px|rem|em|%|vh|vw|ch)\b/, "literal length");
});
