# Archie: Analyze Command Flow

This document details the execution flow of the `analyze` command, focusing on how the Human-in-the-Loop (HITL) pattern is implemented using LangGraphJS for multi-turn conversational analysis.

## Overview

The `analyze` command allows users to initiate an analysis task by providing an initial query (`--query`) and an input directory path (`--inputs`). Optionally, a `--prompts-config <path>` can be provided to customize agent prompts. The system reads relevant files (`.txt`, `.md`) from the input directory and then enters a conversational loop where an AI agent interacts with the user via the console, asking clarifying questions until the user approves a proposed solution or indicates they are done. This flow runs directly from the command line after being invoked via `src/main.ts`.

This flow leverages LangGraph's state management, checkpointers, and interrupt mechanism, combined with a specific two-node structure (`AnalysisPrepareNode` and `AnalysisInterruptNode`). The actual LLM interaction happens within `AnalysisPrepareNode`. This node now uses an injected `PromptService` (passed via `config.configurable` from `runGraph` in `analyze.ts`) to get formatted prompt strings. The `PromptService` handles loading default prompts or custom prompts specified in the user-provided configuration file. The `callLLM` function within `AnalysisPrepareNode` then uses this formatted prompt when calling `callOpenAI` from `src/agents/LLMUtils.ts`.

## Visual Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant Terminal
    participant main.ts as Main
    participant analyze.ts as AnalyzeCmd
    participant PromptService
    participant AgentGraph
    participant Checkpointer

    User->>Terminal: node dist/main.js analyze --query "..." --inputs <dir_path> [--prompts-config <cfg_path>]
    Terminal->>Main: Executes main(), parses args via Commander
    Main->>PromptService: new PromptService(promptsConfigPath)
    Main->>AnalyzeCmd: runAnalysis(query, inputsDir, modelName, memoryService, promptService)
    Note right of AnalyzeCmd: runAnalysis handles the core logic
    AnalyzeCmd->>AnalyzeCmd: readFiles(inputsDir) -> fileContents
    AnalyzeCmd->>AnalyzeCmd: Create initial AppState (..., modelName) & config (thread_id)
    AnalyzeCmd->>AnalyzeCmd: Start Execution Loop (while !analysisDone)
    AnalyzeCmd->>AnalyzeCmd: analysisIteration(currentInput, config, promptService)
    AnalyzeCmd->>AnalyzeCmd: runGraph(currentInput, config, promptService)
    Note right of AnalyzeCmd: Adds promptService to config.configurable
    AnalyzeCmd->>AgentGraph: app.stream(currentInput{..., modelName}, config{..., configurable.promptService})
    AgentGraph->>AgentGraph: START -> Evaluate Initial Routing
    Note right of AgentGraph: Based on userInput keywords
    AgentGraph->>AgentGraph: Route -> AnalysisPrepareNode
    AgentGraph->>AgentGraph: Run AnalysisPrepareNode(state, config{configurable.promptService})
    Note right of AgentGraph: Retrieves promptService from config
    AgentGraph->>PromptService: Get formatted prompt (initial, followup, or final)
    PromptService-->>AgentGraph: Return formatted prompt string
    AgentGraph->>AgentGraph: Uses formatted prompt in callLLM(..., modelName)->callOpenAI(..., model=effectiveModel)
    Note right of AgentGraph: Returns state update (history, query)
    AgentGraph->>Checkpointer: Save State (after Prepare returns)
    AgentGraph->>AgentGraph: Route: AnalysisPrepareNode -> AnalysisInterruptNode
    AgentGraph->>AgentGraph: Run AnalysisInterruptNode
    AgentGraph->>AgentGraph: await interrupt({query: ...})
    Note right of AgentGraph: Graph Pauses
    AgentGraph->>AnalyzeCmd: runGraph returns {interrupted: true, query: ...}
    AnalyzeCmd->>AnalyzeCmd: analysisIteration checks interrupted == true
    AnalyzeCmd->>User: Display Agent Query (via utils.say)
    User->>AnalyzeCmd: Provide Response (via inquirer)
    AnalyzeCmd->>AnalyzeCmd: Prepare currentInput = Command{resume: response}
    AnalyzeCmd->>AnalyzeCmd: analysisIteration returns {isDone: false, newInput: Command}
    AnalyzeCmd->>AnalyzeCmd: Loop continues with new currentInput
    AnalyzeCmd->>AnalyzeCmd: analysisIteration(currentInput, config, promptService)
    AnalyzeCmd->>AnalyzeCmd: runGraph(currentInput, config, promptService)
    AnalyzeCmd->>AgentGraph: app.stream(currentInput, config{configurable.promptService})
    Note left of AgentGraph: Graph Resumes
    AgentGraph->>AgentGraph: interrupt() resolves, returns response
    AgentGraph->>AgentGraph: AnalysisInterruptNode returns {userInput: response}
    AgentGraph->>Checkpointer: Save State (after Interrupt returns)
    AgentGraph->>AgentGraph: Route: AnalysisInterruptNode -> AnalysisPrepareNode
    AgentGraph->>AgentGraph: Run AnalysisPrepareNode(state, config{configurable.promptService})
    Note right of AgentGraph: Processes response from state.userInput, adds to history

    loop Until User Provides "SOLUTION APPROVED" or similar
        AnalyzeCmd->>AnalyzeCmd: analysisIteration calls runGraph
        AgentGraph->>AgentGraph: Prepare(state, config{configurable.promptService}) -> Interrupt -> Pause
        AgentGraph->>AnalyzeCmd: runGraph returns {interrupted: true, query: ...}
        AnalyzeCmd->>AnalyzeCommand: analysisIteration handles interrupt
        AnalyzeCmd->>User: Display Agent Query
        User->>AnalyzeCmd: Provide Response
        AnalyzeCmd->>AnalyzeCmd: Prepare Command{resume: ...}
        AnalyzeCmd->>AnalyzeCmd: analysisIteration returns {isDone: false, newInput: Command}
    end

    Note over User, AnalyzeCmd: User eventually provides approval/done keyword

    AnalyzeCmd->>AnalyzeCmd: analysisIteration(currentInput, config, promptService)
    AnalyzeCmd->>AnalyzeCmd: runGraph(currentInput, config, promptService)
    AnalyzeCmd->>AgentGraph: app.stream(currentInput, config{configurable.promptService})
    AgentGraph->>AgentGraph: Run AnalysisPrepareNode(state, config{configurable.promptService}) (processes approval keyword)
    AgentGraph->>PromptService: Get formatted prompt ('final')
    PromptService-->>AgentGraph: Return final prompt string
    AgentGraph->>AgentGraph: Uses final prompt in callLLM('final', modelName) -> callOpenAI(..., model=effectiveModel) for final summary
    Note right of AgentGraph: Returns state update {analysisOutput: "..."}
    AgentGraph->>Checkpointer: Save State (after Prepare returns)
    AgentGraph->>AgentGraph: Route: AnalysisPrepareNode -> END
    AgentGraph->>AnalyzeCmd: runGraph returns {interrupted: false}
    AnalyzeCmd->>AnalyzeCmd: analysisIteration checks interrupted == false
    AnalyzeCmd->>AnalyzeCmd: analysisIteration returns {isDone: true, newInput: ...}
    AnalyzeCmd->>AnalyzeCmd: Loop finishes (analysisDone = true)
    AnalyzeCmd->>AnalyzeCmd: getFinalOutput(config, getStateFn) # Get final output string
    Note right of AnalyzeCmd: Internally calls agentApp.getState
    AnalyzeCmd->>AnalyzeCmd: Returns finalOutput string
    AnalyzeCmd->>User: displayFinalOutputToUser(finalOutput) # Display on console
    AnalyzeCmd->>AnalyzeCmd: persistFinalOutput(finalOutput, inputsDir) # Save to file
    Note right of AnalyzeCmd: Writes to <inputsDir>/analysis_result.md
    AnalyzeCmd->>Main: runAnalysis returns
    Main->>Main: Save memory (if command successful) and exit
