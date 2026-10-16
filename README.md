# Compact workspace header tab swipes — QA

All media uses temporary mock-provider workspaces and synthetic drafts.

- [Touch navigation recording](swipe-tabs.webm): chat, terminal and draft; both swipe directions and both tab boundaries.
- [Gesture guards recording](gesture-guards.webm): one tab; short, vertical, diagonal, canceled and multi-finger gestures; mouse dragging; a swipe starting on the switcher trigger, then tapping it and selecting an existing tab.
- [Terminal after a swipe](swiped-to-terminal.png).
- [Retained draft after a swipe](swiped-to-draft.png).
- [Check output](checks.txt). Metro and isolated daemon addresses are omitted.

Tested in Chromium using a 390 × 844 mobile viewport, 2× device scale, real CDP touch input and touch-enabled context. Native Android, native iOS and Electron were not exercised.

Commands:

```sh
npm run format
npm run typecheck
npm run lint
env -u PASEO_PASSWORD E2E_RECORD_VIDEO=1 npm run test:e2e --workspace=@getpaseo/app -- e2e/browser/workspace-tab-switcher-rename.spec.ts
```

The invocation clears password configuration for isolated test daemons. The navigation test was first run before the implementation and failed at the first expected swipe to the adjacent terminal (expected one visible terminal, received zero). The final complete spec reports four passing tests.
