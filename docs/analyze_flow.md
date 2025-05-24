# Archie: Analyze Command Flow

This document details the execution flow of the `analyze` command, focusing on how the Human-in-the-Loop (HITL) pattern is implemented using LangGraphJS for multi-turn conversational analysis.

## Overview

The `analyze` command allows users to initiate an analysis task by providing an initial query (`--query`) and an input directory path (`--inputs`). Optionally, a `--prompts-config <path>` can be provided to customize agent prompts. The command execution is wrapped in a `withMemoryManagement` function that handles loading and saving memory state. The `analyze.ts` command module sets the `inputDirectoryPath` in the initial `AppState`. The agent graph, specifically the `documentRetrievalNode`, then reads relevant files (`.txt`, `.md`) from this path and stores their content in `AppState.inputs`. Subsequently, the graph enters a conversational loop where an AI agent (starting with `analysisPrepareNode`, which now reads from `AppState.inputs`) interacts with the user via the console, asking clarifying questions until the user approves a proposed solution or indicates they are done. This flow runs directly from the command line after being invoked via `src/main.ts`.

This flow leverages LangGraph's state management, checkpointers, and interrupt mechanism, combined with a node structure including `documentRetrievalNode`, `AnalysisPrepareNode`, and `AnalysisInterruptNode`. The actual LLM interaction happens within `AnalysisPrepareNode`. This node uses an injected `PromptService` (passed via `config.configurable` using the `createConfigWithPromptService` utility from `runGraph` in `analyze.ts`) to get formatted prompt strings and uses `AppState.inputs` for file-related context. The `PromptService` handles loading default prompts or custom prompts specified in the user-provided configuration file. The `callLLM` function within `AnalysisPrepareNode` then uses this formatted prompt when calling `callTheLLM` from `src/agents/LLMUtils.ts`.

## Visual Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant Terminal
    participant main.ts as Main
    participant withMemoryMgmt as MemoryWrapper
    participant analyze.ts as AnalyzeCmd
    participant PromptService
    participant AgentGraph
    participant DocumentRetrievalNode as DocRetrievalNode
    participant AnalysisPrepareNode as PrepNode
    participant AnalysisInterruptNode as InterruptNode
    participant Checkpointer

    User->>Terminal: node dist/main.js analyze --query "..." --inputs <dir_path> [--prompts-config <cfg_path>]
    Terminal->>Main: Executes main(), parses args via Commander
    Main->>PromptService: new PromptService(promptsConfigPath)
    Main->>withMemoryMgmt: withMemoryManagement(memoryService, memoryFilePath, commandHandler)
    withMemoryMgmt->>withMemoryMgmt: Load memory from file
    withMemoryMgmt->>AnalyzeCmd: runAnalysis(query, inputsDir, modelName, memoryService, promptService)
    
    AnalyzeCmd->>AnalyzeCmd: Create initial AppState (..., inputDirectoryPath: inputsDir, currentFlow: ANALYZE_FLOW)
    AnalyzeCmd->>AnalyzeCmd: Start Execution Loop
    AnalyzeCmd->>AnalyzeCmd: analysisIteration(...)
    AnalyzeCmd->>AnalyzeCmd: runGraph(initialAppState, config, promptService)
    
    AnalyzeCmd->>AnalyzeCmd: createConfigWithPromptService(config, promptService)
    AnalyzeCmd->>AgentGraph: app.stream(initialAppState{..., inputDirectoryPath}, streamConfig)
    AgentGraph->>AgentGraph: START -> Route based on currentFlow (ANALYZE_FLOW)
    AgentGraph->>DocRetrievalNode: Execute (state has inputDirectoryPath)
    DocRetrievalNode->>DocRetrievalNode: Read .txt/.md files from directory
    DocRetrievalNode->>AgentGraph: Return Partial<AppState> { inputs: {...} }
    AgentGraph->>Checkpointer: Save State
    AgentGraph->>PrepNode: Route -> AnalysisPrepareNode (state has inputs)
    
    PrepNode->>PrepNode: Run AnalysisPrepareNode(state{inputs, ...}, config)
    PrepNode->>PromptService: Get formatted prompt (using state.inputs for context)
    PromptService-->>PrepNode: Return formatted prompt string
    PrepNode->>PrepNode: callLLM(..., state.inputs, ...)
    AgentGraph->>Checkpointer: Save State
    AgentGraph->>InterruptNode: Route -> AnalysisInterruptNode
    InterruptNode->>AgentGraph: await interrupt({query: ...})
    AgentGraph->>AnalyzeCmd: runGraph returns {interrupted: true, agentQuery: ...}
    
    AnalyzeCmd->>User: Display Agent Query
    User->>AnalyzeCmd: Provide Response
    AnalyzeCmd->>AnalyzeCmd: Prepare currentInput = Command{resume: response}
    AnalyzeCmd->>AnalyzeCmd: analysisIteration returns {isDone: false, newInput: Command}
    AnalyzeCmd->>AnalyzeCmd: Loop continues...
    
    AnalyzeCmd->>AgentGraph: app.stream(Command{resume}, streamConfig) 
    AgentGraph->>InterruptNode: interrupt() resolves, returns response
    AgentGraph->>Checkpointer: Save State
    AgentGraph->>PrepNode: Route -> AnalysisPrepareNode (state has inputs, userInput)
    PrepNode->>PrepNode: Process user response (using state.inputs for context)
    
    loop Until User Approves
        PrepNode->>PromptService: Get prompt (using state.inputs)
        PromptService-->>PrepNode: Return prompt
        PrepNode->>PrepNode: callLLM(..., state.inputs, ...)
        AgentGraph->>Checkpointer: Save State
        AgentGraph->>InterruptNode: Route and Interrupt
        AgentGraph->>AnalyzeCmd: Return interrupted
        AnalyzeCmd->>User: Display Query
        User->>AnalyzeCmd: Provide Response
    end
    
    PrepNode->>PrepNode: Process approval (using state.inputs)
    PrepNode->>PromptService: Get final prompt (using state.inputs)
    PromptService-->>PrepNode: Return final prompt
    PrepNode->>PrepNode: callLLM for final summary (using state.inputs)
    AgentGraph->>Checkpointer: Save State
    AgentGraph->>AgentGraph: Route to END
    AgentGraph->>AnalyzeCmd: runGraph returns {interrupted: false}
    
    AnalyzeCmd->>AnalyzeCmd: analysisIteration returns {isDone: true, ...}
    AnalyzeCmd->>AnalyzeCmd: Loop finishes
    AnalyzeCmd->>AnalyzeCmd: getFinalOutput(config, getStateFn)
    AnalyzeCmd->>User: displayFinalOutputToUser(finalOutput)
    AnalyzeCmd->>AnalyzeCmd: persistFinalOutput(finalOutput, inputsDir)
    AnalyzeCmd->>withMemoryMgmt: Return finalState
    withMemoryMgmt->>withMemoryMgmt: Update memory with final system_context
    withMemoryMgmt->>withMemoryMgmt: Save memory to file
    withMemoryMgmt->>Main: Complete
    Main->>Main: Exit

