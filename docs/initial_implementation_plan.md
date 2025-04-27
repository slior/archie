# Archie Initial Implementation Plan

**Revised Plan**

**Phase 1: Core Setup and Basic Shell**

1.  **Project Initialization:**
    *   Ensure you are in the desired project directory (`./`).
    *   Initialize a Node.js project if not already done: `npm init -y`.
    *   Install core dependencies: `npm install typescript @types/node ts-node --save-dev` and `npm install @langchain/langgraph commander inquirer dotenv`.
    *   Create a `tsconfig.json` file configured for compilation to a `dist` directory and using a modern ECMAScript target (e.g., ES2020) with Node16 module resolution.
    *   Add basic scripts to `package.json` for building (`tsc`) and running (`ts-node src/main.ts`).
    *   Create a `src` directory for source code if it doesn't exist.
    *   Create a `.gitignore` file (e.g., including `node_modules`, `dist`, `.env`, `memory.json`).
    *   Create an empty `.env` file for environment variables (e.g., API keys).

2.  **Basic CLI Shell Implementation:**
    *   Create `src/main.ts` as the main entry point.
    *   Use `commander` in `src/main.ts` to:
        *   Define the main application command.
        *   Add an option to specify the memory file path (e.g., `--memory-file <path>`, defaulting to `./memory.json`).
        *   Add options or commands for providing LLM API keys if not using environment variables.
        *   Parse command-line arguments.
    *   Create `src/cli/shell.ts`.
    *   Implement a simple interactive loop in `src/cli/shell.ts` using `inquirer` for user input.
        *   Display a prompt (e.g., `archie>`).
        *   Read user commands.
        *   Implement a basic `exit` command to terminate the application.
        *   Include placeholder logic for handling other commands.
    *   Integrate the shell loop into `src/main.ts` so it starts after argument parsing and memory loading.

**Phase 2: Agent Framework and Core Logic**

3.  **LangGraphJS Setup:**
    *   Create `src/agents/graph.ts`.
    *   Define the basic LangGraphJS state graph (`StateGraph`) structure in `src/agents/graph.ts`.
    *   Define the application state schema that will pass between nodes (e.g., including user input, conversation history, potentially references needed by agents to interact with `MemoryService`).

4.  **Internal Memory Implementation:**
    *   Define the data structures/interfaces for memory in `src/memory/types.ts`:
        *   `Entity`: `{ name: string; label?: string; entityType: string; observations: string[]; }`
        *   `Relation`: `{ from: string; to: string; label: string; observations: string[]; }`
        *   `MemoryState`: `{ entities: Entity[]; relations: Relation[]; }`
    *   Create `src/memory/MemoryService.ts`.
    *   Implement the `MemoryService` class responsible for:
        *   Holding the current `MemoryState` in memory.
        *   `loadMemory(filePath: string)`: Reads the JSON file specified by `filePath`. If the file doesn't exist, initialize with an empty `MemoryState` (`{ entities: [], relations: [] }`). Handles JSON parsing errors.
        *   `saveMemory(filePath: string)`: Writes the current in-memory `MemoryState` to the JSON file specified by `filePath`.
        *   `addEntity(entity: Entity)`: Adds an entity to the `entities` array. Ensures `name` uniqueness.
        *   `addRelation(relation: Relation)`: Adds a relation to the `relations` array. Could include checks to ensure `from` and `to` entities exist.
        *   `findEntityByName(name: string): Entity | undefined`: Finds an entity by its unique `name`.
        *   `findRelations(query: Partial<Pick<Relation, 'from' | 'to' | 'label'>>): Relation[]`: Finds relations matching the provided query criteria (e.g., find all relations `from` a specific entity).
        *   Potentially add methods to update existing entities/relations.
    *   Instantiate `MemoryService` in `src/main.ts`.
    *   Call `loadMemory` early in `src/main.ts` using the path from the CLI argument or the default.
    *   Make the `MemoryService` instance available to the agent system (e.g., pass it in the graph execution context or via a shared service).

5.  **Initial Agent Definition:**
    *   Create `src/agents/BaseAgentNode.ts` (optional interface/abstract class).
    *   Create `src/agents/EchoAgentNode.ts`: Simple agent node taking user input from the state and returning an echo response.

6.  **Supervisor/Orchestrator Node:**
    *   Create `src/agents/SupervisorNode.ts`.
    *   Implement the initial supervisor node in `src/agents/graph.ts`.
    *   Minimal logic: receive state, route to `EchoAgentNode`.
    *   Add `EchoAgentNode` and `SupervisorNode` to the graph in `src/agents/graph.ts`. Define entry point and edges. Compile graph.

**Phase 3: Persistence and Configuration**

