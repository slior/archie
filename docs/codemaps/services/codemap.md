# Services Code Map

## Purpose
Provides configurable prompt management services for LLM agents, enabling dynamic loading of custom prompts or fallback to default prompts with template parameter replacement.

## Files
- [`PromptService.ts`](../../../src/services/PromptService.ts): Core service class for managing and formatting prompt templates with configurable sources and dependency injection.
  - [`constructor()`](../../../src/services/PromptService.ts): Initializes the service with optional custom prompt configuration file path and injectable dependencies.
  - [`getFormattedPrompt()`](../../../src/services/PromptService.ts): Retrieves and formats prompts by agent name and key, applying template parameter substitution.
  - [`_ensureConfigLoaded()`](../../../src/services/PromptService.ts): Lazy-loads prompt configuration from JSON file when custom configuration is specified.
  - [`_readFile()`](../../../src/services/PromptService.ts): Internal file reading wrapper using injected dependencies for testability.
  - [`_resolvePath()`](../../../src/services/PromptService.ts): Resolves prompt file paths relative to configuration directory or project root.
- [`promptTypes.ts`](../../../src/services/promptTypes.ts): TypeScript type definitions for prompt configuration structures.
  - [`PromptConfigEntry`](../../../src/services/promptTypes.ts): Interface defining individual prompt configuration with inputs and file path.
  - [`AgentPromptsConfig`](../../../src/services/promptTypes.ts): Type alias for mapping prompt keys to configuration entries for a single agent.
  - [`FullPromptsConfig`](../../../src/services/promptTypes.ts): Interface for complete prompt configuration containing all agents' prompt mappings.

## Architecture
The service follows a configurable template pattern with fallback strategy - attempts to load custom prompts from configuration first, then falls back to default prompts in standard locations. Uses dependency injection for file system operations to enable comprehensive testing and alternative storage backends.

## Interactions
- Integrated into LangGraph agent configuration through `createConfigWithPromptService()` utility function
- Consumed by agent nodes (`AnalysisPrepareNode`, `ContextBuildingAgentNode`) for retrieving formatted prompts with context injection
- Configuration loaded from JSON files specified via CLI `--prompts-config` option or default prompt files in `src/agents/prompts/` directories
- Template parameters replaced using `{{key}}` placeholder syntax with context objects

## Dependencies
- **External**: `fs/promises` and `path` for file system operations and path resolution
- **Internal**: None - operates as a standalone service with optional configuration 