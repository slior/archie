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
    
    *   `OPENAI_API_KEY`: **Required**. Your OpenAI API key. This key is used to authenticate requests to the OpenAI API. The expected variable name is `OPENAI_API_KEY`.
    *   `BASE_URL`: (Optional) Specifies a custom base URL for the OpenAI API. This is useful if you are using a proxy or a self-hosted instance of an OpenAI-compatible API. If not set, the official OpenAI API URL will be used. The expected variable name is `BASE_URL`.

    Example `.env` file contents:

    ```dotenv
    # Example: Using OpenAI provider
    OPENAI_API_KEY=sk-...
    # BASE_URL=https://your-proxy-url/v1 # Optional: if using a proxy for OpenAI
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
