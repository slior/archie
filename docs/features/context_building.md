# Feature Specification

I'd like to implement another command for the systam - "Context Building".

The program (Archie), should support another command, from the CLI, with the aim of building system context.
The command receives as inputs:
- A directory name for directory containing input files.
    - this is similar to the analyze command.
- The name of the system or feature. A string.

The command then uses the existing DocumentRetrievalNode, and using an LLM call, creates a summary of the system.
The implementation of this command should be in a separate agent in the graph.
The new agent will have its own prompt (default, and configurable).
The new agent will be a new node in the graph, after the document retrieval node.
The routing from the document retrieval node should be conditional based on a "flow" parameter.
- If the flow is 'analyze' -> it will route to the analysisPrepare node, like it currently does.
- If the flow is 'build_context' -> it will route to the new ContextBuilding agent.

The new agent will implement a call to the LLM, with the relevant input file summaries.
It should use the prompt service to retrieve the prompt, according to configuration.

The agent should output the result of the context building (the output of the LLM) to the same directory as the input directory.
The input directory should be available on the application state.
The name of the output file should be the name of the system + "_context.md" suffix.
The format of the output is a markdown, the exact content is to be described in the prompt.


# Plan

**Feature:** Context Building Command (`build-context`)

**Goal:** Create a new CLI command that takes an input directory and a system name, uses the existing `DocumentRetrievalNode` and a new `ContextBuildingAgentNode` to generate a system context summary using an LLM, and saves this summary to a markdown file in the input directory.

---

**IMPLEMENTATION CHECKLIST:**

**Section 1: `AppState` Modifications and Utility Extraction**

1.  **Modify `AppState` in `src/agents/graph.ts`:** - DONE
    *   Add `currentFlow?: 'analyze' | 'build_context' | null;`
        *   Update `channels` in `StateGraphArgs<AppState>`: `currentFlow: { value: null }` (or keep as optional if no default action is needed, relying on commands to always set it).
    *   Add `systemName?: string;`
        *   Update `channels`: `systemName: { value: null }`
    *   Add `contextBuilderOutputContent?: string;`
        *   Update `channels`: `contextBuilderOutputContent: { value: null }`
    *   Add `contextBuilderOutputFileName?: string;`
        *   Update `channels`: `contextBuilderOutputFileName: { value: null }`

2.  **Extract `summarizeFiles` function:** - DONE
    *   **Action:** Move the `summarizeFiles` function from `src/agents/AnalysisPrepareNode.ts` to a new file: `src/agents/agentUtils.ts`.
    *   **Export:** Ensure it's exported from `src/agents/agentUtils.ts`.
    *   **Update Imports in `AnalysisPrepareNode.ts`:** Modify `src/agents/AnalysisPrepareNode.ts` to import `summarizeFiles` from `src/agents/agentUtils.ts`.
    *   **Verification:** Ensure `AnalysisPrepareNode.ts` still functions as expected (tests will confirm later).

3.  **Create shared `persistOutput` utility:** - DONE
    *   **Action:** Create a new function `persistOutput(content: string, outputDir: string, outputFileName: string, resolveFn = path.resolve, writeFileFn = fsPromises.writeFile)` in `src/utils.ts`.
    *   **Logic:** This function will be similar to the current `persistFinalOutput` in `src/commands/analyze.ts` but will take the filename as a parameter.
        *   It should resolve the full output path: `resolveFn(outputDir, outputFileName)`.
        *   It should write the `content` to this path.
        *   It should log success or error messages.
    *   **Export:** Ensure it's exported from `src/utils.ts`.

4.  **Refactor `persistFinalOutput` in `src/commands/analyze.ts`:** - DONE
    *   **Action:** Modify `persistFinalOutput` in `src/commands/analyze.ts` to call the new shared `persistOutput` utility.
        *   It will call `persistOutput(output, targetDir, 'analysis_result.md', resolveFn, writeFileFn)`.
    *   **Verification:** Ensure `analyze` command's output persistence still works (tests will confirm).

