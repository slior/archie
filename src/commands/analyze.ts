import { Command } from "@langchain/langgraph";
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
import { app as agentApp, AppState } from "../agents/graph";
import { MemoryService } from '../memory/MemoryService';
import { PromptService } from '../services/PromptService';
import { dbg, say, newGraphConfig, AppRunnableConfig } from '../utils';
// Define types needed within this command module
export type Input = Partial<AppState> | Command;
type ResolveFn = (...paths: string[]) => string;
type RunGraphFn = (currentInput: Input, config: any, promptService: PromptService) => Promise<{ interrupted: boolean, agentQuery: string }>;
type PromptFn = (questions: any[]) => Promise<any>;
type AnalysisIterationFn = (
    currentInput: Input,
    config: any,
    promptService: PromptService,
    runGraphFn?: RunGraphFn,
    promptFn?: PromptFn
) => Promise<{ isDone: boolean, newInput: Input }>;

type GetStateFn = (config: any) => Promise<{ values: Partial<AppState> }>;
type GetFinalOutputFn = typeof getFinalOutput;
type DisplayFinalOutputFn = typeof displayFinalOutputToUser;
type PersistFinalOutputFn = typeof persistFinalOutput;
type ReadFilesFn = (directoryPath: string, readFileFn?: BasicReadFileFn, resolveFn?: ResolveFn) => Promise<Record<string, string>>;
type BasicReadFileFn = (path: string, encoding: string) => Promise<string>;

// --- Core Logic ---

/**
 * Runs the analysis process based on a query and input files.
 *
 * @param query The analysis query string.
 * @param inputsDir An array of input file paths for analysis context.
 * @param modelName The AI model name to use.
 * @param memoryService The memory service instance (currently unused here, but kept for potential future use).
 * @param promptService The prompt service instance (currently unused here, but kept for potential future use).
 * @param readFilesFn Injected dependency for reading files.
 * @param newGraphConfigFn Injected dependency for creating graph config.
 * @param analysisIterationFn Injected dependency for handling analysis loop.
 * @param getStateFn Injected dependency for getting graph state.
 * @param getFinalOutputFn Injected dependency for extracting final output.
 * @param displayFinalOutputFn Injected dependency for displaying output.
 * @param persistFinalOutputFn Injected dependency for saving output.
 */
export async function runAnalysis(
    query: string,
    inputsDir: string,
    modelName: string,
    memoryService: MemoryService, // Keep signature consistent, though save is handled in main
    promptService: PromptService, // Added promptService
    // Injected Dependencies for testability
    readFilesFn: ReadFilesFn = readFiles,
    newGraphConfigFn: typeof newGraphConfig = newGraphConfig,
    analysisIterationFn: AnalysisIterationFn = analysisIteration,
    getStateFn: GetStateFn = agentApp.getState.bind(agentApp),
    getFinalOutputFn: GetFinalOutputFn = getFinalOutput,
    displayFinalOutputFn: DisplayFinalOutputFn = displayFinalOutputToUser,
    persistFinalOutputFn: PersistFinalOutputFn = persistFinalOutput
) {
    if (!query || !inputsDir) {
        say("Error: Analysis requires a query (--query) and a working directory (--inputs).");
        return;
    }

    dbg(`Reading content for input files from: ${inputsDir}`);
    const fileContents = await readFilesFn(inputsDir);
    if (Object.keys(fileContents).length === 0) {
        say("Error: Could not read any of the specified input files.");
        return;
    }

    const initialAppState: Partial<AppState> = {
        userInput: `analyze: ${query}`, // Prefix query for clarity in graph
        fileContents: fileContents,
        analysisHistory: [],
        analysisOutput: "",
        currentAnalysisQuery: query, // Store the original query
        response: "",
        modelName: modelName,
    };
    const config = newGraphConfigFn();

    dbg(`Starting analysis with thread ID: ${config.configurable.thread_id}`);

    let currentInput: Input = initialAppState;
    let analysisDone = false;
    while (!analysisDone) {
        const { isDone, newInput } = await analysisIterationFn(currentInput, config, promptService);
        currentInput = newInput;
        analysisDone = isDone;
    }

    dbg("Analysis loop finished. Retrieving final output.");
    // Determine output directory from the first input file's directory


    const finalOutput = await getFinalOutputFn(config, getStateFn);
    displayFinalOutputFn(finalOutput);
    await persistFinalOutputFn(finalOutput, inputsDir);

    dbg("runAnalysis completed.");
}


