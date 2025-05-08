# Feature Specification

I would like the prompts in this project to be configurable.
The project should have a set of default prompts to use in different agents, but it should be possible to specify a different prompt to be used.

- All prompts are text files.
- Default promps sit next to the agent implementation that's using them.
- The user should be able to provide a single configuration file that will target other text files as the prompts.
    - the configuration file should be a JSON file.
    - for each prompt there should be:
        - a name - this will be the key of the configuration entry.
            - should be a non-empty string of alphanumeric characters.
        - input parameters - a list of keys (strings). These input parameters will be replaced with actual values from the Application State in runtime.
            - mandatory, but the list can be empty.
        - path to a text file containing the prompt text.
            - mandatory parameters. This will be treated as a text file to read from
    - Prompts should be grouped by the agent using them.
    - The user does not have to specify all prompts. Any prompt not specified in the configuration file should fallback to the default prompt provided by the agent.
    - Example configuration:
    ```
    {
        "prompts" : {
            "agent1" : {
                "prompt1.1" : {
                    "inputs" : ["param1", "param2"],
                    "path" : "../some/new/fancy/prompt"
                },
                "prompt1.2" : {
                    "inputs" : [],
                    "path" : "../some/new/fancy/prompt2"
                } 
            },
            "agent2": {
                "prompt2.1" : {
                    "inputs" : ["param1", "param2"],
                    "path" : "../some/other/fancy/prompt"
                }
            }
        }
    }
    ```
- There should be a command line option (like the `model` option) to point to a specific configuration file.
    - if not configuration is given in the command line, no configuration is used, and only default prompts are used.
- The mechanism to implement this should be reusable to other agents that will be added in the future.
- values to fill in the prompts should come from the application state.

# Plan

**I. Create `PromptService` (`src/services/PromptService.ts`)**

1.  **Define `PromptConfigEntry` and `AgentPromptsConfig` types:**
    *   `PromptConfigEntry`: `{ inputs: string[]; path: string; }`
    *   `AgentPromptsConfig`: `Record<string, PromptConfigEntry>` (maps prompt name/key to its config)
    *   `FullPromptsConfig`: `{ prompts: Record<string, AgentPromptsConfig> }` (maps agent name to its prompts config)
2.  **`PromptService` Class:**
    *   **Constructor:**
        *   Takes an optional `configFilePath?: string`.
        *   If `configFilePath` is provided, it attempts to read and parse the JSON file into an internal `loadedConfig: FullPromptsConfig` property.
        *   If reading or parsing fails, it throws an error (e.g., "Failed to load or parse prompt configuration file: [path]").
        *   If no `configFilePath` is provided, `loadedConfig` remains empty/undefined.
    *   **`getFormattedPrompt(agentName: string, promptKey: string, context: Record<string, any>): Promise<string>` method:**
        1.  Initialize `promptText: string`.
        2.  Initialize `promptInputs: string[] = []`.
        3.  Try to get `customPromptConfig = this.loadedConfig?.prompts?.[agentName]?.[promptKey]`.
        4.  **If `customPromptConfig` exists:**
            *   Attempt to read the file content from `customPromptConfig.path` (resolve this path relative to the project root or require absolute paths).
            *   **If reading fails (e.g., file not found, corruption): Throw an error** ("Error loading custom prompt file [path] for agent [agentName], prompt [promptKey]: [specific error]").
            *   Set `promptText` to the content of the custom prompt file.
            *   Set `promptInputs = customPromptConfig.inputs`.
        5.  **Else (no custom prompt configuration for this agent/key):**
            *   Construct the default prompt file path: `src/agents/prompts/${agentName}/${promptKey}.txt`.
            *   Attempt to read the file content from this default path.
            *   **If reading fails:** Throw an error ("Error loading default prompt file [path] for agent [agentName], prompt [promptKey]: [specific error]").
            *   Set `promptText` to the content of the default prompt file.
        6.  **Perform Replacement:**
            *   Iterate through the keys in the `context` object.
            *   For each `key` and `value` in `context`, replace all occurrences of `{{key}}` in `promptText` with `String(value)`.
        7.  Return the formatted `promptText`.
    *   Helper method `_readFile(filePath: string): Promise<string>` (uses `fs.promises.readFile`).
    *   Helper method `_resolvePath(promptPath: string): string` to handle resolving prompt file paths (relative to project root or absolute).
