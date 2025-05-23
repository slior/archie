# Feature Specification

I would like to add the possibility of a building a knowledge graph of the system being reviewed, over time.

This has 2 aspects: updating the context, and using it between sessions.

## Structure of the system context

First we consider the general conceptual structure of the system context.

The memory of the system is generally built as a directed graph where nodes are entities that play some role in the system, or its development.
Examples for entities could be: services, data stores, message queues, web pages, API gateways, libraries, etc.
Generally speaking, any technical software artifact that plays a role in some flow.

Entities can also be development process artifacts - things that shape how the system look, or help communicate about its structure.
Examples for this are requirement documents, design documents, design decisions (ADRs), bug/ticket, etc.

Each entity has:
- `name`: Mandatory. a string, has to be unique in the scope of the system.
- `description`: a string. Can be empty.
- `type`: mandatory. A string identifying the class of the entity. The type can be changed if an entity is updated.
- `tags`: list of non-empty strings. Can be an empty list. When updating, new tags are added; existing tags are not removed unless explicitly part of the update operation.
- `properties`: a dictionary of key-value pairs. Can be empty. When updating, new properties are added; existing properties with matching keys are overwritten by new values.

The nodes (entities) are connected among themselves by the edges - relationships.
Relationships are simply directed edges between the nodes, with a type.
Each relationship has:
- `from`: Madnatory. the name of the source of the relationship
- `to`: Mandatory. the name of the target of the relationship.
- `type`: Mandatory. the type of the relationship, identifying the class of relationship. a non-empty string.
- `properties`: a dictionary of key-value pairs. Can be empty. When updating, new properties are added; existing properties with matching keys are overwritten by new values.

A given pair of nodes can have more than one relationship, but it must be of a different `type`.
We cannot have more than one relationship in the context with the same (`from`, `to`, `type`) triplet. If a new relationship with an existing triplet is added, its properties will update the existing one.

Relationships pointing to non-existent nodes (either `from` or `to`) should be ignored, and the system should issue a warning. The resulting context graph must always be valid.


## Updating the context
At the end of each analysis or context building flow, we should update the larger context of the sytem.
The purpose is to maintain a memory of the system between invocations of the tool, and to increase the knowledge over time. The `MemoryService` class will be responsible for managing the system context, including its persistence and update logic, and may require modifications to align with these specifications.

When updating the context, we should take into account existing memory context, and apply any new learning to that context.
Updating can include adding new entities or relationships, or modifying existing ones.
- **Entity Updates**: If an entity with the same `name` exists, its `description`, `type`, `tags`, and `properties` are updated according to the rules specified in the "Structure of the system context" section. New entities are added.
- **Relationship Updates**: If a relationship with the same (`from`, `to`, `type`) triplet exists, its `properties` are updated. New relationships are added, provided they do not point to non-existent entities.

The context should be persisted to a JSON file.
- **File Path**: The path to this file will be specified using the existing `--memory-file` CLI argument.
- **Default File**: If `--memory-file` is not provided, the default location will be `context.json` in the current working directory of the script.
- **Initialization**: If the specified context file does not exist upon loading, the system will initialize with an empty context. The specified file path will then be used for saving.

Saving of the context should occur at the end of the `analyze` and `build-context` flows.

**Error Handling**:
Any errors encountered during context operations (e.g., file I/O errors during load/save, JSON parsing errors of the context file, or critical validation errors during context updates that would lead to an invalid graph state) should stop the flow and report the error.
The exception to this rule is if the designated context file does not exist, in which case the context should load as empty.  

## Using the context
Upon invocation of any relevant flow (currently `analyze` and `build-context`), the system should load the existing system context using the `MemoryService`.
The context should then be made available in the `AppState` via a field named `system_context`. This field will hold the graph data (entities and relationships), managed by the `MemoryService` instance. For the initial implementation, the entire graph will be loaded into this field.

When invoking LLM agents, the context should be made available to the LLM.
A first, naive, implementation should simply concatenate a string serialization of the entire system context (entities and relationships) to the prompt. Future enhancements may involve more sophisticated strategies for providing relevant context.

