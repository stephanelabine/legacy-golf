\# Legacy Golf UI Guardrails

Last updated: 2026-02-01



Purpose

This document defines non-negotiable UI rules for Legacy Golf so screens remain consistent, premium, and stable.

These rules exist to prevent accidental UI drift (especially headers).



Core principles

\- Stable-first, then polish

\- Premium iOS-first UI

\- Trust the math

\- Reduce disputes and ambiguity

\- Do not introduce new UI patterns without explicit instruction



Header system (non-negotiable)

1\) Default header approach

\- Legacy Golf uses the custom in-screen header component:

&nbsp; src/components/ScreenHeader.js

\- Tournament setup screens must use ScreenHeader as the first visible UI element.



2\) Navigation header policy

\- RootNavigator uses screenOptions: { headerShown: false } as the default.

\- Do not enable native stack headers (headerShown: true) for individual setup screens.

\- Do not use navigation.setOptions to create or style a header unless explicitly instructed.



3\) Consistency rule

\- Header must remain consistent across tournament setup screens unless the user explicitly instructs otherwise.

\- “Consistent” means:

&nbsp; - ScreenHeader pill back button on left (text: Back)

&nbsp; - Center title always truly centered

&nbsp; - Optional subtitle below title

&nbsp; - Same padding, background, and divider styling as ScreenHeader



Allowed exceptions (must be explicitly approved)

Native headers, immersive headers, or special header layouts are allowed only when:

\- user explicitly requests an “in-tournament live mode” UI

\- user explicitly requests a special screen (leaderboards, scoring, or full-bleed)

\- user explicitly requests a header redesign



Implementation rules

\- If a screen needs a header, use:

&nbsp; import ScreenHeader from "../components/ScreenHeader";

&nbsp; <ScreenHeader navigation={navigation} title="..." subtitle="..." />



\- If a screen currently uses a different header pattern, refactor it to ScreenHeader before adding new UI polish.

\- Never mix header systems within the same flow (no native header on one screen and ScreenHeader on another).



Verification checklist (run before committing)

1\) RootNavigator must not turn headers on for setup screens

\- Search for "headerShown: true" or "options={{ ...LEGACY\_HEADER"

\- RootNavigator should remain globally headerShown: false unless user approves a global change.



2\) Setup screens must include ScreenHeader

\- For every tournament setup screen (Rounds/Course/Tees/Players/Formats/Team vs Team/Pairings/Overview):

&nbsp; confirm ScreenHeader is present and used.



3\) No hidden back-title drift

\- Ensure we do not rely on iOS back button titles.

\- ScreenHeader should handle back behavior consistently.



Quick command checks (Windows CMD)

\- Find accidental native headers:

&nbsp; findstr /s /n /i "headerShown: true" src\\navigation\\\*.js src\\screens\\\*.js



\- Find screens manually setting options:

&nbsp; findstr /s /n /i "setOptions" src\\screens\\\*.js



\- Find screens missing ScreenHeader:

&nbsp; findstr /s /n /i "ScreenHeader" src\\screens\\Tournament\*.js



Decision rule for the assistant (must follow)

Before writing any code that affects headers:

1\) Identify the current header system in use for the flow.

2\) Match the existing standard (ScreenHeader) unless user explicitly requests a change.

3\) If uncertain, stop and ask for the target screen name that represents “correct header.”



