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

Archie uses environment variables for configuration, primarily for LLM API keys (though LLM integration is not part of this initial setup).

1.  Create a `.env` file in the project root:
    ```bash
    touch .env
    ```
2.  Add necessary environment variables to the `.env` file. For example:
    ```dotenv
    # Example for OpenAI (add your actual key)
    # OPENAI_API_KEY=sk-...
    ```
    *(Note: Environment variable handling is set up, but no agent currently uses them.)*

## Building

To compile the TypeScript code to JavaScript (output to the `dist` directory):

```bash
npm run build
```

## Running

To run the application using `ts-node` (which compiles and runs on the fly):

```bash
npm run start
```

You can also specify a different path for the memory state file using the `--memory-file` option:

```bash
npm run start -- --memory-file /path/to/your/memory.json
```

*   If the specified memory file does not exist, it will be created with an empty state (`{ "entities": [], "relations": [] }`).
*   If the option is omitted, it defaults to using `./memory.json` in the project root.

## Basic Usage

Once running, you will see the `archie>` prompt.

*   Type any text and press Enter. The echo agent will respond with `Echo: [your text]`.
*   Type `exit` to save the current memory state (if any changes were made conceptually) and quit the application.

## Memory File (`memory.json`)

The application maintains its understanding of system components, relationships, etc., in a JSON file (defaulting to `memory.json`).

The structure is:

```json
{
  "entities": [
    {
      "name": "unique_entity_id",
      "label": "Optional Human Label",
      "entityType": "component | requirement | etc.",
      "observations": [
        "Fact 1 about this entity",
        "Fact 2"
      ]
    }
  ],
  "relations": [
    {
      "from": "source_entity_id",
      "to": "target_entity_id",
      "label": "relationship_type (e.g., depends_on)",
      "observations": [
        "Fact about this relationship"
      ]
    }
  ]
}
```

Currently, the application only loads and saves this file. No commands modify it yet. 