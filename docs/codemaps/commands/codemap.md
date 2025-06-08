# Commands Code Map

## Purpose
Contains command implementations for Archie's CLI interface, providing analysis, context building, and AI assistant functionality through direct command execution.

## Files
- [`analyze.ts`](../../../src/commands/analyze.ts): Implements the analyze command for conducting multi-turn AI-powered analysis of software systems.
  - [`runAnalysis()`](../../../src/commands/analyze.ts): Main entry point that coordinates the analysis workflow with user interactions.
  - [`analysisIteration()`](../../../src/commands/analyze.ts): Handles single iterations of the analysis loop, managing agent interruptions and user input.
  - [`runGraph()`](../../../src/commands/analyze.ts): Executes the LangGraph agent with proper configuration and error handling.
  - [`getFinalOutput()`](../../../src/commands/analyze.ts): Retrieves the final analysis output from the agent graph state.
  - [`displayFinalOutputToUser()`](../../../src/commands/analyze.ts): Formats and displays analysis results to the user.
  - [`persistFinalOutput()`](../../../src/commands/analyze.ts): Saves analysis results to a markdown file in the target directory.
- [`buildContext.ts`](../../../src/commands/buildContext.ts): Implements the build-context command for generating system context summaries from input documents.
  - [`runBuildContext()`](../../../src/commands/buildContext.ts): Main function that processes input documents and generates contextual summaries for software systems.
- [`ask.ts`](../../../src/commands/ask.ts): Implements the ask command for single-turn AI interactions.
  - [`runAsk()`](../../../src/commands/ask.ts): Handles direct user questions by invoking the agent graph for immediate responses.

## Architecture
All commands follow a consistent dependency injection pattern for testability, accepting core services (MemoryService, PromptService) and injected functions as parameters. Commands integrate with the LangGraph agent system through the shared `app` instance and utilize the AppState structure for state management.

## Interactions
- Communicates with the LangGraph agent system via `../agents/graph` for AI processing
- Uses `MemoryService` from `../memory/MemoryService` for state persistence
- Leverages `PromptService` from `../services/PromptService` for configurable prompt management
- Integrates with utility functions from `../utils` for configuration, debugging, and output persistence
- Depends on `inquirer` for interactive user prompts during analysis iterations

## Dependencies
- **External**: `@langchain/langgraph` for agent graph execution, `inquirer` for user interaction prompts, `fs/promises` and `path` for file operations
- **Internal**: `../agents/graph` (agent system), `../memory/MemoryService` (state persistence), `../services/PromptService` (prompt management), `../utils` (shared utilities), `../config` (configuration constants) 