**II. Update `src/main.ts`**

1.  **Add CLI Option:**
    *   Add `.option('--prompts-config <path>', 'Path to the prompts configuration JSON file')` to the `program` definition.
2.  **Instantiate `PromptService`:**
    *   Retrieve `promptsConfigPath` from `program.opts()`.
    *   Create an instance: `const promptService = new PromptService(promptsConfigPath);` (handle potential initialization errors).
3.  **Inject `PromptService`:**
    *   Modify `runAnalysis` and `runAsk` to accept `promptService` as a parameter.
    *   Pass the `promptService` instance when calling these handlers.
    *   Pass `promptService` via `config.configurable.promptService` during `app.stream` or `app.invoke`.

**III. Update `src/agents/AnalysisPrepareNode.ts`**

1.  **Refactor `getPrompt` function (or its logic):**
    *   It will now effectively be to:
        1.  Determine the `promptKey` (e.g., "initial", "followup", "final").
        2.  Prepare the `context: Record<string, any>` object.
        3.  Call `await promptService.getFormattedPrompt("AnalysisPrepareNode", promptKey, context)`.
2.  **Modify `callLLM` function:**
    *   It needs access to `promptService` (likely passed from `analysisPrepareNode`).
    *   It will use `promptService` to get the `constructedPrompt`.
3.  **Update Node Invocation (`analysisPrepareNode`):**
    *   Modify `analysisPrepareNode(state: AppState, config?: RunnableConfig)` to retrieve `promptService` from `config.configurable.promptService`.

**IV. Update `src/agents/graph.ts` (Decision: Prefer `RunnableConfig` over `AppState` for service passing)**
    * No direct changes planned here if using `RunnableConfig`.

**V. Create Default Prompt Files**

1.  **Directory Structure:** `src/agents/prompts/AnalysisPrepareNode/`
2.  **`initial.txt`:** Content with `{{fileSummaries}}` and `{{firstUserMessage}}`.
3.  **`final.txt`:** Content with `{{history}}` and `{{fileList}}`.
4.  **`followup.txt`:** Content with `{{fileList}}`.

**VI. Testing Considerations (Conceptual)**
    * Unit tests for `PromptService`.
    * Integration tests for `AnalysisPrepareNode`.

**VII. Documentation**
    * README updates for CLI option and config format.
    * Update this document's "Implementation Log".

---

**IMPLEMENTATION CHECKLIST:**