# Plan

**Phase 1: `MemoryService` Enhancement and Core Types**

1.  **Define Core Types:**
    *   In a new file `src/memory/memory_types.ts` (or `src/types/context_types.ts`):
        *   Define `interface Entity { name: string; description: string; type: string; tags: string[]; properties: Record<string, any>; }`
        *   Define `interface Relationship { from: string; to: string; type: string; properties: Record<string, any>; }`
        *   Define `interface MemoryState { entities: Entity[]; relationships: Relationship[]; }`
        *   Define `const DEFAULT_MEMORY_STATE: MemoryState = { entities: [], relationships: [] };`
2.  **Refactor `MemoryService.ts` (`src/memory/MemoryService.ts`):**
    *   Update imports to use the new types from `memory_types.ts`.
    *   Change `private state: MemoryState` to use the new `MemoryState` type.
    *   Update constructor and `loadMemory` error handling for `ENOENT` to use `DEFAULT_MEMORY_STATE` from `memory_types.ts`.
    *   Modify `loadMemory` error handling: If the file doesn't exist (`ENOENT`), load with empty state (as currently done) and *do not* treat it as a flow-stopping error. Other I/O or parsing errors should throw an exception to stop the flow.
    *   Modify `saveMemory` to throw exceptions on failure to stop the flow.
    *   Rename `addRelation` to `addOrUpdateRelationship` and `findRelations`'s `label` parameter/property to `type`.
    *   Rename `addEntity` to `addOrUpdateEntity`.
