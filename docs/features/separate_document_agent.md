# Feature Specification

Given the agent graph implemented for Archie, I would like to separate the input retrieval into a separate agent.
The purpose is to isolate the document (and context) retrieval into a separate agent, so it can be later reused.

- The functionality of reading the input files should be separated into a separate agent graph.
- For flows that require the input files (have this as an option), this agent should be called first.
- The agent should read the input files, and put them into the application state under a new key - `inputs`.
    - It should be a dictionary mapping the input name to the content of the file.
- If a file cannot be read, warn, but skip it.
- Use the same filter for files as the existing code today. This behavior should not change.
- Other agents using the content of the file should be changed to read the data from the application state.
    - if the data doesn't exist there, other agents should stop and notify an error.


# Plan

**I. `AppState` Modifications (`src/agents/graph.ts`)**

1.  **Add `inputs` field:**
    *   Modify the `AppState` interface to include a new field: `inputs: Record<string, string>;`
    *   This field will store the mapping of file names (not full paths, just names, as per original `readFiles` behavior implied by `path.basename` usage in `AnalysisPrepareNode`'s prompt construction, although `readFiles` currently stores full paths as keys). *Correction: The spec says "dictionary mapping the input name to the content of the file." Let's stick to filename as key. The current `readFiles` uses resolved paths as keys; this will need adjustment in the new node.*
    *   *Self-correction based on re-reading spec for `inputs` key: "It should be a dictionary mapping the input name to the content of the file." This implies basename. The `readFiles` function currently uses resolved paths as keys. The new node should adapt this to use basenames.*
2.  **Add `inputDirectoryPath` field:**
    *   Modify the `AppState` interface to include: `inputDirectoryPath: string;`
    *   This field will store the path to the directory from which files should be read.
3.  **Update Channels:**
    *   Add channel configurations for `inputs` and `inputDirectoryPath` in the `StateGraph` constructor.
    *   `inputs`: `{ value: (x, y) => y ?? x, default: () => ({}) }` (Persist, allow override)
    *   `inputDirectoryPath`: `{ value: (x, y) => y ?? x, default: () => "" }` (Persist, allow override)
4.  **Deprecate/Remove `fileContents` (Future Consideration, Action for this plan: Identify usage):**
    *   For now, we will keep `fileContents` to avoid breaking existing parts of the graph not immediately refactored.
    *   However, the new `DocumentRetrievalNode` will populate `inputs`.
    *   `AnalysisPrepareNode` will be changed to read from `inputs`.
    *   Identify all usages of `fileContents` in the codebase to assess future removal.

**II. Create `DocumentRetrievalNode.ts` (`src/agents/DocumentRetrievalNode.ts`)**

1.  **Create new file:** `src/agents/DocumentRetrievalNode.ts`.
2.  **Define `documentRetrievalNode` function:**
    *   Signature: `async function documentRetrievalNode(state: AppState): Promise<Partial<AppState>>`
    *   Functionality:
        *   Retrieve `state.inputDirectoryPath`. If empty or undefined, log a warning and return an empty `inputs` object or handle as an error condition for the node.
        *   Implement file reading logic:
            *   This logic will be similar to the current `readFiles` function in `src/commands/analyze.ts`. Consider moving the core file reading and filtering logic (for `.txt`, `.md`) into a utility function in `src/utils.ts` or keeping it encapsulated within this node. For this plan, let's assume it's implemented within the node for now, mirroring `readFiles`.
            *   Use `fsPromises.readdir` to list files in `state.inputDirectoryPath`.
            *   Filter for `.txt` and `.md` files.
            *   For each matching file:
                *   Construct the full file path.
                *   Attempt to read the file using `fsPromises.readFile`.
                *   If successful, store the content in a dictionary with the **file name (basename)** as the key and content as the value.
                *   If reading a file fails, log a warning (e.g., `console.warn`) including the file path and error, then skip the file (do not throw an error that stops the node).
        *   Return a `Partial<AppState>` object: `{ inputs: <the_dictionary_of_file_contents> }`.

**III. Modify Agent Graph (`src/agents/graph.ts`)**

1.  **Import `documentRetrievalNode`**.
2.  **Add new node name constant:** `const DOCUMENT_RETRIEVAL = "documentRetrievalNode";`
3.  **Add node to workflow:** `.addNode(DOCUMENT_RETRIEVAL, documentRetrievalNode)`
4.  **Modify Conditional Edges from `START`:**
    *   The existing conditional edge from `START` routes to `ANALYSIS_PREPARE` if `shouldTriggerAnalysis(state.userInput)` is true.
    *   This needs to be changed: If analysis is triggered, it should first go to `DOCUMENT_RETRIEVAL`.
    *   New flow: `START` -- "analyze" keyword --> `DOCUMENT_RETRIEVAL`
5.  **Add Edge from `DOCUMENT_RETRIEVAL`:**
    *   After `documentRetrievalNode` completes, it should proceed to `ANALYSIS_PREPARE`.
    *   Add edge: `.addEdge(DOCUMENT_RETRIEVAL, ANALYSIS_PREPARE)`

**IV. Modify `AnalysisPrepareNode.ts` (`src/agents/AnalysisPrepareNode.ts`)**

1.  **Change input source:**
    *   Locate where `analysisPrepareNode` (and its internal `callLLM` or prompt generation logic) currently accesses `state.fileContents`.
    *   Modify this logic to read from `state.inputs` instead.
    *   The keys in `state.inputs` will be file names (basenames). Ensure prompt construction logic correctly uses these (it likely already does if it was using `path.basename` on keys from `state.fileContents` if they were full paths).
2.  **Add Error Handling for Missing `inputs`:**
    *   At the beginning of `analysisPrepareNode`, check if `state.inputs` exists or is empty.
    *   If `state.inputs` is undefined or an empty object (and inputs were expected for an analysis task), the node should:
        *   Log an error.
        *   Return a state that indicates failure or halts further processing in a controlled way (e.g., setting `analysisOutput` to an error message and transitioning to `END`, or throwing an error if the graph framework handles it gracefully). The spec says "stop and notify an error." For a graph node, this typically means returning a state that leads to an error path or a non-successful termination. For now, let's plan to set `analysisOutput` to an error message and ensure it transitions to `END`.
        *   Example: `return { analysisOutput: "Critical Error: Input documents not found in application state." };` (This will cause the conditional edge from `ANALYSIS_PREPARE` to go to `END`).

**V. Modify `analyze` Command (`src/commands/analyze.ts`)**

1.  **Remove direct `readFiles` call:**
    *   The `runAnalysis` function currently calls `await readFilesFn(inputsDir)`. This call should be removed.
2.  **Populate `inputDirectoryPath` in `initialAppState`:**
    *   When creating `initialAppState`, set the `inputDirectoryPath` field using the `inputsDir` argument passed to `runAnalysis`.
    *   Example: `inputDirectoryPath: inputsDir,`
3.  **Adjust `initialAppState` regarding `fileContents`:**
    *   Since `documentRetrievalNode` will now populate `inputs`, the `fileContents: fileContents,` line in `initialAppState` (where `fileContents` came from the now-removed `readFilesFn` call) should be removed or initialized to empty `fileContents: {},`.

**VI. Documentation Updates**

1.  **`docs/agent_graph.md`:**
    *   Update the "State (`AppState`)" section:
        *   Add descriptions for the new `inputs` and `inputDirectoryPath` fields.
        *   Mention the deprecation plan for `fileContents` if we decide to add that note.
    *   Update the "Nodes" section:
        *   Add a description for the new `documentRetrievalNode`.
    *   Update the Mermaid diagram and the "Flow / Edges" section:
        *   Show `documentRetrievalNode` in the diagram.
        *   Describe the new flow: `START` -> `documentRetrievalNode` -> `analysisPrepare` for analysis tasks.
2.  **`docs/analyze_flow.md`:**
    *   In the "Overview" and "Detailed Step-by-Step Description" sections, modify where file reading occurs.
    *   Instead of `AnalyzeCmd: readFiles(inputsDir) -> fileContents`, the flow will now show `analyze.ts` setting `inputDirectoryPath` in `AppState`, and then the `agentGraph` (specifically `documentRetrievalNode`) handling the file reading.
    *   Update the sequence diagram to reflect `documentRetrievalNode` and `AppState.inputs`.
    *   Ensure descriptions of `AnalysisPrepareNode` mention it now uses `state.inputs`.

**VII. Update `memory_bank.md`**

1.  After implementation and review, update `docs/memory_bank.md` with a summary of this feature implementation, including discoveries, problems, approach, and outcome.

---

**IMPLEMENTATION CHECKLIST:**

**Phase 1: AppState and Document Retrieval Node**
1.  [x] (`src/agents/graph.ts`) Modify `AppState` interface: Add `inputs: Record<string, string>;`.
2.  [x] (`src/agents/graph.ts`) Modify `AppState` interface: Add `inputDirectoryPath: string;`.
3.  [x] (`src/agents/graph.ts`) Update `StateGraph` channel configurations for `inputs` and `inputDirectoryPath`.
4.  [x] (`src/agents/DocumentRetrievalNode.ts`) Create the file.
5.  [x] (`src/agents/DocumentRetrievalNode.ts`) Implement `documentRetrievalNode` function:
    *   [x] Retrieve `state.inputDirectoryPath`. Handle if missing.
    *   [x] Implement file reading logic (mirroring `readFiles` from `analyze.ts` for `.txt`, `.md` files).
    *   [x] Use **file name (basename)** as key in the returned `inputs` dictionary.
    *   [x] Warn and skip on individual file read errors.
    *   [x] Return `Partial<AppState>` with the `inputs` dictionary.

**Phase 2: Graph Structure Modification**
6.  [x] (`src/agents/graph.ts`) Import `documentRetrievalNode` and add `DOCUMENT_RETRIEVAL` constant.
7.  [x] (`src/agents/graph.ts`) Add `documentRetrievalNode` to the workflow using `.addNode()`.
8.  [x] (`src/agents/graph.ts`) Modify conditional edge from `START`: `analyze` commands route to `DOCUMENT_RETRIEVAL`.
9.  [x] (`src/agents/graph.ts`) Add edge from `DOCUMENT_RETRIEVAL` to `ANALYSIS_PREPARE`.

**Phase 3: Update Consumer Node (`AnalysisPrepareNode`)**
10. [x] (`src/agents/AnalysisPrepareNode.ts`) Modify `analysisPrepareNode` to read file data from `state.inputs` instead of `state.fileContents`.
11. [x] (`src/agents/AnalysisPrepareNode.ts`) Ensure prompt construction logic correctly uses file names (basenames) from `state.inputs` keys.
12. [x] (`src/agents/AnalysisPrepareNode.ts`) Add error handling: If `state.inputs` is missing/empty when expected, log error and return state that leads to `END` (e.g., `{ analysisOutput: "Critical Error: Input documents not found..." }`).

**Phase 4: Update Calling Command (`analyze.ts`)**
13. [x] (`src/commands/analyze.ts`) In `runAnalysis`, remove the direct call to `readFilesFn`.
14. [x] (`src/commands/analyze.ts`) In `runAnalysis`, when creating `initialAppState`, set `inputDirectoryPath: inputsDir`.
15. [x] (`src/commands/analyze.ts`) In `runAnalysis`, remove `fileContents: fileContents,` from `initialAppState` or set to `fileContents: {}`.

**Phase 5: Documentation**
16. [x] (`docs/agent_graph.md`) Update `AppState` section (add `inputs`, `inputDirectoryPath`).
17. [x] (`docs/agent_graph.md`) Update "Nodes" section (add `documentRetrievalNode`).
18. [x] (`docs/agent_graph.md`) Update Mermaid diagram and "Flow / Edges" section.
19. [x] (`docs/analyze_flow.md`) Update "Overview" and "Detailed Step-by-Step Description" for new input mechanism.
20. [x] (`docs/analyze_flow.md`) Update sequence diagram.

**Phase 6: Final Review and Memory Bank**
21. [x] Review all changes for correctness and adherence to the plan.
22. [x] Manually test the `analyze` command with various scenarios (files present, some files unreadable, no files, incorrect directory).
23. [x] (`docs/memory_bank.md`) Update with a summary of the feature implementation.

---

# Implementation Log

*   **[Current Date/Time Placeholder] - Bug Fix in `runAnalysis`:** Noticed that the `inputsDir` parameter in `src/commands/analyze.ts#runAnalysis` was not being correctly assigned to `initialAppState.inputDirectoryPath`. This was manually corrected to ensure the document retrieval node receives the correct directory path. This issue was identified while investigating a failing test (`GenAI.test.ts`) that expected `readFiles` to be called, which is no longer the case.
