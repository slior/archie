# Feature Specification

We would like to implement a new feature - enable the user to specify the model when invoking the program.

The model name should be given as an argument to the initial program.
- The parameter should be called 'model'
- The value is a simple string.
- The model should be kept and made available to all LLM calls, to be used as the model when making LLM calls.
- The model name should have a hard-coded default.
- Whatever model is chosen, it should be made explicit to the user in the console.

# Plan

**Overall Approach:**
*   The model name will be specified via a `--model` CLI argument.
*   A default model will be defined in `src/agents/LLMUtils.ts` and used as the default for the CLI argument and as a fallback in the LLM call function.
*   The chosen model name will be propagated through the application primarily via the `AppState` managed by LangGraphJS.
*   Logging will confirm the selected model at startup and the model used for each API call.

**Detailed Steps:**

1.  **Modify `src/agents/LLMUtils.ts`:**
    *   Export the `DEFAULT_MODEL` constant.
    *   Modify the `callOpenAI` function signature to accept an optional `modelName?: string` parameter.
    *   Inside `callOpenAI`, determine the `effectiveModel`: if `modelName` is provided (not null/undefined/empty), use it; otherwise, use `DEFAULT_MODEL`.
    *   Log the `effectiveModel` using `dbg` right before the `openai.chat.completions.create` call (e.g., `dbg(\`Using model for API call: ${effectiveModel}\`)`).
    *   Use `effectiveModel` in the `openai.chat.completions.create` call (`model: effectiveModel`).

2.  **Modify `src/main.ts`:**
    *   Import `DEFAULT_MODEL` from `src/agents/LLMUtils.ts`.
    *   Add a new `.option()` to the `program` definition: `.option('--model <name>', 'Specify the OpenAI model to use', DEFAULT_MODEL)`.
    *   After `program.parse(process.argv)`, retrieve the model name: `const modelName = options.model;`.
    *   Add a log statement: `console.log(\`Using model: ${modelName}\`);`.
    *   Modify the `startShell` call to pass the model name: `await startShell(memoryService, modelName);`.

3.  **Modify `src/cli/shell.ts`:**
    *   Update the `startShell` function signature to accept `modelName: string`: `export async function startShell(memoryService: MemoryService, modelName: string)`.
    *   In the `analyze` case of the `switch` statement, modify the call to pass the model name: `await handleAnalyzeCommand(args, modelName);`.
    *   Update the `handleDefaultCommand` signature to accept `modelName: string`: `async function handleDefaultCommand(commandInput: string, modelName: string)`.
    *   Inside `handleDefaultCommand`, add `modelName: modelName` to the `initialState` object.
    *   In the `default` case of the `switch` statement in `startShell`, modify the call to pass the model name: `await handleDefaultCommand(commandInput, modelName);`.

4.  **Modify `src/cli/AnalyzeCommand.ts`:**
    *   Update the `handleAnalyzeCommand` signature to accept `modelName: string`: `export async function handleAnalyzeCommand(args: string[], modelName: string, ...other dependencies...)`.
    *   Inside `handleAnalyzeCommand`, add `modelName: modelName` to the `initialAppState` object.
    *   *Note:* Since dependencies are injected, ensure the signature change is reflected in the default parameters and any direct calls if applicable, although the primary call from `shell.ts` will provide it.

5.  **Modify `src/agents/graph.ts`:**
    *   Add `modelName: string;` to the `AppState` interface definition.
    *   Add a new channel configuration for `modelName` within the `channels` object passed to `StateGraph`: `modelName: { value: (x, y) => y ?? x, default: () => "" }`. This ensures the model name persists if updated and defaults to an empty string (actual default logic handled later).

6.  **Modify `src/agents/AnalysisPrepareNode.ts`:**
    *   Update the `callLLM` function signature to accept `modelName: string`: `async function callLLM(history: HistoryMessage[], files: Record<string, string>, promptType: PromptType, modelName: string): Promise<string>`.
    *   Inside `callLLM`, pass the `modelName` argument when calling `callOpenAI`: `return await callOpenAI(history, constructedPrompt, modelName);`.
    *   Update the `returnFinalOutput` function:
        *   Access the model name: `const modelName = state.modelName;`.
        *   Pass `modelName` when calling `callLLM`: `const finalOutput = await callLLM(currentHistory, state.fileContents, PROMPT_TYPE_FINAL, modelName);`.
    *   Update the `callLLMForNextStep` function:
        *   Access the model name: `const modelName = state.modelName;`.
        *   Pass `modelName` when calling `callLLM`: `const agentResponse = await callLLM(currentHistory, state.fileContents, promptType, modelName);`.

**IMPLEMENTATION CHECKLIST:**

