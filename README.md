# Compact workspace header tab swipes — QA

Source: `5f6544b7045d53716f4164b36b9f51375cd125cb`. All media uses temporary mock-provider workspaces and synthetic drafts.

- [Header ownership](header-ownership.webm): single-tab and boundary no-ops, switches from both header buttons, outer edges and empty padding, and button taps opening the panels.
- [Panel edges](panel-edges.webm): below-header edge swipes open the panels; center and inner-edge starts leave them closed.
- [Tab navigation](swipe-tabs.webm): chat, terminal and draft; both directions and boundaries, retained drafts.
- [Gesture guards](gesture-guards.webm): short, vertical, diagonal, canceled, multi-finger and mouse gestures; swipe then tap the switcher.
- [Retained draft](swiped-to-draft.png).
- [Check output](checks.txt).

Chromium uses a 390 × 844 mobile viewport, 2× device scale and real CDP touch input. These recordings do not establish Android/iOS gesture behavior. Native APK startup evidence is tracked in the PR.

The final spec run passed five cases. The existing guard case reached its 120-second total timeout while clicking a moving switcher row; its isolated repeat passed on the same source. Only that case was repeated after the full spec run. Four targeted policy unit tests and the commit's format, lint and full-workspace typecheck passed.

The header ownership case also passes on the previous browser implementation; it is coverage, not a browser reproduction of the native report. Before the compact transcript touch-action correction, the below-header panel case failed because Chromium canceled the pointer stream after the first move. The corrected case passes.
