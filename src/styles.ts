/**
 * Plugin CSS, injected with `ctx.injectStylesheet()` (a sibling .css would not
 * ship — see vite.config.ts). Theme tokens only: no literal colours or lengths,
 * so the plugin follows every installed theme, mode and density.
 */
export const STYLES = `
.tumult-rp-activity {
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    line-height: var(--leading-tight);
}
.tumult-rp-activity > * { flex: none; }
.tumult-rp-headline,
.tumult-rp-secondary {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}
.tumult-rp-headline { font-weight: var(--weight-semibold); color: var(--text-primary); }
.tumult-rp-activity--row .tumult-rp-headline { font-weight: var(--weight-normal); color: inherit; }
.tumult-rp-elapsed,
.tumult-rp-secondary { color: var(--text-muted); }
.tumult-rp-elapsed { font-variant-numeric: tabular-nums; }

.tumult-rp-settings { display: grid; gap: var(--space-4); color: var(--text-primary); }
.tumult-rp-heading { margin: 0; font-size: var(--text-lg); font-weight: var(--weight-bold); }
.tumult-rp-notice {
    margin: 0;
    padding: var(--space-3);
    border: var(--border-width) solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--surface-inset);
    color: var(--text-secondary);
    font-size: var(--text-sm);
}
.tumult-rp-form { display: grid; gap: var(--space-3); }
.tumult-rp-field { display: grid; gap: var(--space-1); font-size: var(--text-sm); color: var(--text-secondary); }
.tumult-rp-field input,
.tumult-rp-field select {
    padding: var(--space-2);
    border: var(--border-width) solid var(--border-default);
    border-radius: var(--radius-sm);
    background: var(--surface-inset);
    color: var(--text-primary);
    font: inherit;
}
.tumult-rp-actions { display: flex; gap: var(--space-2); }
.tumult-rp-actions button {
    padding: var(--space-2) var(--space-4);
    border: var(--border-width) solid var(--border-default);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--text-primary);
    font: inherit;
    cursor: pointer;
}
.tumult-rp-actions button[type="submit"] { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast); }
.tumult-rp-actions button:hover:not(:disabled) { background: var(--surface-hover); }
.tumult-rp-actions button[type="submit"]:hover:not(:disabled) { background: var(--accent-hover); }
.tumult-rp-actions button:disabled { cursor: default; opacity: 0.6; }
.tumult-rp-toggle { display: flex; gap: var(--space-2); align-items: flex-start; font-size: var(--text-sm); }
.tumult-rp-message { margin: 0; color: var(--text-secondary); font-size: var(--text-sm); }
.tumult-rp-error { margin: 0; color: var(--danger); font-size: var(--text-sm); }
`;
