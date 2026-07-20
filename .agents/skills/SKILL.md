---
name: spec-driven-project-implementation
description: Use this skill when implementing, modifying, refactoring, or reviewing code in an existing repository where the agent must preserve approved specifications, architecture decisions, code templates, naming conventions, tests, and documentation. Trigger for feature work, bug fixes, migrations, API or schema changes, and cross-file changes that must follow established project patterns. Do not use for isolated throwaway prototypes or requests that do not modify repository artifacts.
---

# Spec-Driven Project Implementation

## Objective

Implement the smallest coherent change that satisfies the requested outcome while preserving the repository's approved contracts, architecture, templates, conventions, tests, and documentation.

Every material implementation decision must be traceable to one of these sources:

- the current task and its acceptance criteria
- effective repository instructions
- an approved specification, ADR, RFC, schema, or design document
- an established implementation or template in the same subsystem
- an existing test that defines intended behavior

Do not invent project rules when repository evidence exists. Do not silently change the design to make implementation easier.

## Skill boundaries

Use this skill when the deliverable changes repository artifacts, including source code, tests, configuration, schemas, migrations, generated files, or documentation.

Do not use this skill for:

- disposable prototypes with no requirement to match an existing repository
- conceptual architecture discussions with no repository change
- generic code examples that are not intended to be committed
- pure code review when another repository-specific review skill governs the task

## Non-negotiable rules

1. Read the effective project instructions before editing files.
2. Identify the canonical specification, contract, template, or precedent before choosing an implementation pattern.
3. Do not resolve conflicts between the task, specifications, and repository instructions silently.
4. Reuse existing generators, templates, components, utilities, error models, and test helpers before creating alternatives.
5. Keep changes limited to the requested behavior and the minimum supporting refactor.
6. Do not weaken tests, bypass validation, or edit snapshots only to make checks pass.
7. Do not edit generated artifacts manually when the repository provides a generator.
8. Do not update an approved specification merely to justify implementation drift.
9. Do not claim a check passed unless the corresponding command completed successfully.
10. Preserve unrelated user changes and avoid repository-wide formatting or cleanup unless explicitly requested.

## Source precedence and conflict handling

Apply these rules in order:

1. Platform and runtime instructions are mandatory.
2. The current task defines the requested outcome and scope.
3. Effective repository instructions define how work must be performed in the current path.
4. Approved specifications, ADRs, RFCs, schemas, and public contracts define intended system behavior.
5. Active code, tests, and documentation provide implementation evidence and compatibility constraints.

The current task does not silently repeal an approved specification or public contract.

When sources conflict:

- Quote or record the conflicting file paths and sections.
- Determine whether one source is explicitly marked obsolete, superseded, generated, or non-normative.
- Continue only with work that is unaffected by the conflict.
- Ask a targeted question when the conflict changes a public API, persisted data, security boundary, billing behavior, authorization rule, migration path, or irreversible operation.
- For lower-impact ambiguity, choose the least invasive option that matches the closest active precedent and disclose the assumption in the final report.

## Required workflow

Follow the steps in order. Do not skip a step because the requested change appears small.

### 1. Establish scope and acceptance criteria

Extract or derive:

- requested behavior
- in-scope modules and files
- explicit non-goals
- affected public interfaces, schemas, data, or configuration
- observable success conditions
- required compatibility constraints

Convert vague goals into verifiable outcomes. Examples include a returned value, emitted event, persisted field, rendered state, error code, migration result, or passing test.

Ask for clarification only when ambiguity materially changes a contract or creates irreversible risk. Otherwise use the narrowest interpretation supported by repository evidence.

### 2. Load repository guidance

Search from the repository root to the target path for applicable instructions and working agreements, including:

- `AGENTS.override.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.github/copilot-instructions.md`
- `CONTRIBUTING.md` or equivalent
- root and module `README` files
- build, test, lint, and CI configuration

Apply the most specific in-scope repository guidance. Do not assume a root convention overrides a documented module-specific rule.

### 3. Locate canonical project sources

Search for project-declared sources of truth, including:

- product or feature specifications
- ADRs and architecture documents
- RFCs and design reviews
- OpenAPI, AsyncAPI, GraphQL, Protocol Buffer, JSON Schema, or database schemas
- migration policies
- design-system tokens and component contracts
- code-generation definitions
- templates, scaffolds, and generators
- test fixtures that are explicitly documented as canonical

Distinguish normative sources from examples, archived documents, experiments, generated outputs, and historical notes.

Do not treat a single implementation file as the architecture specification when a canonical document exists.

### 4. Build a traceability map

Before editing, create a compact internal map with these fields:

| Concern | Canonical source | Path or section | Required behavior | Planned validation |
|---|---|---|---|---|

Include each acceptance criterion and every affected contract. Keep the map current as new evidence appears.

A changed file without a mapped requirement is presumptively out of scope.

### 5. Select the reference implementation or template

Find the closest active precedent in the same subsystem and layer.

Compare at least these dimensions when relevant:

- directory and module boundaries
- naming and file layout
- dependency injection and lifecycle
- request, response, event, and error models
- logging, metrics, and tracing
- configuration and feature flags
- state management and data access
- validation and authorization
- test structure, fixtures, and helpers
- documentation format

Prefer, in order:

1. a repository-provided generator or scaffold
2. an approved template
3. the closest active implementation in the same subsystem
4. a documented organization-wide convention

Do not combine incompatible patterns from unrelated modules. Do not copy code from examples, deprecated paths, migrations, or test fixtures without confirming that the pattern is intended for production use.

If no precedent exists, implement the smallest local solution. Do not create a repository-wide abstraction or standard unless the task explicitly requires one.