```

## Detailed Step-by-Step Description

1.  **User Invocation (`src/main.ts`):**
    *   The user runs the application from the terminal, specifying the `analyze` command and its arguments (e.g., `node dist/main.js analyze --query "Implement feature X" --inputs ./docs/feature_x`). They may optionally include `--prompts-config <path_to_config.json>`.
    *   `main.ts`, using `commander`, parses the arguments and identifies the `analyze` command and global options.
    *   `PromptService` is instantiated, passing the `promptsConfigPath` (if provided).
    *   The `action` handler for the `analyze` command in `main.ts` calls `runAnalysis(query, inputsDir, modelName, memoryService, promptService)` from `src/commands/analyze.ts`.

2.  **Preprocessing (`runAnalysis` in `src/commands/analyze.ts`):**
    *   `runAnalysis` receives the `query`, `inputsDir`, `modelName`, and the `promptService` instance.
    *   It calls `readFiles(inputsDir)` to read the content of `.txt` and `.md` files into the `fileContents` record.
    *   A unique `thread_id` is generated via `newGraphConfigFn`. The `config` object (of type `AppRunnableConfig`) is prepared, initially containing `configurable: { thread_id }`.
    *   The initial `AppState` object is created (`userInput`, `fileContents`, `modelName`, empty `analysisHistory`, etc.).

3.  **Analysis Execution Loop Start (`runAnalysis` in `src/commands/analyze.ts`):**
    *   `runAnalysis` initializes `currentInput` with the `initialAppState` and `analysisDone = false`.
    *   It enters a `while (!analysisDone)` loop.
    *   Inside the loop, it calls `await analysisIterationFn(currentInput, config, promptService)` (which defaults to the local `analysisIteration` function).

4.  **Analysis Iteration (`analysisIteration` in `src/commands/analyze.ts`):**
    *   Receives `promptService`.
    *   Calls `await runGraphFn(currentInput, config, promptService)` (which defaults to the local `runGraph`) to execute a step of the agent graph.

5.  **Graph Invocation (`runGraph` in `src/commands/analyze.ts`):**
    *   Receives `promptService`.
    *   Crucially, it modifies the passed `config` by adding `promptService` to `config.configurable.promptService`.
    *   `runGraph` calls `agentApp.stream(currentInput, config)`. The `config` now carries the `promptService` instance into the graph execution environment.
    *   Execution enters the LangGraph graph (`src/agents/graph.ts`) at the `START` node.

6.  **Initial Routing (`src/agents/graph.ts` conditional edge from START):**
    *   The conditional edge logic examines `state.userInput` (`analyze: <query>`).
    *   It routes execution to the `ANALYSIS_PREPARE` node.

7.  **Analysis Preparation (`src/agents/AnalysisPrepareNode.ts`):**
    *   `analysisPrepareNode` executes. It receives the `state` and the `config` (of type `AppRunnableConfig`).
    *   It retrieves `promptService` from `config.configurable.promptService`.
    *   **Input Handling & Approval Check:** Processes input, adds to history, checks for approval keywords.
    *   **Conversational Turn (If not approved):** Calls its internal `callLLM` function (passing history, files, prompt type, `modelName` from state, and the retrieved `promptService`).
        *   `callLLM` now uses `promptService.getFormattedPrompt("AnalysisPrepareNode", promptKey, context)` to obtain the prompt string (either default or custom).
        *   This formatted prompt is then passed to `LLMUtils.callOpenAI` (which receives `modelName`).
        *   Returns state update (`analysisHistory`, `currentAnalysisQuery`).

8.  **Transition to Interrupt (`src/agents/graph.ts` conditional edge):**
    *   Edge after `ANALYSIS_PREPARE` routes to `ANALYSIS_INTERRUPT` if `analysisOutput` is empty.
    *   Checkpointer saves state.

9.  **Interrupt Trigger (`src/agents/AnalysisInterruptNode.ts`):**
    *   `analysisInterruptNode` reads `state.currentAnalysisQuery`.
    *   Calls `await interrupt({ query: queryToAsk })`, pausing the graph.

10. **Handling Interrupt (`runGraph` -> `analysisIteration` in `src/commands/analyze.ts`):**
    *   `agentApp.stream` yields `__interrupt__`.
    *   `runGraph` returns `{ interrupted: true, agentQuery: queryToAsk }`.
    *   `analysisIteration` receives this.
    *   Displays `agentQuery` (via `utils.say`).
    *   Uses `inquirer.prompt` to get `userResponse`.
    *   Prepares `currentInput = new Command({ resume: userResponse })`.
    *   `analysisIteration` returns `{ isDone: false, newInput: currentInput }`.

11. **Loop Continuation (`runAnalysis` in `src/commands/analyze.ts`):**
    *   The main `while` loop updates `currentInput`.
    *   `analysisDone` remains false, loop continues (back to step 4, passing `promptService` again).

12. **Resuming Graph (`analysisIteration` -> `runGraph` -> `AnalysisInterruptNode` -> `graph.ts` edge):**
    *   The next loop calls `runGraph` with the `Command` object and `promptService` (which again gets added to `config.configurable`).
    *   `agentApp.stream` resumes.
    *   `interrupt()` call resolves, returning `userResponse`.
    *   `AnalysisInterruptNode` returns `{ userInput: userResponse }`.
    *   Framework updates state, checkpointer saves.

13. **Input Processing Cycle (`graph.ts` edge -> `AnalysisPrepareNode`):**
    *   Edge `ANALYSIS_INTERRUPT -> ANALYSIS_PREPARE` is followed.
    *   Execution returns to **Step 7** (`AnalysisPrepareNode`), which will again use `promptService` from the `config` to get its prompts.

14. **Completion (`AnalysisPrepareNode` -> `END` -> `analysisIteration` -> `runAnalysis`):**
    *   User provides approval keyword.
    *   `AnalysisPrepareNode` detects it, calls its internal `returnFinalOutput`. 
        *   `returnFinalOutput` calls `callLLM` with `promptType: 'final'` and passes the `promptService`.
        *   `callLLM` uses `promptService.getFormattedPrompt("AnalysisPrepareNode", "final", context)`.
        *   Returns state with `analysisOutput` populated.
    *   Edge routes to `END`.
    *   `runGraph` returns `{ interrupted: false, ... }`.
    *   `analysisIteration` returns `{ isDone: true, ... }`.
    *   The `while` loop in `runAnalysis` ends.
    *   `runAnalysis` calls `getFinalOutputFn` (defaults to local `getFinalOutput`, using `getStateFn`).
    *   `runAnalysis` calls `displayFinalOutputFn` (defaults to local `displayFinalOutputToUser`).
    *   `runAnalysis` calls `persistFinalOutputFn` (defaults to local `persistFinalOutput`).
    *   `runAnalysis` finishes, returning control to the `action` handler in `src/main.ts`.
    *   `main.ts` proceeds to save memory (if successful) and then the application exits. 