## Detailed Step-by-Step Description

1.  **User Invocation (`src/main.ts`):**
    *   The user runs the application from the terminal, specifying the `analyze` command and its arguments (e.g., `node dist/main.js analyze --query "Implement feature X" --inputs ./docs/feature_x`). They may optionally include `--prompts-config <path_to_config.json>`.
    *   `main.ts`, using `commander`, parses the arguments and identifies the `analyze` command and global options.
    *   A global `PromptService` is instantiated, passing the `promptsConfigPath` (if provided). Local overrides can create a different `PromptService` instance if needed.
    *   The `action` handler for the `analyze` command in `main.ts` calls `withMemoryManagement` with a command handler that executes `runAnalysis(query, inputsDir, modelName, memoryService, promptService)` from `src/commands/analyze.ts`.

2.  **Memory Management Wrapper (`withMemoryManagement` in `src/main.ts`):**
    *   Before command execution, the memory service loads existing memory from the specified file path.
    *   The command handler is executed within a try-finally block.
    *   After command completion (success or failure), if the final state contains `system_context`, the memory service is updated.
    *   Memory is always saved back to the file, even if the command failed.

3.  **Preprocessing (`runAnalysis` in `src/commands/analyze.ts`):**
    *   `runAnalysis` receives the `query`, `inputsDir`, `modelName`, `memoryService`, and the `promptService` instance.
    *   A unique `thread_id` is generated via `newGraphConfigFn`. The `config` object (of type `AppRunnableConfig`) is prepared, initially containing `configurable: { thread_id }`.
    *   The initial `AppState` object is created, including `userInput` (prefixed with "analyze: "), `modelName`, `currentFlow: ANALYZE_FLOW`, an empty `analysisHistory`, and crucially, `inputDirectoryPath` set to the `inputsDir` provided to `runAnalysis`. `inputs` is initialized as empty.

4.  **Analysis Execution Loop Start (`runAnalysis` in `src/commands/analyze.ts`):**
    *   `runAnalysis` initializes `currentInput` with the `initialAppState` and `analysisDone = false`.
    *   It enters a `while (!analysisDone)` loop.
    *   Inside the loop, it calls `await analysisIterationFn(currentInput, config, promptService)` (which defaults to the local `analysisIteration` function).

