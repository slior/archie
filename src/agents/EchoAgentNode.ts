import { AppState, safeAppConfig, } from "./graph";
import { AppRunnableConfig } from "../utils";
import { RunnableConfig } from "@langchain/core/runnables";

/**
 * A simple agent node that takes the user input from the state
 * and puts an echoed response back into the state.
 */
export async function echoAgentNode(state: AppState, config: RunnableConfig): Promise<Partial<AppState>> {
    console.log("--- Echo Agent Node Running ---");
    
    const appConfig : AppRunnableConfig = safeAppConfig(config);

    const userInput = state.userInput;
    const echoResponse = `Echo: ${userInput}`;
    console.log(`Echo Agent Response: ${echoResponse}`);
    return { response: echoResponse };
} 