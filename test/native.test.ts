import assert from "node:assert/strict";
import { test } from "node:test";

import type { NativeActivity, NativeActivityFeed, ChatClient } from "@tumult/ui";

import { ACTIVITY_KEY, isActivity, makeActivity } from "../src/activity.ts";
import { NativeActivityConsumer, nativeConsumerFor, toActivityDocument } from "../src/native.ts";

/** A one-cell feed the controller test's `feed` helper shape (get/subscribe/set). */
function feed<T>(value: T) {
    return { get: () => value, subscribe: () => ({}), set(v: T) { value = v; } };
}

/** A drivable native feed, shaped like the shell's live feed: `current()` plus a
 *  `subscribe` that delivers the current value immediately and a disposer that
 *  un-subscribes. `emit` is the test's handle for a native push or clear. */
function makeFeed(initial: NativeActivity | null = null) {
    let current = initial;
    const subscribers = new Set<(activity: NativeActivity | null) => void>();
    return {
        feed: {
            current: () => current,
            subscribe: (callback: (activity: NativeActivity | null) => void) => {
                subscribers.add(callback);
                callback(current); // a late subscriber still sees the settled value
                let done = false;
                return () => {
                    if (done) return;
                    done = true;
                    subscribers.delete(callback);
                };
            },
        } satisfies NativeActivityFeed,
        emit(value: NativeActivity | null) {
            current = value;
            for (const callback of subscribers) callback(value);
        },
        subscriberCount() {
            return subscribers.size;
        },
    };
}

/** A no-source feed, like the web shell hands out when nothing is active. */
function emptyFeed(): NativeActivityFeed {
    return {
        current: () => null,
        subscribe: (callback) => {
            callback(null);
            return () => {};
        },
    };
}

const chess: NativeActivity = { type: "playing", name: "Chess", emoji: "♛" };
const film: NativeActivity = { type: "watching", name: "Film", details: "Trailer" };
const chessDoc = makeActivity({ type: "playing", name: "Chess", emoji: "♛" });
const filmDoc = makeActivity({ type: "watching", name: "Film", details: "Trailer" });

/** A client with a controllable `app.tumult.activity` field we can read back. */
function fakeClient(opts?: { userId?: string | null }) {
    const calls = { profile: [] as [string, unknown][], presence: [] as [string, string | undefined][] };
    const own = feed<{ presence: string; statusMessage: string | null } | null>({
        presence: "online",
        statusMessage: null,
    });
    const field = feed<unknown>(null); // the stored `app.tumult.activity` value
    const client = {
        session: feed(opts?.userId === undefined ? { userId: "@me:example.org" } : { userId: opts.userId }),
        ownPresence: own,
        profileFieldsSupported: async () => true,
        setProfileField: async (k: string, v: unknown) => {
            calls.profile.push([k, v]);
            field.set(v);
        },
        setOwnPresence: async (p: string, s?: string) => {
            calls.presence.push([p, s ?? undefined]);
            own.set({ presence: p, statusMessage: s || null });
        },
        profileField: (_u: string, _k: string) => field,
    } as unknown as ChatClient;
    return { client, calls, field };
}

