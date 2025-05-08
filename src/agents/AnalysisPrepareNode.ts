import { AppState, Role } from "./graph";
import { AppGraphConfigurable, AppRunnableConfig, dbg, say } from "../utils";
import { callTheLLM } from './LLMUtils'; // Import the OpenAI utility
import * as path from 'path'; // Import path here
import { PromptService } from "../services/PromptService"; // Added PromptService import
import { RunnableConfig } from "@langchain/core/runnables"; // Import RunnableConfig

// Define the type for history based on AppState Role
type HistoryMessage = { role: Role; content: string };

const PROMPT_TYPE_INITIAL = 'initial';
const PROMPT_TYPE_FOLLOWUP = 'followup';
const PROMPT_TYPE_FINAL = 'final';
/**
 * Represents the type of prompt to generate for the LLM.
 * - PROMPT_TYPE_INITIAL: Used for the first interaction to understand the user's analysis goals
 * - PROMPT_TYPE_FOLLOWUP: Used for continuing the conversation and gathering more details
 * - PROMPT_TYPE_FINAL: Used to generate the final analysis summary
 */
type PromptType = typeof PROMPT_TYPE_INITIAL | typeof PROMPT_TYPE_FOLLOWUP | typeof PROMPT_TYPE_FINAL;

/**
 * Summarizes the contents of multiple files into a single formatted string.
 * 
 * @param files - An object mapping file paths to their contents
 * @returns A formatted string containing summaries of all files, with each file's content
 *          truncated to 1000 characters if needed. Returns "No file content provided" if
 *          the files object is empty.
 * 
 * Each file summary is formatted as:
 * --- File: filename.ext ---
 * [file contents]
 * 
 * Files are separated by double newlines in the output.
 */
function summarizeFiles(files: Record<string, string>): string {
    const summaries: string[] = [];
    const MAX_LENGTH = 1000;

    if (Object.keys(files).length === 0) {
        return "No file content provided.";
    }

    for (const [filePath, content] of Object.entries(files)) {
        const basename = path.basename(filePath);
        let displayContent = content;
        if (content.length > MAX_LENGTH) {
            displayContent = content.substring(0, MAX_LENGTH) + '... [truncated]';
        }
        const fileSummary = `--- File: ${basename} ---\n${displayContent}`;
        summaries.push(fileSummary);
    }

    return summaries.join('\n\n');
}

/**
 * Generates a prompt for the LLM based on the prompt type, conversation history, and available files.
 * 
 * @param promptType - The type of prompt to generate (initial, followup, or final)
 * @param history - Array of previous conversation messages between user and agent
 * @param files - Record of filenames and their contents that provide context
 * @returns A constructed prompt string appropriate for the given prompt type
 * 
 * The function handles three types of prompts:
 * - Initial: Creates a prompt to analyze the user's first query and understand analysis goals
 * - Followup: Creates a prompt to continue the analysis based on ongoing conversation
 * - Final: Creates a prompt to generate a comprehensive summary of the analysis
 * 
 * For initial prompts, it includes detailed file summaries.
 * For followup and final prompts, it includes file names for context.
 * The function uses debug logging to track prompt construction.
 */
