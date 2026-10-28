import assert from "node:assert/strict";
import { test } from "node:test";

import { ACTIVITY_KEY, makeActivity } from "../src/activity.ts";
import type { ActivityClient } from "../src/api.ts";
import { ActivityController, type KeyValueStore } from "../src/controller.ts";

function feed<T>(value: T) {
    return { get: () => value, subscribe: () => ({ unsubscribe() {} }), set(v: T) { value = v; } };
}

function fakeClient(opts: { supported: boolean; status?: string | null; presence?: "online" | "unavailable" }) {
    const calls: { profile: [string, unknown][]; presence: [string, string | undefined][] } = { profile: [], presence: [] };
    const own = feed<{ presence: string; statusMessage: string | null } | null>({
        presence: opts.presence ?? "online",
        statusMessage: opts.status ?? null,
    });
    const client = {
        session: feed({ userId: "@me:example.org" }),
        ownPresence: own,
        profileFieldsSupported: async () => opts.supported,
        setProfileField: async (k: string, v: unknown) => void calls.profile.push([k, v]),
        async setOwnPresence(p: string, s?: string) {
            calls.presence.push([p, s]);
            own.set({ presence: p, statusMessage: s || null });
        },
    } as unknown as ActivityClient;
    return { client, calls };
}

function memStore(): KeyValueStore {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

const chess = makeActivity({ type: "playing", name: "Chess" });

test("writes the profile field and mirrors into an empty status, keeping presence", async () => {
    const { client, calls } = fakeClient({ supported: true, presence: "unavailable" });
    const c = new ActivityController(client, memStore());
    const r = await c.setActivity(chess);
    assert.deepEqual(r, { profile: true, mirrored: true, skippedManual: false });
    assert.deepEqual(calls.profile, [[ACTIVITY_KEY, chess]]);
    assert.deepEqual(calls.presence, [["unavailable", "Playing Chess"]]);
    assert.equal(c.prefs().lastMirrored, "Playing Chess");
});

test("replaces its own previous mirror but never a manual status", async () => {
    const { client, calls } = fakeClient({ supported: true });
    const c = new ActivityController(client, memStore());
    await c.setActivity(chess);
    await c.setActivity(makeActivity({ type: "watching", name: "Film" }));
    assert.equal(calls.presence.at(-1)?.[1], "Watching Film");

    await client.setOwnPresence("online", "brb, lunch"); // the user typed this
    calls.presence.length = 0;
    const r = await c.setActivity(chess);
    assert.equal(r.skippedManual, true);
    assert.equal(r.mirrored, false);
    assert.deepEqual(calls.presence, []);
    const cleared = await c.clearActivity();
    assert.equal(cleared.skippedManual, true);
    assert.deepEqual(calls.presence, []);
});

test("clear removes the field and our own mirror", async () => {
    const { client, calls } = fakeClient({ supported: true });
    const c = new ActivityController(client, memStore());
    await c.setActivity(chess);
    await c.clearActivity();
    assert.deepEqual(calls.profile.at(-1), [ACTIVITY_KEY, null]);
    assert.deepEqual(calls.presence.at(-1), ["online", ""]);
    assert.equal(c.prefs().lastMirrored, null);
});

test("unsupported homeserver: mirror is the only output", async () => {
    const { client, calls } = fakeClient({ supported: false });
    const c = new ActivityController(client, memStore());
    const r = await c.setActivity(chess);
    assert.deepEqual(r, { profile: false, mirrored: true, skippedManual: false });
    assert.deepEqual(calls.profile, []);
});

test("unsupported + mirror off: setting throws instead of pretending", async () => {
    const { client } = fakeClient({ supported: false });
    const c = new ActivityController(client, memStore());
    c.savePrefs({ mirror: false });
    await assert.rejects(() => c.setActivity(chess));
});

test("mirror off leaves status alone; prefs default to mirror on", async () => {
    const { client, calls } = fakeClient({ supported: true });
    const c = new ActivityController(client, memStore());
    assert.equal(c.prefs().mirror, true);
    c.savePrefs({ mirror: false });
    await c.setActivity(chess);
    assert.deepEqual(calls.presence, []);
});

test("a failing support probe counts as unsupported", async () => {
    const { client } = fakeClient({ supported: true });
    (client as { profileFieldsSupported: () => Promise<boolean> }).profileFieldsSupported = () => Promise.reject(new Error("x"));
    assert.equal(await new ActivityController(client, memStore()).profileFieldsSupported(), false);
});
