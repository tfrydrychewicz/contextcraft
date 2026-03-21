---
"slotmux": minor
---

Add `forceCompress` build override that triggers overflow strategies on all eligible slots even when content is within budget. Uses a synthetic 50% budget so strategies have a meaningful compression target. Works with both `build()` and `buildStream()`.