/**
 * Reads text and markdown files from a specified directory and returns their contents.
 * 
 * @param directoryPath - The path to the directory containing files to read
 * @param readFileFn - Function to read file contents (defaults to fs.promises.readFile)
 * @param resolveFn - Function to resolve file paths (defaults to path.resolve)
 * @param readdirFn - Function to read directory contents (defaults to fs.promises.readdir)
 * @returns Promise resolving to an object mapping file paths to their contents
 * @throws Error if the directory cannot be read or if there are errors reading individual files
 */
export async function readFiles(
    directoryPath: string,
    readFileFn: BasicReadFileFn = fsPromises.readFile as BasicReadFileFn,
    resolveFn: ResolveFn = path.resolve,
    readdirFn: (path: string) => Promise<string[]> = fsPromises.readdir
): Promise<Record<string, string>> {
    const fileContents: Record<string, string> = {};
    try {
        const dirents = await readdirFn(directoryPath);
        const filesToRead = dirents.filter(
            (dirent) => dirent.endsWith('.txt') || dirent.endsWith('.md')
        );

        for (const filename of filesToRead) {
            const resolvedPath = resolveFn(directoryPath, filename);
            dbg(`Reading file: ${resolvedPath}`);
            try {
                 fileContents[resolvedPath] = await readFileFn(resolvedPath, 'utf-8');
            } catch (readError) {
                console.error(`Error reading file ${resolvedPath}:`, readError);
                // Decide if one error should stop the whole process or just skip the file
            }
        }
    } catch (error) {
        console.error(`Error reading input directory ${directoryPath}:`, error);
        throw error;
    }
    finally {
        return fileContents;
    }
}

/**
 * Retrieves the final analysis output from the agent graph's state.
 * 
 * @param config - Configuration object containing graph execution settings
 * @param getStateFn - Function to retrieve the current state of the agent graph
 * @returns Promise resolving to the analysis output string, or empty string if not found/error
 * @throws Error if there are issues retrieving the graph state (caught internally)
 */
export async function getFinalOutput(config: any, getStateFn: GetStateFn): Promise<string> {
    try {
        const finalState = await getStateFn(config);
        return finalState.values?.analysisOutput ?? "";
    } catch (error) {
        console.error("Error retrieving final graph state:", error);
        return "";
    }
}

/**
 * Displays the final analysis output to the user in a formatted way.
 * Adds visual separators around the output for better readability.
 * 
 * @param output - The analysis output string to display
 *                 If empty/null/undefined, displays a default message
 */
export function displayFinalOutputToUser(output: string) {
    say("\n--- Final Analysis Output ---");
    say(output || "No analysis output generated.");
    say("-----------------------------\n");
}


/**
 * Persists the analysis output to a markdown file in the specified directory.
 * Creates an 'analysis_result.md' file containing the output text.
 * 
 * @param output - The analysis output string to save to file
 * @param targetDir - The directory path where the output file should be created
 * @param resolveFn - Function to resolve file paths (defaults to path.resolve)
 * @param writeFileFn - Function to write files (defaults to fs.promises.writeFile)
 * @returns Promise<void>
 * @throws Logs but does not throw errors if file writing fails
 */
export async function persistFinalOutput(
    output: string,
    targetDir: string,
    resolveFn: ResolveFn = path.resolve,
    writeFileFn = fsPromises.writeFile
) {
    const outputPath = resolveFn(targetDir, 'analysis_result.md');
    try {
        await writeFileFn(outputPath, output || "", 'utf-8'); // Write empty string if output is null/undefined
        say(`Analysis results saved to: ${outputPath}`);
    } catch (error) {
        console.error(`Error saving analysis results to ${outputPath}:`, error);
    }
}


