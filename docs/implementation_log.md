# Archie: Implementation Log - Human-in-the-Loop Debugging

This document summarizes the key findings and troubleshooting steps taken while implementing the conversational "Analysis Agent" using LangGraphJS's Human-in-the-Loop (HITL) pattern.

## Goal

Implement a multi-turn conversational agent within a LangGraph graph where the agent can pause execution, ask the user for clarification or input, and then resume processing based on the user's response.

## Initial Approach & Problem 1: Single Node State Persistence

*   **Attempt:** A single agent node (`analysisAgentNode`) was designed to:
    1.  Perform analysis (LLM call).
    2.  Update internal state (add messages to `analysisHistory`, set `currentAnalysisQuery`).
    3.  Call `interrupt({ query: ... })` to pause.
*   **Problem:** Upon resuming (using `Command({ resume: userInput })`), the node re-executed but its state appeared reset. The `analysisHistory` and `currentAnalysisQuery` updates made *before* the `interrupt()` call in the previous run were not present. The `MemorySaver` checkpointer seemed to save the state from *before* the node ran, not the state immediately before the interrupt.

## Solution 1 & Problem 2: Two-Node Structure & Resume Input Handling

*   **Attempt:** Refactored into two nodes:
    1.  `AnalysisPrepareNode`: Does the LLM call, prepares the state update (history, query), and **returns** this update.
    2.  `AnalysisInterruptNode`: Reads the query from the state and calls `interrupt({ query: ... })`.
    *   The graph edge connected `AnalysisInterruptNode` back to `AnalysisPrepareNode` upon resume.
*   **Result:** This successfully fixed the state persistence issue. The checkpointer correctly saved the state returned by `AnalysisPrepareNode` before the interrupt occurred.
*   **New Problem:** Although state persistence worked, the `userInput` state channel was empty when `AnalysisPrepareNode` ran after resuming. The value provided via `Command({ resume: userResponse })` was not being injected into the state.

## Debugging Input Handling

*   Tried explicit `agentApp.updateState()`: This bypassed the graph's resume logic and broke the flow.
*   Tried `Command({ resume: ..., goto: ... })`: Invalid combination, resulted in an error.
*   Tried modifying the `userInput` channel reducer: No effect.

## Final Solution: Capturing `interrupt()` Return Value

*   **Realization:** The `await interrupt(...)` call itself returns the value provided by the user during the resume step.
*   **Modification:** Changed `AnalysisInterruptNode`:
    1.  `await interrupt({ query: ... })` to get the user's input.
    2.  Explicitly **return** the captured input in the state update: `return { userInput: resumedValue }`.
*   **Result:** This worked correctly.
    1.  The framework processes the state update returned by `AnalysisInterruptNode`, setting the `userInput` channel.
    2.  Execution proceeds to `AnalysisPrepareNode`.
    3.  `AnalysisPrepareNode` now correctly receives the user's input via `state.userInput`.
    4.  The conversational loop functions as expected, including detecting the "SOLUTION APPROVED" message.

## Key Learnings for LangGraph HITL

1.  **State Updates Before Interrupt:** State updates intended to be saved *before* an interrupt should ideally be returned by a node *prior* to the node that calls `interrupt()`. A two-node structure (`Prepare` -> `Interrupt`) facilitates this.
2.  **Handling Resumed Input:** Relying solely on `Command({ resume: value })` might not consistently inject the `value` into the state for the next node. The robust method is to capture the return value of `await interrupt(...)` in the interrupting node and explicitly return it in the desired state channel (e.g., `{ userInput: await interrupt(...) }`).

## Unit Testing with Mocha/Chai/Sinon

*   **Goal:** Add comprehensive unit tests for `src/cli/shell.ts` and `src/cli/AnalyzeCommand.ts` to ensure code correctness and facilitate future refactoring.

