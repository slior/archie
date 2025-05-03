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