5.  **Analysis Iteration (`analysisIteration` in `src/commands/analyze.ts`):**
    *   Receives `promptService`.
    *   Calls `await runGraphFn(currentInput, config, promptService)` (which defaults to the local `runGraph`) to execute a step of the agent graph.

6.  **Graph Invocation (`runGraph` in `src/commands/analyze.ts`):**
    *   Receives `promptService`.
    *   Creates a new config using the `createConfigWithPromptService(config, promptService)` utility function, which embeds the `promptService` into `config.configurable.promptService`.
    *   `runGraph` calls `agentApp.stream(currentInput, streamConfig)`. The `streamConfig` now carries the `promptService` instance into the graph execution environment.
    *   Execution enters the LangGraph graph (`src/agents/graph.ts`) at the `START` node.

7.  **Initial Routing (`src/agents/graph.ts` conditional edge from START):**
    *   The conditional edge logic examines `state.currentFlow`.
    *   For analysis flow (`ANALYZE_FLOW`), it routes execution to the `documentRetrievalNode`.

8.  **Document Retrieval (`src/agents/DocumentRetrievalNode.ts`):**
    *   `documentRetrievalNode` executes. It receives the `state`.
    *   It reads `state.inputDirectoryPath`.
    *   It reads `.txt` and `.md` files from the directory, handling errors by warning and skipping files.
    *   It populates `state.inputs` with a map of { filename: content } using the basename as the key.
    *   The graph then transitions to `ANALYSIS_PREPARE` based on the `currentFlow`.

9.  **Analysis Preparation (`src/agents/AnalysisPrepareNode.ts`):**
    *   `analysisPrepareNode` executes. It receives the `state` (which now includes `state.inputs`) and the `config` (of type `AppRunnableConfig`).
    *   It first checks if `state.inputs` is populated. If not (and inputs were expected), it sets an error in `analysisOutput` and transitions to `END`.
    *   It retrieves `promptService` from `config.configurable.promptService`.
    *   **Input Handling & Approval Check:** Processes `state.userInput`. If this is a user response (after an interrupt), it checks for "done" keywords using `userIsDone()`. If the user is done, it calls `returnFinalOutput()` to generate the final analysis summary.
    *   **LLM Interaction:** If not done, it calls `callLLMForNextStep()` which constructs the appropriate prompt using `promptService.getFormattedPrompt()` and calls the LLM via `callTheLLM()` from `LLMUtils.ts`.
    *   **Next Step Decision:** Based on whether `analysisOutput` is populated, it either ends the flow or proceeds to the interrupt node.

10. **Analysis Interrupt (`src/agents/AnalysisInterruptNode.ts`):**
    *   `analysisInterruptNode` executes when the agent needs user input.
    *   It calls `interrupt({ query: currentAnalysisQuery })` to pause execution and return control to the `runGraph` function.
    *   The interrupt contains the agent's question for the user.

11. **User Interaction Loop (`runGraph` and `analysisIteration`):**
    *   When an interrupt occurs, `runGraph` detects it and returns `{ interrupted: true, agentQuery }`.
    *   `analysisIteration` displays the agent's query to the user and prompts for input using `inquirer`.
    *   The user's response is packaged into a `Command({ resume: userResponse })` and becomes the next input.
    *   The loop continues until the agent generates a final `analysisOutput` or the user indicates they are done.

12. **Final Output and Cleanup:**
    *   Once the analysis is complete, `getFinalOutput()` extracts the final analysis from the graph state.
    *   `displayFinalOutputToUser()` shows the result to the user.
    *   `persistFinalOutput()` saves the analysis to a file in the input directory.
    *   The final state is returned to `withMemoryManagement`, which updates and saves the memory.

## Key Components

### State Management
- **AppState**: Contains all relevant data including `inputs`, `analysisHistory`, `analysisOutput`, `inputDirectoryPath`, and `currentFlow`.
- **LangGraph Checkpointer**: Maintains conversation state across interrupts and resumes.

### Prompt Management
- **PromptService**: Handles loading and formatting of prompts, supporting both default and custom configurations.
- **Dynamic Context**: Prompts are populated with file summaries, conversation history, and user input as needed.

### Error Handling
- **File Reading**: Individual file read errors are logged but don't stop the process.
- **LLM Calls**: API failures are caught and converted to user-friendly error messages.
- **Memory Management**: Memory is always saved, even if the command fails.

### Dependency Injection
- All external dependencies (file system, LLM calls, user prompts) are injected for testability.
- Default implementations are provided for normal operation.