<script setup lang="ts">
import type { ChatClient } from "@tumult/ui";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { ACTIVITY_KEY, ACTIVITY_TYPES, type Activity, type ActivityType, isActivity, LIMITS, makeActivity } from "../activity.ts";
import ActivityLine from "../components/ActivityLine.vue";
import { controllerFor } from "../controller.ts";
import { nativeConsumerFor, toActivityDocument } from "../native.ts";

const props = defineProps<{ client: ChatClient; close(): void }>();
const client = props.client;
const controller = controllerFor(client);

const supported = ref<boolean | null>(null);
const mirror = ref(controller.prefs().mirror);
const type = ref<ActivityType>("playing");
const name = ref("");
const details = ref("");
const emoji = ref("");
const busy = ref(false);
const message = ref("");
const error = ref("");

// The live native/RPC activity, shared by install() and this tab. On the web the
// feed is empty, so this stays null and the block shows its empty-state note.
const native = nativeConsumerFor(client);
const nativeDoc = computed<Activity | null>(() => {
    const live = native.current.value;
    return live ? toActivityDocument(live) : null;
});
const selfId = client.session.get()?.userId ?? "";

let unsubscribe: (() => void) | null = null;

function load(value: unknown): void {
    if (!isActivity(value)) return;
    type.value = value.type;
    name.value = value.name;
    details.value = value.details ?? "";
    emoji.value = value.emoji ?? "";
}

onMounted(async () => {
    supported.value = await controller.profileFieldsSupported();
    const userId = client.session.get()?.userId;
    if (supported.value && userId) {
        const feed = client.profileField(userId, ACTIVITY_KEY);
        load(feed.get());
        const sub = feed.subscribe(load);
        unsubscribe = () => sub.unsubscribe();
    }
});
onBeforeUnmount(() => unsubscribe?.());

function toggleMirror(event: Event): void {
    mirror.value = (event.target as HTMLInputElement).checked;
    controller.savePrefs({ mirror: mirror.value });
}

function describe(r: { profile: boolean; mirrored: boolean; skippedManual: boolean }, verb: string): string {
    const parts: string[] = [];
    if (r.profile) parts.push(`activity ${verb}`);
    if (r.mirrored) parts.push(`status ${verb === "set" ? "updated" : "cleared"}`);
    if (r.skippedManual) parts.push("your custom status was left as is");
    return parts.length ? parts.join("; ") + "." : "Nothing to do.";
}

async function run(job: () => Promise<string>): Promise<void> {
    busy.value = true;
    message.value = "";
    error.value = "";
    try {
        message.value = await job();
    } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
    } finally {
        busy.value = false;
    }
}

function save(): Promise<void> {
    return run(async () => {
        const doc = makeActivity({
            type: type.value,
            name: name.value,
            details: details.value,
            emoji: emoji.value,
            startedAt: Date.now(),
        });
        const r = await controller.setActivity(doc);
        return describe(r, "set");
    });
}

function clear(): Promise<void> {
    return run(async () => describe(await controller.clearActivity(), "cleared"));
}
</script>

<template>
    <section class="tumult-rp-settings">
        <h2 class="tumult-rp-heading">Activity</h2>
        <p v-if="supported === false" class="tumult-rp-notice" role="note">
            Your homeserver does not support extended profiles (MSC4133), so other people cannot see a
            rich activity. The status-message mirror below is the only output here — keep it on.
        </p>

        <form class="tumult-rp-form" @submit.prevent="save">
            <label class="tumult-rp-field">
                <span>Type</span>
                <select v-model="type" :disabled="busy">
                    <option v-for="t in ACTIVITY_TYPES" :key="t" :value="t">{{ t }}</option>
                </select>
            </label>
            <label class="tumult-rp-field">
                <span>{{ type === "custom" ? "Text" : "Name" }}</span>
                <input v-model="name" :maxlength="LIMITS.name" required :disabled="busy" placeholder="Chess" />
            </label>
            <label class="tumult-rp-field">
                <span>Details (optional)</span>
                <input v-model="details" :maxlength="LIMITS.details" :disabled="busy" />
            </label>
            <label class="tumult-rp-field">
                <span>Emoji (optional)</span>
                <input v-model="emoji" :maxlength="LIMITS.emoji" :disabled="busy" />
            </label>
            <div class="tumult-rp-actions">
                <button type="submit" :disabled="busy || !name.trim()">Set activity</button>
                <button type="button" :disabled="busy" @click="clear">Clear</button>
            </div>
        </form>

        <label class="tumult-rp-toggle">
            <input type="checkbox" :checked="mirror" @change="toggleMirror" />
            <span>
                Also show it as my status message (e.g. "Playing Chess"). A status you typed yourself is
                never overwritten.
            </span>
        </label>

        <p v-if="message" class="tumult-rp-message" role="status">{{ message }}</p>
        <p v-if="error" class="tumult-rp-error" role="alert">{{ error }}</p>

        <section class="tumult-rp-native">
            <h3 class="tumult-rp-native-title">Native / RPC activity</h3>
            <div v-if="nativeDoc" class="tumult-rp-native-active">
                <ActivityLine :user-id="selfId" :value="nativeDoc" variant="self" />
                <p class="tumult-rp-native-note">Mirrored from a native app on your desktop.</p>
            </div>
            <p v-else class="tumult-rp-native-note">
                On desktop, a running app — a game, a music player, an editor — can report what it
                is doing, and it shows here just like your own activity above, wherever your profile
                appears. A web tab cannot see an operating system, so this stays empty in the browser.
            </p>
        </section>
    </section>
</template>
