import { AppState } from "./graph";
import { AppGraphConfigurable, dbg } from "../utils";
import { callTheLLM } from './LLMUtils';
import { summarizeFiles, buildSystemPrompt, parseLLMResponse, processLLMResponse } from './agentUtils';
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
    };

    const constructedPrompt = await promptService.getFormattedPrompt("ContextBuildingAgentNode", promptType, promptContext);


    try {
        // Build system prompt with context injection
        const systemPrompt = buildSystemPrompt(memoryService);
        
        //there's no history for this node, so we pass an empty array. The system prompt is injected at the beginning of the conversation.
        const llmResponse = await callTheLLM([], constructedPrompt, state.modelName, systemPrompt);

        const parsedResponse = parseLLMResponse(llmResponse);
        const updatedMemoryService = processLLMResponse(parsedResponse, memoryService);
        dbg(`Updated Memory Service: ${updatedMemoryService.getContextAsString()}`);

        const agentResponseText = parsedResponse.agentResponse || llmResponse;

        // Prepare output
        const outputFileName = `${state.systemName}_context.md`;

        // Return updated state
        return {
            contextBuilderOutputContent: agentResponseText,
            contextBuilderOutputFileName: outputFileName,
            userInput: "", // Clear userInput as it's been processed
            system_context: updatedMemoryService.getCurrentState()
        };
    } catch (error) {
        console.error("Error in ContextBuildingAgentNode LLM call:", error);
        throw new Error("LLM communication failed during context building.");
    }
}
