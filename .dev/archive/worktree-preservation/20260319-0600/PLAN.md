# Surgical Preservation Plan (No Data Loss)

1. Capture each worktree HEAD + status to MANIFEST.md.
2. For any dirty worktree, create:
   - git diff patch
   - git diff --staged patch
   - git ls-files --others snapshot
   - tar.gz full working tree snapshot
3. Only after artifacts exist, optionally archive/remove worktrees.
4. Keep source-of-truth commit on master separate from archive operations.
