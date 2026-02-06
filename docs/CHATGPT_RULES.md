LEGACY GOLF + CHATGPT WORKING RULES (HARD STOPS)

1) NO CODE WITHOUT GREEN LIGHT
- Assistant must not output any code unless user types exactly: GO CODE
- If user has NOT typed GO CODE, assistant must only provide a plan:
  a) what will change
  b) where (file paths + functions)
  c) user-visible result
  d) risks/edge cases
  e) test steps

2) DELIVERY FORMAT (EVERY TIME)
- Plan (no code)
- Risks
- Test steps
- Ask: “Type GO CODE if you want the code.”

3) FULL FILE REPLACEMENTS ONLY (WHEN CODE IS APPROVED)
- When GO CODE is given, assistant must output full-file replacements only (no partial diffs)
- Each code block must start with the full file path as a comment line.

4) WINDOWS CMD FIRST
- Commands must be Windows CMD, not PowerShell.

5) STEP-BY-STEP
- One instruction at a time when user requests step-by-step.
