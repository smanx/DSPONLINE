# UI visual feedback development handoff (2026-08-04)

## Role and boundary

- Source role: `feedback`
- Target role: `develop`
- Priority: P1 for unreadable, unusable, or non-persistent UI; P2 for discoverability and organization improvements.
- Release target: none. Do not deploy, publish packages, or update the download page in this task.
- Data boundary: do not change `GameState`, save-envelope, cloud-save, leaderboard, or simulation semantics for these UI fixes.

## Why this handoff replaces the previous summary

The previous development prompt summarized the requested UI changes but omitted the player's reference images. As a result, broad theme work could appear complete while the exact reported surfaces remained broken. This handoff restores every currently available reference path and makes image-by-image verification mandatory.

As of 2026-08-04, all 19 attachment files listed below were verified and copied into `docs/feedback-assets/ui-2026-08-04/`. Use these repository copies rather than the original Windows temporary paths.

## Required development workflow

1. Read `docs/PROJECT_STATUS.md`, `docs/ARCHITECTURE.md`, `docs/GAMEPLAY_SYSTEMS.md`, and `docs/TESTING_RELEASE.md`.
2. Inspect the dirty worktree and preserve all existing user and agent changes. Do not reset, clean, or overwrite unrelated work.
3. Open every attachment below at full resolution before editing. Do not rely only on the textual summary.
4. Reproduce each surface in the current target build and record one of: `reproduced`, `already fixed and verified`, or `not reproducible with evidence`.
5. Implement shared theme/layout rules where appropriate. Do not add 19 independent screenshot-specific CSS overrides.
6. Capture matching after-fix screenshots for every reproduced item.
7. The final development handoff must include an attachment checklist. A generic statement such as "light theme fixed" is not acceptance evidence.

## P1-A: settings layout collapses at larger font sizes

### Evidence A1: endgame settings reduced to a one-character column

- Attachment: [open A1](./feedback-assets/ui-2026-08-04/A1-settings-large-font.png)
- Observed: endgame performance setting titles wrap one Chinese character per line; icons and toggles detach from their labels; descriptions overflow into a large empty area.
- Expected: title, description, icon, and toggle remain a readable row. If width is insufficient, switch to a deliberate stacked single-column layout.

### Evidence A2: the same setting layout remains broken in a second capture

- Attachment: [open A2](./feedback-assets/ui-2026-08-04/A2-settings-large-font-2.png)
- Observed: "终局优化·极限模式" and its child settings are vertically fragmented; the toggle overlaps the title area.
- Expected: no single-character wrapping, overlap, clipping, detached hitboxes, or large accidental blank column.

### Acceptance for P1-A

- Validate 80%, 100%, 125%, 150%, and 200% font scales.
- Validate desktop 1920x1080 and 1366x768, tablet landscape, phone portrait, and phone landscape.
- Use responsive grid/flex constraints; do not solve this by shrinking text.
- Toggle hitboxes must remain aligned with the visible controls.
- Long translated labels must wrap by words/phrases, never one glyph per line unless the viewport is genuinely narrower than the minimum supported layout.

## P1-B: comprehensive light-theme audit

The player's requested visual rule is explicit:

- ordinary surfaces use white or light-neutral backgrounds;
- hover, focus, selected, carrying, and active states use a visible light-green treatment;
- positive/add operations use pale green;
- destructive/recycle operations use pale red;
- disabled states remain readable and distinct;
- black or near-black component backgrounds must not remain in light mode unless a documented semantic reason requires them.

Do not apply one blanket color override. Preserve hierarchy with light background tokens, borders, shadows, and semantic state tokens. Verify contrast for text and icons in default, hover, pressed, selected, focused, disabled, warning, error, and success states.

### Evidence B1: settings cards still use dark backgrounds

- Attachment: [open B1](./feedback-assets/ui-2026-08-04/B1-settings-cards.png)
- Surfaces: simulation diagnostics, release history, QQ group, tutorial action.
- Expected: consistent light cards and readable status colors.

### Evidence B2: save-management actions remain dark

- Attachment: [open B2](./feedback-assets/ui-2026-08-04/B2-save-management.png)
- Surfaces: save now, create snapshot, export JSON, import JSON, slot and snapshot controls.
- Expected: light-theme action hierarchy; destructive actions retain clear pale-red treatment.

