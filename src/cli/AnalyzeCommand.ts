
import { app as agentApp, AppState } from "../agents/graph";
import { Command } from "@langchain/langgraph";
import { dbg, say, newGraphConfig, Input } from "./shell";
import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';


export async function handleAnalyzeCommand(args: string[]) {

    const { query, files } = parseArgs(args);
    
    const fileContents = await readFiles(files);

    const initialAppState: Partial<AppState> = {
        userInput: `analyze: ${query}`,
        fileContents: fileContents,
        analysisHistory: [],
        analysisOutput: "",
        currentAnalysisQuery: "",
        response: "", 
    };
    const config = newGraphConfig();

    dbg(`Starting analysis with thread ID: ${config.configurable.thread_id}`);

    /*
        The core of this function is a loop that runs the agent graph,
        and handles the agent's interrupt requests.
     */
    let currentInput: Input = initialAppState;
    let analysisDone = false;
    while (!analysisDone)
    {

        const {interrupted, agentQuery} = await runGraph(currentInput, config);

        if (interrupted)
        {
            analysisDone = false;
            say(`\nAgent: ${agentQuery}`);
            const { userResponse } = await inquirer.prompt([
                { type: 'input', name: 'userResponse', message: 'Your response: ' }
            ]);

            currentInput = new Command({  resume: userResponse  });
            dbg(`Resuming with Command. currentInput: ${JSON.stringify(currentInput)}`); 

        }
        else
        {
            say("\n--- Analysis Complete ---");
            analysisDone = true;
        }
    }   

    // Final Output
    try
    {
        const finalState = await agentApp.getState(config);
        say("Final Output:");
        say(finalState.values.analysisOutput || "No analysis output generated.");
    }
    catch (error)
    {
        console.error("Error retrieving final graph state:", error);
        throw error;
    }
}


async function readFiles(files: string[]): Promise<Record<string, string>> {
    const fileContents: Record<string, string> = {};
    try {
        for (const filePath of files) {
            const resolvedPath = path.resolve(filePath);
            console.log(`Reading file: ${resolvedPath}`);
            fileContents[resolvedPath] = await fs.readFile(resolvedPath, 'utf-8');
        }
    } catch (error) {
        console.error(`Error reading input files: ${error}`);
     
    }
    finally {
        return fileContents;
    }
}

function parseArgs(args: string[]): { query: string, files: string[] }
{
    let q = '';
    let files: string[] = [];
    try {
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--query' && i + 1 < args.length) {
                q = args[i + 1];
                i++;
            } else if (args[i] === '--file' && i + 1 < args.length) {
                files.push(args[i + 1]);
                i++;
            } else {
                console.warn(`Unrecognized argument: ${args[i]}`);
            }
        }
        if (!q || files.length === 0) {
            console.log("Usage: analyze --query \"<your query>\" --file <path1> [--file <path2> ...]");
            return { query: '', files: [] }; // Exit handler
        }
    } catch (e) {
        console.log("Error parsing arguments for analyze command.");
        console.log("Usage: analyze --query \"<your query>\" --file <path1> [--file <path2> ...]");
        return { query: '', files: [] };
    }
    return { query: q, files: files };
}



async function runGraph(currentInput: Input, config: any) : Promise<{interrupted: boolean, agentQuery: string}>
{
    let stream;
    let agentQuery = "";
    let interrupted = false;
    try {
        stream = await agentApp.stream(currentInput, config);

        for await (const chunk of stream) {
            dbg(`chunk: ${JSON.stringify(chunk)}`);
            if (chunk.__interrupt__) {
                interrupted = true;
                // Extract query from the first interrupt object's value
                agentQuery = chunk.__interrupt__[0]?.value?.query || "Agent needs input.";
                dbg(`agentQuery: ${agentQuery}`);
                break; // Exit inner loop to prompt user
            }
             // You might want to log other node outputs here if needed
             // e.g., if (chunk.supervisor) { console.log("Supervisor output:", chunk.supervisor); }
        }
    } catch (error) {
        console.error("Error during agent graph stream:", error);
        throw error; // Exit the handler on stream error
    }
    return {interrupted, agentQuery};
}
