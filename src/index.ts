/**
 * Rich Presence — Discord-style activities for Tumult.
 *
 * Producer: a settings tab and `/activity` write an `app.tumult.activity`
 * document to the user's MSC4133 extended profile, and (optionally, on by
 * default) mirror "Playing Chess" into `status_msg` so every Matrix client sees
 * something. Consumer: an activity renderer replaces the status line in member
 * rows and the user bar for anyone whose profile carries a valid document.
 *
 * On desktop a native app pushes its activity through the shell's native feed
 * (the `native-activity` permission — the one declared exception to the
 * bridge-less shell), and this mirrors it into the same profile field, so
 * "what a person is doing" shows the same on desktop and web. On the web the
 * feed is empty, so the native mirror degrades to nothing and only the manual
 * producer runs.
 *
 * Uses component permissions, so it runs in the trusted (in-page) lane.
 */
import type { Plugin, PluginManifest } from "@tumult/ui";

import { ACTIVITY_KEY, isActivity, makeActivity, mirrorText, parseActivityArgs } from "./activity.ts";
import ActivityLine from "./components/ActivityLine.vue";
import ActivitySettings from "./components/ActivitySettings.vue";
import { controllerFor } from "./controller.ts";
import { nativeConsumerFor } from "./native.ts";
import { STYLES } from "./styles.ts";

export const manifest: PluginManifest = {
    id: "app.tumult.rich-presence",
    name: "Rich Presence",
    version: "0.2.0",
    author: "jackgraddon",
    description: "Discord-style activities (Playing / Listening / Watching) on your profile, shown in member lists and the user bar; on desktop, mirror what native apps are doing.",
    permissions: ["activity-renderers", "commands", "settings-tabs", "styles", "native-activity"],
    minCore: "1.5.0",
    minUI: "1.3.0",
};

export const USAGE = "/activity [playing|listening|watching|custom] [emoji] <name> [| details]  ·  /activity clear";

export const plugin: Plugin = {
    manifest,

    install(ctx) {
        ctx.injectStylesheet(STYLES);

        ctx.addActivityRenderer({
            id: "app.tumult.rich-presence.activity",
            key: ACTIVITY_KEY,
            component: ActivityLine,
            match: isActivity,
        });

        ctx.addSettingsTab({
            id: "app.tumult.rich-presence.settings",
            title: "Activity",
            component: ActivitySettings,
        });

        ctx.addCommand({
            name: "activity",
            description: "Set or clear your activity (Playing / Listening / Watching)",
            usage: "[type] <name> | clear",
            run: async ({ args }) => {
                const parsed = parseActivityArgs(args);
                if (parsed === null) throw new Error(`Usage: ${USAGE}`);
                const controller = controllerFor(ctx.client);
                if (parsed.clear) {
                    await controller.clearActivity();
                    return;
                }
                const doc = makeActivity(parsed.input);
                const result = await controller.setActivity(doc);
                if (!result.profile && result.skippedManual) {
                    throw new Error(
                        `Extended profiles are unsupported here and your custom status was left alone, so "${mirrorText(doc)}" was not published.`,
                    );
                }
            },
        });

        // Mirror native/RPC activity (desktop only; empty on the web) into the
        // same field. Returned as teardown, so uninstalling stops it, and the
        // shell's feed teardown un-subscribes it on the way out.
        const feed = ctx.nativeActivity();
        return nativeConsumerFor(ctx.client).start(feed);
    },
};

export default plugin;