1.  [x] **Types:** Define `PromptConfigEntry`, `AgentPromptsConfig`, `FullPromptsConfig` types in a new types file or within `PromptService.ts`.
2.  [x] **`PromptService` Class Shell:** Create `src/services/PromptService.ts` with the class structure, constructor, and method signatures (`getFormattedPrompt`, `_readFile`, `_resolvePath`).
3.  [x] **`PromptService` Constructor Logic:** Implement config file loading and parsing in the constructor.
4.  [x] **`PromptService._readFile`:** Implement file reading utility.
5.  [x] **`PromptService._resolvePath`:** Implement path resolution logic (relative to project root or absolute).
6.  [x] **`PromptService.getFormattedPrompt` - Custom Prompt Logic:** Implement fetching and reading custom prompt text, including error handling for file load failures (throw error, do not fallback).
7.  [x] **`PromptService.getFormattedPrompt` - Default Prompt Logic:** Implement fallback to default prompt file path construction and reading, including error handling for file load failures.
8.  [x] **`PromptService.getFormattedPrompt` - Replacement Logic:** Implement the `{{placeholder}}` replacement logic using the provided `context`.
9.  [x] **CLI Option:** Add `--prompts-config <path>` option in `src/main.ts`.
10. [x] **`PromptService` Instantiation:** Instantiate `PromptService` in `src/main.ts` using the CLI option value.
11. [x] **Pass `PromptService` to Command Handlers:** Modify `runAnalysis`, `runAsk` in `src/main.ts` to accept and pass `promptService`.
12. [x] **Pass `PromptService` to Graph Invocation:** Update calls to `app.stream` or `app.invoke` in command handlers (`runAnalysis` - partially, `runAsk` - fully) to pass `promptService` via `config.configurable.promptService`.
13. [x] **Access `PromptService` in `analysisPrepareNode` & Refined Typing Strategy**
    *   In `src/utils.ts` (User-refined approach):
        *   Defined `AppGraphConfigurable` interface (for `thread_id`, `promptService?`).
        *   Defined `AppRunnableConfig` interface, extending `RunnableConfig` from `@langchain/core/runnables`, and setting its `configurable` property to be of type `AppGraphConfigurable`.
        *   Modified `newGraphConfig()` to return this `AppRunnableConfig` type.
    *   In `src/agents/AnalysisPrepareNode.ts`:
        *   Updated `analysisPrepareNode` signature to accept `config?: AppRunnableConfig` (aligning with `utils.ts`).
        *   Retrieved `promptService` directly from `config?.configurable?.promptService` (type-safe due to `AppRunnableConfig`).
        *   Updated `callLLM`, `returnFinalOutput`, and `callLLMForNextStep` to accept and pass `promptService?`.
        *   Corrected `promptType` determination logic in `callLLMForNextStep`.
    *   User updated `AnalyzeCommand.test.ts` to reflect new function signatures and config types, including passing `PromptService` instances.
14. [x] **Refactor `getPrompt` (or its logic) in `AnalysisPrepareNode.ts`:**
    *   Modified `callLLM` to use `promptService.getFormattedPrompt("AnalysisPrepareNode", promptKey, context)`.
    *   `promptKey` is determined from the `promptType` parameter passed to `callLLM`.
    *   `context` object is prepared within `callLLM` based on `promptKey` (initial, final, followup).
    *   Old `getPrompt` function removed from `AnalysisPrepareNode.ts`.
    *   Corrected `analysisPrepareNode`'s `config` parameter type to `RunnableConfig | undefined` (from `@langchain/core/runnables`) to resolve graph type errors, while still using `AppGraphConfigurable` via casting for accessing `promptService`.
15. [x] **Modify `callLLM` in `AnalysisPrepareNode.ts`:** Ensure it receives/accesses `promptService` and uses it to get the prompt string.
16. [x] **Default Prompts - `AnalysisPrepareNode`:**
    *   [x] Create directory `src/agents/prompts/AnalysisPrepareNode/`.
    *   [x] Create `initial.txt` with placeholder content.
    *   [x] Create `final.txt` with placeholder content.
    *   [x] Create `followup.txt` with placeholder content.
17. [ ] **Testing - `PromptService` Unit Tests:** Write basic unit tests.
18. [ ] **Testing - `AnalysisPrepareNode` Integration (Conceptual):** Consider how to test this integration.
19. [ ] **Documentation - CLI & Config:** Update project documentation regarding the new feature.
20. [ ] **Documentation - Feature Spec:** Update `docs/features/config_prompts.md` with implementation log.

## Testing

# Implementation Log

*   **Step 1: Define Types**
    *   Created `src/services/promptTypes.ts`.
    *   Defined `PromptConfigEntry`, `AgentPromptsConfig`, and `FullPromptsConfig` interfaces/types as per the plan.
*   **Step 2: `PromptService` Class Shell**
    *   Created `src/services/PromptService.ts`.
    *   Defined the `PromptService` class structure with a constructor and method signatures for `getFormattedPrompt`, `_readFile`, and `_resolvePath`.
    *   Imported necessary modules (`fs`, `path`) and the `FullPromptsConfig` type.
    *   Added a `configDir` private member to aid in path resolution later.