### Evidence B3: item hover card remains dark

- Attachment: [open B3](./feedback-assets/ui-2026-08-04/B3-item-hover-card.png)
- Surfaces: item name, source, uses, locate button, codex button.
- Expected: light tooltip/card, readable copy, consistent action buttons, and accessible shadow/border.

### Evidence B4: current-task panel remains dark

- Attachment: [open B4](./feedback-assets/ui-2026-08-04/B4-current-task.png)
- Expected: light task surface with clear progress and active state.

### Evidence B5: planet switcher and locked planet cards remain dark

- Attachment: [open B5](./feedback-assets/ui-2026-08-04/B5-planet-switcher.png)
- Expected: light cards for available and locked planets; locked/disabled status must not reuse the dark-theme panel.

### Evidence B6: quick-build hammer states are visually wrong

- Attachment: [open B6](./feedback-assets/ui-2026-08-04/B6-construction-hammers.png)
- Surfaces: construction tray and gray/yellow/green quick-build hammers.
- Expected: ready, partially available, and missing-material states remain both semantically correct and visually distinguishable in light mode. Do not rely only on hue; use icon/border/state affordances where needed.
- Regression link: also verify the historical green-hammer state calculation and gray-hammer explicit jump behavior; theme work must not hide a logic error.

### Evidence B7: inspector power-grid panel remains dark

- Attachment: [open B7](./feedback-assets/ui-2026-08-04/B7-inspector-power.png)
- Surfaces: quantity controls, recovery controls, grid status, power state, and priority segmented control.
- Expected: light inspector surfaces with readable semantic warning/error text.

### Evidence B8: selected-building quick-action bar remains dark

- Attachment: [open B8](./feedback-assets/ui-2026-08-04/B8-selection-action-bar.png)
- Surfaces: selection count, focus/trace, copy, move, lock/unlock, delete, cancel, and confirm.
- Expected: light toolbar; selected, enabled, disabled, destructive, and confirm states are immediately distinguishable.

### Evidence B9: achievement toast remains dark and unreadable

- Attachment: [open B9](./feedback-assets/ui-2026-08-04/B9-achievement-toast.png)
- Expected: readable light-theme achievement toast with preserved success semantics.

### Evidence B10: run-log panel remains dark

- Attachment: [open B10](./feedback-assets/ui-2026-08-04/B10-run-log.png)
- Expected: light log panel, readable entries/dividers, and visible close button.

### Evidence B11: carried cargo and left resource tray remain dark

- Attachment: [open B11](./feedback-assets/ui-2026-08-04/B11-carried-cargo-tray.png)
- Surfaces: cursor cargo label, handheld interstellar payload, Dyson summary, parent-planet material tray, task panel, tray inputs and presets.
- Expected: white/light-normal cards and a visible light-green carrying/active highlight. Do not use a black carrying badge in light mode.

### Evidence B12: selected building card has the wrong background and badge layout

- Attachment: [open B12](./feedback-assets/ui-2026-08-04/B12-selected-node.png)
- Observed: selected card uses a dark body; the "已选中" badge is clipped/misaligned at the top.
- Expected: light card with persistent green selection treatment; the badge remains inside a stable header slot and never covers the title, status, ports, or actions.

### Evidence B13: construction-state overlays remain dark

- Attachment: [open B13](./feedback-assets/ui-2026-08-04/B13-construction-overlays.png)
- Surfaces: `Ctrl 连续建` shortcut chip and placement/array-count preview.
- Expected: light placement overlays with readable green active state; they must not obstruct the placement target.

### Evidence B14: inspector positive and destructive actions lack semantic color

- Attachment: [open B14](./feedback-assets/ui-2026-08-04/B14-inspector-semantic-actions.png)
- Expected: "增加建筑" is pale green; "回收设备" is pale red. Apply consistent semantics to add, reduce, recycle, delete, confirm, cancel, and upgrade controls.

### Evidence B15: segmented controls do not reveal the selected option