5.  **Create shared `createConfigWithPromptService` utility:** - DONE
    *   **Action:** Create a new function `createConfigWithPromptService(baseConfig: AppRunnableConfig, promptService: PromptService): AppRunnableConfig` in `src/utils.ts` (or a new `src/graphUtils.ts` if preferred, for now `src/utils.ts` is fine).
    *   **Logic:**
        ```typescript
        // In src/utils.ts
        export function createConfigWithPromptService(baseConfig: AppRunnableConfig, promptService: PromptService): AppRunnableConfig {
            return {
                ...baseConfig,
                configurable: {
                    ...baseConfig.configurable,
                    promptService: promptService,
                },
            };
        }
        ```
    *   **Export:** Ensure it's exported from `src/utils.ts`.
    *   **Update `runGraph` in `src/commands/analyze.ts`:** Modify the `runGraph` function in `analyze.ts` to use this utility when preparing the `config` for `agentApp.stream()`.
        *   Instead of:
            ```typescript
            // const fullConfig = { ... };
            // config.configurable.promptService = promptService;
            // stream = await agentApp.stream(currentInput, config);
            ```
        *   Use:
            ```typescript
            const streamConfig = createConfigWithPromptService(config, promptService);
            stream = await agentApp.stream(currentInput, streamConfig);
            ```

**Section 2: Implement `ContextBuildingAgentNode`**

6.  **Create `ContextBuildingAgentNode.ts`:** - DONE
    *   **File:** Create `src/agents/ContextBuildingAgentNode.ts`.
    *   **Imports:**
        *   `AppState`, `Role` from `./graph`.
        *   `AppGraphConfigurable`, `AppRunnableConfig`, `dbg`, `say` from `../utils`.
        *   `callTheLLM`, `HistoryMessage` from `./LLMUtils`.
        *   `summarizeFiles` from `./agentUtils.ts`.
        *   `PromptService` from `../services/PromptService`.
        *   `RunnableConfig` from `@langchain/core/runnables`.
        *   Local `HistoryMessage` type definition.

7.  **Define `contextBuildingAgentNode` function in `ContextBuildingAgentNode.ts`:** - DONE
    *   **Signature:** `export async function contextBuildingAgentNode(state: AppState, config?: RunnableConfig): Promise<Partial<AppState>>`
    *   **Logic:**
        *   Retrieve `promptService` from `config.configurable.promptService` (similar to `AnalysisPrepareNode`).
        *   Log entry: `dbg("--- Context Building Agent Node Running ---");`
        *   **Input Validation:**
            *   Check if `state.inputs` is populated. If not, log an error, and `throw new Error("Critical Error: Input documents (state.inputs) were not found or are empty. Context building cannot proceed.");`
            *   Check if `state.systemName` is populated. If not, log an error, and `throw new Error("Critical Error: System name (state.systemName) not found. Context building cannot proceed.");`
        *   **Summarize Input Files:** Call `const fileSummaries = summarizeFiles(state.inputs);`
        *   **Prepare LLM Call:**
            *   Define `promptType` (e.g., `const promptType = 'context_build';`).
            *   Prepare context for `promptService.getFormattedPrompt`:
                ```typescript
                const promptContext = {
                    systemName: state.systemName,
                    fileSummaries: fileSummaries,
                };
                ```
            *   Get the formatted prompt: `const constructedPrompt = await promptService.getFormattedPrompt("ContextBuildingAgentNode", promptType, promptContext);`
            *   History for LLM: `const llmHistory: HistoryMessage[] = [];` (as this is a one-shot summary, no prior conversation).
        *   **Call LLM:** `const llmResponse = await callTheLLM(llmHistory, constructedPrompt, state.modelName);`
        *   **Prepare Output:**
            *   `const outputFileName = \`\${state.systemName}_context.md\`;`
            *   Return `Partial<AppState>`:
                ```typescript
                return {
                    contextBuilderOutputContent: llmResponse,
                    contextBuilderOutputFileName: outputFileName,
                    userInput: "" // Clear userInput for this flow as it's processed
                };
                ```
        *   **Error Handling (around LLM call):** Wrap the `callTheLLM` and prompt construction in a `try...catch` block. If an error occurs:
            *   Log the error: `console.error("Error in ContextBuildingAgentNode LLM call:", error);`
            *   `throw new Error("LLM communication failed during context building.");`

8.  **Create Default Prompt for `ContextBuildingAgentNode`:** - DONE
    *   **File:** Create `src/agents/prompts/ContextBuildingAgentNode/context_build.txt`.
    *   **Content (Basic Suggestion):**
        ```text
        You are an expert software architect. Based on the following summarized file contents for the system or feature named "{{systemName}}", please generate a concise and informative context overview.

        This overview should explain the main purpose, key components, and primary interactions or data flows described in the provided files. Aim for a summary that would quickly onboard someone to the high-level understanding of "{{systemName}}".

        Format the output as a markdown document.

        File Summaries:
        {{fileSummaries}}

        Generate the context overview:
        ```
    *   **Ensure `PromptService` is updated (manual step for user or later AI step if service is auto-detecting):** The `PromptService` might need to be aware of "ContextBuildingAgentNode" as a valid `agentName` if it has strict validation or pre-defined structures. For now, assume it can load `prompts/<agentName>/<promptType>.txt` dynamically.

