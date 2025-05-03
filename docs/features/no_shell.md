# Feature Specification

I would like to cancel the main interactive shell feature for this program.
See ./src/cli/shell.ts for main shell functionality.

The main difference: the invocation of the program should include the command to execute. There should not be an interactive shell.
The command should be invoked, read the command and its arguments, execute it (e.g. run analysis), and terminate.

There should not be an interactive shell.

It should be possible to ask for available commands (e.g. a --help command).
It should also be possible to ask for help on a specific command.

# Plan

IMPLEMENTATION CHECKLIST (REVISED):

1.  Create `src/commands/analyze.ts` with `runAnalysis(query: string, inputs: string[], modelName: string, memoryService: MemoryService)`, adapting logic from `handleAnalyzeCommand`, removing `saveMemory` call.
2.  Create `src/commands/ask.ts` with `runAsk(input: string, modelName: string, memoryService: MemoryService)`, adapting logic from `handleDefaultCommand`, removing `saveMemory` call.
3.  Modify `src/main.ts`: Remove `startShell` import and call.
4.  Modify `src/main.ts`: Import `runAnalysis` and `runAsk`.
5.  Modify `src/main.ts`: Define `analyze` subcommand using `program.command('analyze')...action()` calling `runAnalysis(options.query, options.inputs, modelName, memoryService)` (passing specific args).
6.  Modify `src/main.ts`: Define `ask` subcommand using `program.command('ask')...action()` calling `runAsk(inputText, modelName, memoryService)` (passing specific args).
7.  Modify `src/main.ts`: Change `program.parse` to `await program.parseAsync(process.argv)`.
8.  Modify `src/main.ts`: Add `await memoryService.saveMemory()` call *after* `program.parseAsync` within the `main` function's `try` block.
9.  Modify `src/main.ts`: Update log messages around saving and shutdown.
10. Add `// TODO: Obsolete...` comment to the top of `src/cli/shell.ts`.
11. Add `// TODO: Obsolete...` comment to the top of the file containing `handleAnalyzeCommand` (e.g., `src/cli/AnalyzeCommand.ts`).
12. Update `docs/main_shell_flow.md`: Modify Mermaid diagram and step-by-step description for the new CLI flow.
13. Plan Testing Updates: Adapt `tests/AnalyzeCommand.test.ts` for `runAnalysis` signature. Remove/gut `tests/shell.test.ts`.
14. Plan New Tests: Create unit tests for `runAsk` (`tests/commands/ask.test.ts`). Create integration tests (`tests/integration/cli.test.ts`).
15. Update `docs/features/no_shell.md` with this *revised* checklist under the `## Plan` section.

# Implementation Log

## Summary of `no_shell` Feature Implementation

The primary goal of this implementation was to remove the interactive shell component (`src/cli/shell.ts`) and transition the application to a standard Command-Line Interface (CLI) model where commands (`analyze`, `ask`) are specified directly upon invocation (e.g., `node dist/main.js analyze ...`). This involved using the `commander` library for argument parsing and command dispatch.

**Implementation Steps:**

1.  **Planning:** A detailed, multi-step plan was formulated, including refactoring command logic, modifying the main entry point (`src/main.ts`), handling memory persistence, updating documentation, and outlining test modifications. The plan was revised early on to pass specific, named arguments to command handlers rather than the generic `options` object from `commander`.
2.  **Command Refactoring:** Logic from the old interactive shell handlers (`handleAnalyzeCommand`, `handleDefaultCommand`) was extracted and adapted into new, dedicated command modules (`src/commands/analyze.ts` and `src/commands/ask.ts`) with clear function signatures (`runAnalysis`, `runAsk`).
3.  **Main Entry Point Update (`src/main.ts`):** The `main.ts` file was significantly reworked. `commander` was configured to define the global options (`--model`, `--memory-file`) and the specific subcommands (`analyze`, `ask`) with their respective arguments/options. It now uses `program.parseAsync()` to parse arguments and trigger the corresponding command's asynchronous action handler. Crucially, memory saving using `MemoryService.saveMemory()` was centralized here, occurring only after a known command action completes successfully.
4.  **Marking Obsolete Code:** TODO comments were added to the now-obsolete `src/cli/shell.ts` and `src/cli/AnalyzeCommand.ts` files, recommending their deletion.
5.  **Documentation Update:** The flow documentation (`docs/main_shell_flow.md`) was updated with a new Mermaid diagram and step-by-step description reflecting the CLI-driven execution flow.
6.  **Testing Implementation & Challenges:**
    *   The existing test file for the analyze command (`tests/AnalyzeCommand.test.ts`) was refactored to target the new `runAnalysis` function and associated helpers.
    *   **Linter/Type Errors:** Multiple attempts were required to automatically fix linter errors introduced during test refactoring, primarily related to importing types (`AppState`, `StateSnapshot`) correctly and accessing the payload within LangGraph's `Command` object (eventually resolved using `.input`).
    *   **Stubbing Errors:** Tests failed with `TypeError: Descriptor for property ... is non-configurable and non-writable` when attempting to directly stub `fsPromises.writeFile` and `path.resolve` using `sinon.stub()`. This indicated these module properties couldn't be modified.
    *   **DI Solution:** Referencing previous logs (`implementation_log.md`, `configurable_model.md`), the fix involved leveraging the Dependency Injection (DI) pattern already present in the function under test (`persistFinalOutput`). Standalone Sinon stubs were created for `writeFileFn` and `resolveFn` and passed as arguments during the test, successfully mocking the dependencies without altering the original modules.

**Deviations from Plan:**

*   The testing phase involved more significant debugging and iterative fixes than initially anticipated, particularly concerning type errors and the stubbing of non-configurable module properties.
*   The solution to the stubbing error relied on knowledge gained from previous implementation challenges and was applied reactively rather than being pre-emptively included in this feature's plan.

Overall, the feature was implemented successfully, migrating the application from an interactive shell to a standard CLI structure, albeit with notable challenges encountered and overcome during the testing phase.