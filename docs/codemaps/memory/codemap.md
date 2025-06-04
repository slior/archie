# Memory Code Map

## Purpose
Manages a persistent knowledge graph containing entities and relationships, providing JSON file-based storage and in-memory operations for querying and modifying the graph structure.

## Files
- [`MemoryService.ts`](./MemoryService.ts): Core service class for managing the knowledge graph with persistence and dependency injection support.
  - [`fromState()`](./MemoryService.ts): Factory method to create MemoryService instances from existing state or defaults.
  - [`loadMemory()`](./MemoryService.ts): Loads memory state from a JSON file, initializing with empty state if file doesn't exist.
  - [`saveMemory()`](./MemoryService.ts): Persists the current memory state to the configured JSON file.
  - [`addOrUpdateEntity()`](./MemoryService.ts): Adds new entities or updates existing ones by name, merging tags and properties.
  - [`addOrUpdateRelationship()`](./MemoryService.ts): Adds or updates relationships with validation that referenced entities exist.
  - [`findEntityByName()`](./MemoryService.ts): Retrieves a specific entity by its unique name identifier.
  - [`findRelations()`](./MemoryService.ts): Queries relationships by optional criteria (from, to, type).
  - [`getContextAsString()`](./MemoryService.ts): Returns the current memory state as a formatted JSON string.
  - [`updateFromState()`](./MemoryService.ts): Updates the internal state from an external MemoryState object.
  - [`getCurrentState()`](./MemoryService.ts): Returns a read-only view of the current memory state.
- [`memory_types.ts`](./memory_types.ts): TypeScript type definitions for the knowledge graph data structures.
  - [`Entity`](./memory_types.ts): Interface defining entities with name, description, type, tags, and properties.
  - [`Relationship`](./memory_types.ts): Interface defining relationships between entities with type and properties.
  - [`MemoryState`](./memory_types.ts): Container interface holding arrays of entities and relationships.
  - [`DEFAULT_MEMORY_STATE`](./memory_types.ts): Constant providing empty default state for initialization.

## Architecture
The memory system follows a service-oriented pattern with clear separation between data structures and operations. MemoryService encapsulates all persistence and manipulation logic while memory_types defines the pure data interfaces. The service uses dependency injection for file operations to enable testing and custom storage backends.

## Interactions
- Integrates with command handlers through state loading/saving lifecycle in `main.ts`
- Provides context to LLM agents via system prompt injection and state sharing through `AppState.system_context`
- Consumed by agent nodes (`AnalysisPrepareNode`, `ContextBuildingAgentNode`) for reading current knowledge and updating with new entities/relationships
- Integrates with LLM response parsing functions in `agentUtils.ts` for automatic knowledge graph updates

## Dependencies
- **External**: `fs/promises` and `path` for JSON file persistence operations
- **Internal**: `../utils` for debugging and user messaging functions (`dbg`, `say`) 