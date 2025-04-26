// Placeholder for the AppState interface - will be defined in graph.ts ideally
// For now, define a minimal version here or import from graph.ts if circular deps allow.
interface MinimalAppState {
    userInput: string;
    response: string;
}

/**
 * A simple agent node that takes the user input from the state
 * and puts an echoed response back into the state.
 */
export async function echoAgentNode(state: MinimalAppState): Promise<Partial<MinimalAppState>> {
    console.log("--- Echo Agent Node Running ---");
    const userInput = state.userInput;
    const echoResponse = `Echo: ${userInput}`;
    console.log(`Echo Agent Response: ${echoResponse}`);
    return { response: echoResponse };
} 