3.  **Implement `addOrUpdateEntity` in `MemoryService.ts`:**
    *   Signature: `addOrUpdateEntity(entity: Entity): void` (or `boolean` indicating if added vs. updated, though `void` is simpler if we don't need to distinguish).
    *   Find existing entity by `entity.name`.
    *   If exists:
        *   Update `description = entity.description`.
        *   Update `type = entity.type`.
        *   Merge `tags`: `existing.tags = Array.from(new Set([...existing.tags, ...entity.tags]))`.
        *   Merge `properties`: `existing.properties = { ...existing.properties, ...entity.properties }`.
    *   If not exists: Push `entity` to `this.state.entities`.
4.  **Implement `addOrUpdateRelationship` in `MemoryService.ts`:**
    *   Signature: `addOrUpdateRelationship(relationship: Relationship): boolean` (returns true if added/updated, false if rejected).
    *   Check if `this.findEntityByName(relationship.from)` and `this.findEntityByName(relationship.to)` exist.
        *   If either does not exist, `console.warn` and return `false` (do not add/update).
    *   Find existing relationship by `(from, to, type)`: `this.state.relationships.find(r => r.from === relationship.from && r.to === relationship.to && r.type === relationship.type)`.
    *   If exists:
        *   Merge `properties`: `existing.properties = { ...existing.properties, ...relationship.properties }`.
    *   If not exists: Push `relationship` to `this.state.relationships`.
    *   Return `true`.
5.  **Implement `getContextAsString` in `MemoryService.ts`:**
    *   Signature: `getContextAsString(): string`.
    *   Return `JSON.stringify(this.state, null, 2)`. (Simple serialization for now).
6.  **Refine `findEntityByName` and `findRelations` in `MemoryService.ts`:**
    *   Ensure `findRelations` uses `relationship.type` for querying (currently uses `label`).
    *   Consider if any changes are needed for `findEntityByName` (likely remains as is).
7.  **Unit Tests for `MemoryService.ts`:**
    *   Create/Update `tests/MemoryService.test.ts`.
    *   Test `loadMemory`:
        *   File not found (should load default, not throw).
        *   Valid file found (loads correctly).
        *   Corrupted JSON file (throws error).
        *   Other I/O read errors (throws error).
    *   Test `saveMemory`:
        *   Successful save.
        *   I/O write errors (throws error).
    *   Test `addOrUpdateEntity`:
        *   Adding a new entity.
        *   Updating an existing entity (check all fields: description, type, tags merge, properties merge).
    *   Test `addOrUpdateRelationship`:
        *   Adding a new relationship (source/target entities exist).
        *   Updating an existing relationship (properties merge).
        *   Attempting to add a relationship with a non-existent `from` entity (warns, returns false).
        *   Attempting to add a relationship with a non-existent `to` entity (warns, returns false).
    *   Test `getContextAsString`: (verify output format).
    *   Test `findEntityByName` and `findRelations`.

**Phase 2: `AppState` and CLI Integration**

8.  **Update `AppState` in `src/agents/graph.ts`:**
    *   Import `MemoryService` from `../../memory/MemoryService`.
    *   Add `system_context?: MemoryService;` to the `AppState` interface. (Optional to handle cases where it might not be initialized if a flow doesn't use it, though for `analyze` and `build-context` it will be).
    *   Update channel configuration for `system_context` if necessary (e.g., `system_context: { value: null, default: () => new MemoryService() }` or handle its lifecycle explicitly in command handlers). A simple `lastValue` reducer might be fine: `system_context: { value: (x: MemoryService | null, y: MemoryService | null) => y ?? x, default: () => null as MemoryService | null }`. Or, since it's an object instance, just pass it and it updates by reference. `(x, y) => y` might be simplest if it's always set by the command handler. Let's go with: `system_context: { value: (x: MemoryService | null, y: MemoryService | null) => y ?? x, default: () => null as MemoryService | null }` for now to allow it to be updated/passed.
9.  **Modify `src/main.ts`:**
    *   Ensure `commander` is set up to provide `options.memoryFile` (this should already exist).
    *   Define a default context file path: `const DEFAULT_CONTEXT_FILE_PATH = 'context.json';`.
10. **Modify `analyze.ts` (`src/commands/analyze.ts`):**
    *   At the beginning of `runAnalysis`:
        *   Determine context file path: `const contextFilePath = options.memoryFile || DEFAULT_CONTEXT_FILE_PATH;` (using `DEFAULT_CONTEXT_FILE_PATH` from `main.ts` or define locally).
        *   Create `const memoryService = new MemoryService();`.
        *   `await memoryService.loadMemory(contextFilePath);` (wrap in try/catch; if it throws, log error and exit process/return error state).
        *   Modify `initialAppState` to include `system_context: memoryService`.
    *   At the end of `runAnalysis` (after successful graph execution, e.g., in the `finally` block or after await `agentApp.invoke`):
        *   `await memoryService.saveMemory();` (wrap in try/catch; if it throws, log error).
11. **Modify `buildContext.ts` (`src/commands/buildContext.ts`):**
    *   Similar to `analyze.ts`:
        *   At the beginning of `runBuildContext`, determine `contextFilePath`, create `memoryService`, load memory (with try/catch), and add to `initialAppState`.
        *   At the end of `runBuildContext`, save memory (with try/catch).

**Phase 3: Agent Node Integration**

12. **Update `AnalysisPrepareNode.ts` (`src/agents/AnalysisPrepareNode.ts`):**
    *   Access `memoryService` via `state.system_context`.
    *   In `analysisPrepareNode` function (and potentially `returnFinalOutput`):
        *   If `state.system_context` exists:
            *   `const contextString = state.system_context.getContextAsString();`
            *   Prepend/append `contextString` to the prompt being sent to the LLM.
        *   When processing LLM response:
            *   Assume (for now) the LLM output contains structured information for new/updated entities and relationships.
            *   Parse this information.
            *   Call `state.system_context.addOrUpdateEntity(newEntity)` and `state.system_context.addOrUpdateRelationship(newRelationship)` as needed. Handle the boolean return from `addOrUpdateRelationship` if necessary (e.g., log if a relationship was ignored).
13. **Update `ContextBuildingAgentNode.ts` (`src/agents/ContextBuildingAgentNode.ts`):**
    *   Similar to `AnalysisPrepareNode`:
        *   Access `state.system_context`.
        *   Use `getContextAsString()` to augment LLM prompt.
        *   Parse LLM response and call `addOrUpdateEntity`/`addOrUpdateRelationship` on `state.system_context`.
14. **Review Prompts:**
    *   Review existing default prompts for `AnalysisPrepareNode` and `ContextBuildingAgentNode`.
    *   Consider how to instruct the LLM to provide entity and relationship information in a parsable format. This might involve adding specific instructions to the prompts.
        *   Example instruction: "Identify key entities (name, type, description) and their relationships (from_entity, to_entity, type_of_relationship) from the provided text. Format them as JSON lists."
    *   *This step is crucial and might require iteration. For the initial plan, we assume the nodes will handle parsing based on new prompt guidance.*

**Phase 4: Documentation**

15. **Update `README.md`:**
    *   Briefly mention the system context feature and its persistence via `--memory-file` (defaulting to `context.json`).
16. **Update `docs/features/context_updating.md`:**
    *   Ensure the "Plan" section is filled with this checklist.
    *   Potentially add a "Implementation Notes" section later for any deviations or key learnings.
17. **Update `agent_graph.md` and relevant flow diagrams:**
    *   Mention that `AppState` now carries `system_context`.
    *   Illustrate (if applicable) that `analyze` and `build-context` flows now load/save this context.
    *   Note that agent nodes can read from and write to this `system_context`.

**Implementation Checklist:**

1.  [x] Define `Entity`, `Relationship`, `MemoryState`, `DEFAULT_MEMORY_STATE` interfaces/const in `src/memory/memory_types.ts`.
2.  [x] Refactor `MemoryService.ts`: Update imports, state type, constructor, `loadMemory` (ENOENT handling, error throwing), `saveMemory` (error throwing), rename `addRelation` to `addOrUpdateRelationship` and `findRelations` `label` to `type`, rename `addEntity` to `addOrUpdateEntity`.
3.  [x] Implement `addOrUpdateEntity` in `MemoryService.ts` with specified merge/overwrite logic.
4.  [x] Implement `addOrUpdateRelationship` in `MemoryService.ts` with entity existence check, specified merge/overwrite logic, and boolean return.
5.  [x] Implement `getContextAsString` in `MemoryService.ts`.
6.  [x] Refine `findRelations` in `MemoryService.ts` to use `type` instead of `label`.
7.  [x] Create/Update unit tests in `tests/MemoryService.test.ts` covering all new/modified functionalities and error conditions.
8.  [x] Update `AppState` in `src/agents/graph.ts` to include `system_context?: MemoryService;` and its channel configuration.
9.  [x] Modify `src/main.ts` to define `DEFAULT_CONTEXT_FILE_PATH`.
10. [ ] Modify `analyze.ts`: Add `MemoryService` instantiation, `loadMemory` (with try/catch and default path logic), pass to `initialAppState`, and `saveMemory` (with try/catch) on completion.
11. [ ] Modify `buildContext.ts`: Add `MemoryService` instantiation, `loadMemory` (with try/catch and default path logic), pass to `initialAppState`, and `saveMemory` (with try/catch) on completion.
12. [ ] Update `AnalysisPrepareNode.ts`: Access `system_context`, use `getContextAsString()` for LLM prompt, parse LLM response, and call `addOrUpdateEntity`/`addOrUpdateRelationship`.
13. [ ] Update `ContextBuildingAgentNode.ts`: Access `system_context`, use `getContextAsString()` for LLM prompt, parse LLM response, and call `addOrUpdateEntity`/`addOrUpdateRelationship`.
14. [ ] Review and update default prompts for `AnalysisPrepareNode` and `ContextBuildingAgentNode` to guide LLM for structured entity/relationship output.
15. [ ] Update `README.md` with context feature information.
16. [ ] Ensure this plan is in `docs/features/context_updating.md` under "Plan".
17. [ ] Update `docs/agent_graph.md` and flow diagrams regarding `system_context` in `AppState` and flow modifications.