7.  **State Persistence:**
    *   Create `src/persistence/PersistenceService.ts` (optional, could be handled in `main.ts` initially if only saving memory is needed on exit).
    *   Focus persistence: The primary persistence mechanism is `MemoryService` saving to `memory.json`.
    *   Ensure `MemoryService.saveMemory` is called reliably before the application exits (e.g., triggered by the `exit` command in the shell, or using process exit handlers).
    *   If conversation history or other non-memory state needs persistence later, `PersistenceService` can be expanded to handle saving/loading that to a separate file (e.g., `archie_conversation.json`).

8.  **Configuration Management:**
    *   Use the `dotenv` library in `src/main.ts` to load environment variables from `.env`.
    *   Make configuration (CLI args from `commander`, env vars from `dotenv`) accessible where needed (e.g., API keys for future LLM agent nodes).

**Phase 4: Integration and Refinement**

9.  **Connecting CLI to Agent Graph:**
    *   Modify the shell loop in `src/cli/shell.ts`.
    *   Pass user input into the compiled LangGraphJS graph.
    *   Execute the graph with the input and current state (including access to `MemoryService` if needed by nodes).
    *   Retrieve the response from the graph state.
    *   Display the response to the user.
    *   (Saving memory is handled separately on exit or via explicit commands later).

10. **Initial README:**
    *   Create/Update `README.md`.
    *   Include instructions on:
        *   Installation (`npm install`).
        *   Configuration (`.env` file, LLM keys).
        *   Building (`npm run build`).
        *   Running (`npm run start`, `--memory-file` option, default `memory.json` location/creation).
        *   Basic usage (shell interaction, `exit` command).
        *   Briefly describe the `memory.json` structure and purpose.

---

**REVISED IMPLEMENTATION CHECKLIST:**

1.  Initialize project (`npm init`, install dependencies: `typescript`, `@types/node`, `ts-node`, `@langchain/langgraph`, `commander`, `inquirer`, `dotenv`).
2.  Create `tsconfig.json` configured for `dist` output, ES2020 target, Node16 modules.
3.  Add `build` and `start` scripts to `package.json`.
4.  Create `src` directory, `.gitignore` (including `memory.json`), empty `.env` file.
5.  Create `src/main.ts` entry point.
6.  Use `commander` in `src/main.ts` for argument parsing (including `--memory-file` option, defaulting to `./memory.json`).
7.  Create `src/cli/shell.ts` and implement the interactive loop using `inquirer` with an `exit` command.
8.  Integrate the shell loop start into `src/main.ts`.
9.  Create `src/agents/graph.ts` and define the basic `StateGraph` structure and state schema.
10. Create `src/memory/types.ts` and define `Entity`, `Relation`, `MemoryState` interfaces/types.
11. Create `src/memory/MemoryService.ts`.
12. Implement `MemoryService.loadMemory(filePath)` method (handling file not found, JSON parsing).
13. Implement `MemoryService.saveMemory(filePath)` method.
14. Implement `MemoryService.addEntity(entity)`, `addRelation(relation)`, `findEntityByName(name)`, `findRelations(query)`.
15. Instantiate `MemoryService` in `src/main.ts`.
16. Call `MemoryService.loadMemory` in `src/main.ts` using the CLI arg/default path.
17. Make `MemoryService` instance available to the agent graph context.
18. Create `src/agents/EchoAgentNode.ts`.
19. Create `src/agents/SupervisorNode.ts` with minimal routing logic.
20. Add nodes to the graph in `src/agents/graph.ts`, define entry/edges, compile graph.
21. Implement logic in `src/cli/shell.ts` (or `main.ts`) to call `MemoryService.saveMemory` before application exit.
22. Use `dotenv` in `src/main.ts` to load `.env`. Make config available.
23. Modify `src/cli/shell.ts` to pass user input to the LangGraphJS graph, execute it, and display the result.
24. Create/Update `README.md` with setup, config, build, run instructions, mention of `memory.json` and the `--memory-file` option.

---

## Implementation Log

This section records the execution process based on the plan above.

*   **Execution Start:** Entered EXECUTE mode as requested.
*   **Checklist Items 1-3:** Project initialized, `tsconfig.json` created, `package.json` scripts added successfully via terminal commands and file edits.
*   **Checklist Item 4:** `src` directory and `.gitignore` created. `.env` file creation was skipped due to workspace restrictions; requires manual creation by the user if needed.
*   **Checklist Items 5-8:** `src/main.ts` and `src/cli/shell.ts` created and integrated with basic CLI functionality using `commander` and `inquirer`.
*   **Checklist Items 9-19:** Files for LangGraphJS structure (`src/agents/graph.ts`), memory (`src/memory/types.ts`, `src/memory/MemoryService.ts`), and initial agents (`src/agents/EchoAgentNode.ts`, `src/agents/SupervisorNode.ts`) created. MemoryService methods implemented. `MemoryService` instantiated and integrated into `main.ts`.
*   **Checklist Item 20:** Graph nodes, edges, and compilation logic were added to `src/agents/graph.ts`. Initial attempts resulted in persistent TypeScript type errors related to graph method parameters (`setEntryPoint`, `addConditionalEdges`, `addEdge`). **Resolution:** The user refactored the graph definition using the fluent interface provided by `StateGraph` (chaining methods like `.addNode().addEdge()...`), which successfully resolved the compilation errors.
*   **Checklist Items 21-23:** Memory saving on exit logic added via `MemoryService` call in `shell.ts`. `dotenv` configured in `main.ts`. CLI loop connected to invoke the compiled agent graph (`agentApp.invoke`).
*   **Checklist Item 24:** Initial `README.md` file created with setup and usage instructions.
*   **Execution End:** All checklist items completed, with deviations noted for item 4 (.env creation) and the resolution process for item 20 (graph compilation). System ready for basic testing as per REVIEW mode assessment.

