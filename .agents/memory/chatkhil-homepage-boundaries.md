---
name: Chatkhil homepage change boundaries
description: The user's durable scope constraints for visual work on the Chatkhil Red Crescent Youth website.
---

For homepage redesigns, make visual changes only. Do not change database records, API logic, admin/editor behavior, authentication, or Vercel/deployment configuration. Keep new campaign photos and copy sourced from the existing database-backed CMS so admins can edit them. Work on an isolated GitHub branch rather than the production branch.

**Why:** The user explicitly asked to preserve existing data and system behavior, keep homepage content editable, and avoid deployment regressions.

**How to apply:** Before editing, verify the actual website source and branch. Limit changes to homepage UI/styles and existing CMS reads; do not alter deployment or backend files.