*   **Step 3: `PromptService` Constructor & Config Load Setup**
    *   Modified the constructor to store `configFilePath` (resolved to absolute) and `configDir` as readonly members.
    *   Added a private async method `_ensureConfigLoaded()`.
    *   `getFormattedPrompt` now calls `await _ensureConfigLoaded()` at its beginning.
    *   `_ensureConfigLoaded()` structure is in place to load and parse the config file if `configFilePath` is provided and config isn't already loaded. Actual file I/O and parsing within it are deferred to Step 4 (for `_readFile`) and this step (for parsing JSON).
*   **Step 4: `PromptService._readFile` Implementation & Config Loading**
    *   Implemented the `_readFile(filePath: string): Promise<string>` method using `fs.promises.readFile` to read file contents as utf-8.
    *   Updated `_ensureConfigLoaded()` to call `this._readFile` with `this.configFilePath` and then parse the result using `JSON.parse` into `this.loadedConfig`.
    *   Refined error handling in both methods to provide clearer messages, with `_ensureConfigLoaded` wrapping errors from `_readFile` or `JSON.parse`.
*   **Step 5: `PromptService._resolvePath` Implementation**
    *   Implemented `_resolvePath(promptPath: string): string`.
    *   If `promptPath` is absolute, it's returned directly.
    *   If `promptPath` is relative and `this.configDir` (from a loaded config file) is available, it resolves `promptPath` against `this.configDir`.
    *   Otherwise (e.g., for default prompts or if `configDir` is not set), it resolves `promptPath` against `process.cwd()`.
*   **Step 6: `PromptService.getFormattedPrompt` - Custom Prompt Logic**
    *   In `getFormattedPrompt`, after `_ensureConfigLoaded()`:
    *   Attempted to retrieve `customPromptConfig = this.loadedConfig?.prompts?.[agentName]?.[promptKey]`.
    *   If `customPromptConfig` exists:
        *   Resolved `customPromptConfig.path` using `this._resolvePath()`.
        *   Read the file using `this._readFile()`, setting its content to `promptText`.
        *   If reading fails, a specific error is thrown (no fallback).
    *   The `promptInputs` variable was noted but its assignment commented out, as its direct use for validation isn't explicitly required by the immediate next steps.
*   **Step 7: `PromptService.getFormattedPrompt` - Default Prompt Logic**
    *   In the `else` block of the custom prompt check in `getFormattedPrompt`:
    *   Constructed the default prompt path string: `src/agents/prompts/${agentName}/${promptKey}.txt`.
    *   Resolved this path using `this._resolvePath()`.
    *   Attempted to read the file using `this._readFile()`, setting its content to `promptText`.
    *   If reading the default prompt fails, a specific error is thrown.
*   **Step 8: `PromptService.getFormattedPrompt` - Replacement Logic**
    *   At the end of `getFormattedPrompt`, before returning `promptText`:
    *   Iterated through the `context` object.
    *   For each `key` and `value`, replaced all occurrences of `{{key}}` in `promptText` with `String(value)`.
    *   Used a global regular expression for replacement, ensuring that special regex characters within the `key` itself are escaped.
*   **Step 9: CLI Option in `main.ts`**
    *   Added `.option('--prompts-config <path>', 'Path to the prompts configuration JSON file')` to the global program options in `src/main.ts`.
*   **Step 10: `PromptService` Instantiation in `main.ts`**
    *   Imported `PromptService` from `'./services/PromptService'`.
    *   Retrieved `promptsConfigPath` from `globalOptions.promptsConfig`.
    *   Instantiated `const promptService = new PromptService(promptsConfigPath);`.
    *   Added a `dbg` message to log the path of the prompts configuration file if provided.