function getPrompt(promptType: PromptType, history: HistoryMessage[], files: Record<string, string>) : string
{
    dbg(`\n--- Constructing LLM Prompt (Type: ${promptType}) ---`);
    let constructedPrompt: string;
    // Define fileList here so it's available to all branches
    const fileList = Object.keys(files).map(p => path.basename(p)).join(', ') || 'None';

    // Use history directly (callLLM expects the full history)
    // The prompt passed to callLLM is the specific instruction for *this* turn.

    if (promptType === PROMPT_TYPE_INITIAL) {
        const firstUserMessage = history.find(m => m.role === 'user')?.content || '(No initial query found)';
        const fileSummaries = summarizeFiles(files); // Call the summarizer
        // Use fileSummaries in the prompt instead of fileList
        constructedPrompt = `Analyze the user query based on the following file summaries:\n\n${fileSummaries}\n\nUser's initial query: "${firstUserMessage}".\n\nWhat is the primary goal for this analysis? Ask clarifying questions if needed.`;
    } else if (promptType === PROMPT_TYPE_FINAL) {
        // Construct detailed final summary prompt (uses fileList for context)
        constructedPrompt = `Based on the following conversation history: ${JSON.stringify(history)} and the context of files: [${fileList}], generate a final analysis summary for the user. The summary should include (if possible based on the conversation):
        - Identified assumptions
        - Identified main components involved
        - Discussed alternatives with tradeoffs
        - Summary of design decisions reached and why
        - A list of any open questions remaining.
        Provide only the summary content.`;
    } else { // PROMPT_TYPE_FOLLOWUP
        // For follow-up, the history contains the context. The prompt should guide the LLM on what to do next.
        // We pass the full history to callLLM, and this prompt acts as the latest instruction.
        // Uses fileList for context.
        constructedPrompt = `Continue the analysis based on the latest user message in the history. Files provided: [${fileList}]. Ask further clarifying questions or provide analysis as appropriate.`;
    }
    dbg(`Constructed prompt:\n${constructedPrompt}`);
    return constructedPrompt;
}


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
    files: Record<string, string>,
    promptKey: PromptType, // Changed name from promptType to promptKey for clarity
    modelName: string,
    promptService?: PromptService
): Promise<string> {
    
    dbg(`callLLM received promptService: ${!!promptService}, using promptKey: ${promptKey}`);
    
    if (!promptService) {
        // This should ideally not happen if the service is correctly injected everywhere.
        // However, as a safeguard during transition or if a call path misses it:
        say("Warning: PromptService not available in callLLM. LLM call might fail or use basic prompts.");
        // Fallback to a very basic instruction or throw an error specific to this missing service.
        // For now, let it proceed and potentially fail at callTheLLM if prompt is not adequate.
        // Or, throw new Error("PromptService is required but not provided to callLLM.");
        // Let's try to make a very basic prompt if service is missing for now, rather than erroring hard here.
        const basicFallbackPrompt = `User query based on history: ${JSON.stringify(history)}. Files: ${Object.keys(files).join(', ') || 'None'}.`;
        dbg(`Prompt Instruction (fallback due to missing PromptService): ${basicFallbackPrompt}`);
        return await callTheLLM(history, basicFallbackPrompt, modelName);
    }

    let context: Record<string, any> = {};
    const fileListString = Object.keys(files).map(p => path.basename(p)).join(', ') || 'None';

    if (promptKey === PROMPT_TYPE_INITIAL) {
        context = {
            fileSummaries: summarizeFiles(files),
            firstUserMessage: history.find(m => m.role === 'user')?.content || '(No initial query found)'
        };
    } else if (promptKey === PROMPT_TYPE_FINAL) {
        context = {
            history: JSON.stringify(history),
            fileList: fileListString
        };
    } else { // PROMPT_TYPE_FOLLOWUP
        context = {
            fileList: fileListString
        };
    }

    const constructedPrompt = await promptService.getFormattedPrompt("AnalysisPrepareNode", promptKey, context);
    dbg(`Prompt Instruction (from PromptService): ${constructedPrompt}`);

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
    promptService?: PromptService
) : Promise<Partial<AppState>> {
    say("Analysis Agent: Solution approved by user.");
    try {
        const modelName = state.modelName; 
        const finalOutput = await callLLM(currentHistory, state.fileContents, PROMPT_TYPE_FINAL, modelName, promptService);
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

async function callLLMForNextStep(
    currentHistory: HistoryMessage[], 
    state: AppState,
    promptService?: PromptService
) : Promise<Partial<AppState>> {
    dbg("Analysis Agent: Thinking...");
    try {
        const modelName = state.modelName;
        // Determine prompt type based on history
        const promptType = currentHistory.length <= 1 && currentHistory.every(m => m.role === 'user') ? PROMPT_TYPE_INITIAL : PROMPT_TYPE_FOLLOWUP;
        const agentResponse = await callLLM(currentHistory, state.fileContents, promptType, modelName, promptService); // Pass promptService and corrected promptType
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
export async function analysisPrepareNode(state: AppState, config?: RunnableConfig): Promise<Partial<AppState>> {
    const appConfigurable = config?.configurable as AppGraphConfigurable | undefined;
    const promptService = appConfigurable?.promptService;
    dbg(`analysisPrepareNode received promptService via RunnableConfig: ${!!promptService}`);

    dbg("--- Analysis Prepare Node Running ---");
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