- Attachment: [open B15](./feedback-assets/ui-2026-08-04/B15-segmented-selection.png)
- Surfaces: belt priority, cargo stack, route mode, monitoring, copy/paste/apply-network, upstream/downstream focus.
- Expected: selected option uses a clear light-green fill/border and an additional state cue where useful; unselected and disabled options remain distinct.

### Acceptance for P1-B

- Search the affected component styles for hard-coded dark backgrounds and migrate them to shared semantic theme tokens where appropriate.
- Do not use broad `!important` patches that override component states indiscriminately.
- Verify every B1-B15 screenshot surface in both themes.
- Verify light theme at all supported font scales and viewports.
- Text, icons, and controls must meet readable contrast; no white-on-white, dark-on-dark, clipped text, or hidden buttons.
- Theme-only changes must not alter click targets, selection data, inventory, construction, simulation, or save behavior.

## P1-C: explicit theme choice does not persist

- Reproduction: select light theme, return to the main menu, then enter the game again. The game returns to dark theme.
- Expected: an explicit light/dark choice persists across main-menu navigation, game re-entry, reload, browser restart, PWA restart, and desktop-app restart.
- `follow system` must remain distinct from an explicit player choice.
- Apply the stored theme before first render to prevent a dark flash.
- Theme is a device-level UI preference and must not enter `GameState` or cloud saves.

## P1-D: stable and unambiguous building selection

- Historical report: clicking a building can briefly show selection and then clear it; the player cannot tell whether it is selected.
- Expected: selection remains authoritative until the player selects another target, clicks the pane intentionally, or performs an explicit clear action.
- Simulation refreshes, node re-derivation, inspector updates, and React Flow transient events must not clear the selection.
- Selected styling must remain obvious in both themes and at low zoom.
- Mobile multi-select must remain stable for 5, 10, 20, and 50 selected buildings.
- Cross-reference Evidence B12 for the selected-card visual defect.

## P2-E: endgame compact nodes should identify their recipe/output

- Attachment: [open E1](./feedback-assets/ui-2026-08-04/E1-endgame-node-title.png)
- Observed: compact/endgame nodes primarily show building names such as `矩阵研究站`, making the actual product difficult to identify.
- Expected:
  - production machines use the current recipe or primary output as the main title;
  - building type is secondary text;
  - research labs show the current technology in research mode and the matrix recipe in production mode;
  - unconfigured machines show `未设置配方`;
  - storage, power, logistics, and other non-recipe buildings keep their building/status title.
- Performance constraint: reuse the existing lightweight snapshot. Do not add per-frame catalog scans or extra high-frequency DOM.

## P2-F: independent left/right side-panel collapse controls

- Attachment/reference interaction: [open F1](./feedback-assets/ui-2026-08-04/F1-side-panel-reference.jpg)
- Expected:
  - left and right panels have independent edge-arrow toggles;
  - one click fully retracts the panel and another restores it;
  - a collapsed panel leaves only a stable arrow/tab, not a black empty strip;
  - canvas space expands when a panel is collapsed;
  - tab, scroll position, inspector content, and selected building are restored on expansion;
  - state is a device-level preference, not save data;
  - reduced-motion/endgame mode can switch without animation.

## P2-G: release history pagination

- Settings must expose all bundled historical release notes, newest first.
- Use pagination (suggested 5-10 releases per page), previous/next controls, and direct page selection where space permits.
- Opening a release shows full details; returning preserves page and scroll position.
- Historical entries must remain available offline from bundled data and must not require a network request.
- Mobile controls must remain visible and tappable.

## P1-H: technology-tree wheel behavior on desktop

- This repeats an older unresolved request and must be verified rather than duplicated.
- While the pointer is over the technology tree, vertical or diagonal wheel/trackpad input moves the tree horizontally only.
- Wheel input must not change the technology tree's vertical offset or scroll the parent page.
- Vertical movement remains available through the visible vertical scrollbar click/drag controls.
- Preserve horizontal/vertical scrollbar dragging, keyboard navigation, right-button panning, standard layout, and compact layout.

## P2-I: run-log visibility and settings information architecture

### Run-log visibility

- Add a persistent device-level `show run log` preference.
- When disabled, ordinary run-log bars and automatic run-log panels do not appear after menu navigation, reload, or restart.
- Do not suppress required error, save-failure, achievement, or research-completion messages.
- Disabling presentation should not silently disable diagnostic collection unless a separate setting explicitly says so.

