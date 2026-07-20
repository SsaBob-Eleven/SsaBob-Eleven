# Project invariants

These accepted product and architecture decisions apply to all implementation work in this repository.

1. The service supports at most 26 registrations per round.
2. The service is for South Korea only. Use `Asia/Seoul` and `ko-KR`; do not add multi-region or multilingual behavior.
3. Keep the runtime architecture small: one Vue static SPA on Netlify, one Express API/worker Render web service, and SQLite at `/var/data/lunch.db` on a Render Persistent Disk.
4. Keep exactly one backend instance. Do not introduce autoscaling, distributed workers, queues, or PostgreSQL unless the user explicitly changes the scale requirement.
5. A team size of 4–5 is a target, not a hard constraint.
6. Use the `ADAPTIVE` group-size policy. When a bucket cannot be divided into groups of 4–5, include every participant and create the most balanced grouping with minimum target-size deviation.
7. Never leave a participant unassigned merely to preserve the 4–5 target.
8. Mark target-size-adjusted teams with `sizeAdjusted=true`; this is a normal result, not an error.
9. Target group sizes may be changed through `TARGET_GROUP_MIN_SIZE` and `TARGET_GROUP_MAX_SIZE`, but the adaptive behavior must remain.
10. Treat `docs/adr/0001-small-single-region-adaptive-groups.md` as the source of truth for capacity and adaptive grouping, and `docs/adr/0002-netlify-render-single-instance.md` as the source of truth for deployment. Supersede either decision with a new ADR instead of silently reversing it.