*   **Initial Challenges & Solutions:**
    *   **ESM/CJS Conflict:** Initial tests failed due to `chai` v5+ being an ES Module while the test environment used CommonJS (`require`).
        *   *Solution:* Downgraded `chai` to `^4.3.0` (a CommonJS version) to resolve the conflict without changing the project's module type.
    *   **Stubbing Imported Modules:** Direct stubbing of imported functions using `sinon.stub(module, 'function')` proved unreliable for ES modules or functions within the same module being tested (e.g., `uuid.v4`, `fs.promises.readFile`, internal calls between `AnalyzeCommand` functions).
        *   *Problem:* Stubs were often bypassed because the function under test held a direct reference to the original imported function, not the stubbed property on the imported namespace object, or due to module loading intricacies.

*   **Dependency Injection (DI) as the Primary Solution:**
    *   *Reasoning:* To overcome the stubbing challenges and create more robust, isolated tests, several functions (`newGraphConfig`, `readFiles`, `analysisIteration`, `handleAnalyzeCommand`) were refactored to use Dependency Injection.
    *   *How it Works:* Instead of directly importing dependencies (like `fs.promises.readFile`, `inquirer.prompt`, `agentApp.stream`, or even other local functions like `runGraph`), the functions were modified to accept these dependencies as optional parameters with default values pointing to the real implementations.
    ```typescript
    // Example: Refactored readFiles
    export async function readFiles(
        files: string[],
        // Injected dependencies with defaults
        readFileFn: ReadFileFn = fsPromises.readFile as ReadFileFn,
        resolveFn: ResolveFn = path.resolve
    ): Promise<Record<string, string>> {
        // ... uses readFileFn and resolveFn internally ...
    }
    ```
    *   *Behavior in Tests:* During unit tests, mock functions (created using `sinon.stub()`) are explicitly passed into the function being tested, replacing the default dependencies. This gives the test complete control over the behavior of external functions or services, ensuring the test verifies only the logic of the unit under test and is not affected by the complexities of module stubbing.

*   **Result:** Achieved comprehensive test coverage for the command-line argument parsing, file reading, and analysis loop logic using Mocha, Chai, and Sinon, leveraging DI for reliable testing of functions with external dependencies. 

## Analysis Agent Implementation Plan (LLM Integration)

This section details the plan for replacing the placeholder LLM call in the Analysis Agent with a real OpenAI API call and updating file input handling.

**REVISED IMPLEMENTATION CHECKLIST:**

1.  **Dependency Management:**
    *   Add the `openai` package as a project dependency (e.g., `npm install openai` or `yarn add openai`). Ensure `dotenv` is also installed if not already (`npm install dotenv`).

2.  **Update Argument Parsing (`src/cli/AnalyzeCommand.ts`)**
    *   Modify the `parseArgs` function signature to return `{ query: string, inputsDir: string }`.
    *   Change the internal logic of `parseArgs` to look for `--inputs <directory_path>` argument instead of multiple `--file` arguments. Store the value in an `inputsDir` variable.
    *   Update the validation logic to check if `q` (query) and `inputsDir` are provided.
    *   Update the usage message printed by `sayFn` within `parseArgs` to reflect the new `--inputs <directory_path>` argument.
    *   In `handleAnalyzeCommand`, update the destructuring assignment from `parseArgsFn` to get `inputsDir` instead of `files`.

3.  **Update File Reading Logic (`src/cli/AnalyzeCommand.ts`)**
    *   Modify the `readFiles` function signature to accept `directoryPath: string` instead of `files: string[]`. Also update the type definition `ReadFileFn` if necessary based on how dependencies are injected.
    *   Replace the `for...of` loop inside `readFiles` with logic that:
        *   Uses `fsPromises.readdir(directoryPath)` to get directory contents.
        *   Filters the contents to keep only filenames ending with `.txt` or `.md`.
        *   Iterates through the filtered filenames.
        *   For each filename, construct the full path using `path.join(directoryPath, filename)`.
        *   Reads the file content using `readFileFn(fullPath, 'utf-8')`. Handle potential errors during file reading within the loop or via the existing `try...catch`.
        *   Stores the content in `fileContents` with the full path as the key.
    *   Update the call to `readFilesFn` inside `handleAnalyzeCommand` to pass the `inputsDir` variable.