### 6. Plan the smallest coherent change

List the files expected to change and the reason for each change.

The plan must cover:

- implementation files
- tests
- schemas or generated artifacts
- documentation
- migration or rollout work when applicable
- validation commands

Separate enabling refactors from behavior changes when practical. Keep every intermediate state buildable and testable.

Do not add a production dependency, shared abstraction, public API, new configuration surface, or persistent field unless the requirement and repository evidence justify it.

### 7. Implement against the selected precedent

During implementation:

- preserve existing module boundaries and dependency direction
- use repository naming, error, logging, configuration, and testing conventions
- start from the canonical template instead of recreating its structure from memory
- use generators for generated files and include the generator input in the change
- keep public contracts backward compatible unless a breaking change is explicitly approved
- validate inputs at the same boundary used by neighboring code
- keep comments focused on rationale, constraints, or non-obvious tradeoffs rather than restating code
- remove temporary debug code, placeholders, and unused scaffolding before completion

Do not introduce speculative flexibility for hypothetical future requirements.

### 8. Add or update tests

Tests must demonstrate the acceptance criteria and protect the changed contract.

For bug fixes, add a regression test that fails before the fix when feasible.

Cover, as applicable:

- primary success behavior
- boundary and invalid input behavior
- authorization or permission behavior
- persistence and migration behavior
- compatibility with existing callers
- generated output or schema conformance

Use the repository's existing test level and helpers. Do not replace a focused unit test with a broad integration test unless the behavior cannot be verified at the existing boundary.

Do not delete assertions, widen tolerances, suppress failures, or update snapshots without inspecting and explaining the behavioral difference.

### 9. Synchronize documentation and specifications

Update documentation in the same change when behavior, configuration, public interfaces, operator workflows, or migration steps change.

Follow these rules:

- use the repository's existing document template and terminology
- update the canonical document rather than duplicating the same rule in multiple files
- link to the canonical specification when repetition would create a second source of truth
- document public behavior, inputs, outputs, defaults, failure modes, and migration steps that changed
- keep code comments local to implementation rationale
- do not rewrite an approved specification to match accidental implementation behavior
- create or update an ADR only when the repository uses ADRs and the change makes an architectural decision

When code and documentation disagree, identify which artifact is canonical before editing either one.

### 10. Run validation from narrow to broad

Discover commands from repository scripts, build files, CI workflows, and contributor documentation. Prefer repository commands over ad hoc alternatives.

Run applicable checks in this order:

1. targeted tests for the changed behavior
2. affected-module lint, formatting, and static analysis
3. affected-module type checking or compilation
4. relevant integration or contract tests
5. repository build or broader test suite when proportionate to the change
6. schema, generated-file, documentation-link, or migration validation
7. `git diff --check` or the repository equivalent

Use the exact project toolchain and pinned versions. Do not substitute a different formatter, linter, package manager, test runner, or generator.

When a command cannot run, record the exact command, failure reason, and what remains unverified. Do not report the work as fully validated.

### 11. Review the diff for design drift

Before completion, inspect the full diff and verify:

- every changed file maps to a requirement or required supporting change
- the implementation follows the selected precedent or documents a justified deviation
- no unrelated formatting, renaming, cleanup, or dependency changes remain
- no public contract changed without corresponding tests and documentation
- no schema or generated artifact is stale
- no test was weakened to accommodate the implementation
- no specification was edited solely to legitimize drift
- no secrets, debug output, temporary flags, or placeholder values remain
- rollback, migration, and compatibility concerns are addressed when applicable

If a deviation remains, state the source, reason, impact, and follow-up required.

## Decision rules for common situations

### Specification and implementation disagree

Verify that the specification is current and approved.

- If the specification is current and the task requests alignment, change code and tests to match it.
- If status is unclear and the difference affects a contract, stop the affected change and surface the conflict.
- Do not silently change the specification to preserve existing code.

### Multiple implementation patterns exist

Choose the pattern used by the same subsystem and architectural layer. Prefer active production code over examples or deprecated modules.

If competing patterns are both active and materially different, do not blend them. Select the one named by project guidance or request a decision when the choice creates a new long-lived convention.

### No template or convention exists

Implement a local, minimal solution that satisfies the requirement. Keep names and structure consistent with neighboring code. Record the absence of a canonical pattern; do not promote the new solution as a repository-wide standard.

### Validation fails outside the changed area

Confirm whether the failure reproduces without the change when feasible. Do not modify unrelated code merely to obtain a green run. Report the pre-existing or unrelated failure separately with evidence.

### Generated files change unexpectedly

Inspect the generator version, inputs, and command. Do not hand-edit the output. Revert unrelated generated changes or explain why the generator deterministically requires them.

### A new dependency appears necessary

First search for an existing dependency or internal utility that provides the capability. Add a new production dependency only when the requirement cannot be met with established project tools and the repository's dependency policy permits it.

## Final response contract

Report completion using this structure:

### Result

- Summarize the observable behavior changed.
- List the changed files or modules and their purpose.

### Traceability

- Map each acceptance criterion to its canonical source, implementation files, and tests.
- Name the template, generator, or reference implementation followed.

### Validation

- List each command run with `passed`, `failed`, or `not run`.
- Include material failure details without hiding partial validation.

### Deviations and unresolved items

- State `None` when there are no deviations.
- Otherwise list each conflict, assumption, unverified behavior, or follow-up with its impact.

## Definition of done

The task is complete only when:

- each acceptance criterion is implemented and traceable
- the selected repository template or precedent is followed
- tests cover the changed contract
- applicable documentation and schemas are synchronized
- required validation passes, or unrun and failed checks are explicitly disclosed
- the final diff contains no unrelated changes or unexplained design drift
