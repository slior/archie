# Archie - AI Architecture Assistant

Archie is a system of AI agents designed to assist with software architecture analysis and design tasks. This initial version provides a basic command-line interface (CLI) shell and a simple echo agent functionality.

## Prerequisites

*   Node.js (v18 or later recommended)
*   npm (usually comes with Node.js)

## Installation

1.  Clone the repository (or ensure you are in the project directory).
2.  Install dependencies:
    ```bash
    npm install
    ```

## Configuration

Archie uses environment variables for configuration, primarily for LLM API keys and provider selection.

1.  Create a `.env` file in the project root if it doesn't exist:
    ```bash
    touch .env
    ```
2.  Add necessary environment variables to the `.env` file. Key variables include:
    
    *   `LLM_PROVIDER`: (Optional) Specifies the LLM provider to use. 
        *   Set to `litellm` to use the LiteLLM provider.
        *   Set to `openai` or leave unset to use the default OpenAI provider.
    *   `OPENAI_API_KEY`: **Required** if using the `openai` provider (or if `LLM_PROVIDER` is unset). Your OpenAI API key.
    *   `LITELLM_API_KEY`: **Required** if using the `litellm` provider. This key is typically used for authenticating with a LiteLLM proxy service.
        *   **Note:** If `LLM_PROVIDER=litellm` and `LITELLM_API_KEY` is *not* set, the underlying `litellm` library might still attempt to use provider-specific keys (like `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) if they are present in the environment, depending on the model requested. However, the primary intended configuration for the `litellm` provider in Archie is via `LITELLM_API_KEY` for proxy usage.

    Example `.env` file contents:

    ```dotenv
    # Example 1: Using default OpenAI provider
    LLM_PROVIDER=openai
    OPENAI_API_KEY=sk-...

    # Example 2: Using LiteLLM provider (likely via a proxy)
    # LLM_PROVIDER=litellm
    # LITELLM_API_KEY=your-litellm-proxy-key
    # OPENAI_API_KEY=sk-...  # May still be needed by LiteLLM if calling OpenAI models
    ```

## Building

To compile the TypeScript code to JavaScript (output to the `dist` directory):

```bash
npm run build
```

## Running

You can run the compiled application directly using Node.js:

```bash
# Run the analyze command
node dist/main.js analyze --query "Suggest improvements for this code" --inputs ./src/my_code_dir

# Run the ask command
node dist/main.js ask "What are the dependencies of module A?"

# Specify a custom memory file and model
node dist/main.js --memory-file /path/to/memory.json --model gpt-4-turbo analyze -q "Refactor this" -i ./src
```

Alternatively, use `ts-node` via npm scripts for development (compiles and runs on the fly):

```bash
# Analyze command using ts-node
npm run start -- analyze --query "Summarize these requirements" --inputs ./docs/requirements

# Ask command using ts-node
npm run start -- ask "Explain the purpose of the MemoryService"

# Specify global options with ts-node (note the extra '--' before command args)
npm run start -- --memory-file ./custom_mem.json analyze -q "Identify risks" -i ./specs
```

*   If the specified memory file does not exist, it will be created with an empty state.
*   If the `--memory-file` option is omitted, it defaults to using `./memory.json` in the project root.
*   If the `--model` option is omitted, it defaults to the model specified in `src/agents/LLMUtils.ts`.

## Basic Usage

Archie provides two main commands:

### `analyze`

Initiates a potentially multi-turn analysis conversation. You provide an initial query and a directory containing context files (`.txt`, `.md`). The agent will read the files and may ask clarifying questions before providing a final analysis.

```bash
# Example: Analyze code in ./src for potential refactoring
node dist/main.js analyze --query "Identify areas for refactoring in this code" --inputs ./src

# Example: Analyze design documents
node dist/main.js analyze -q "Summarize the key decisions in these design docs" -i ./docs/design
```

The analysis result is typically saved to `analysis_result.md` within the specified inputs directory.

### `ask`

For single-turn questions or commands directed at the agent.

```bash
# Example: Ask a direct question
node dist/main.js ask "What is the role of the AgentGraph?"

# Example: Request information based on loaded memory (if applicable)
node dist/main.js ask "List all known components"
```

The response is printed directly to the console.

### Global Options

*   `--memory-file <path>`: Specify the path to the JSON file used for persistent memory (defaults to `./memory.json`).
*   `--model <name>`: Specify the underlying LLM to use (e.g., `gpt-4`, `gpt-3.5-turbo`).

## Memory File (`memory.json`)

The application can load and save state (like conversation history or derived knowledge) to a JSON file. The exact structure depends on the agents and checkpointers used. By default, it uses `./memory.json`.

## Developer Documentation

For a deeper understanding of the internal workings, refer to the following documents:

*   [`docs/main_shell_flow.md`](docs/main_shell_flow.md): Describes the overall command-line execution flow, from parsing arguments with `commander` to command dispatch and memory handling.
*   [`docs/analyze_flow.md`](docs/analyze_flow.md): Details the step-by-step execution of the `analyze` command, including file reading, the conversational loop, LangGraph interrupts (Human-in-the-Loop), state management, and final output generation.
*   [`docs/agent_graph.md`](docs/agent_graph.md): Explains the structure, state, nodes, and conditional logic of the LangGraph agent graph used by the commands.