4.  **Create LLM Utility File (`src/agents/llmUtils.ts`)**
    *   Create a new file named `src/agents/llmUtils.ts`.
    *   Import necessary modules: `import OpenAI from "openai";`, `import * as dotenv from 'dotenv'; dotenv.config();` (Ensure dotenv is loaded early).
    *   Define an async function `callOpenAI(history: Array<{ role: string; content: string }>, prompt: string): Promise<string>`.
    *   Inside `callOpenAI`:
        *   Read the API key: `const apiKey = process.env.OPENAI_API_KEY;`.
        *   **Error Handling:** If `!apiKey`, log a warning (`console.warn`) and `throw new Error("OpenAI API key (OPENAI_API_KEY) is not set in environment variables.");`.
        *   Instantiate the client: `const openai = new OpenAI({ apiKey });`.
        *   Prepare the messages array: `const messages = [...history, { role: 'user', content: prompt }];`.
        *   Implement the API call within a `try...catch` block:
            *   `const completion = await openai.chat.completions.create({ model: 'gpt-3.5-turbo', messages: messages, temperature: 0.7, max_tokens: 1500 });`
            *   Extract the response: `const responseContent = completion.choices[0]?.message?.content;`
            *   **Error Handling:** If `!responseContent`, log a warning and `throw new Error("OpenAI API call returned successfully but contained no content.");`.
            *   Return `responseContent`.
        *   In the `catch` block:
            *   Log the error (`console.error("Error calling OpenAI API:", error);`).
            *   Rethrow the original error or a new error encapsulating it: `throw new Error(`Failed to communicate with OpenAI: ${error.message}`);`.
    *   Export the `callOpenAI` function.

5.  **Refactor LLM Call Abstraction (`src/agents/AnalysisPrepareNode.ts`)**
    *   Import the new `callOpenAI` function: `import { callOpenAI } from './llmUtils';`.
    *   Keep the existing `async function callLLM(...)` function definition signature. Its input parameters might need adjustment depending on what information it needs to construct the prompts (e.g., `callLLM(state: AppState, instructionType: 'initial' | 'followup' | 'final'): Promise<string>`). *Alternatively, keep it simpler `callLLM(history: Array<{ role: string; content: string }>, files: Record<string, string>, promptInstruction: string): Promise<string>`.* Let's plan for the simpler signature for now: `callLLM(history: Array<{ role: 'user' | 'agent'; content: string }>, files: Record<string, string>, promptType: 'initial' | 'followup' | 'final'): Promise<string>`. (Added specific roles to history type).
    *   **Replace the *implementation* of `callLLM`:**
        *   Remove the placeholder `console.log` and `if/else` logic simulating responses.
        *   Add logic inside `callLLM` to construct the actual `prompt` string to be sent to `callOpenAI` based on the `promptType` argument and potentially the `history` and `files`.
            *   If `promptType === 'initial'`: Construct a prompt like "Based on the following files: \[list file keys], what is the primary goal for this analysis? User's initial query was: \[first user message from history]".
            *   If `promptType === 'followup'`: Construct a prompt like "Continue the conversation based on this history: \[history]. Files provided: \[list file keys]. Ask the next relevant question or provide analysis based on the latest user input."
            *   If `promptType === 'final'`: Construct the detailed final summary prompt as described previously, incorporating history and file context, requesting specific sections (assumptions, components, etc.). Example: `Based on the conversation history: ${JSON.stringify(history)} and files: ${Object.keys(files).join(', ')}, generate a final analysis summary including: identified assumptions, main components, discussed alternatives, design decisions, and open questions.`
        *   Call the utility function: `return await callOpenAI(history, constructedPrompt);`.
        *   Add a `try...catch` block around the `callOpenAI` call within `callLLM` to handle potential errors thrown by `callOpenAI`. Log the error and rethrow or return a user-friendly error message suitable for the agent's response (e.g., throw `new Error("LLM communication failed. Please check logs.")`).

