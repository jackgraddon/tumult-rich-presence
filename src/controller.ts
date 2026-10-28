/**
 * Producer side: set/clear the activity and keep the optional `status_msg`
 * mirror honest.
 *
 * Mirror rule: we only ever overwrite a status message that is empty or that
 * WE wrote last time (`lastMirrored`). Anything else was typed by the user (here
 * or on another client) and is left alone. Presence itself is never changed —
 * the current value is re-sent alongside the new message.
 */
import type { OwnPresenceState } from "@tumult/ui";

import { ACTIVITY_KEY, type Activity, mirrorText } from "./activity.ts";
import type { ActivityClient } from "./api.ts";

export interface KeyValueStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface Prefs {
    /** Mirror the activity into `status_msg`. ON by default. */
    mirror: boolean;
    /** The exact text the plugin last wrote to `status_msg`, or null. */
    lastMirrored: string | null;
}

const PREFS_KEY = "app.tumult.rich-presence.prefs";
export const DEFAULT_PREFS: Prefs = { mirror: true, lastMirrored: null };

/** Browser storage can throw (private mode, blocked site data) — fall back to memory. */
export function safeStorage(): KeyValueStore {
    const memory = new Map<string, string>();
    const fallback: KeyValueStore = {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => void memory.set(k, v),
    };
    try {
        const ls = globalThis.localStorage;
        if (!ls) return fallback;
        return {
            getItem: (k) => {
                try { return ls.getItem(k); } catch { return fallback.getItem(k); }
            },
            setItem: (k, v) => {
                try { ls.setItem(k, v); } catch { fallback.setItem(k, v); }
            },
        };
    } catch {
        return fallback;
    }
}

export interface SetResult {
    /** Whether the profile field was written (false when MSC4133 is unsupported). */
    profile: boolean;
    /** Whether `status_msg` was written. */
    mirrored: boolean;
    /** Set when the mirror was skipped because the status looked manual. */
    skippedManual: boolean;
}

export class ActivityController {
    private readonly client: ActivityClient;
    private readonly store: KeyValueStore;
    private supported: Promise<boolean> | null = null;

    constructor(client: ActivityClient, store: KeyValueStore = safeStorage()) {
        this.client = client;
        this.store = store;
    }

    private prefsKey(): string {
        const userId = this.client.session.get()?.userId ?? "anonymous";
        return `${PREFS_KEY}:${userId}`;
    }

    prefs(): Prefs {
        try {
            const raw = this.store.getItem(this.prefsKey());
            if (!raw) return { ...DEFAULT_PREFS };
            const parsed = JSON.parse(raw) as Partial<Prefs>;
            return {
                mirror: typeof parsed.mirror === "boolean" ? parsed.mirror : DEFAULT_PREFS.mirror,
                lastMirrored: typeof parsed.lastMirrored === "string" ? parsed.lastMirrored : null,
            };
        } catch {
            return { ...DEFAULT_PREFS };
        }
    }

    savePrefs(patch: Partial<Prefs>): Prefs {
        const next = { ...this.prefs(), ...patch };
        this.store.setItem(this.prefsKey(), JSON.stringify(next));
        return next;
    }

    /** Cached: the answer does not change within a session. A failure counts as unsupported. */
    profileFieldsSupported(): Promise<boolean> {
        this.supported ??= this.client.profileFieldsSupported().catch(() => false);
        return this.supported;
    }

    async setActivity(doc: Activity): Promise<SetResult> {
        const profile = await this.writeProfile(doc);
        const { mirrored, skippedManual } = await this.mirror(mirrorText(doc));
        if (!profile && !mirrored && !skippedManual) {
            throw new Error("Nothing was written: extended profiles are unsupported here and the status mirror is off.");
        }
        return { profile, mirrored, skippedManual };
    }

    async clearActivity(): Promise<SetResult> {
        const profile = await this.writeProfile(null);
        const { mirrored, skippedManual } = await this.mirror(null);
        return { profile, mirrored, skippedManual };
    }

    private async writeProfile(value: Activity | null): Promise<boolean> {
        if (!(await this.profileFieldsSupported())) return false;
        await this.client.setProfileField(ACTIVITY_KEY, value);
        return true;
    }

    /** `text === null` clears a mirror we own. */
    private async mirror(text: string | null): Promise<{ mirrored: boolean; skippedManual: boolean }> {
        const prefs = this.prefs();
        if (!prefs.mirror) return { mirrored: false, skippedManual: false };
        const own = this.client.ownPresence.get();
        const current = own?.statusMessage ?? "";
        const ours = current === "" || current === prefs.lastMirrored;
        if (!ours) return { mirrored: false, skippedManual: true };
        if (text === null && current === "") {
            this.savePrefs({ lastMirrored: null });
            return { mirrored: false, skippedManual: false };
        }
        const presence: OwnPresenceState = own?.presence ?? "online";
        await this.client.setOwnPresence(presence, text ?? "");
        this.savePrefs({ lastMirrored: text });
        return { mirrored: true, skippedManual: false };
    }
}

const controllers = new WeakMap<object, ActivityController>();

/** One controller per client, shared by the command and the settings tab. */
export function controllerFor(client: ActivityClient): ActivityController {
    let c = controllers.get(client);
    if (!c) {
        c = new ActivityController(client);
        controllers.set(client, c);
    }
    return c;
}
