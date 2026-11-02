/**
 * Consumer side of native/RPC rich presence.
 *
 * On desktop a native app pushes an activity into the shell's native feed (the
 * `window.tumultNative` bridge, surfaced to plugins as `ctx.nativeActivity()`).
 * This mirrors it into the SAME `app.tumult.activity` profile field the manual
 * `/activity` command and the settings tab write, so the activity shows to
 * everyone in the member list and the user bar — and disappears when the app
 * goes idle.
 *
 * On the web the feed is always empty: a browser tab cannot observe the
 * operating system, so this does nothing. The same consumer is shared by
 * `install()` and the settings tab, the way `controllerFor` shares the producer
 * — one instance per client, keyed by it.
 *
 * Coordination with the manual producer is "last-writer-wins": a native push
 * supersedes whatever the field currently holds. The one courtesy is a native
 * CLEAR — we only clear the field when the value there is still the document WE
 * own, so a `/activity` typed after our last push is never erased by us going
 * idle. The status-mirror protection (never overwrite a status the user typed)
 * is inherited, because we write through the same `ActivityController`: we do not
 * repeat its `lastMirrored` logic here.
 */
import { ref, type Ref } from "vue";

import type { ChatClient, NativeActivity, NativeActivityFeed } from "@tumult/ui";

import { ACTIVITY_KEY, isActivity, makeActivity, type Activity } from "./activity.ts";
import { controllerFor } from "./controller.ts";

/**
 * A native activity → the `Activity` document we store, or `null` when the push
 * is not a valid activity (a field too long, an empty name). Malformed pushes
 * are ignored rather than clobbering whatever is in the field.
 */
export function toActivityDocument(native: NativeActivity): Activity | null {
    try {
        return makeActivity({
            type: native.type,
            name: native.name,
            details: native.details,
            state: native.state,
            startedAt: native.startedAt,
            emoji: native.emoji,
        });
    } catch {
        return null;
    }
}

/** Do two stored activity documents say the same thing? The ownership key. */
function sameActivity(a: Activity, b: Activity): boolean {
    return (
        a.type === b.type &&
        a.name === b.name &&
        a.details === b.details &&
        a.state === b.state &&
        a.startedAt === b.startedAt &&
        a.emoji === b.emoji
    );
}

/**
 * One native consumer per client. It holds the live native activity (a ref the
 * settings tab binds to) and, while mirroring, writes through the client's shared
 * `ActivityController`, so the manual producer's status-mirror protection applies
 * for free.
 */
export class NativeActivityConsumer {
    private readonly client: ChatClient;
    /** The native document we last pushed and believe the field still holds. */
    private owned: Activity | null = null;
    /** Set once teardown has run, so an in-flight async callback stops. */
    private stopped = false;
    private unsubscribed: (() => void) | null = null;
    private teardown: (() => void) | null = null;

    /** The live native activity. Read by the settings tab; null on the web. */
    readonly current: Ref<NativeActivity | null> = ref(null);

    constructor(client: ChatClient) {
        this.client = client;
    }

    /**
     * Subscribe to the feed and mirror it into the profile field. Returns a
     * disposer (run on the registry's uninstall, or called directly) that stops
     * mirroring and un-subscribes. Idempotent: a second `start` is a no-op that
     * returns the same disposer.
     */
    start(feed: NativeActivityFeed): () => void {
        const teardown = (): void => {
            if (this.teardown === null) return;
            this.teardown = null;
            this.stopped = true;
            const out = this.unsubscribed;
            this.unsubscribed = null;
            out?.();
        };
        if (this.teardown) return this.teardown;
        this.unsubscribed = feed.subscribe((native) => {
            if (this.stopped) return;
            void this.onNative(native);
        });
        this.teardown = teardown;
        return teardown;
    }

    private async onNative(native: NativeActivity | null): Promise<void> {
        // Live view first, so the settings tab reacts to every change, clear
        // included. On the web this stays null, so nothing ever happens.
        this.current.value = native;
        const userId = this.client.session.get()?.userId;
        if (!userId) return;
        const controller = controllerFor(this.client);
        if (native === null) {
            // Going idle: clear only the document we still own, so a manual
            // /activity written since our last push is left in place.
            if (this.owned === null) return;
            const current = this.client.profileField(userId, ACTIVITY_KEY).get();
            if (isActivity(current) && sameActivity(current, this.owned)) {
                await controller.clearActivity();
            }
            this.owned = null;
            return;
        }
        // A push supersedes whatever is in the field (last-writer-wins).
        const doc = toActivityDocument(native);
        if (doc === null) return;
        await controller.setActivity(doc);
        this.owned = doc;
    }
}

const consumers = new WeakMap<object, NativeActivityConsumer>();

/** One native consumer per client, shared by `install()` and the settings tab. */
export function nativeConsumerFor(client: ChatClient): NativeActivityConsumer {
    let consumer = consumers.get(client);
    if (!consumer) {
        consumer = new NativeActivityConsumer(client);
        consumers.set(client, consumer);
    }
    return consumer;
}
