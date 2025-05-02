import { AppState } from "./graph";
// No longer need interrupt here
// import { interrupt } from "@langchain/langgraph"; 
import { say,dbg } from "../cli/shell";
import { callOpenAI } from './LLMUtils'; // Import the OpenAI utility
import * as path from 'path'; // Import path here

// Define the type for history based on AppState Role
type Role = 'user' | 'agent';
type HistoryMessage = { role: Role; content: string };

/**
 * Abstracted LLM call function.
 * Constructs the appropriate prompt based on the context and calls the underlying LLM utility.
 */
async function callLLM(
    history: HistoryMessage[], 
    files: Record<string, string>,
    promptType: 'initial' | 'followup' | 'final'
): Promise<string> {
    dbg(`\n--- Constructing LLM Prompt (Type: ${promptType}) ---`);
    let constructedPrompt: string;
    const fileList = Object.keys(files).map(p => path.basename(p)).join(', ') || 'None'; // Use path.basename

    // Use history directly (callOpenAI expects the full history)
    // The prompt passed to callOpenAI is the specific instruction for *this* turn.
    
    if (promptType === 'initial') {
        const firstUserMessage = history.find(m => m.role === 'user')?.content || '(No initial query found)';
        constructedPrompt = `Analyze the user query based on the provided files. Files: [${fileList}]. User's initial query: "${firstUserMessage}". What is the primary goal for this analysis? Ask clarifying questions if needed.`;
    } else if (promptType === 'final') {
        // Construct detailed final summary prompt
        constructedPrompt = `Based on the following conversation history: ${JSON.stringify(history)} and the context of files: [${fileList}], generate a final analysis summary for the user. The summary should include (if possible based on the conversation):
        - Identified assumptions
        - Identified main components involved
        - Discussed alternatives with tradeoffs
        - Summary of design decisions reached and why
        - A list of any open questions remaining.
        Provide only the summary content.`;
    } else { // 'followup'
        // For follow-up, the history contains the context. The prompt should guide the LLM on what to do next.
        // We pass the full history to callOpenAI, and this prompt acts as the latest instruction.
        constructedPrompt = `Continue the analysis based on the latest user message in the history. Files provided: [${fileList}]. Ask further clarifying questions or provide analysis as appropriate.`;
    }

    dbg(`Prompt Instruction: ${constructedPrompt}`);

    try {
        // Pass the existing history and the newly constructed prompt instruction
        return await callOpenAI(history, constructedPrompt);
    } catch (error) {
        console.error("Error in callLLM calling callOpenAI:", error);
        // Rethrow a user-friendly error or handle as needed
        throw new Error("LLM communication failed. Please check logs or API key.");
    }
}

async function returnFinalOutput(
    currentHistory: HistoryMessage[], 
    lastUserMessage: string, 
    state: AppState
) : Promise<Partial<AppState>> {
    say("Analysis Agent: Solution approved by user.");
    try {
        // Call the abstracted LLM function for the final summary
        const finalOutput = await callLLM(currentHistory, state.fileContents, 'final');
        const finalAgentMsg = { role: 'agent' as const, content: "Okay, generating the final solution description." };

        return {
            analysisOutput: finalOutput,
            // Log only the agent message and the user approval that triggered this
            analysisHistory: currentHistory.concat([finalAgentMsg, { role: 'user', content: lastUserMessage }]), 
            userInput: "", // Clear input
            currentAnalysisQuery: "" // Clear query
        };
    } catch(error) {
        console.error("Failed to generate final output:", error);
        // Handle error, maybe return a state indicating failure
        return {
            analysisOutput: "Error: Failed to generate the final analysis summary.",
            analysisHistory: currentHistory.concat([{role: 'agent', content: "I encountered an error trying to generate the final summary."}]),
            userInput: "", 
            currentAnalysisQuery: "" 
        }
    }
}

function userIsDone(userMessage: string) : boolean {
    const doneKeywords = ["SOLUTION APPROVED", "DONE", "OKAY BYE"];
    return doneKeywords.some(keyword => userMessage.toUpperCase().includes(keyword));
}

export async function analysisPrepareNode(state: AppState): Promise<Partial<AppState>> { // Return type no longer includes interrupt
    dbg("--- Analysis Prepare Node Running ---"); // Updated log
    const currentUserInput = state.userInput;
    // Ensure history is correctly typed using HistoryMessage
    let currentHistory: HistoryMessage[] = state.analysisHistory || [];
    dbg(`currentUserInput: ${currentUserInput}, currentHistory length: ${currentHistory.length}, currentAnalysisQuery: ${state.currentAnalysisQuery}`);
    
    // 1. Add user's resumed input to history (if applicable)
    if (currentUserInput && state.currentAnalysisQuery) {
        dbg(`Analysis Prepare: Resuming with user input: ${currentUserInput}`);
        // Add user input to history before calling LLM
        currentHistory = currentHistory.concat({ role: 'user', content: currentUserInput });
        // Clear the query now that we've consumed the input for it (in the return state)
    } else if (currentUserInput && currentHistory.length === 0) {
        dbg(`Analysis Prepare: Starting with initial user input: ${currentUserInput}`);
        // Add initial user input to history
        currentHistory = currentHistory.concat({ role: 'user', content: currentUserInput });
    }

    // 2. Check for approval keyword BEFORE calling LLM for this turn
    const lastUserMessageContent = currentHistory.filter(m => m.role === 'user').pop()?.content || "";
    if (userIsDone(lastUserMessageContent)) {
        // If approved, generate final output
        return await returnFinalOutput(currentHistory, lastUserMessageContent, state);
    }

    // 3. Normal conversational turn - Call LLM for the next step
    dbg("Analysis Prepare: Calling LLM for next step.");
    try {
        // Determine prompt type based on history
        // Consider it 'initial' only if history *only* contains the first user message
        const promptType = currentHistory.length <= 1 ? 'initial' : 'followup'; 
        
        const agentResponse = await callLLM(currentHistory, state.fileContents, promptType);
        const agentMsg = { role: 'agent' as const, content: agentResponse };

        dbg(`Agent response generated: ${agentResponse}`);

        // Prepare the state update to be returned for the interrupt node
        const stateUpdate: Partial<AppState> = {
            // Update history INCLUDING the latest agent response
            analysisHistory: currentHistory.concat(agentMsg),
            currentAnalysisQuery: agentResponse, // Store the agent's response/question for interrupt
            userInput: "" // Clear the input used in this turn
        };
        return stateUpdate;

    } catch (error) {
        console.error("Error during analysisPrepareNode LLM call:", error);
        // Return state indicating error to the user via interrupt
        // const errorMessage = "Sorry, I encountered an error communicating with the language model. Please try again later.";
        throw error;
        // return {
        //     analysisHistory: currentHistory.concat([{ role: 'agent', content: errorMessage}]),
        //     currentAnalysisQuery: errorMessage,
        //     userInput: ""
        // }
    }
} 