## Analysis Agent Implementation Plan

This section details the plan for adding the "Analysis Agent," designed for multi-turn conversational analysis based on user queries and provided files.

*   **Core Pattern:** The implementation utilizes LangGraph's Human-in-the-loop (HITL) pattern, specifically the `interrupt()` function within the agent node.
    *   **Rationale:** This pattern was chosen because it directly models the requirement for the agent to pause during its execution, ask the user clarifying questions derived from its analysis, await input, and then resume processing with the new information. It aligns well with the conversational nature described in the initial specification and leverages a dedicated LangGraph feature, deemed more suitable than managing the conversational state purely through graph routing logic.
*   **State Changes (`AppState` in `src/agents/graph.ts`):** The central state object will be augmented to support the agent's needs:
    *   `fileContents: Record<string, string>`: To hold the content of files provided by the user, loaded upstream by the calling process (the shell command).
    *   `analysisHistory: Array<{ role: 'user' | 'agent'; content: string }>`: To maintain a log of the conversation turns between the user and the agent. This will be appended to during the interaction.
    *   `analysisOutput: string`: To store the final, detailed solution description generated by the agent after the user provides approval.
    *   `currentAnalysisQuery: string`: A field to temporarily store the specific question or message the agent wants to present to the user when it triggers an `interrupt()`.
    *   StateGraph channels will be updated accordingly to manage these new fields (e.g., appending to history, persisting file contents, updating outputs).
*   **New Node (`src/agents/AnalysisAgentNode.ts`):** A new agent node function, `analysisAgentNode`, will be created. It will:
    *   Contain the core logic for interacting with an LLM (placeholder initially).
    *   Manage the `analysisHistory`.
    *   Evaluate the context (history, file contents) to determine if clarification is needed from the user.
    *   Call `interrupt()` when user input is required, passing the query via the state.
    *   Check incoming user input for the "SOLUTION APPROVED" trigger phrase to conclude the analysis.
    *   Generate the final `analysisOutput` upon approval.
*   **Supervisor Node (`src/agents/SupervisorNode.ts`):** The existing supervisor's routing logic will be modified:
    *   It will inspect the initial `userInput` for keywords (e.g., "analyze").
    *   If keywords are detected, it will route the graph execution to the newly added `analysisAgentNode`.
    *   Existing routing logic (e.g., to `echoAgent` or `END`) will be maintained for other inputs.
*   **Graph Definition (`src/agents/graph.ts`):**
    *   The `analysisAgentNode` will be added to the graph definition.
    *   Conditional edges from the `supervisor` node will be updated to include the `analysisAgentNode` as a possible destination.
    *   An edge will be added from `analysisAgentNode` to `END` for when the analysis process completes successfully.
    *   A checkpointer (e.g., `MemorySaver`) will be configured and passed during graph compilation, as this is a requirement for using `interrupt()`.
*   **Shell Integration (`src/cli/shell.ts`):** The interactive shell will be enhanced:
    *   Input parsing will be added to distinguish commands (like `analyze`) from simple inputs.
    *   A specific handler function (`handleAnalyzeCommand`) will be created for the `analyze` command. This handler will:
        *   Parse command-line arguments provided within the shell (e.g., `--query "<text>"`, `--file <path>`).
        *   Read the specified files into the `fileContents` structure.
        *   Generate a unique `thread_id` for the graph run.
        *   Invoke the graph using `app.stream()` within a loop.
        *   Detect the `__interrupt__` signal from the stream.
        *   When interrupted, display the agent's query (from `currentAnalysisQuery`) and use `inquirer` to prompt the user for input.
        *   Resume the graph execution by feeding a `new Command({ resume: userResponse })` back into the stream loop.
        *   When the graph finishes without interruption, retrieve the final state using `app.getState()` and display the `analysisOutput`.
    *   The previous default behavior (invoking the graph directly with any input) will be refactored into a separate handler (`handleDefaultCommand`). 