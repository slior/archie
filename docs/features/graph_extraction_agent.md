# Feature Specification

Given the agent graph implemented for Archie, we now need to implement a knowledge graph extraction agent.
This agent needs to receive as input a set of documents (a path to a directory), and create a (set of?) graph documents that can then be converted and saved in the memory.

The created knowledge graph will be added to the context of the agent graph and be used downstream by other agents.
The knowledge graph should then be used by other agents to facilitate their work on the graph.

At a first phase, we will focus only on knowledge graph creation from scratch.

At first we will not create a separate command for this, although this might come later (so the functionality will need to be separate).
We will create this as a separate node that can be embedded into the graph as part of the 'build-context' and 'analyze' flows. 
It should come after the documentRetrievalNode, and before the agent nodes that implement the relevant other functionality (analyze or build-context).
We need to consider also how this affects the interface and functionality of downstream node, although it seems that simply adding the generated graph nodes and relations to the memory should be enough.

## Clarifications

Based on discussions, the following requirements and design decisions have been confirmed:

### LLM Integration Strategy
- The new knowledge graph extraction node will use LangChain's `LLMGraphTransformer` for knowledge graph extraction
- This is in addition to (not replacing) the existing LLM response parsing system in `AnalysisPrepareNode` and `ContextBuildingAgentNode`
- The `LLMGraphTransformer` usage should be restricted to this new node only
- The node will have different LLM response parsing since `LLMGraphTransformer` handles the LLM calls internally

### Flow Integration
- **Node Positioning**: Insert directly between `documentRetrievalNode` and existing agent nodes (`analysisPrepareNode`, `contextBuildingAgentNode`)
- **Flow Coverage**: Execute for both `analyze` and `build_context` flows
- **Document Processing**: Process all document types that `documentRetrievalNode` handles (`.txt`, `.md` files)
- **Sequential Execution**: NOT parallel execution - must complete before downstream nodes

### Memory System Integration
- Update `MemoryService` directly within the node using existing public methods:
  - `addOrUpdateEntity()` for entities
  - `addOrUpdateRelationship()` for relationships
- Serialize updated `MemoryService` to `AppState.system_context` (following pattern from `callLLMForNextStep()`)
- Leverage built-in conflict resolution in `MemoryService` methods
- Downstream nodes rely on knowledge provided through `MemoryService` context

### Data Transformation Requirements
- Map `LLMGraphTransformer` Node objects to Archie `Entity` objects:
  - `Node.id` → `Entity.name`
  - `Node.type` → `Entity.type`
  - `Node.properties` → `Entity.properties`
  - Handle `Entity.description` and `Entity.tags` (likely with defaults)
- Map `LLMGraphTransformer` Relationship objects to Archie `Relationship` objects:
  - `Relationship.source.id` → `Relationship.from`
  - `Relationship.target.id` → `Relationship.to`
  - `Relationship.type` → `Relationship.type`
  - `Relationship.properties` → `Relationship.properties`

### Configuration and Error Handling
- **Entity Types**: No specific entity type configuration for now (may be added later)
- **LLM Failures**: Do NOT fail the entire flow - issue clear console warnings and continue gracefully
- **Empty Results**: Log as warning but treat as normal operation
- **Dependencies**: Will require adding LangChain experimental package for `LLMGraphTransformer`

### Downstream Impact
- Downstream nodes should rely on the knowledge provided by `MemoryService` through their context
- No changes required to existing agent node logic for knowledge graph consumption
- Existing entity/relationship extraction in downstream nodes continues as before

# Plan

## Implementation Approach

Following the simple approach discussed, we will create a `GraphExtractionNode` that:
1. Uses LangChain's `LLMGraphTransformer` for knowledge graph extraction
2. Integrates with Archie's existing LLM configuration system
3. Maps extracted data to Archie's `Entity` and `Relationship` types
4. Updates `MemoryService` using existing public methods
5. Handles errors gracefully without failing the flow

## Dependencies

**New Package Requirements:**
- `@langchain/community` - Contains `LLMGraphTransformer`
- `@langchain/openai` - For ChatOpenAI integration
- `@langchain/core` - Core LangChain types (likely already present)

**Installation Command:**
```bash
npm install @langchain/community @langchain/openai
```

## Implementation Checklist

### Phase 1: Setup and Dependencies
- [x] 1. Install required LangChain packages (`@langchain/community`, `@langchain/openai`)
- [x] 2. Verify package installation and imports work correctly
- [x] 3. Update `package.json` with new dependencies

### Phase 2: Core GraphExtractionNode Implementation
- [x] 4. Create `src/agents/GraphExtractionNode.ts` file
- [x] 5. Import required modules:
  - [x] LangChain types and classes
  - [x] Archie types (`AppState`, `Entity`, `Relationship`) 
  - [x] Archie constants (`DEFAULT_MODEL_NAME`, API key constants)
  - [x] `MemoryService` and related utilities
- [x] 6. Implement `graphExtractionNode` function signature:
  ```typescript
  export async function graphExtractionNode(
    state: AppState,
    config?: RunnableConfig
  ): Promise<Partial<AppState>>
  ```
- [x] 7. Implement LLM configuration using Archie's system:
  - [x] Read API key from `process.env[OPENAI_API_KEY_ENV_VAR]`
  - [x] Use `state.modelName` or fall back to `DEFAULT_MODEL_NAME`
  - [x] Configure optional base URL from `process.env[OPENAI_BASE_URL_ENV_VAR]`
  - [x] Create `ChatOpenAI` instance with Archie's configuration
