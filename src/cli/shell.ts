import inquirer from 'inquirer';
import { MemoryService } from '../memory/MemoryService';
import { app as agentApp, AppState } from '../agents/graph';
import { handleAnalyzeCommand } from './AnalyzeCommand';
// Imports needed for Analysis Agent command
// import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { Command } from '@langchain/langgraph';
// import * as path from 'path'; // Import path for resolving file paths

const EXIT_COMMAND = 'exit';
const ANALYZE_COMMAND = 'analyze';

export type Input = Partial<AppState> | Command;

export function newGraphConfig()
{
    const thread_id = uuidv4(); 
    return { configurable: { thread_id } };
}

// --- Helper Function: Default Command Handler ---
async function handleDefaultCommand(commandInput: string) {
    if (!agentApp) {
        console.log("Error: Agent graph is not compiled or available.");
        return;
    }
    try {
        console.log(`Invoking agent graph with input: "${commandInput}"`);
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
        console.error("Error during default graph execution:", error);
        throw error;
    }
}

// async function readFiles(files: string[]): Promise<Record<string, string>> {
//     const fileContents: Record<string, string> = {};
//     try {
//         for (const filePath of files) {
//             const resolvedPath = path.resolve(filePath);
//             console.log(`Reading file: ${resolvedPath}`);
//             fileContents[resolvedPath] = await fs.readFile(resolvedPath, 'utf-8');
//         }
//     } catch (error) {
//         console.error(`Error reading input files: ${error}`);
     
//     }
//     finally {
//         return fileContents;
//     }
// }

// function parseArgs(args: string[]): { query: string, files: string[] }
// {
//     let q = '';
//     let files: string[] = [];
//     try {
//         for (let i = 0; i < args.length; i++) {
//             if (args[i] === '--query' && i + 1 < args.length) {
//                 q = args[i + 1];
//                 i++;
//             } else if (args[i] === '--file' && i + 1 < args.length) {
//                 files.push(args[i + 1]);
//                 i++;
//             } else {
//                 console.warn(`Unrecognized argument: ${args[i]}`);
//             }
//         }
//         if (!q || files.length === 0) {
//             console.log("Usage: analyze --query \"<your query>\" --file <path1> [--file <path2> ...]");
//             return { query: '', files: [] }; // Exit handler
//         }
//     } catch (e) {
//         console.log("Error parsing arguments for analyze command.");
//         console.log("Usage: analyze --query \"<your query>\" --file <path1> [--file <path2> ...]");
//         return { query: '', files: [] };
//     }
//     return { query: q, files: files };
// }

// type Input = Partial<AppState> | Command;

// async function runGraph(currentInput: Input, config: any) : Promise<{interrupted: boolean, agentQuery: string}>
// {
//     let stream;
//     let agentQuery = "";
//     let interrupted = false;
//     try {
//         stream = await agentApp.stream(currentInput, config);

//         for await (const chunk of stream) {
//             dbg(`chunk: ${JSON.stringify(chunk)}`);
//             if (chunk.__interrupt__) {
//                 interrupted = true;
//                 // Extract query from the first interrupt object's value
//                 agentQuery = chunk.__interrupt__[0]?.value?.query || "Agent needs input.";
//                 dbg(`agentQuery: ${agentQuery}`);
//                 break; // Exit inner loop to prompt user
//             }
//              // You might want to log other node outputs here if needed
//              // e.g., if (chunk.supervisor) { console.log("Supervisor output:", chunk.supervisor); }
//         }
//     } catch (error) {
//         console.error("Error during agent graph stream:", error);
//         throw error; // Exit the handler on stream error
//     }
//     return {interrupted, agentQuery};
// }

// --- Helper Function: Analyze Command Handler ---
// async function handleAnalyzeCommand(args: string[]) {

//     const { query, files } = parseArgs(args);
    
//     const fileContents = await readFiles(files);

//     const initialAppState: Partial<AppState> = {
//         userInput: `analyze: ${query}`,
//         fileContents: fileContents,
//         analysisHistory: [],
//         analysisOutput: "",
//         currentAnalysisQuery: "",
//         response: "", 
//     };
//     const config = newGraphConfig();

//     dbg(`Starting analysis with thread ID: ${config.configurable.thread_id}`);

//     /*
//         The core of this function is a loop that runs the agent graph,
//         and handles the agent's interrupt requests.
//      */
//     let currentInput: Input = initialAppState;
//     let analysisDone = false;
//     while (!analysisDone)
//     {

//         const {interrupted, agentQuery} = await runGraph(currentInput, config);

//         if (interrupted)
//         {
//             analysisDone = false;
//             say(`\nAgent: ${agentQuery}`);
//             const { userResponse } = await inquirer.prompt([
//                 { type: 'input', name: 'userResponse', message: 'Your response: ' }
//             ]);

//             currentInput = new Command({  resume: userResponse  });
//             dbg(`Resuming with Command. currentInput: ${JSON.stringify(currentInput)}`); 

//         }
//         else
//         {
//             say("\n--- Analysis Complete ---");
//             analysisDone = true;
//         }
//     }   

//     // Final Output
//     try
//     {
//         const finalState = await agentApp.getState(config);
//         say("Final Output:");
//         say(finalState.values.analysisOutput || "No analysis output generated.");
//     }
//     catch (error)
//     {
//         console.error("Error retrieving final graph state:", error);
//         throw error;
//     }
// }

/**
 * Prompts the user for command input in the interactive shell.
 * 
 * Uses inquirer to display a prompt with "archie> " and collect user input.
 * Trims whitespace from the input before returning.
 * 
 * @returns Promise that resolves to the trimmed command string entered by user
 */
async function getCommandInput() : Promise<string>
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
function parseCommand(commandInput: string) : {command: string, args: string[]}
{
    const parts = commandInput.match(/(?:[^\s\"]+|\"[^\"]*\")+/g) || [];
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