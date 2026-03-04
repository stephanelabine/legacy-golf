Legacy Golf – Save Today’s Work (Git Snapshots)

Purpose
We create “save points” any time we want a safe restore point (can be many times per day).

Rule
When we say: “save today’s work”
We create a unique annotated git tag and push it to origin.

Tag format
save-YYYY-MM-DD-##
Examples:
save-2026-03-04-01
save-2026-03-04-02

Commands (manual)
1) Confirm status:
git status

2) List existing saves for today:
git tag -l "save-YYYY-MM-DD-*"

3) Create the next tag number:
git tag -a "save-YYYY-MM-DD-##" -m "Save YYYY-MM-DD ##"

4) Push the tag:
git push origin "save-YYYY-MM-DD-##"

Notes
- Tags are preferred over extra branches for frequent saves.
- Do not force-push shared working branches.