- [x] 8. Initialize `LLMGraphTransformer` with configured model:
  - [x] Set `allowedNodes: []` (allow all)
  - [x] Set `allowedRelationships: []` (allow all)
  - [x] Set `strictMode: true`
- [x] 9. Implement document conversion logic:
  - [x] Convert `state.inputs` to LangChain `Document` objects
  - [x] Include filename in metadata for traceability
- [x] 10. Implement graph extraction:
  - [x] Call `llmGraphTransformer.convertToGraphDocuments(documents)`
  - [x] Handle empty results gracefully
- [x] 11. Implement data transformation pipeline:
  - [x] Create `normalizeEntityName` helper function
  - [x] Map `GraphDocument.nodes` to Archie `Entity` objects
  - [x] Map `GraphDocument.relationships` to Archie `Relationship` objects
  - [x] Handle missing properties with sensible defaults
- [x] 12. Implement MemoryService integration:
  - [x] Get `MemoryService` from state context
  - [x] Call `memoryService.addOrUpdateEntity()` for each entity
  - [x] Call `memoryService.addOrUpdateRelationship()` for each relationship
  - [x] Serialize updated memory to `state.system_context`
- [x] 13. Implement comprehensive error handling:
  - [x] Try-catch around entire operation
  - [x] Log specific errors with `console.warn`
  - [x] Return unchanged state on failures
  - [x] Never throw exceptions that would break the flow

### Phase 3: Graph Integration
- [x] 14. Update `src/agents/graph.ts`:
  - [x] Import `graphExtractionNode`
  - [x] Add node to graph: `.addNode("graphExtractionNode", graphExtractionNode)`
  - [x] Update flow routing for both `analyze` and `build_context`:
    - [x] `documentRetrievalNode` → `graphExtractionNode` → existing agent nodes
  - [x] Ensure conditional edges route correctly through the new node

### Phase 4: Testing
- [x] 15. Create `tests/GraphExtractionNode.test.ts`:
  - [x] Test successful graph extraction with mock data
  - [x] Test error handling (API failures, empty results)
  - [x] Test data transformation (Node→Entity, Relationship mapping)
  - [x] Test MemoryService integration
  - [x] Test LLM configuration reuse
- [x] 16. Update existing integration tests:
  - [x] Ensure `analyze` flow tests account for new node
  - [x] Ensure `build_context` flow tests account for new node
  - [x] Mock `LLMGraphTransformer` in integration tests if needed

### Phase 5: Documentation Updates
- [x] 17. Update `docs/agent_graph.md`:
  - [x] Add `GraphExtractionNode` to nodes list
  - [x] Update flow diagrams to show new node positioning
  - [x] Document node's inputs, outputs, and error handling
- [x] 18. Update `docs/analyze_flow.md`:
  - [x] Update sequence diagram to include graph extraction step
  - [x] Document how extracted knowledge affects analysis
- [x] 19. Update `docs/build_context_flow.md`:
  - [x] Update sequence diagram to include graph extraction step
  - [x] Document how extracted knowledge affects context building
- [x] 20. Update `README.md`:
  - [x] Add note about new graph extraction capabilities
  - [x] Update dependencies section with new packages
- [x] 21. Update `llms.txt`:
  - [x] Add reference to graph extraction feature documentation

### Phase 6: Final Validation
- [ ] 22. Manual testing with real documents:
  - [ ] Test with various document types (.txt, .md)
  - [ ] Verify entities and relationships are extracted and stored
  - [ ] Confirm downstream agents have access to extracted knowledge
  - [ ] Test error scenarios (network issues, invalid API keys)
- [ ] 23. Performance testing:
  - [ ] Measure impact on overall flow execution time
  - [ ] Test with larger document sets
  - [ ] Verify memory usage is reasonable
- [ ] 24. Code review and cleanup:
  - [ ] Ensure code follows Archie's patterns and conventions
  - [ ] Add comprehensive JSDoc comments
  - [ ] Verify all imports are properly organized
  - [ ] Run linter and fix any issues

## Data Mapping Specification

### Node to Entity Mapping
```typescript
// LLMGraphTransformer Node → Archie Entity
{
  name: normalizeEntityName(node.id),           // Normalized node ID
  type: node.type || 'concept',                 // Node type or default
  description: node.properties?.description || '', // From properties or empty
  properties: node.properties || {},            // All properties
  tags: []                                      // Empty for now (future enhancement)
}
```

### Relationship Mapping
```typescript
// LLMGraphTransformer Relationship → Archie Relationship  
{
  from: normalizeEntityName(relationship.source.id),  // Normalized source
  to: normalizeEntityName(relationship.target.id),    // Normalized target
  type: relationship.type,                             // Relationship type
  properties: relationship.properties || {}           // All properties
}
```

### Normalization Strategy
```typescript
const normalizeEntityName = (name: string): string => 
  name.toLowerCase().trim();
```

## Error Handling Strategy

1. **API Failures**: Log warning, continue with empty extraction
2. **Configuration Issues**: Log error, skip extraction
3. **Data Transformation Errors**: Log warning, skip problematic items
4. **Memory Service Errors**: Log error, continue (conflicts handled by MemoryService)
5. **Network Issues**: Log warning, continue with timeout/retry logic

## Integration Points

- **Input**: `state.inputs` from `DocumentRetrievalNode`
- **Configuration**: `state.modelName` from CLI options
- **Memory**: `MemoryService` from graph configuration
- **Output**: Updated `state.system_context` with serialized memory
- **Flow**: Integrates between document retrieval and agent processing

# Implementation Checklist