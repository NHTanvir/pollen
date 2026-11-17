# Fixtures

Example `poppy.json` documents that `pollen demo` and the test suite run against.

- `valid/`: documents that pass with no errors.
- `invalid/`: documents that each break **exactly one** error rule. `manifest.json` names the rule,
  and the tests fail if a fixture breaks any other error rule as well.

To add one, drop the file in the right folder and list it in `manifest.json`.

Every organization uses a reserved `.example` domain (RFC 2606), so none of them is a real company.
The one exception is `valid/spec-example.json`, which is the example document from section 3 of the
[Personal Agent Protocol 1.0 specification](https://personalagentprotocol.org/docs/1.0/spec#discovery),
copyright its authors and licensed under the
[Apache License 2.0](https://github.com/personal-agent-protocol/personal-agent-protocol/blob/main/LICENSE).
It uses `example.com`, as the spec does.
