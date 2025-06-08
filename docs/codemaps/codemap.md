# Source Code Map

## Purpose
Implements Archie, an AI-powered architecture assistant providing CLI-based analysis, context building, and consultation capabilities through LangGraph conversational flows with persistent knowledge graph memory.

## Files
- [`main.ts`](../../src/main.ts): Application entry point providing CLI interface with global configuration and memory management orchestration.
  - [`withMemoryManagement()`](../../src/main.ts): Template method that ensures memory loading before command execution and saving after completion.
  - [`main()`](../../src/main.ts): Sets up Commander.js CLI with global options and command definitions for analyze, build-context, and ask operations.
- [`utils.ts`](../../src/utils.ts): Shared utilities for debugging, configuration, and cross-cutting concerns used throughout the application.
  - [`dbg()`](../../src/utils.ts): Debug logging function for development and troubleshooting.
  - [`say()`](../../src/utils.ts): User-facing console output function for messages.
  - [`newGraphConfig()`](../../src/utils.ts): Creates new LangGraph configuration objects with unique thread IDs.
  - [`persistOutput()`](../../src/utils.ts): Generic file persistence utility with dependency injection for testability.
  - [`createConfigWithPromptService()`](../../src/utils.ts): Embeds PromptService instances into LangGraph configuration objects.
- [`config.ts`](../../src/config.ts): Application configuration constants and default values.
  - [`DEFAULT_CONTEXT_FILE_PATH`](../../src/config.ts): Default file path for JSON-based memory persistence.

## Child Components
- [commands](./commands/codemap.md): Contains command implementations for Archie's CLI interface, providing analysis, context building, and AI assistant functionality through direct command execution.
- [agents](./agents/codemap.md): Implements the LangGraph-based agent system with individual nodes for analysis, context building, and document processing, including LLM integration and knowledge graph management.
- [memory](./memory/codemap.md): Manages a persistent knowledge graph containing entities and relationships, providing JSON file-based storage and in-memory operations for querying and modifying the graph structure.
- [services](./services/codemap.md): Provides configurable prompt management services for LLM agents, enabling dynamic loading of custom prompts or fallback to default prompts with template parameter replacement.

## Architecture
The application follows a layered architecture with clear separation of concerns: CLI commands orchestrate user interactions, agents implement the core AI workflows using LangGraph state machines, memory services provide persistent knowledge management, and prompt services enable configurable LLM interactions. The main entry point (`main.ts`) provides CLI parsing with global configuration options and a template method pattern for memory management that ensures consistent loading and saving of knowledge state across all commands.

## Cross-Cutting Concerns
- **Memory Management**: Implemented through a template method pattern in `main.ts` that automatically loads memory before command execution and saves updated knowledge after completion
- **Configuration**: Global options for model selection, memory file paths, and prompt configuration files are handled centrally and propagated to all components
- **Shared Utilities**: Common debugging, logging, and file persistence functions provided through `utils.ts` enable consistent behavior across all modules
- **Error Handling**: Standardized error codes and exception handling patterns ensure robust command execution and proper exit status reporting 