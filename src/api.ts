/**
 * LOCAL DECLARATIONS FOR THE NOT-YET-VENDORED API (contract 1.4.0 / plugin API 1.2.0).
 *
 * `types/plugin.d.ts` is generated in the Tumult repo and, when this plugin was
 * written, it still described contract 1.3.0 / plugin API 1.1.0 — it had no
 * extended-profile methods and no `addActivityRenderer`. These shapes mirror the
 * announced API exactly. Once the vendored types catch up, delete this file and
 * import the same names from "@tumult/ui".
 */
import type { ChatClient, Disposable, PluginContext, Subscribable } from "@tumult/ui";
import type { Component } from "vue";

/** The profile-field half of `ChatClient` (MSC4133 extended profiles). */
export interface ProfileFieldsApi {
    /** Whether the homeserver supports MSC4133 extended profiles. */
    profileFieldsSupported(): Promise<boolean>;
    /** Cached lazy read of a user's field; `null` when unset or unsupported. */
    profileField(userId: string, key: string): Subscribable<unknown | null>;
    /** Write (or with `null`, delete) one of our own fields. Rejects when unsupported. */
    setProfileField(key: string, value: unknown | null): Promise<void>;
}

export type ActivityClient = ChatClient & ProfileFieldsApi;

export type ActivityVariant = "row" | "self";

/** Props every activity renderer component receives. */
export interface ActivityRendererProps {
    userId: string;
    value: unknown;
    variant: ActivityVariant;
}

export interface ActivityRenderer {
    id: string;
    /** Profile-field key whose value is handed to the renderer. */
    key: string;
    component: Component;
    priority?: number;
    match?(value: unknown): boolean;
}

export type ActivityPluginContext = Omit<PluginContext, "client"> & {
    readonly client: ActivityClient;
    addActivityRenderer(renderer: ActivityRenderer): Disposable;
};

/** Narrow the vendored context to the announced one (it is the same object at runtime). */
export function asActivityContext(ctx: PluginContext): ActivityPluginContext {
    return ctx as unknown as ActivityPluginContext;
}
