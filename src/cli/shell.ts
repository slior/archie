import inquirer from 'inquirer';
import { MemoryService } from '../memory/MemoryService';
import { app as agentApp, AppState } from '../agents/graph';

// Imports needed for Analysis Agent command
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { Command } from '@langchain/langgraph';
import * as path from 'path'; // Import path for resolving file paths

// --- Helper Function: Default Command Handler ---
async function handleDefaultCommand(commandInput: string) {
    if (!agentApp) {
        console.log("Error: Agent graph is not compiled or available.");
        return;
    }
    try {
        console.log(`Invoking agent graph with input: "${commandInput}"`);
        // Define the initial state for this invocation, including defaults for new fields
        const initialState: Partial<AppState> = {
            userInput: commandInput,
            response: "", // Start with an empty response
            fileContents: {},
            analysisHistory: [],
            analysisOutput: "",
            currentAnalysisQuery: "",
        };

        // Invoke the graph - Cast needed as invoke expects full state usually
        const result = await agentApp.invoke(initialState as AppState);

        // Display the final response from the graph state
        console.log("Agent Response:", result.response); // Access the 'response' channel from the final state
    } catch (error) {
        console.error("Error during default graph execution:", error);
    }
}

// --- Helper Function: Analyze Command Handler ---
async function handleAnalyzeCommand(args: string[]) {
    let query = "";
    const files: string[] = [];

    // Basic argument parsing
    try {
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--query' && i + 1 < args.length) {
                query = args[i + 1];
                i++;
            } else if (args[i] === '--file' && i + 1 < args.length) {
                files.push(args[i + 1]);
                i++;
            } else {
                console.warn(`Unrecognized argument: ${args[i]}`);
            }
        }
        if (!query || files.length === 0) {
            console.log("Usage: analyze --query \"<your query>\" --file <path1> [--file <path2> ...]");
            return; // Exit handler
        }
    } catch (e) {
        console.log("Error parsing arguments for analyze command.");
        console.log("Usage: analyze --query \"<your query>\" --file <path1> [--file <path2> ...]");
        return;
    }

    // File Reading
    const fileContents: Record<string, string> = {};
    try {
        for (const filePath of files) {
            const resolvedPath = path.resolve(filePath);
            console.log(`Reading file: ${resolvedPath}`);
            fileContents[resolvedPath] = await fs.readFile(resolvedPath, 'utf-8');
        }
    } catch (error) {
        console.error(`Error reading input files: ${error}`);
        return;
    }

    // Thread ID & Initial State
    const thread_id = uuidv4();
    const initialAppState: Partial<AppState> = {
        userInput: query,
        fileContents: fileContents,
        analysisHistory: [],
        analysisOutput: "",
        currentAnalysisQuery: "",
        response: "", // Ensure all fields are present
    };
    const config = { configurable: { thread_id } };

    console.log(`Starting analysis with thread ID: ${thread_id}`);

    // Execution Loop
    let currentInput: Partial<AppState> | Command = initialAppState;
    while (true) {
        let interrupted = false;
        let agentQuery = "";
        let stream;

        try {
            stream = await agentApp.stream(currentInput, config);

            for await (const chunk of stream) {
                // console.dir(chunk, { depth: 1 }); // Debug logging
                if (chunk.__interrupt__) {
                    interrupted = true;
                    // Extract query from the first interrupt object's value
                    agentQuery = chunk.__interrupt__[0]?.value?.query || "Agent needs input.";
                    break; // Exit inner loop to prompt user
                }
                 // You might want to log other node outputs here if needed
                 // e.g., if (chunk.supervisor) { console.log("Supervisor output:", chunk.supervisor); }
            }
        } catch (error) {
            console.error("Error during agent graph stream:", error);
            return; // Exit the handler on stream error
        }

        if (interrupted) {
            console.log(`\nAgent: ${agentQuery}`);
            // Use inquirer to get user input
            const { userResponse } = await inquirer.prompt([
                { type: 'input', name: 'userResponse', message: 'Your response: ' }
            ]);
            // Prepare Command for next iteration
            currentInput = new Command({ resume: userResponse });
        } else {
            // Graph finished without interruption
            console.log("\n--- Analysis Complete ---");
            break; // Exit the while loop
        }
    }

    // Final Output
    try {
        const finalState = await agentApp.getState(config);
        console.log("Final Output:");
        console.log(finalState.values.analysisOutput || "No analysis output generated.");
    } catch (error) {
        console.error("Error retrieving final graph state:", error);
    }
}

// --- Main Shell Function --- (Refactored)
export async function startShell(memoryService: MemoryService) {
  console.log('Starting interactive shell. Type "exit" to quit.');
  console.log('Available commands: exit, analyze --query "...\" --file <path> ..., or provide input for default agent.');

  while (true) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'command',
        message: 'archie> ',
      },
    ]);

    const commandInput = answers.command.trim();

    // Simple command parsing (split by space, respecting quotes)
    const parts = commandInput.match(/(?:[^\s\"]+|\"[^\"]*\")+/g) || [];
    const command = parts[0]?.toLowerCase() || '';
    // Remove surrounding quotes from arguments if present, add type annotation
    const args = parts.slice(1).map((arg: string) => 
        (arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'")) 
        ? arg.slice(1, -1) 
        : arg
    );

    if (command === 'exit') {
      console.log('Saving memory before exiting...');
      await memoryService.saveMemory();
      console.log('Exiting Archie...');
      break; // Exit the loop
    } else if (command === '') {
        continue; // Ignore empty input
    } else if (command === 'analyze') {
        await handleAnalyzeCommand(args); // Pass only args
    } else {
        // Treat the entire input as input for the default command handler
        await handleDefaultCommand(commandInput);
    }
  }
} 