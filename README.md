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

## Customizing Agent Prompts

Archie allows you to customize the prompts used by its AI agents. This enables fine-tuning agent behavior, language, and task focus without modifying the core code.

### Command-Line Argument for Prompts Configuration

To use custom prompts, you provide a JSON configuration file via the `--prompts-config` global option:

```bash
node dist/main.js --prompts-config ./my_prompts_config.json analyze --query "..." --inputs ./src
# or using ts-node
npm run start -- --prompts-config ./my_prompts_config.json ask "..."
```

### Prompts Configuration File

*   **Location:** You can place your prompt configuration JSON file anywhere accessible by the application. The path to this file is given via the `--prompts-config` argument.
*   **Syntax:** The file must be in JSON format.
*   **Structure:** The configuration file groups prompts by the agent that uses them, and then by a specific prompt key (identifier) for that agent.

    ```json
    {
        "prompts": {
            "AgentName1": {
                "promptKey1_1": {
                    "inputs": ["context_var1", "context_var2"],
                    "path": "path/to/your/custom_prompt1_1.txt"
                },
                "promptKey1_2": {
                    "inputs": [],
                    "path": "/absolute/path/to/custom_prompt1_2.txt"
                }
            },
            "AgentName2": {
                "promptKey2_1": {
                    "inputs": ["some_other_var"],
                    "path": "../relative/path/from/config/file/custom_prompt2_1.txt"
                }
            }
        }
    }
    ```
    *   `"prompts"`: The root object.
    *   `"AgentName1"`, `"AgentName2"`: Keys representing the agent using the prompts (e.g., `"AnalysisPrepareNode"`).
    *   `"promptKey1_1"`, etc.: Keys identifying a specific prompt for that agent (e.g., `"initial"`, `"final"`, `"followup"` for `AnalysisPrepareNode`).
    *   `"inputs"`: An array of strings. These are the names of the context variables (placeholders) that your custom prompt text expects. This is primarily for documentation and to help you design your prompts.
    *   `"path"`: The file path to your custom prompt text file.

### Custom Prompt File Format and Location

*   **Format:** Custom prompt files should be plain text (`.txt`).
*   **Placeholders:** Inside your prompt text, you can use placeholders with double curly braces, like `{{placeholder_name}}`. These will be replaced with actual values from the application state at runtime.
    *   For example, a prompt for `AnalysisPrepareNode` with key `initial` might use `{{fileSummaries}}` and `{{firstUserMessage}}`.
*   **Location:** You can store your custom `.txt` prompt files anywhere on your filesystem that the Archie application can read.
*   **Path Configuration:** The `"path"` value in your JSON configuration:
    *   Can be an **absolute path** (e.g., `"/opt/archie_prompts/my_custom_initial.txt"`).
    *   Can be a **relative path** (e.g., `"./my_prompts/initial.txt"` or `"../common_prompts/shared_intro.txt"`). Relative paths are resolved from the directory where your JSON prompt configuration file is located.

### Fallback Behavior

*   **No Config File:** If you do not provide the `--prompts-config` argument, Archie will use its default, built-in prompts for all agents and operations.
*   **Partial Configuration:** If you provide a configuration file but do not specify an override for every possible agent or prompt key, Archie will:
    *   Use your custom prompt if an entry for a specific `AgentName` and `promptKey` is found in your configuration.
    *   Fall back to the default built-in prompt if the specific `AgentName` or `promptKey` is not found in your configuration.
*   **Default Prompt Locations:** The default prompts are located within the project structure, typically under `src/agents/prompts/<AgentName>/<promptKey>.txt` (e.g., `src/agents/prompts/AnalysisPrepareNode/initial.txt`).
