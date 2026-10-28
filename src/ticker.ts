/**
 * One shared clock for every elapsed-time label. Member rows are virtualized
 * and numerous, so they must not each own a timer: the interval runs only
 * while at least one label is mounted.
 */
import { ref, type Ref } from "vue";

const now = ref(Date.now());
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export function useNow(): { now: Ref<number>; release(): void } {
    users += 1;
    if (timer === null) {
        now.value = Date.now();
        timer = setInterval(() => (now.value = Date.now()), 30_000);
    }
    let released = false;
    return {
        now,
        release() {
            if (released) return;
            released = true;
            users -= 1;
            if (users === 0 && timer !== null) {
                clearInterval(timer);
                timer = null;
            }
        },
    };
}
