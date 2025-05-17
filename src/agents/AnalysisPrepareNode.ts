import { AppState, safeAppConfig } from "./graph";
import { AppRunnableConfig, dbg, say } from "../utils";
import { callTheLLM, HistoryMessage } from './LLMUtils'; // Import HistoryMessage from LLMUtils

import { PromptService } from "../services/PromptService"; // Added PromptService import
import { RunnableConfig } from "@langchain/core/runnables"; // Import RunnableConfig
import { summarizeFiles } from './agentUtils'; // Import summarizeFiles from agentUtils


const PROMPT_TYPE_INITIAL = 'initial';
const PROMPT_TYPE_FOLLOWUP = 'followup';
const PROMPT_TYPE_FINAL = 'final';
/**
 * Represents the type of prompt to generate for the LLM.
 * - PROMPT_TYPE_INITIAL: Used for the first interaction to understand the user's analysis goals
 * - PROMPT_TYPE_FOLLOWUP: Used for continuing the conversation and gathering more details
 * - PROMPT_TYPE_FINAL: Used to generate the final analysis summary
 */


/**
 * Makes a call to the Language Learning Model (LLM) with the appropriate prompt and context.
 * 
 * @param history - Array of previous conversation messages between user and agent
 * @param files - Record of filenames and their contents that provide context
 * @param promptType - Type of prompt to generate (initial, followup, or final)
 * @param modelName - Name of the LLM model to use
 * @returns Promise resolving to the LLM's response string
 * @throws Error if the LLM call fails or there are API issues
 */
async function callLLM(
    history: HistoryMessage[], 
    inputs: Record<string, string> | undefined,
    promptType: 'initial' | 'followup' | 'final',
    modelName: string,
    promptService?: PromptService
): Promise<string> {
    
    dbg(`callLLM received promptService: ${!!promptService}, using promptType: ${promptType}`);
    
    if (!promptService) {
        // This should ideally not happen if the service is correctly injected everywhere.
        // However, as a safeguard during transition or if a call path misses it:
        say("Warning: PromptService not available in callLLM. LLM call might fail or use basic prompts.");
        throw new Error("PromptService is required but not provided to callLLM.");
    }

    let context: Record<string, any> = {};
    const currentInputs = inputs ?? {};
    const filesContext = Object.entries(currentInputs)
        .map(([fileName, content]) => `File: ${fileName}\nContent:\n${content}`)
        .join("\n\n---\n\n");

    if (promptType === PROMPT_TYPE_INITIAL) {
        context = {
            fileSummaries: summarizeFiles(currentInputs),
            firstUserMessage: history.find(m => m.role === 'user')?.content || '(No initial query found)'
        };
    } else if (promptType === PROMPT_TYPE_FINAL) {
        context = {
            history: JSON.stringify(history),
            fileList: filesContext
        };
    } else { // PROMPT_TYPE_FOLLOWUP
        context = {
            fileList: filesContext
        };
    }

    const constructedPrompt = await promptService.getFormattedPrompt("AnalysisPrepareNode", promptType, context);
    // dbg(`Prompt Instruction (from PromptService): ${constructedPrompt}`);

    try {
        return await callTheLLM(history, constructedPrompt, modelName);
    } catch (error) {
        console.error("Error in callLLM calling callTheLLM:", error);
        throw new Error("LLM communication failed. Please check logs or API key.");
    }
}

/**
 * Generates and returns the final analysis output after user approval.
 * 
 * This function is called when the user indicates they are satisfied with the analysis
 * and want to see the final summary. It makes a final LLM call to generate a comprehensive
 * analysis based on the full conversation history.
 *
 * @param currentHistory - Array of previous conversation messages between user and agent
 * @param lastUserMessage - The user's final message indicating approval
 * @param state - Current application state containing model name and file contents
 * @returns Promise resolving to a partial state update containing:
 *          - analysisOutput: The final analysis summary
 *          - analysisHistory: Updated conversation history with final messages
 *          - userInput: Cleared
 *          - currentAnalysisQuery: Cleared
 * @throws Error if LLM call fails (caught internally and returns error state)
 */
