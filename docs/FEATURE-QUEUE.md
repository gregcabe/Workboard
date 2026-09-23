# Feature queue: decided, not built. Close with an outcome, never delete.

| # | Item | Open question | Status |
|---|---|---|---|
| 1 | Cloudflare Access in front of the page and connector; identity from the login replaces the "You are" picker; `people.email` maps the login to a person | Which emails; whether the connector stays on a bearer key | Open |
| 2 | Drag bars on the Timeline to move dates | Only if people miss it after using the card | Open |
| 3 | Print view | None | Closed 23 Sep: Print button opens a review report (attention list, open actions by owner or workstream, bundles, changes this week); browser print dialog picks Letter or Tabloid; save as PDF |
| 4 | Restore from backup as a launcher | None | Closed 22 Sep: Restore.cmd uses the newest backup, or a file dragged onto it, and asks for YES |
| 5 | Migration runner script (`scripts/migrate.py`) once there is a 002 | None; 001 is pasted into the Turso shell | Open |
| 6 | Post-build security sweep with evidence, per the method | Run after Access lands too | Open |
| 8 | Delete (retract) a post on an action's update log | Connector retract tool: not yet | Closed 22 Sep: a Retract link on each post (click twice) writes a `retract` row naming the post; the log shows "Post retracted by X"; the connector omits retracted posts |
| 9 | Connect Workboard to Greg's WCC (his personal Work Control Center), asked 22 Sep. Likely shape: WCC actions that point at a Workboard key (e.g. VMX-12) and a nightly or on-demand pull that mirrors stage, owner and due into WCC as read-only; Workboard stays the system of record for team actions | Which direction: WCC reads Workboard, or both? One WCC workstream per Workboard project? Where does the pull run (scheduled task on the PC, or a Worker cron)? | Open |
| 10 | Bug: the title box in the card drawer collapses to a sliver above Stage on shorter screens (flex child shrinking when the drawer content overflows). Fixed in the working copy 22 Sep with `.db>*{flex-shrink:0}`; ships with the sweep package | None | Closed 22 Sep, in v1.2 |
| 11 | In-page help: the ? button top right opens a how-to panel | Keep it in step with the team email | Closed 22 Sep, in v1.2 |
| 7 | Second-owner request (VMX-2 came in as two names) | Deliberately refused; revisit only if it recurs | Closed: one owner, others in checklist |