/** Let the fire-and-forget `onNative` await chain settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a native SET mirrors into the profile field and exposes the live view", async () => {
    const { client, calls, field } = fakeClient();
    const { feed: f, emit } = makeFeed();
    const consumer = new NativeActivityConsumer(client);
    const done = consumer.start(f);

    emit(chess);
    await flush();

    assert.deepEqual(calls.profile.at(-1), [ACTIVITY_KEY, chessDoc]);
    assert.deepEqual(field.get(), chessDoc);
    assert.deepEqual(consumer.current.value, chess);
});

test("a later native SET supersedes the last one (last-writer-wins)", async () => {
    const { client, field } = fakeClient();
    const { feed: f, emit } = makeFeed();
    const consumer = new NativeActivityConsumer(client);
    consumer.start(f);

    emit(chess);
    await flush();
    emit(film);
    await flush();

    assert.deepEqual(field.get(), filmDoc);
    assert.deepEqual(consumer.current.value, film);
});

test("a CLEAR removes the field only when it still holds the document we own", async () => {
    const { client, calls, field } = fakeClient();
    const { feed: f, emit } = makeFeed();
    const consumer = new NativeActivityConsumer(client);
    consumer.start(f);

    emit(chess);
    await flush();
    assert.deepEqual(field.get(), chessDoc);

    emit(null); // going idle
    await flush();

    assert.deepEqual(calls.profile.at(-1), [ACTIVITY_KEY, null]);
    assert.equal(field.get(), null);
    assert.equal(consumer.current.value, null);

    // Already idle: a further clear is a no-op (we own nothing now).
    const writes = calls.profile.length;
    emit(null);
    await flush();
    assert.equal(calls.profile.length, writes);
});

test("a CLEAR never blanks a manual write made since our last push", async () => {
    const { client, calls, field } = fakeClient();
    const { feed: f, emit } = makeFeed();
    const consumer = new NativeActivityConsumer(client);
    consumer.start(f);

    emit(chess);
    await flush();
    // Simulate the user typing `/activity` a different activity afterwards.
    field.set(filmDoc);

    emit(null);
    await flush();

    // The field still holds the manual film doc — we did not clear it.
    assert.deepEqual(field.get(), filmDoc);
    assert.equal(consumer.current.value, null);
    assert.ok(calls.profile.every(([, value]) => value !== null), "no null write was appended");
});

test("a malformed native push is ignored, leaving the field untouched", async () => {
    const { client, calls } = fakeClient();
    const { feed: f, emit } = makeFeed();
    const consumer = new NativeActivityConsumer(client);
    consumer.start(f);

    emit({ type: "playing", name: "  " }); // empty name -> not a valid activity
    await flush();
    assert.deepEqual(calls.profile, []);

    // A valid push afterwards still lands.
    emit(chess);
    await flush();
    assert.deepEqual(calls.profile.at(-1), [ACTIVITY_KEY, chessDoc]);
});

test("on the web the feed is empty, so a consumer writes nothing", async () => {
    const { client, calls } = fakeClient();
    const consumer = new NativeActivityConsumer(client);
    const done = consumer.start(emptyFeed());

    await flush(); // the empty feed delivers one null at subscription time
    assert.deepEqual(calls.profile, []);
    assert.equal(consumer.current.value, null);

    await done(); // idempotent teardown, no-op here
});

test("start() is idempotent: one subscription, one write per push", async () => {
    const { client, calls } = fakeClient();
    const { feed: f, emit, subscriberCount } = makeFeed();
    const consumer = new NativeActivityConsumer(client);
    const d1 = consumer.start(f);
    const d2 = consumer.start(f);

    assert.equal(d1, d2);
    assert.equal(subscriberCount(), 1);

    emit(chess);
    await flush();
    assert.equal(calls.profile.length, 1);
});

test("the disposer stops mirroring and un-subscribes", async () => {
    const { client, calls } = fakeClient();
    const { feed: f, emit, subscriberCount } = makeFeed();
    const consumer = new NativeActivityConsumer(client);
    const done = consumer.start(f);

    emit(chess);
    await flush();
    assert.equal(calls.profile.length, 1);

    done();
    assert.equal(subscriberCount(), 0);

    emit(film);
    await flush();
    assert.equal(calls.profile.length, 1);
});

test("a client with no settled session writes nothing, but the live view still tracks", async () => {
    const { client, calls } = fakeClient({ userId: null });
    const { feed: f, emit } = makeFeed();
    const consumer = new NativeActivityConsumer(client);
    consumer.start(f);

    emit(chess);
    await flush();
    assert.deepEqual(calls.profile, []);
    assert.deepEqual(consumer.current.value, chess);
});

test("nativeConsumerFor returns one consumer per client", () => {
    const { client } = fakeClient();
    const { client: client2 } = fakeClient();
    assert.equal(nativeConsumerFor(client), nativeConsumerFor(client));
    assert.notEqual(nativeConsumerFor(client), nativeConsumerFor(client2));
});

test("toActivityDocument accepts a valid push and drops a malformed one", () => {
    assert.deepEqual(toActivityDocument(chess), chessDoc);
    assert.equal(toActivityDocument({ type: "playing", name: "  " }), null);
    assert.equal(toActivityDocument({ type: "playing", name: "x".repeat(129) }), null);
});

test("isActivity still recognises a mirrored document", () => {
    assert.ok(isActivity(makeActivity(chess)));
});