async function returnFinalOutput(
    currentHistory: HistoryMessage[], 
    lastUserMessage: string, 
    state: AppState,
    promptService?: PromptService // Ensure this matches callLLM if it's passed through
) : Promise<Partial<AppState>> {
    say("Analysis Agent: Solution approved by user.");
    try {
        const modelName = state.modelName; 
        const finalOutput = await callLLM(currentHistory, state.inputs, PROMPT_TYPE_FINAL, modelName, promptService);
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

/**
 * Checks if the user's message indicates they are done with the analysis.
 * 
 * This function looks for specific keywords in the user's message (case-insensitive)
 * to determine if the user has approved the solution or wants to end the interaction.
 *
 * @param userMessage - The message string from the user.
 * @returns `true` if the user's message contains a "done" (or other relevant) keyword, `false` otherwise.
 *
 * @example
 * userIsDone("SOLUTION APPROVED, looks great!"); // true
 * userIsDone("Okay bye for now."); // true
 * userIsDone("What about this other file?"); // false
 */
function userIsDone(userMessage: string) : boolean {
    const doneKeywords = ["SOLUTION APPROVED", "DONE", "OKAY BYE"];
    return doneKeywords.some(keyword => userMessage.toUpperCase().includes(keyword));
}

/**
 * Appends the user's input to the conversation history.
 *
 * If `currentUserInput` is provided, it's added as a new message with `role: 'user'`
 * to the `currentHistory`. This function handles both initializing the history
 * with the first user message and appending to an existing conversation.
 *
 * @param currentHistory - The current array of `HistoryMessage` objects.
 * @param currentUserInput - The string input from the user. If empty or undefined,
 *                           the history is returned unchanged.
 * @returns A new `HistoryMessage` array with the user's input appended, or the
 *          original `currentHistory` if `currentUserInput` was not provided.
 *
 * @example
 * // Initial input
 * addUserInputToHistory([], "Analyze my data.");
 * // Returns: [{ role: 'user', content: "Analyze my data." }]
 *
 * // Follow-up input
 * addUserInputToHistory(
 *   [{ role: 'agent', content: "Which data?" }],
 *   "The sales data."
 * );
 * // Returns: [
 * //   { role: 'agent', content: "Which data?" },
 * //   { role: 'user', content: "The sales data." }
 * // ]
 */
function addUserInputToHistory(currentHistory: HistoryMessage[], currentUserInput: string) : HistoryMessage[]
{

    if (currentUserInput && currentHistory.length > 0) {
        dbg(`Analysis Prepare: Resuming with user input: ${currentUserInput}`);
        // Add user input to history before calling LLM
        currentHistory = currentHistory.concat({ role: 'user', content: currentUserInput });
        // Clear the query now that we've consumed the input for it (in the return state)
    } else if (currentUserInput && currentHistory.length === 0) {
        dbg(`Analysis Prepare: Starting with initial user input: ${currentUserInput}`);
        // Add initial user input to history
        currentHistory = currentHistory.concat({ role: 'user', content: currentUserInput });
    }
    return currentHistory;
}

/**
 * Calls the LLM to determine the next step or question in the analysis conversation.
 *
 * This function orchestrates a call to the LLM using either an 'initial' or 'followup' prompt
 * based on the current conversation history. It then updates the application state with the
 * LLM's response, preparing for a potential user interrupt or further processing.
 *
 * @param currentHistory - The existing conversation history between the user and the agent.
 * @param state - The current application state, providing context like model name and input files.
 * @param promptService - An optional service for formatting prompts. Passed to `callLLM`.
 * @returns A promise that resolves to a partial `AppState` object. This object includes:
 *          - `analysisHistory`: The updated conversation history, including the LLM's latest response.
 *          - `currentAnalysisQuery`: The LLM's response, which will be used as the next query to the user.
 *          - `userInput`: Cleared, as the input for this turn has been processed.
 * @throws Re-throws any errors encountered during the `callLLM` invocation, such as API issues or prompt failures.
 */
async function callLLMForNextStep(
    currentHistory: HistoryMessage[], 
    state: AppState,
    promptService?: PromptService // Ensure this matches callLLM if it's passed through
) : Promise<Partial<AppState>> {
    dbg("Analysis Agent: Thinking...");
    try {
        const modelName = state.modelName;
        // Determine prompt type based on history
        const determinedPromptType: 'initial' | 'followup' = currentHistory.length <= 1 && currentHistory.every(m => m.role === 'user') ? PROMPT_TYPE_INITIAL : PROMPT_TYPE_FOLLOWUP;
        const agentResponse = await callLLM(currentHistory, state.inputs, determinedPromptType, modelName, promptService);
        const agentMsg = { role: 'agent' as const, content: agentResponse };

        // dbg(`Agent response generated: ${agentResponse}`);

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
        throw error;
        
    }
}

/**
 * Prepares and manages the analysis conversation flow between user and agent.
 * 
 * This node handles:
 * 1. Adding new user input to the conversation history
 * 2. Checking if the user has approved/completed the analysis
 * 3. Either generating final output or continuing the conversation with the LLM
 *
 * @param state - The current application state containing user input and conversation history
 * @param config - The LangGraph RunnableConfig, which may contain our AppGraphConfigurable settings
 * @returns Promise<Partial<AppState>> - Updated state with new conversation history, analysis output, or next query
 */
export async function analysisPrepareNode(state: AppState, config: RunnableConfig): Promise<Partial<AppState>> {
    // const appConfigurable = config?.configurable as AppGraphConfigurable | undefined;
    const appConfigurable : AppRunnableConfig = safeAppConfig(config);
    const promptService = appConfigurable?.configurable?.promptService;
    dbg(`analysisPrepareNode received promptService via RunnableConfig: ${!!promptService}`);

    dbg("--- Analysis Prepare Node Running ---");

    // Error handling for missing inputs, as per Step 12
    // Assuming that if `analysisPrepareNode` is reached in an analysis flow, inputs are expected.
    if (!state.inputs || Object.keys(state.inputs).length === 0) {
        const errorMessage = "Critical Error: Input documents (state.inputs) were not found or are empty. Analysis cannot proceed.";
        console.error(`AnalysisPrepareNode: ${errorMessage}`);
        // Return a state that should lead to END, with analysisOutput indicating the error.
        return {
            analysisOutput: errorMessage,
            analysisHistory: state.analysisHistory ? state.analysisHistory.concat([{ role: 'agent', content: errorMessage }]) : [{ role: 'agent', content: errorMessage }],
            userInput: "", // Clear input
            currentAnalysisQuery: "" // Clear query
        };
    }

    const currentUserInput = state.userInput;
    let currentHistory: HistoryMessage[] = state.analysisHistory || [];
    
    currentHistory = addUserInputToHistory(currentHistory, currentUserInput);
    
    const lastUserMessageContent = currentHistory.filter(m => m.role === 'user').pop()?.content || "";
    if (userIsDone(lastUserMessageContent)) {
        return await returnFinalOutput(currentHistory, lastUserMessageContent, state, promptService);
    }

    dbg("Analysis Prepare: Calling LLM for next step.");
    return await callLLMForNextStep(currentHistory, state, promptService);
}