/**
 * The activity document stored under the `app.tumult.activity` profile field.
 *
 * Versioned JSON: `v` is bumped on any incompatible change, and a reader only
 * accepts versions it understands, so an old client never misrenders a newer
 * document — it falls back to the plain status line instead.
 */
export const ACTIVITY_KEY = "app.tumult.activity";
export const ACTIVITY_VERSION = 1;

export const ACTIVITY_TYPES = ["playing", "listening", "watching", "custom"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface Activity {
    v: 1;
    type: ActivityType;
    /** What: "Chess", "Lo-fi beats", or the custom text itself. */
    name: string;
    details?: string;
    state?: string;
    /** ms since epoch. */
    startedAt?: number;
    emoji?: string;
}

/** Field length caps — the value lands in everyone's profile and member list. */
export const LIMITS = { name: 128, details: 128, state: 128, emoji: 16 } as const;

function optString(value: unknown, max: number): boolean {
    return value === undefined || (typeof value === "string" && value.length <= max);
}

/** Strict validator: a renderer only `match`es documents that pass this. */
export function isActivity(value: unknown): value is Activity {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const doc = value as Record<string, unknown>;
    if (doc.v !== ACTIVITY_VERSION) return false;
    if (typeof doc.type !== "string" || !(ACTIVITY_TYPES as readonly string[]).includes(doc.type)) return false;
    if (typeof doc.name !== "string" || doc.name.trim() === "" || doc.name.length > LIMITS.name) return false;
    if (!optString(doc.details, LIMITS.details)) return false;
    if (!optString(doc.state, LIMITS.state)) return false;
    if (!optString(doc.emoji, LIMITS.emoji)) return false;
    if (doc.startedAt !== undefined) {
        if (typeof doc.startedAt !== "number" || !Number.isFinite(doc.startedAt) || doc.startedAt < 0) return false;
    }
    return true;
}

export interface ActivityInput {
    type: ActivityType;
    name: string;
    details?: string | undefined;
    state?: string | undefined;
    emoji?: string | undefined;
    startedAt?: number | undefined;
}

/** Build a valid document from loose input, trimming and dropping empties. Throws on invalid input. */
export function makeActivity(input: ActivityInput): Activity {
    const doc: Activity = { v: ACTIVITY_VERSION, type: input.type, name: input.name.trim() };
    const details = input.details?.trim();
    const state = input.state?.trim();
    const emoji = input.emoji?.trim();
    if (details) doc.details = details;
    if (state) doc.state = state;
    if (emoji) doc.emoji = emoji;
    if (input.startedAt !== undefined) doc.startedAt = input.startedAt;
    if (!isActivity(doc)) throw new Error("Invalid activity: check the type, the name (1–128 characters) and the field lengths.");
    return doc;
}

const VERBS: Record<ActivityType, string> = {
    playing: "Playing",
    listening: "Listening to",
    watching: "Watching",
    custom: "",
};

/** One-line headline: "Playing Chess", "Listening to Lo-fi", or the custom text. */
export function activityHeadline(doc: Activity): string {
    const verb = VERBS[doc.type];
    return verb ? `${verb} ${doc.name}` : doc.name;
}

/** The `status_msg` mirror text (emoji-prefixed headline). */
export function mirrorText(doc: Activity): string {
    const head = activityHeadline(doc);
    return doc.emoji ? `${doc.emoji} ${head}` : head;
}

/** "5m", "1h 02m", "2d 3h" — or "" for a missing/future start. */
export function formatElapsed(startedAt: number | undefined, now: number): string {
    if (startedAt === undefined || now < startedAt) return "";
    const minutes = Math.floor((now - startedAt) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * Parse `/activity` arguments.
 *
 *   /activity                       → show usage (returns null)
 *   /activity clear                 → { clear: true }
 *   /activity playing Chess         → playing "Chess"
 *   /activity listening Lo-fi | Some Artist
 *   /activity custom 🎉 Celebrating  (a leading emoji-ish token becomes `emoji`)
 *   /activity Chess                 → playing "Chess" (default type)
 *
 * A `|` splits name from details.
 */
export type ParsedCommand = { clear: true } | { clear: false; input: ActivityInput } | null;

export function parseActivityArgs(args: string): ParsedCommand {
    const text = args.trim();
    if (!text) return null;
    if (/^(clear|off|none)$/i.test(text)) return { clear: true };
    const [first = "", ...rest] = text.split(/\s+/);
    let type: ActivityType = "playing";
    let body = text;
    const lower = first.toLowerCase().replace(/^listen(ing)?$/, "listening");
    if ((ACTIVITY_TYPES as readonly string[]).includes(lower)) {
        type = lower as ActivityType;
        body = rest.join(" ");
    }
    let emoji: string | undefined;
    const emojiMatch = /^(\p{Extended_Pictographic}[\p{Extended_Pictographic}‍️\p{Emoji_Modifier}]*)\s+/u.exec(body);
    if (emojiMatch) {
        emoji = emojiMatch[1];
        body = body.slice(emojiMatch[0].length);
    }
    const [name = "", ...detailParts] = body.split("|");
    const details = detailParts.join("|").trim();
    const input: ActivityInput = { type, name, startedAt: Date.now() };
    if (details) input.details = details;
    if (emoji) input.emoji = emoji;
    return { clear: false, input };
}
