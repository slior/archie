import { AppState, Role, safeAppConfig } from "./graph";
import { AppGraphConfigurable, AppRunnableConfig, dbg, say } from "../utils";
import { callTheLLM, HistoryMessage } from './LLMUtils'; // Import HistoryMessage from LLMUtils
import { summarizeFiles } from './agentUtils';
import { PromptService } from "../services/PromptService";
import { RunnableConfig } from "@langchain/core/runnables";
import { MemoryService } from "../memory/MemoryService";

/**
 * Context Building Agent Node
 * 
 * This node is responsible for building a context for the system.
 * It takes the input files and summarizes them into a single context string.
 * 
 */
export async function contextBuildingAgentNode(state: AppState, config?: RunnableConfig): Promise<Partial<AppState>> {
    const promptService = (config?.configurable as AppGraphConfigurable)?.promptService;
    if (!promptService) {
        throw new Error("Critical Error: PromptService not found in config. Context building cannot proceed.");
    }

    dbg("--- Context Building Agent Node Running ---");

    // Input validation
    if (!state.inputs || Object.keys(state.inputs).length === 0) {
        dbg("Error: Input documents (state.inputs) were not found or are empty.");
        throw new Error("Critical Error: Input documents (state.inputs) were not found or are empty. Context building cannot proceed.");
    }
    if (!state.systemName) {
        dbg("Error: System name (state.systemName) not found.");
        throw new Error("Critical Error: System name (state.systemName) not found. Context building cannot proceed.");
    }

    // Summarize input files
    const fileSummaries = summarizeFiles(state.inputs);

    // Prepare LLM call
    const promptType = 'context_build';

    const memoryService = MemoryService.fromState(state.system_context);
    
    const promptContext = {
        systemName: state.systemName,
        fileSummaries: fileSummaries,
        systemContext: memoryService.getContextAsString(), // Add system context to prompt
    };

    const constructedPrompt = await promptService.getFormattedPrompt("ContextBuildingAgentNode", promptType, promptContext);

    // History for LLM
    const llmHistory: HistoryMessage[] = [];

    try {
        const llmResponse = await callTheLLM(llmHistory, constructedPrompt, state.modelName);

        // Parse LLM response for entities and relationships
        try {
            const parsedResponse = JSON.parse(llmResponse);
            if (parsedResponse.entities && Array.isArray(parsedResponse.entities)) {
                for (const entity of parsedResponse.entities) {
                    memoryService.addOrUpdateEntity(entity);
                }
            }
            if (parsedResponse.relationships && Array.isArray(parsedResponse.relationships)) {
                for (const relationship of parsedResponse.relationships) {
                    const success = memoryService.addOrUpdateRelationship(relationship);
                    if (!success) {
                        dbg(`Warning: Failed to add relationship from ${relationship.from} to ${relationship.to} of type ${relationship.type}`);
                    }
                }
            }
        } catch (parseError) {
            dbg(`Warning: Could not parse LLM response for entities/relationships: ${parseError}`);
        }

        // Prepare output
        const outputFileName = `${state.systemName}_context.md`;

        // Return updated state
        return {
            contextBuilderOutputContent: llmResponse,
            contextBuilderOutputFileName: outputFileName,
            userInput: "", // Clear userInput as it's been processed
            system_context: memoryService.getCurrentState()
        };
    } catch (error) {
        console.error("Error in ContextBuildingAgentNode LLM call:", error);
        throw new Error("LLM communication failed during context building.");
    }
}
