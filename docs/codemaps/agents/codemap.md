# Agents Code Map

## Purpose
Implements the LangGraph-based agent system with individual nodes for analysis, context building, and document processing, including LLM integration, response parsing, and knowledge graph management.

## Files
- [`graph.ts`](../../../src/agents/graph.ts): Defines the main LangGraph StateGraph structure with routing logic and AppState interface.
  - [`AppState`](../../../src/agents/graph.ts): Central interface defining all state fields that flow between agent nodes.
  - [`createWorkflow()`](../../../src/agents/graph.ts): Factory function that creates the StateGraph with conditional routing between nodes.
  - [`safeAppConfig()`](../../../src/agents/graph.ts): Type-safe configuration wrapper for LangGraph execution.
- [`AnalysisPrepareNode.ts`](../../../src/agents/AnalysisPrepareNode.ts): Main analysis agent node implementing multi-turn conversations with memory integration.
  - [`analysisPrepareNode()`](../../../src/agents/AnalysisPrepareNode.ts): Core node function that handles analysis preparation and LLM interactions.
  - [`callLLMForNextStep()`](../../../src/agents/AnalysisPrepareNode.ts): Manages LLM calls with context preparation and response processing.
  - [`returnFinalOutput()`](../../../src/agents/AnalysisPrepareNode.ts): Generates final analysis output and handles conversation completion.
  - [`prepareContextByType()`](../../../src/agents/AnalysisPrepareNode.ts): Prepares different context types for initial, followup, and final prompts.
- [`ContextBuildingAgentNode.ts`](../../../src/agents/ContextBuildingAgentNode.ts): Agent node for generating system context summaries from input documents.
  - [`contextBuildingAgentNode()`](../../../src/agents/ContextBuildingAgentNode.ts): Main node function that processes inputs and generates contextual documentation.
- [`DocumentRetrievalNode.ts`](../../../src/agents/DocumentRetrievalNode.ts): Utility node for reading and loading files from input directories.
  - [`documentRetrievalNode()`](../../../src/agents/DocumentRetrievalNode.ts): Reads .txt and .md files from specified directories into the AppState.
- [`GraphExtractionNode.ts`](../../../src/agents/GraphExtractionNode.ts): Knowledge graph extraction agent that processes document content to extract entities and relationships using LangChain's LLMGraphTransformer.
  - [`graphExtractionNode()`](../../../src/agents/GraphExtractionNode.ts): Main node function that converts documents to knowledge graphs and updates system memory.
  - [`normalizeEntityName()`](../../../src/agents/GraphExtractionNode.ts): Helper function that normalizes entity names for consistent storage.
- [`AnalysisInterruptNode.ts`](../../../src/agents/AnalysisInterruptNode.ts): Handles interruption and resumption during multi-turn analysis conversations.
  - [`analysisInterruptNode()`](../../../src/agents/AnalysisInterruptNode.ts): Manages analysis interrupts and prepares for user input collection.
- [`EchoAgentNode.ts`](../../../src/agents/EchoAgentNode.ts): Simple test node that echoes user input for basic graph validation.
  - [`echoAgentNode()`](../../../src/agents/EchoAgentNode.ts): Returns the user input as the agent response for testing purposes.
- [`LLMUtils.ts`](../../../src/agents/LLMUtils.ts): Core utilities for LLM provider integration and conversation management.
  - [`callTheLLM()`](../../../src/agents/LLMUtils.ts): Main function for calling LLM providers with conversation history and system prompts.
  - [`getLLMClient()`](../../../src/agents/LLMUtils.ts): Factory function that provides singleton access to configured LLM client instances.
- [`OpenAIClient.ts`](../../../src/agents/OpenAIClient.ts): Concrete implementation of ILLMClient for OpenAI API integration.
  - [`chatCompletion()`](../../../src/agents/OpenAIClient.ts): Implements the OpenAI Chat Completions API call with error handling.
- [`ILLMClient.ts`](../../../src/agents/ILLMClient.ts): Interface defining the contract for LLM provider implementations.
  - [`ILLMClient`](../../../src/agents/ILLMClient.ts): Interface with chatCompletion method for provider abstraction.
  - [`ChatMessage`](../../../src/agents/ILLMClient.ts): Type definition for conversation messages with role and content.
- [`agentUtils.ts`](../../../src/agents/agentUtils.ts): Comprehensive utilities for LLM response processing and memory management.
  - [`parseLLMResponse()`](../../../src/agents/agentUtils.ts): Parses structured LLM responses with agent and system sections.
  - [`processLLMResponse()`](../../../src/agents/agentUtils.ts): Orchestrates warning logging and memory updates from parsed responses.
  - [`updateMemoryWithSystemContext()`](../../../src/agents/agentUtils.ts): Updates MemoryService with entities and relationships from LLM responses.
  - [`buildSystemPrompt()`](../../../src/agents/agentUtils.ts): Constructs system prompts with current memory context for LLM calls.
  - [`summarizeFiles()`](../../../src/agents/agentUtils.ts): Formats file contents into summarized text for LLM context.
- [`llmConstants.ts`](../../../src/agents/llmConstants.ts): Environment variable names and default values for LLM configuration.
  - [`OPENAI_API_KEY_ENV_VAR`](../../../src/agents/llmConstants.ts): Environment variable name for OpenAI API key.
  - [`DEFAULT_MODEL_NAME`](../../../src/agents/llmConstants.ts): Default LLM model identifier.

## Architecture
The system implements a LangGraph-based conversational AI architecture with conditional routing between specialized nodes. Each node handles specific responsibilities (document retrieval, knowledge graph extraction, analysis, context building) while sharing state through the AppState interface. The architecture supports multiple flows (analyze, build_context) with configurable LLM providers and comprehensive memory management through knowledge graph integration.

## Interactions
- Integrates with command handlers through AppState initialization and final state return
- Communicates with MemoryService for knowledge graph persistence and system context injection
- Uses PromptService for configurable prompt management across different agent types
- Interfaces with external LLM providers (OpenAI) through the ILLMClient abstraction
- Coordinates with file system operations for document retrieval and context building
- Supports interruption/resumption patterns for human-in-the-loop workflows
- Processes documents through LLMGraphTransformer for automatic knowledge graph extraction

## Dependencies
- **External**: `@langchain/langgraph` for StateGraph implementation, `@langchain/core/runnables` for LangGraph types, `@langchain/community` for LLMGraphTransformer, `@langchain/openai` for LLM integration, `dotenv` for environment configuration, `fs/promises` and `path` for file operations
- **Internal**: `../utils` for debugging and configuration utilities, `../memory/MemoryService` and `../memory/memory_types` for knowledge graph management 