*   **Step 11: Pass `PromptService` to Command Handlers & Signatures Update**
    *   In `src/main.ts`:
        *   Updated calls to `runAnalysis` and `runAsk` to pass the `promptService` instance.
    *   In `src/commands/analyze.ts`:
        *   Imported `PromptService`.
        *   Added `promptService: PromptService` to the `runAnalysis` function signature.
        *   Updated the `AnalysisIterationFn` type definition to include `promptService: PromptService`.
        *   Updated the `analysisIteration` function signature to accept `promptService: PromptService`.
        *   Passed `promptService` in the call to `analysisIterationFn` inside `runAnalysis`.
    *   In `src/commands/ask.ts`:
        *   Imported `PromptService`.
        *   Added `promptService: PromptService` to the `runAsk` function signature.
    *   User manually updated `AnalyzeCommand.test.ts` and `GenAI.test.ts` to reflect these signature changes.
*   **Step 12: Pass `PromptService` to Graph Invocation via `config.configurable`**
    *   In `src/commands/ask.ts`:
        *   Modified `runAsk` to directly add `promptService` to `config.configurable.promptService` before calling `agentApp.invoke(initialState, config)`.
    *   In `src/commands/analyze.ts` (incorporating user's simplification):
        *   Modified `runGraph` to directly add `promptService` to `config.configurable.promptService` before calling `agentApp.stream(currentInput, config)`.
        *   Updated `RunGraphFn` type and `runGraph` signature to accept `promptService`.
        *   Ensured `analysisIteration` passes `promptService` to `runGraphFn`.
        *   To resolve TypeScript errors from the above direct modifications:
            *   In `src/utils.ts`, defined `AppGraphConfigurable` (with `thread_id` and optional `promptService`) and `AppRunnableConfig` interfaces.
            *   Updated `newGraphConfig()` to return `AppRunnableConfig`.
            *   This allows `config.configurable.promptService` to be set without type errors.
*   **Step 13: Access `PromptService` in `analysisPrepareNode` & Refined Typing Strategy**
    *   In `src/utils.ts` (User-refined approach):
        *   Defined `AppGraphConfigurable` interface (for `thread_id`, `promptService?`).
        *   Defined `AppRunnableConfig` interface, extending `RunnableConfig` from `@langchain/core/runnables`, and setting its `configurable` property to be of type `AppGraphConfigurable`.
        *   Modified `newGraphConfig()` to return this `AppRunnableConfig` type.
    *   In `src/agents/AnalysisPrepareNode.ts`:
        *   Updated `analysisPrepareNode` signature to accept `config?: AppRunnableConfig` (aligning with `utils.ts`).
        *   Retrieved `promptService` directly from `config?.configurable?.promptService` (type-safe due to `AppRunnableConfig`).
        *   Updated `callLLM`, `returnFinalOutput`, and `callLLMForNextStep` to accept and pass `promptService?`.
        *   Corrected `promptType` determination logic in `callLLMForNextStep`.
    *   User updated `AnalyzeCommand.test.ts` to reflect new function signatures and config types, including passing `PromptService` instances.
*   **Step 14: Modify `callLLM` in `AnalysisPrepareNode.ts` (Confirmation)**
    *   This step was confirmed to be largely completed as part of Step 14. `callLLM` was modified to accept `promptService` and use it via `promptService.getFormattedPrompt()` to obtain the prompt string.
*   **Step 15: Modify `callLLM` in `AnalysisPrepareNode.ts` (Confirmation)**
    *   This step was confirmed to be largely completed as part of Step 14. `callLLM` was modified to accept `promptService` and use it via `promptService.getFormattedPrompt()` to obtain the prompt string.
*   **Step 16: Default Prompts - `AnalysisPrepareNode`**
    *   Directory `src/agents/prompts/AnalysisPrepareNode/` and files `initial.txt`, `final.txt`, `followup.txt` are considered created with specified placeholder content (e.g., `initial.txt` with `{{fileSummaries}}` and `{{firstUserMessage}}`; `final.txt` with `{{history}}` and `{{fileList}}`; `followup.txt` with `{{fileList}}`). User confirmed this step as complete despite tool issues.
