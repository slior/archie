import { Command } from "@langchain/langgraph";
// import * as shell from "./shell"; // Import shell namespace for defaults
import { dbg, say, newGraphConfig, Input, SayFn, DbgFn } from "./shell"; 
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
import { app as agentApp, AppState } from "../agents/graph";


// Define types for the dependency functions
type ParsedAnalyzeArgs = { query: string, inputsDir: string };

type ParseArgsFn = (args: string[]) => ParsedAnalyzeArgs;
type ReadFilesFn = (directoryPath: string) => Promise<Record<string, string>>;
type BasicReadFileFn = (path: string, encoding: string) => Promise<string>;
type ResolveFn = (...paths: string[]) => string;
type RunGraphFn = typeof runGraph;
type PromptFn = (questions: any[]) => Promise<any>; 
type AnalysisIterationFn = (
    currentInput: Input, 
    config: any,
    runGraphFn?: RunGraphFn, // Optional here as they are passed down
    promptFn?: PromptFn,
    sayFn?: SayFn,
    dbgFn?: DbgFn
) => Promise<{ isDone: boolean, newInput: Input }>;

type NewGraphConfigFn = typeof newGraphConfig;
type GetStateFn = (config: any) => Promise<{ values: Partial<AppState> }>;

type GetFinalOutputFn = typeof getFinalOutput;
type DisplayFinalOutputFn = typeof displayFinalOutputToUser;
type PersistFinalOutputFn = typeof persistFinalOutput;

/**
 * Handles the 'analyze' command by initiating an interactive analysis session with the agent.
 * 
 * This function:
 * 1. Parses the command arguments to extract the query and input directory path
 * 2. Reads the contents of the specified files (.txt, .md) in the directory
 * 3. Initializes the analysis state and configuration
 * 4. Enters an interactive loop where it:
 *    - Runs the agent graph
 *    - Handles interrupts from the agent to get user input
 *    - Continues until analysis is complete
 * 5. Outputs the final analysis results
 *
 * The function implements a Human-in-the-Loop pattern where the agent can pause
 * execution to ask clarifying questions before providing the final analysis.
 * 
 * Dependencies are injected to allow for testing.
 * 
 * @param args - Array of command line arguments containing --query and --inputs parameters
 * @param modelName - The model name selected at startup
 * @param parseArgsFn 
 * @param readFilesFn 
 * @param newGraphConfigFn 
 * @param analysisIterationFn 
 * @param getStateFn 
 * @param sayFn 
 * @param dbgFn 
 * @param getFinalOutputFn 
 * @param displayFinalOutputFn 
 * @param persistFinalOutputFn 
 * @throws Error if there are issues accessing the graph state or other runtime errors
 */
export async function handleAnalyzeCommand(
    args: string[],
    modelName: string,
    // Injected Dependencies
    parseArgsFn: ParseArgsFn = parseArgs,
    readFilesFn: ReadFilesFn = readFiles,
    newGraphConfigFn: NewGraphConfigFn = newGraphConfig,
    analysisIterationFn: AnalysisIterationFn = analysisIteration,
    getStateFn: GetStateFn = agentApp.getState.bind(agentApp), // Inject agentApp.getState
    sayFn: SayFn = say,
    dbgFn: DbgFn = dbg,
    getFinalOutputFn: GetFinalOutputFn = getFinalOutput,
    displayFinalOutputFn: DisplayFinalOutputFn = displayFinalOutputToUser,
    persistFinalOutputFn: PersistFinalOutputFn = persistFinalOutput
) {

    const { query, inputsDir } = parseArgsFn(args);
    if (!query || !inputsDir) { // Exit if parsing failed (returned empty query or dir)
      dbgFn("Exiting handleAnalyzeCommand due to missing query or inputs directory.");
      return;
    }
    
    // Use the default readFile/resolve embedded within readFilesFn unless overridden
    const fileContents = await readFilesFn(inputsDir);

    const initialAppState: Partial<AppState> = {
        userInput: `analyze: ${query}`,
        fileContents: fileContents,
        analysisHistory: [],
        analysisOutput: "",
        currentAnalysisQuery: "",
        response: "", 
        modelName: modelName,
    };
    const config = newGraphConfigFn();

    dbgFn(`Starting analysis with thread ID: ${config.configurable.thread_id}`);

    let currentInput: Input = initialAppState;
    let analysisDone = false;
    while (!analysisDone)
    {
        const { isDone, newInput } = await analysisIterationFn(currentInput, config);
        currentInput = newInput;
        analysisDone = isDone;
    }   

    // Get, display, and persist the final output
    const finalOutput = await getFinalOutputFn(config, getStateFn);
    displayFinalOutputFn(finalOutput, sayFn);
    await persistFinalOutputFn(finalOutput, inputsDir); 
}