### Settings organization

- The settings page currently exposes too many controls at once.
- Group controls into clear categories such as theme/display, endgame performance, interaction/control, save/cloud, statistics/run log, and tutorial/release/other.
- Use collapsible sections or secondary pages for dense categories.
- Preserve setting values, section state, page state, and scroll position when navigating back.
- Do not make nested decorative cards; use simple full-width sections and stable rows.

## P2-J: item-hover trigger area is too large

- Current behavior: hovering anywhere in an item row/card can open the item information card.
- Expected: only the item icon, item name, or quantity content triggers the hover card. Empty row space, buttons, inputs, and adjacent items do not.
- Moving from the trigger to the hover card must keep it open so `定位` and `打开图鉴` remain clickable.
- Preserve keyboard focus behavior on desktop and click/long-press behavior on mobile.
- Do not break item click, drag, carrying, or manufacturing actions.

## Related text-only UI requirements to regression-check

These were previously recorded and some are documented as shipped in 1.0.25. Do not reimplement blindly; verify the target build and fix only remaining regressions.

1. Resource shortage during rapid handcraft should not passively navigate away when auto-jump is disabled; explicit gray-hammer/missing-item actions still navigate.
2. Production statistics can filter by planet while preserving time range, sort, and search.
3. Trace mode highlights the selected building's full upstream/downstream network and can be disabled from toolbar/settings.
4. Autosave offers a 10-minute interval and a disabled option; manual save/export/cloud sync remain independent.
5. Selected building state is visually stable and does not flicker.

## Smallest likely ownership areas

- Theme tokens and global responsive rules: `src/theme.css`, `src/styles.css`
- Theme boot/persistence: `src/main.tsx`, device-level UI preference helper
- Settings/save/release/run-log surfaces: `src/components/OperationsWorkspace.tsx`, `src/components/ReleaseNotesDialog.tsx`, `src/components/StartMenu.tsx`
- Canvas nodes, inspector, construction tray, carried cargo, sidebars: `src/components/FactoryNodes.tsx`, `src/components/GamePanels.tsx`, `src/App.tsx`
- Item hover card: `src/components/ItemReference.tsx`
- Technology-tree scrolling: `src/components/TechnologyWorkspace.tsx`, `src/hooks/useHorizontalPan.ts`
- Mobile equivalents: `src/components/mobile/`, responsive portions of `src/styles.css`

Inspect current ownership before editing; do not assume the file list is exhaustive.

## Required visual and interaction matrix

At minimum verify:

- themes: dark, light, follow-system resolving to both;
- font scales: 80%, 100%, 125%, 150%, 200%;
- viewports: 1920x1080, 1366x768, tablet landscape, phone portrait, phone landscape;
- interaction states: default, hover, focus, pressed, selected, disabled, warning, error, success, carrying, placing;
- modes: standard canvas, endgame extreme mode, standard/compact technology tree;
- navigation: enter game, return menu, re-enter, reload.

Run the proportional UI matrix from `docs/TESTING_RELEASE.md`, including typecheck, production build, focused unit tests, focused Playwright tests, and screenshot review. Shared theme/font/React Flow changes require broad visual regression coverage.

## User-visible acceptance criteria

1. Every attachment A1-A2, B1-B15, E1, and F1 has a recorded before/after or a documented non-reproduction reason.
2. Light mode has no accidental dark panels on the reported surfaces.
3. Selected, unselected, disabled, positive, destructive, warning, and active states are immediately distinguishable.
4. No text becomes a one-character vertical column, overlaps another control, clips, or moves outside its hitbox at supported scales.
5. Explicit light theme persists across all requested navigation/restart paths without a dark flash.
6. None of the UI work changes persisted gameplay state or deterministic simulation results.

## Required final development handoff

Report:

- changed files;
- exact tests and pass/skip/fail counts;
- before/after screenshot path for each reproduced attachment;
- attachment checklist with `fixed`, `already correct`, or `not reproduced` plus evidence;
- unverified platforms/viewports;
- remaining contrast, interaction, or performance risks;
- rollback scope.

Do not mark the task complete if any attachment is silently omitted.
