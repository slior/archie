import { AppState, Role, safeAppConfig } from "./graph";
import { AppGraphConfigurable, AppRunnableConfig, dbg, say } from "../utils";
import { callTheLLM, HistoryMessage } from './LLMUtils'; // Import HistoryMessage from LLMUtils
import { summarizeFiles } from './agentUtils';
import { PromptService } from "../services/PromptService";
import { RunnableConfig } from "@langchain/core/runnables";

/**
 * Context Building Agent Node
 * 
 * This node is responsible for building a context for the system.
 * It takes the input files and summarizes them into a single context string.
 * 
 */
export async function contextBuildingAgentNode(state: AppState, config: RunnableConfig): Promise<Partial<AppState>> {
    const appConfigurable : AppRunnableConfig = safeAppConfig(config);
    const promptService = appConfigurable?.configurable?.promptService;

    dbg("--- Context Building Agent Node Running ---");

    if (!promptService) {
        // This safeguard is important as PromptService is critical here.
        const errMsg = "Critical Error: PromptService not available in ContextBuildingAgentNode.";
        console.error(errMsg);
        throw new Error(errMsg);
    }

    if (!state.inputs || Object.keys(state.inputs).length === 0) {
        const errMsg = "Critical Error: Input documents (state.inputs) were not found or are empty. Context building cannot proceed.";
        console.error(`ContextBuildingAgentNode: ${errMsg}`);
        throw new Error(errMsg);
    }

    if (!state.systemName) {
        const errMsg = "Critical Error: System name (state.systemName) not found. Context building cannot proceed.";
        console.error(`ContextBuildingAgentNode: ${errMsg}`);
        throw new Error(errMsg);
    }

    try {
        const fileSummaries = summarizeFiles(state.inputs);
        const promptType = 'context_build';
        const promptContext = {
            systemName: state.systemName,
            fileSummaries: fileSummaries,
        };

        const constructedPrompt = await promptService.getFormattedPrompt("ContextBuildingAgentNode", promptType, promptContext);
        const llmHistory: HistoryMessage[] = []; // Context building is a one-shot summary, no prior history
        
        dbg(`ContextBuildingAgentNode: Calling LLM for system: ${state.systemName}`);
        const llmResponse = await callTheLLM(llmHistory, constructedPrompt, state.modelName);
        dbg(`ContextBuildingAgentNode: LLM response received for system: ${state.systemName}`);

        const outputFileName = `${state.systemName}_context.md`;

        return {
            contextBuilderOutputContent: llmResponse,
            contextBuilderOutputFileName: outputFileName,
            userInput: "" // Clear userInput for this flow as it's processed
        };
    } catch (error) {
        console.error(`Error in ContextBuildingAgentNode for system ${state.systemName}:`, error);
        // Propagate the error to be handled by the command layer
        throw new Error(`LLM communication or processing failed during context building for ${state.systemName}. Original error: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Placeholder for the contextBuildingAgentNode function to be implemented in Step 7
// export async function contextBuildingAgentNode(state: AppState, config?: RunnableConfig): Promise<Partial<AppState>> {
//    // Logic will be added in the next step
//    return {}; 
// } 