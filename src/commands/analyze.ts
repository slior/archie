import { Command } from "@langchain/langgraph";
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
import { app as agentApp, AppState } from "../agents/graph";
import { MemoryService } from '../memory/MemoryService';
import * as uuid from 'uuid'; 
import { dbg, say } from '../utils';
// Define types needed within this command module
type Input = Partial<AppState> | Command;
type ResolveFn = (...paths: string[]) => string;
type RunGraphFn = typeof runGraph;
type PromptFn = (questions: any[]) => Promise<any>;
type AnalysisIterationFn = (
    currentInput: Input,
    config: any,
    runGraphFn?: RunGraphFn,
    promptFn?: PromptFn
) => Promise<{ isDone: boolean, newInput: Input }>;

type GetStateFn = (config: any) => Promise<{ values: Partial<AppState> }>;
type GetFinalOutputFn = typeof getFinalOutput;
type DisplayFinalOutputFn = typeof displayFinalOutputToUser;
type PersistFinalOutputFn = typeof persistFinalOutput;
type ReadFilesFn = (filePaths: string[]) => Promise<Record<string, string>>;
type BasicReadFileFn = (path: string, encoding: string) => Promise<string>;

// --- Helper Functions (Adapted/Moved) ---

// export function dbg(s: string) {
//     console.debug(`[Analyze] ${s}`);
// }

// export function say(s: string) {
//     console.log(s);
// }

export function newGraphConfig() {
    const thread_id = uuid.v4();
    return { configurable: { thread_id } };
}

// --- Core Logic ---

/**
 * Runs the analysis process based on a query and input files.
 *
 * @param query The analysis query string.
 * @param inputsDir An array of input file paths for analysis context.
 * @param modelName The AI model name to use.
 * @param memoryService The memory service instance (currently unused here, but kept for potential future use).
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
    // Injected Dependencies for testability
    // readFilesFn: ReadFilesFn = readInputFiles,
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
    // const fileContents = await readFilesFn(inputs);
    const fileContents = await readFiles(inputsDir);
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
        const { isDone, newInput } = await analysisIterationFn(currentInput, config);
        currentInput = newInput;
        analysisDone = isDone;
    }

    dbg("Analysis loop finished. Retrieving final output.");
    // Determine output directory from the first input file's directory
    // const outputDir = inputsDir.length > 0 ? path.dirname(path.resolve(inputsDir[0])) : '.';

    const finalOutput = await getFinalOutputFn(config, getStateFn);
    displayFinalOutputFn(finalOutput);
    await persistFinalOutputFn(finalOutput, inputsDir);

    // No memoryService.saveMemory() call here - handled in main.ts
    dbg("runAnalysis completed.");
}


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
        // Potentially rethrow or handle differently
    }
    finally {
        return fileContents;
    }
}

/**
 * Reads the content of specified input files.
 *
 * @param filePaths Array of absolute or relative file paths.
 * @param readFileFn Basic file reading function.
 * @param resolveFn Path resolution function.
 * @returns A record mapping resolved file paths to their content.
 */
export async function readInputFiles(
    filePaths: string[],
    readFileFn: (path: string, encoding: BufferEncoding) => Promise<string> = fsPromises.readFile,
    resolveFn: ResolveFn = path.resolve
): Promise<Record<string, string>> {
    const fileContents: Record<string, string> = {};
    for (const filePath of filePaths) {
        const resolvedPath = resolveFn(filePath);
        try {
            dbg(`Reading file: ${resolvedPath}`);
            fileContents[resolvedPath] = await readFileFn(resolvedPath, 'utf-8');
        } catch (readError: any) {
            say(`Warning: Error reading file ${resolvedPath}: ${readError.message}. Skipping.`);
            // Skip the file, but continue with others
        }
    }
    return fileContents;
}


export async function getFinalOutput(config: any, getStateFn: GetStateFn): Promise<string> {
    try {
        const finalState = await getStateFn(config);
        // Ensure analysisOutput exists and is a string
        return finalState.values?.analysisOutput ?? "";
    } catch (error) {
        console.error("Error retrieving final graph state:", error);
        // Return empty string or rethrow depending on desired error handling
        return "";
    }
}

export function displayFinalOutputToUser(output: string) {
    say("\n--- Final Analysis Output ---");
    say(output || "No analysis output generated.");
    say("-----------------------------\n");
}


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


export async function analysisIteration(
    currentInput: Input,
    config: any,
    runGraphFn: RunGraphFn = runGraph,
    promptFn: PromptFn = inquirer.prompt
): Promise<{ isDone: boolean, newInput: Input }> {
    dbg(`Running graph iteration on thread: ${config.configurable.thread_id}`);
    
    const { interrupted, agentQuery } = await runGraphFn(currentInput, config);
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


export async function runGraph(currentInput: Input, config: any): Promise<{ interrupted: boolean, agentQuery: string }> {
    let stream;
    let agentQuery = "";
    let interrupted = false;

    try {
        dbg("Invoking agent graph...");
        stream = await agentApp.stream(currentInput, config);
        // for await (const event of stream) {
        //     if (event.event === 'on_chat_model_stream') {
        //         // Log stream events if needed
        //         // const content = event.data?.chunk?.message?.content;
        //         // if (content) process.stdout.write(content);
        //     } else if (event.event === 'on_tool_end') {
        //          dbg(`Tool ${event.name} finished.`);
        //     } else if (event.event === 'on_tool_start') {
        //          dbg(`Tool ${event.name} started with input: ${JSON.stringify(event.data.input)}`);
        //     }
        //  }
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
        // Check the final state for interruption
        // This assumes the graph sets a specific flag or state upon interruption.
        // Let's refine this based on how `agentApp` actually signals interruption.
        // For now, we assume getState() reveals if it paused.
        // **This part needs verification against the actual graph implementation**
        // const finalState = await agentApp.getState(config);
        // Example: Check if a specific node indicating interruption is the last one active
        // Or if a specific field in the state signifies interruption.
        // If the graph uses LangGraph's built-in interrupt handling:
        // if (finalState.next && finalState.next.length > 0 && finalState.next.includes('__interrupt__')) {
        //      interrupted = true;
        //      // Attempt to extract the agent's query from the state if available
        //      agentQuery = finalState.values?.currentAnalysisQuery || "Agent requires input."; // Example state field
        //      dbg(`Graph interrupted. Agent query: "${agentQuery}"`);
        // } else {
        //     dbg("Graph finished without explicit interruption signal in state.");
        //      interrupted = false; // Ensure it's false if no interrupt found
        //  }

    } catch (error) {
        console.error("Error executing agent graph:", error);
        // Decide how to handle graph execution errors - rethrow or return specific state?
        // Returning as non-interrupted might be misleading. Rethrowing might be better.
         throw error; // Rethrow for now
    }

    // Return based on whether an interruption occurred and any query extracted
    return { interrupted, agentQuery };
} 