**Section 3: Update Agent Graph**

9.  **Modify `src/agents/graph.ts`:** - DONE
    *   **Import:** `import { contextBuildingAgentNode } from './ContextBuildingAgentNode';`
    *   **Add Node:** Add `contextBuildingAgentNode` to the `workflow.addNode(...)` calls:
        `workflow.addNode('contextBuildingAgent', contextBuildingAgentNode);`
    *   **Modify Conditional Edges after `documentRetrievalNode`:**
        *   The current edge is `workflow.addEdge('documentRetrievalNode', 'analysisPrepare');`
        *   This needs to become a conditional edge.
        *   Define a routing function:
            ```typescript
            function routeAfterDocumentRetrieval(state: AppState): string {
                if (state.currentFlow === 'analyze') {
                    return 'analysisPrepare';
                } else if (state.currentFlow === 'build_context') {
                    return 'contextBuildingAgent';
                }
                // Optional: Fallback or error if flow is not set/invalid
                console.warn("Unknown flow in routeAfterDocumentRetrieval:", state.currentFlow);
                return END; // Or throw an error
            }
            ```
        *   Replace `workflow.addEdge('documentRetrievalNode', 'analysisPrepare');` with:
            `workflow.addConditionalEdges('documentRetrievalNode', routeAfterDocumentRetrieval);`
    *   **Add Edge from `contextBuildingAgent` to `END`:**
        `workflow.addEdge('contextBuildingAgent', END);`
    *   **Verify `START` node routing:** The `START` node's conditional routing should remain as is (routing to `documentRetrievalNode` for `analyze` keyword, and to `echoAgent` for `echo`). The new `build-context` command will also need to trigger the path to `documentRetrievalNode`.
        *   Modify the `shouldContinueToDocumentRetrieval` (or equivalent) function for the `START` node's conditional edge to also include the `build-context` command. E.g., if `state.userInput` starts with "analyze:" OR "build_context:".
        *   Alternatively, if `documentRetrievalNode` is always the first step for both flows that need documents, simplify the initial routing to just go to `documentRetrievalNode` if `userInput` signals a document-heavy task, and let the new conditional edge *after* it handle the `analyze` vs `build_context` split. For now, let's assume the START node's conditional routing needs adjustment to include "build_context:" as a trigger to go to `documentRetrievalNode`.
            ```typescript
            // Example adjustment for START node's conditional routing logic
            function routeFromStart(state: AppState): string {
                const input = state.userInput.toLowerCase();
                if (input.startsWith("analyze:") || input.startsWith("build_context:")) {
                    return "documentRetrievalNode";
                } else if (input.startsWith("echo ")) {
                    return "echoAgent";
                }
                return END;
            }
            // And update .addConditionalEdges(START, routeFromStart, { ... })
            ```

**Section 4: Implement `build-context` CLI Command**