1.  [ ] Export `DEFAULT_MODEL` constant in `src/agents/LLMUtils.ts`
2.  [ ] Update `callOpenAI` signature in `src/agents/LLMUtils.ts` to accept optional `modelName?: string`
3.  [ ] Implement logic in `callOpenAI` to determine and log `effectiveModel` based on `modelName` and `DEFAULT_MODEL`
4.  [ ] Use `effectiveModel` in `openai.chat.completions.create` call within `callOpenAI`
5.  [ ] Import `DEFAULT_MODEL` in `src/main.ts`
6.  [ ] Add `--model <name>` option to `commander` in `src/main.ts` using imported `DEFAULT_MODEL`
7.  [ ] Retrieve `modelName` from parsed options in `src/main.ts`
8.  [ ] Log the selected `modelName` in `src/main.ts`
9.  [ ] Update `startShell` call in `src/main.ts` to pass `modelName`
10. [ ] Update `startShell` signature in `src/cli/shell.ts` to accept `modelName: string`
11. [ ] Update `handleAnalyzeCommand` call in `src/cli/shell.ts` to pass `modelName`
12. [ ] Update `handleDefaultCommand` signature in `src/cli/shell.ts` to accept `modelName: string`
13. [ ] Add `modelName` to `initialState` in `handleDefaultCommand`
14. [ ] Update `handleDefaultCommand` call in `src/cli/shell.ts` to pass `modelName`
15. [ ] Update `handleAnalyzeCommand` signature in `src/cli/AnalyzeCommand.ts` to accept `modelName: string`
16. [ ] Add `modelName` to `initialAppState` in `handleAnalyzeCommand`
17. [ ] Add `modelName: string;` to `AppState` interface in `src/agents/graph.ts`
18. [ ] Add `modelName` channel configuration to `StateGraph` in `src/agents/graph.ts`
19. [ ] Update `callLLM` signature in `src/agents/AnalysisPrepareNode.ts` to accept `modelName: string`
20. [ ] Pass `modelName` to `callOpenAI` within `callLLM` in `src/agents/AnalysisPrepareNode.ts`
21. [ ] In `returnFinalOutput` (in `AnalysisPrepareNode.ts`), get `modelName` from state and pass it to `callLLM`
22. [ ] In `callLLMForNextStep` (in `AnalysisPrepareNode.ts`), get `modelName` from state and pass it to `callLLM`

## Testing

Here is a plan for testing the configurable model feature:

**Manual Testing Scenarios:**

1.  **Default Model Test (Analyze Command):**
    *   Run the application without the `--model` argument (`node dist/main.js`).
    *   Observe the startup log: Verify it logs `Using model: <DEFAULT_MODEL>`.
    *   Execute an `analyze` command (`analyze --query "test" --inputs ./some_dir`).
    *   Observe the debug logs: Verify that before the OpenAI API call, it logs `Using model for API call: <DEFAULT_MODEL>`.
    *   Complete the analysis flow.

2.  **Specific Model Test (Analyze Command):**
    *   Run the application *with* the `--model` argument, specifying a valid alternative model (e.g., `node dist/main.js --model gpt-4o`).
    *   Observe the startup log: Verify it logs `Using model: gpt-4o`.
    *   Execute an `analyze` command (`analyze --query "test" --inputs ./some_dir`).
    *   Observe the debug logs: Verify that before the OpenAI API call, it logs `Using model for API call: gpt-4o`.
    *   Complete the analysis flow.

3.  **Default Model Test (Default Command):**
    *   Run the application without the `--model` argument (`node dist/main.js`).
    *   Observe the startup log: Verify it logs `Using model: <DEFAULT_MODEL>`.
    *   Execute a default command (e.g., type "hello").
    *   Observe the debug logs: Verify that before the OpenAI API call (if the default handler makes one - *needs confirmation*), it logs `Using model for API call: <DEFAULT_MODEL>`.

4.  **Specific Model Test (Default Command):**
    *   Run the application *with* the `--model` argument (e.g., `node dist/main.js --model gpt-4o`).
    *   Observe the startup log: Verify it logs `Using model: gpt-4o`.
    *   Execute a default command (e.g., type "hello").
    *   Observe the debug logs: Verify that before the OpenAI API call (if applicable), it logs `Using model for API call: gpt-4o`.

**Potential Edge Cases/Further Tests (Optional):**

*   Test with different valid OpenAI model names.
*   Consider what happens if an *invalid* model name is provided (the API call will likely fail - verify error handling is reasonable).

# Implementation Log

## Summary

The feature was implemented according to the plan. Key changes involved:
- Added a `--model` command-line option in `src/main.ts` using `commander`, defaulting to `DEFAULT_MODEL` imported from `src/agents/LLMUtils.ts`.
- Added `modelName: string` to the `AppState` interface and configured its channel in `src/agents/graph.ts`.
- Propagated the `modelName` from `main.ts` through `startShell`, `handleAnalyzeCommand`, and `handleDefaultCommand`.
- Added `modelName` to the initial state created in `handleAnalyzeCommand` and `handleDefaultCommand`.
- Modified `callOpenAI` in `src/agents/LLMUtils.ts` to accept `modelName`, log the effective model used, and pass it to the OpenAI API call, falling back to `DEFAULT_MODEL` if necessary.
- Updated the `callLLM` helper and its callers (`returnFinalOutput`, `callLLMForNextStep`) in `src/agents/AnalysisPrepareNode.ts` to retrieve `modelName` from the state and pass it down to `callOpenAI`.
- Created a new test suite `tests/GenAI.test.ts` using Mocha/Chai/Sinon, mirroring the testing plan.
- Updated existing tests in `tests/AnalyzeCommand.test.ts` to accommodate the `handleAnalyzeCommand` signature change.
- Fixed several test failures by correcting mock implementations and assertions.

## Review Verdict

**Plan Checklist:** All 22 items were completed.

**Deviations Detected:**
*   :warning: DEVIATION DETECTED: `handleDefaultCommand` was exported from `src/cli/shell.ts` to enable testing, which was not specified in the original plan.
*   :warning: DEVIATION DETECTED: Existing tests in `tests/AnalyzeCommand.test.ts` required modification due to the signature change in `handleAnalyzeCommand`, which was not explicitly included in the plan's checklist.
*   :warning: DEVIATION DETECTED: Test file `tests/GenAI.test.ts` creation involved additional steps (library conversion, debugging) beyond simply adding tests based on the plan, performed reactively.

**Conclusion:**
:cross_mark: IMPLEMENTATION DEVIATES FROM PLAN (due to necessary testing-related adjustments).