# Accessibility

Polyglot Security Guard has no user interface of its own. Everything it shows appears
inside GitHub: the pull request comment, the job summary, inline annotations on the diff,
and code-scanning alerts from the SARIF file. This document describes how that output is
designed to work for everyone, including people using screen readers, magnification,
high-contrast themes or keyboard-only navigation.

## How the output is designed

- **Severity is never shown by color or emoji alone.** Every finding has a text label
  (`🟣 Critical`, `🔴 High`, `🟠 Medium`, `🔵 Low`), so it is understood without seeing
  the color, in any theme, and in plain-text logs.
- **Real tables with headers.** Findings and the "Checks that ran" list are Markdown
  tables with header rows, which GitHub renders as HTML tables that screen readers can
  navigate cell by cell.
- **Plain-language messages.** Each finding says what was found and what to do next (for
  example "Fix: upgrade to 4.17.21"), instead of only a rule ID.
- **Text, not images.** No information is conveyed only through images, badges or charts.
- **Locations as text.** File paths and line numbers are written out (`app/db.py:12`), and
  annotations attach to the exact line, so they are reachable from GitHub's file view.
- **Collapsed detail.** Engine status sits in a `<details>` block, a native disclosure
  element that works with the keyboard and assistive technology.
- **Standard formats.** The SARIF file feeds GitHub's own code-scanning interface, so
  alerts inherit GitHub's accessibility features (filtering, keyboard navigation, theme
  support).

## Known limitations

- **Emoji are read aloud.** Screen readers announce the severity emoji (for example "red
  circle High") before the label. The label is always present, so the meaning is never
  lost, but it adds some noise.
- **Wide tables.** The findings table has four columns and can scroll horizontally on
  narrow screens or at high zoom. The job summary and SARIF alerts carry the same
  information in other layouts.
- **Long reports are capped.** The PR comment shows at most 50 findings (the job
  summary 300) to stay readable; the rest are in the job summary, the `findings` output
  and the Security tab.
- **GitHub's own interface** (how comments, summaries and annotations render) is outside
  this project's control. See
  [GitHub's accessibility documentation](https://accessibility.github.com/).

## Reporting an accessibility problem

If any part of the action's output is hard to use with your setup, please
[open an issue](https://github.com/xkid1/polyglot-security-scan/issues/new/choose) and
describe:

- what you were trying to do and where (PR comment, job summary, annotation, Security
  tab);
- your assistive technology, browser and operating system, if relevant;
- what happened and what you expected.

Accessibility issues are treated as bugs, not feature requests.
