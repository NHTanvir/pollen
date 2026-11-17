# Contributing to Pollen

Thanks for helping. Pollen checks `poppy.json` documents against the
[Personal Agent Protocol](https://personalagentprotocol.org/docs/1.0/spec), so the most valuable
contributions are reports of real documents it gets wrong, and new rules for requirements it
doesn't check yet.

## Report a false positive or a missed problem

[Open an issue](https://github.com/NHTanvir/pollen/issues/new) with:

- the URL you checked, or the document itself,
- the output of `pollen check <target> --json`,
- the spec section that says Pollen is wrong.

If the spec is ambiguous, say so. It's fine to open an issue just to ask how a rule should read.

## Set up

You need Node.js 18 or newer.

```sh
git clone https://github.com/NHTanvir/pollen.git
cd pollen
npm ci
npm test          # builds, then runs every test
node dist/src/cli.js demo
```

The tests never touch the network: live checks run against a fake fetcher (`tests/helpers.ts`).

## Project layout

| Path | What's there |
| --- | --- |
| `src/rules/` | The rules, one file per group: transport, document, channels, auth, extensions, oauth |
| `src/check.ts` | Fetches, runs the rules, and scores the result |
| `src/fetch.ts`, `src/discover.ts` | HTTP with redirects checked hop by hop, and OAuth issuer discovery |
| `src/report.ts` | The text and JSON reports |
| `src/init.ts`, `src/demo.ts`, `src/cli.ts` | The commands |
| `tests/fixtures/` | Example documents. `manifest.json` names the one rule each broken fixture breaks |
| `docs/SPEC-NOTES.md` | What the spec requires, with sources. Rules are written from this |
| `action.yml` | The GitHub Action |

## Add or change a rule

1. Find the requirement in the [1.0 spec](https://personalagentprotocol.org/docs/1.0/spec) or an
   extension page, and note the section. Every rule cites one.
2. Add the rule with `defineRule` in the right file in `src/rules/`, and register it in
   `src/rules/index.ts`. Use `error` for a MUST that makes agents refuse the document, and
   `warning` for things agents ignore or skip.
3. Give each problem a JSON path, a message that says what's wrong, and a fix that says what to do.
4. Add cases to `tests/rules.test.ts`: at least one that passes and one that fails. The coverage
   test fails if a rule has neither.
5. Add the rule to the table in `README.md`. A test checks that the README lists every rule.
6. If it's a common real-world mistake, add a fixture to `tests/fixtures/invalid/` and list it in
   `tests/fixtures/manifest.json`.

Rules stay deterministic: no LLM calls, no randomness, and no network access outside `check.ts`.
Runtime dependencies stay at zero.

## Pull requests

- Open an issue first for anything bigger than a small fix, so we can agree on the approach.
- Branch off `master`, and reference the issue in the PR (`Closes #12`).
- Keep `npm test` green on Node 18 and later. CI runs Node 18, 20, 22 and 24, and tests the Action.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
