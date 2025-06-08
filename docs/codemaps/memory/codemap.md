# Memory Code Map

## Purpose
Manages a persistent knowledge graph containing entities and relationships, providing JSON file-based storage and in-memory operations for querying and modifying the graph structure.

## Files
- [`MemoryService.ts`](../../../src/memory/MemoryService.ts): Core service class for managing the knowledge graph with persistence and dependency injection support.
  - [`fromState()`](../../../src/memory/MemoryService.ts): Factory method to create MemoryService instances from existing state or defaults.
  - [`loadMemory()`](../../../src/memory/MemoryService.ts): Loads memory state from a JSON file, initializing with empty state if file doesn't exist.
  - [`saveMemory()`](../../../src/memory/MemoryService.ts): Persists the current memory state to the configured JSON file.
  - [`addOrUpdateEntity()`](../../../src/memory/MemoryService.ts): Adds new entities or updates existing ones by name, merging tags and properties.
  - [`addOrUpdateRelationship()`](../../../src/memory/MemoryService.ts): Adds or updates relationships with validation that referenced entities exist.
  - [`findEntityByName()`](../../../src/memory/MemoryService.ts): Retrieves a specific entity by its unique name identifier.
  - [`findRelations()`](../../../src/memory/MemoryService.ts): Queries relationships by optional criteria (from, to, type).
  - [`getContextAsString()`](../../../src/memory/MemoryService.ts): Returns the current memory state as a formatted JSON string.
  - [`updateFromState()`](../../../src/memory/MemoryService.ts): Updates the internal state from an external MemoryState object.
  - [`getCurrentState()`](../../../src/memory/MemoryService.ts): Returns a read-only view of the current memory state.
- [`memory_types.ts`](../../../src/memory/memory_types.ts): TypeScript type definitions for the knowledge graph data structures.
  - [`Entity`](../../../src/memory/memory_types.ts): Interface defining entities with name, description, type, tags, and properties.
  - [`Relationship`](../../../src/memory/memory_types.ts): Interface defining relationships between entities with type and properties.
  - [`MemoryState`](../../../src/memory/memory_types.ts): Container interface holding arrays of entities and relationships.
  - [`DEFAULT_MEMORY_STATE`](../../../src/memory/memory_types.ts): Constant providing empty default state for initialization.

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