10. **Create `src/commands/buildContext.ts`:** - DONE
    *   **Imports:**
        *   `commander` (if defining command here, or it's handled in `main.ts`)
        *   `fsPromises`, `path`
        *   `agentApp`, `AppState` from `../agents/graph`.
        *   `MemoryService` from `../memory/MemoryService`.
        *   `PromptService` from `../services/PromptService`.
        *   `dbg`, `say`, `newGraphConfig`, `AppRunnableConfig`, `persistOutput`, `createConfigWithPromptService` from `../utils`.

11. **Define `runBuildContext` function in `buildContext.ts`:** - DONE
    *   **Signature:**
        ```typescript
        export async function runBuildContext(
            systemName: string,
            inputsDir: string,
            modelName: string,
            memoryService: MemoryService, // For consistency, though may not be used directly here for saving
            promptService: PromptService,
            // Injected dependencies for testability
            newGraphConfigFn: typeof newGraphConfig = newGraphConfig,
            getGraphStateFn: (config: any) => Promise<{ values: Partial<AppState> }> = agentApp.getState.bind(agentApp),
            persistOutputFn: typeof persistOutput = persistOutput,
            createConfigFn: typeof createConfigWithPromptService = createConfigWithPromptService
        )
        ```
    *   **Input Validation:** Check if `systemName` and `inputsDir` are provided. If not, `say` error and return.
    *   **Initial `AppState`:**
        ```typescript
        const initialAppState: Partial<AppState> = {
            userInput: \`build_context: \${systemName}\`, // For START node routing
            inputDirectoryPath: inputsDir,
            systemName: systemName,
            modelName: modelName,
            currentFlow: 'build_context', // Critical for routing after DocumentRetrievalNode
            // Initialize other relevant fields from AppState to defaults if necessary
            analysisHistory: [],
            analysisOutput: "",
            currentAnalysisQuery: "",
            response: "",
            contextBuilderOutputContent: "",
            contextBuilderOutputFileName: ""
        };
        ```
    *   **Graph Config:** `const baseConfig = newGraphConfigFn();`
    *   **Inject PromptService into Config:** `const graphConfig = createConfigFn(baseConfig, promptService);`
    *   **Run Graph:**
        ```typescript
        dbg(\`Starting context building for system: \${systemName} with thread ID: \${graphConfig.configurable.thread_id}\`);
        try {
            const finalStateValues = await agentApp.invoke(initialAppState, graphConfig);

            // Retrieve output from finalStateValues (using .values if invoke returns it)
            // Or, if invoke returns the full state directly:
            // const outputContent = finalStateValues.contextBuilderOutputContent;
            // const outputFileName = finalStateValues.contextBuilderOutputFileName;
            // const outputDir = finalStateValues.inputDirectoryPath; // Confirm this is passed through state

            // Assuming agentApp.invoke returns the full final state object:
            const outputContent = (finalStateValues as AppState).contextBuilderOutputContent;
            const outputFileName = (finalStateValues as AppState).contextBuilderOutputFileName;
            const outputDir = (finalStateValues as AppState).inputDirectoryPath;

            if (outputContent && outputFileName && outputDir) {
                await persistOutputFn(outputContent, outputDir, outputFileName);
                say(\`Context built successfully for \${systemName}.\`);
            } else {
                say(\`Error: Context building completed, but output content or filename was not generated.\`);
                if (!outputContent) say("Output content is missing.");
                if (!outputFileName) say("Output filename is missing.");
                if (!outputDir) say("Output directory is missing from state.");
            }

        } catch (error) {
            console.error(\`Error during context building graph execution for \${systemName}:\`, error);
            say(\`Error: Failed to build context for \${systemName}. Check logs for details.\`);
        }
        dbg(\`runBuildContext for \${systemName} completed.\`);
        ```

12. **Integrate `build-context` command into `src/main.ts`:** - DONE
    *   Import `runBuildContext` from `./commands/buildContext`.
    *   Add a new command using `program.command('build-context')`:
        *   Required options: `--inputs <directory>`, `--name <system_name>`.
        *   Optional options: Use existing global `--model` and `--prompts-config` options.
        *   Action handler:
            *   Instantiate `MemoryService` and `PromptService` (as done for `analyze`).
            *   Call `runBuildContext(cmd.name, cmd.inputs, globalOpts.model, memoryService, promptService)`.

**Section 5: Testing and Documentation**

13. **Update Unit Tests for `src/commands/analyze.ts`:** - SKIPPED
    *   If `persistFinalOutput` was mocked, update mocks to reflect its new implementation using `persistOutput`.
    *   If `runGraph` (or the part that prepares config for `agentApp.stream`) was tested, update for usage of `createConfigWithPromptService`.

14. **Update Unit Tests for `src/agents/AnalysisPrepareNode.ts`:** - SKIPPED
    *   Update mocks/stubs for `summarizeFiles` if it was directly part of `AnalysisPrepareNode.ts` tests, now it's imported.

15. **Write Unit Tests for `src/agents/agentUtils.ts`:** - SKIPPED
    *   Test `summarizeFiles` function with various inputs (empty, single file, multiple files, long content).

16. **Write Unit Tests for `src/utils.ts` (new/modified functions):** - SKIPPED
    *   Test `persistOutput` (mocking `fsPromises.writeFile` and `path.resolve`).
    *   Test `createConfigWithPromptService`.

17. **Write Unit Tests for `src/agents/ContextBuildingAgentNode.ts`:**
    *   Mock `callTheLLM`, `summarizeFiles`, and `PromptService`.
    *   Test normal operation: valid inputs, LLM success, correct state output.
    *   Test error conditions: missing `state.inputs`, missing `state.systemName`, LLM failure.

18. **Update `README.md` or other relevant documentation:**
    *   Add documentation for the new `build-context` command, its arguments, and purpose.
    *   Update `docs/agent_graph.md` with the new node (`contextBuildingAgent`), new `AppState` fields, and modified conditional routing. Include an updated Mermaid diagram.
    *   Update `docs/features/context_building.md` by moving this plan to the "Plan" section and starting an "Implementation Log" section.

---

# Implementation Log