export async function getFinalOutput(config: any, getStateFn: GetStateFn): Promise<string> 
{
    try
    {
        const finalState = await getStateFn(config);
        return finalState.values.analysisOutput || ""; // Return empty string if undefined
    } 
    catch (error) 
    { 
        console.error("Error retrieving final graph state:", error);
        throw error;
    }
}

export function displayFinalOutputToUser(output: string, sayFn: SayFn = say)
{
    sayFn("Final Output:");
    sayFn(output || "No analysis output generated.");
}

export async function persistFinalOutput(
    output: string, 
    targetDir: string, 
    resolveFn: ResolveFn = path.resolve, 
    writeFileFn = fsPromises.writeFile
) {
    const outputPath = resolveFn(targetDir, 'analysis_result.md');
    try {
        await writeFileFn(outputPath, output, 'utf-8');
        say(`Analysis results saved to: ${outputPath}`);
    } catch (error) {
        console.error(`Error saving analysis results to ${outputPath}:`, error);
        // Log error but don't throw, as displaying output might still be useful
    }
}

export async function analysisIteration(
    currentInput: Input, 
    config: any,
    // Inject dependencies
    runGraphFn: RunGraphFn = runGraph,
    promptFn: PromptFn = inquirer.prompt,
    sayFn: SayFn = say,
    dbgFn: DbgFn = dbg
) : Promise<{ isDone: boolean, newInput: Input }>
{
    const {interrupted, agentQuery} = await runGraphFn(currentInput, config); 
    let analysisDone = false;
    if (interrupted)
    {
        sayFn(`\nAgent: ${agentQuery}`); 
        const { userResponse } = await promptFn([ 
            { type: 'input', name: 'userResponse', message: 'Your response: ' }
        ]);

        currentInput = new Command({  resume: userResponse  });
        dbgFn(`Resuming with Command. currentInput: ${JSON.stringify(currentInput)}`);

    }
    else
    {
        sayFn("\n--- Analysis Complete ---");
        analysisDone = true;
    }
    return { isDone: analysisDone, newInput: currentInput };
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

export function parseArgs(args: string[], sayFn: SayFn = say): ParsedAnalyzeArgs
{
    let q = '';
    let dir = ''; // Renamed variable
    try {
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--query' && i + 1 < args.length) {
                q = args[i + 1];
                i++;
            } else if (args[i] === '--inputs' && i + 1 < args.length) {
                dir = args[i + 1];
                i++;
            } else {
                console.warn(`Unrecognized argument: ${args[i]}`);
            }
        }
        if (!q || !dir) {
            sayFn("Usage: analyze --query \"<your query>\" --inputs <directory_path>");
            return { query: '', inputsDir: '' }; // Exit handler
        }
    } catch (e) {
        sayFn("Error parsing arguments for analyze command.");
        sayFn("Usage: analyze --query \"<your query>\" --inputs <directory_path>");
        return { query: '', inputsDir: '' };
    }
    return { query: q, inputsDir: dir }; // Return inputsDir
}

export async function runGraph(currentInput: Input, config: any) : Promise<{interrupted: boolean, agentQuery: string}>
{
    let stream;
    let agentQuery = "";
    let interrupted = false;
    try {
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
        console.error("Error during agent graph stream:", error);
        throw error; // Exit the handler on stream error
    }
    return {interrupted, agentQuery};
}