/**
 * Executes a single iteration of the analysis process, handling agent interruptions and user interactions.
 * This is an internal function used by the analyze command. It's exported for testing purposes.
 * 
 * This function runs one iteration of the agent graph and handles two possible outcomes:
 * 1. The agent interrupts to request user input - in which case it prompts the user and prepares the next iteration
 * 2. The agent completes without interruption - in which case the analysis is marked as done
 *
 * @param currentInput - The current Input object containing the analysis state/command
 * @param config - Configuration object containing thread ID and other settings
 * @param promptService - The prompt service instance (currently unused here, but kept for potential future use)
 * @param runGraphFn - Function to execute the agent graph (defaults to runGraph)
 * @param promptFn - Function to prompt for user input (defaults to inquirer.prompt)
 * @returns Promise containing:
 *          - isDone: boolean indicating if analysis is complete
 *          - newInput: Input object for the next iteration (if not done)
 */
export async function analysisIteration(
    currentInput: Input,
    config: any,
    promptService: PromptService,
    runGraphFn: RunGraphFn = runGraph,
    promptFn: PromptFn = inquirer.prompt
): Promise<{ isDone: boolean, newInput: Input }> {
    dbg(`Running graph iteration on thread: ${config.configurable.thread_id}`);
    
    const { interrupted, agentQuery } = await runGraphFn(currentInput, config, promptService);
    let analysisDone = false;
    let nextInput = currentInput;
    
    if (interrupted) {
        say(`\nAgent: ${agentQuery || "Agent needs input..."}`); // Provide default if query is empty
        const { userResponse } = await promptFn([
            { type: 'input', name: 'userResponse', message: 'Your response: ' }
        ]);

        nextInput = new Command({ resume: userResponse || "" }); // Use empty string if user provides no input
        dbg(`Resuming analysis with user response. Next input: ${JSON.stringify(nextInput)}`);
    } else {
        dbg("Graph execution completed without interruption.");
        analysisDone = true;
    }
    return { isDone: analysisDone, newInput: nextInput };
}


/**
 * Executes the agent graph and processes its stream output to handle interruptions.
 * This is an internal function used by the analyze command. It's exported for testing purposes.
 * 
 * This function streams the agent graph execution and watches for interrupt signals
 * that indicate the agent needs user input to continue. It processes the stream
 * chunks until either an interrupt is encountered or the stream completes.
 *
 * @param currentInput - The current Input object containing the analysis state/command
 * @param config - Configuration object containing thread ID and other settings
 * @param promptService - The prompt service instance (currently unused here, but kept for potential future use)
 * @returns Promise containing:
 *          - interrupted: boolean indicating if agent requested user input
 *          - agentQuery: string containing the agent's question if interrupted
 * @throws Error if the agent graph execution fails
 */
export async function runGraph(currentInput: Input, config: AppRunnableConfig, promptService: PromptService): Promise<{ interrupted: boolean, agentQuery: string }> {
    let stream;
    let agentQuery = "";
    let interrupted = false;

    try {
        dbg("Invoking agent graph...");
        const fullConfig = {
            ...config,
            configurable: {
                ...config.configurable,
                promptService: promptService,
            },
        };

        config.configurable.promptService = promptService;
        // stream = await agentApp.stream(currentInput, fullConfig);
        stream = await agentApp.stream(currentInput, config);
        for await (const chunk of stream) {
            
            if (chunk.__interrupt__) {
                interrupted = true;
                // Extract query from the first interrupt object's value
                agentQuery = chunk.__interrupt__[0]?.value?.query || "Agent needs input.";
                dbg(`agentQuery: ${agentQuery}`);
                break; // Exit inner loop to prompt user
            }
             // Consider logging other node outputs here if needed
             // e.g., if (chunk.supervisor) { console.log("Supervisor output:", chunk.supervisor); }
        }

    } catch (error) {
        console.error("Error executing agent graph:", error);
        // Returning as non-interrupted might be misleading. Rethrowing might be better.
         throw error; // Rethrow for now
    }

    return { interrupted, agentQuery };
}