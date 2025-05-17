// Placeholder for the AppState interface - will be defined in graph.ts ideally
// For now, define a minimal version here or import from graph.ts if circular deps allow.
// interface MinimalAppState {
//     userInput: string;
//     response: string;
// }

import { AppState, safeAppConfig, } from "./graph";
import { AppRunnableConfig } from "../utils";
import { RunnableConfig } from "@langchain/core/runnables";

/**
 * A simple agent node that takes the user input from the state
 * and puts an echoed response back into the state.
 */
export async function echoAgentNode(state: AppState, config: RunnableConfig): Promise<Partial<AppState>> {
    console.log("--- Echo Agent Node Running ---");
    
    // The config passed by LangGraph is RunnableConfig.
    // We expect it to be an AppRunnableConfig due to how the graph is typically invoked
    // and how checkpointer store/retrieve configurable fields.
    // const appConfig = config as AppRunnableConfig;
    const appConfig : AppRunnableConfig = safeAppConfig(config);

    const userInput = state.userInput;
    const echoResponse = `Echo: ${userInput}`;
    console.log(`Echo Agent Response: ${echoResponse}`);
    return { response: echoResponse };
} 