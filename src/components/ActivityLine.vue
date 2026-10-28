<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";

import { activityHeadline, formatElapsed, isActivity } from "../activity.ts";
import type { ActivityVariant } from "@tumult/ui";
import { useNow } from "../ticker.ts";

const props = defineProps<{ userId: string; value: unknown; variant: ActivityVariant }>();

const clock = useNow();
onBeforeUnmount(clock.release);

// `match` already filtered, but a renderer must never throw on a bad value.
const doc = computed(() => (isActivity(props.value) ? props.value : null));
const elapsed = computed(() => (doc.value ? formatElapsed(doc.value.startedAt, clock.now.value) : ""));
const secondary = computed(() => {
    const d = doc.value;
    if (!d) return "";
    return [d.details, d.state].filter(Boolean).join(" · ");
});
const title = computed(() => {
    const d = doc.value;
    if (!d) return "";
    return [activityHeadline(d), secondary.value, elapsed.value].filter(Boolean).join(" — ");
});
</script>

<template>
    <span
        v-if="doc"
        class="tumult-rp-activity"
        :class="`tumult-rp-activity--${variant}`"
        :data-activity-type="doc.type"
        :title="title"
    >
        <span v-if="doc.emoji" class="tumult-rp-emoji" aria-hidden="true">{{ doc.emoji }}</span>
        <span class="tumult-rp-headline">{{ activityHeadline(doc) }}</span>
        <span v-if="variant === 'self' && secondary" class="tumult-rp-secondary">{{ secondary }}</span>
        <span v-if="elapsed" class="tumult-rp-elapsed">{{ elapsed }}</span>
    </span>
</template>
