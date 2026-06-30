# AGENTS.md

Guidance for any agent working in this repo.

## Source Control

This repository uses jj git. **CRITICAL** Do not use naked git commands. Do not commit unless otherwise asked to.
Make small, well scoped changes as distinct jj changes with adequate descriptions.

## How to work here (style and behavior)

1. **No extraneous comments.** Add a comment only when the intent cannot be
   inferred from the code, file, tests, and surrounding docs. Prefer clear names
   and structure over narration.
2. **Tests are meaningful and concise.** Cover the most important main paths and
   edge cases first - not every line. If you see uncovered cases that you think
   matter, ask before adding them. (See [Tests](#tests) for the highest-risk
   areas here.)
3. **Stay on task.** Accomplish the requested task first, then raise improvements
   or forward-looking changes. If you have multiple viable approaches, ask for
   feedback before picking one. Do not introduce abstractions (layers, patterns,
   indirection) unless there is a clear present need or the author asked for it.
   Forward-thinking discussion is welcome in plan mode.
4. **Make narrow changes.** Touch only what the task requires. If an existing
   pattern or piece of code is blocking the best implementation, flag it to the
   author before refactoring around or through it.
5. **Write testable code.** Code should be well encapsulated. Prefer injecting fakes over mocks. Prefer dependency injection.

## Tests

Not comprehensive coverage. Ask: _what would I be most nervous about if someone
else changed this code?_ For this app the two highest-risk areas are almost always:

- **Ownership enforcement** - can User A access User B's data? Test this
  explicitly.
- **Validation** - does the app correctly reject bad input (empty titles, missing
  due dates, invalid values)?

A few real tests on these beats twenty tests that a button renders. No tests, or a
test project with no real assertions, is a common rejection reason.

## Documentation

Be sure to update relevant documentation when creating or updating features. Especially around:

- Architecture changes
- Build, test, or other commands
- API contracts
