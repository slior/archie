import inquirer from 'inquirer';
import { MemoryService } from '../memory/MemoryService';
import { app as agentApp, AppState } from '../agents/graph';
import { handleAnalyzeCommand } from './AnalyzeCommand';
import * as uuid from 'uuid';
import { Command } from '@langchain/langgraph';

const EXIT_COMMAND = 'exit';
const ANALYZE_COMMAND = 'analyze';

export type Input = Partial<AppState> | Command;

/**
 * Creates a new configuration object for the agent graph with a unique thread ID.
 * 
 * This function generates a new UUID v4 thread ID and returns it wrapped in a 
 * configuration object structure expected by the LangGraph framework. The thread ID
 * is used to maintain conversation state and history across multiple graph executions.
 * 
 * @returns {Object} Configuration object with format { configurable: { thread_id: string } }
 */
export function newGraphConfig()
{
    const thread_id = uuid.v4();
    return { configurable: { thread_id } };
}


/**
 * Handles commands that don't match any special keywords by passing them directly to the agent graph.
 * 
 * This function creates an initial state with the command as user input and empty fields for other
 * state properties, then invokes the agent graph for a single-turn response.
 * it makes one call and returns the response.
 * 
 * @param commandInput - The raw command string entered by the user
 * @throws Error if the agent graph fails to execute or is not available
 */
async function handleDefaultCommand(commandInput: string) {
    if (!agentApp) {
        dbg("Error: Agent graph is not compiled or available.");
        return;
    }
    try {
        dbg(`Invoking agent graph with input: "${commandInput}"`);
        // Define the initial state for this invocation, including defaults for new fields
        const initialState: Input = {
            userInput: commandInput,
            response: "", // Start with an empty response
            fileContents: {},
            analysisHistory: [],
            analysisOutput: "",
            currentAnalysisQuery: "",
        };
        const config = newGraphConfig();
        // Invoke the graph - Cast needed as invoke expects full state usually
        const result = await agentApp.invoke(initialState, config);
        say(`Agent Response: ${result.response}`); // Display the final response from the graph state
    } catch (error) {
        dbg(`Error during default graph execution: ${error}`);
        throw error;
    }
}

/**
 * Prompts the user for command input in the interactive shell.
 * 
 * Uses inquirer to display a prompt with "archie> " and collect user input.
 * Trims whitespace from the input before returning.
 * 
 * @returns Promise that resolves to the trimmed command string entered by user
 */
export async function getCommandInput() : Promise<string>
{
    const answers = await inquirer.prompt([
        { type: 'input', name: 'command', message: 'archie> ' }
    ]);
    return answers.command.trim();
}

/**
 * Parses a command line input string into a command and arguments.
 * 
 * Handles quoted arguments by preserving spaces within quotes and removing the quotes.
 * For example: `analyze --query "my query" --file test.ts` becomes:
 * - command: "analyze"
 * - args: ["--query", "my query", "--file", "test.ts"]
 * 
 * @param commandInput - The raw command line input string to parse
 * @returns An object containing:
 *   - command: The first word of input, converted to lowercase
 *   - args: Array of remaining arguments, with quotes stripped from quoted arguments
 */
export function parseCommand(commandInput: string) : {command: string, args: string[]}
{
    const parts = commandInput.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const command = parts[0]?.toLowerCase() || '';
    const args = parts.slice(1).map((arg: string) => 
        (arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'")) 
        ? arg.slice(1, -1) 
        : arg
    );
    return { command, args };
}



/**
 * Starts an interactive command-line shell for interacting with the agent system.
 * 
 * The shell provides a REPL (Read-Eval-Print Loop) interface that accepts the following commands:
 * - 'exit': Saves the memory state and exits the shell
 * - 'analyze --query "..." --file <path>': Runs analysis on specified files with the given query
 * - Any other input is treated as a message for the default agent handler
 * 
 * @param memoryService - Service for persisting agent memory state between sessions
 * @returns Promise that resolves when the shell is exited
 */
export async function startShell(memoryService: MemoryService) {
  console.log('Starting interactive shell. Type "exit" to quit.');
  console.log('Available commands: exit, analyze --query "...\" --file <path> ..., or provide input for default agent.');

  let shellRunning = true;
  while (shellRunning) {
    
    const commandInput = await getCommandInput();
    const { command, args } = parseCommand(commandInput);

    switch (command)    
    {
        case EXIT_COMMAND:
            say('Saving memory before exiting...');
            await memoryService.saveMemory();
            say('Exiting Archie...');
            shellRunning = false;
            break;
        case ANALYZE_COMMAND:
            await handleAnalyzeCommand(args);
            break;
        default:
            // Treat the entire input as input for the default command handler
            await handleDefaultCommand(commandInput);
            break;
    }
  }
}


export function dbg(s: string) {
    console.debug(s);
}

export function say(s : string) {
    console.log(s);
}