6.  **Update `callLLM` Usage in Nodes (`src/agents/AnalysisPrepareNode.ts`)**
    *   Modify the `analysisPrepareNode` function:
        *   Determine the appropriate `promptType` for the call to `callLLM` ('initial' if history is empty or only contains the initial user query, 'followup' otherwise).
        *   Locate the line `const agentResponse = await callLLM(prompt);` (or similar).
        *   Replace it with a call using the new signature, passing the relevant parts of the `state`: `const agentResponse = await callLLM(currentHistory, state.fileContents, promptType);`.
    *   Modify the `returnFinalOutput` function:
        *   Locate the line `const finalOutput = await callLLM(finalPrompt);` (or similar).
        *   Replace it with a call using the new signature: `const finalOutput = await callLLM(currentHistory, state.fileContents, 'final');`. 

### Debugging `agentApp.getState` Checkpointer Issue

*   **Problem:** Encountered a `TypeError: Cannot read properties of undefined (reading 'checkpointer')` when calling `agentApp.getState(config)` or the injected `getStateFn` (defaulting to `agentApp.getState`) in `handleAnalyzeCommand` *after* the main analysis loop completed. This occurred despite the checkpointer functioning correctly *during* the `agentApp.stream()` execution within the loop.
*   **Analysis:** The issue stemmed from how the default value for the dependency-injected `getStateFn` was assigned:
    ```typescript
    // In handleAnalyzeCommand signature:
    getStateFn: GetStateFn = agentApp.getState 
    ```
    This stored a reference to the `getState` method detached from its `agentApp` instance. When called later as `getStateFn(config)`, the `this` context within the `getState` method was incorrect (likely `undefined`), preventing it from accessing the checkpointer associated with the `agentApp` instance (`this.checkpointer`). Direct calls like `agentApp.getState(config)` worked at runtime but broke unit tests relying on injecting a mock `getStateFn`.
*   **Solution:** Modified the default value assignment to explicitly bind the `this` context using `.bind()`:
    ```typescript
    // In handleAnalyzeCommand signature:
    getStateFn: GetStateFn = agentApp.getState.bind(agentApp)
    ```
    This ensures the default function used at runtime executes with `this` correctly bound to the `agentApp` instance, allowing it to find the checkpointer. Crucially, this does not interfere with unit tests, as they explicitly provide a mock function for the `getStateFn` parameter, overriding this default bound function. 

### Plan Execution Log (LLM Integration)

*   **Step 1 (Dependency):** Added `openai` npm package.
*   **Step 2 (Arg Parsing):** Updated `parseArgs` in `src/cli/AnalyzeCommand.ts` to use `--inputs <directory>` instead of `--file <path>`. Updated usage messages.
*   **Step 3 (File Reading):** Updated `readFiles` in `src/cli/AnalyzeCommand.ts` to read `.txt` and `.md` files from the specified directory. Updated calls in `handleAnalyzeCommand`.
*   **Unit Tests:** Updated tests in `tests/AnalyzeCommand.test.ts` to reflect changes in `parseArgs` and `readFiles`. Required several iterations to fix failing tests related to argument changes and function signatures.
*   **Step 4 (LLM Utility):** Created `src/agents/LLMUtils.ts` (note: filename corrected from `llmUtils.ts` during execution) with `callOpenAI` function implementing API key handling (env var), error handling (throwing errors), and the actual OpenAI API call (`gpt-3.5-turbo`, chat completions).
*   **Step 5 (LLM Abstraction):** Refactored `callLLM` function within `src/agents/AnalysisPrepareNode.ts` to act as an abstraction layer, constructing prompts based on `promptType` and calling `callOpenAI`. Added error handling.
*   **Step 6 (Integration):** Updated `analysisPrepareNode` and `returnFinalOutput` in `src/agents/AnalysisPrepareNode.ts` to use the new signature of `callLLM`.
*   **Post-Execution Debugging:** Addressed runtime `TypeError` related to `agentApp.getState` and checkpointer by using `agentApp.getState.bind(agentApp)` for the default value of the injected `getStateFn` in `handleAnalyzeCommand` to fix the `this` context issue while maintaining testability. 