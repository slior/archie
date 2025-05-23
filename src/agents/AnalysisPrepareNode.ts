import { AppState, safeAppConfig } from "./graph";
import { AppGraphConfigurable, dbg, say } from "../utils";
import { callTheLLM, HistoryMessage } from './LLMUtils'; // Import HistoryMessage from LLMUtils

import { PromptService } from "../services/PromptService"; // Added PromptService import
import { RunnableConfig } from "@langchain/core/runnables"; // Import RunnableConfig
import { summarizeFiles } from './agentUtils'; // Import summarizeFiles from agentUtils
import { MemoryService } from "../memory/MemoryService";
import { Entity, Relationship } from "../memory/memory_types"; // Import proper types

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
 * Interface representing the result of parsing an LLM response with agent and system sections.
 */
export interface ParsedLLMResponse {
    /** The agent's response to the user (content from <agent> tag) */
    agentResponse: string;
    /** Parsed system context containing entities and relationships (content from <system> tag) */
    systemContext: {
        entities: Entity[];
        relationships: Relationship[];
    } | null;
    /** Any warnings encountered during parsing */
    warnings: string[];
}

/**
 * Parses an LLM response that may contain <agent> and <system> tags.
 * 
 * The function expects the response to be in the format:
 * ```
 * <agent>
 * Agent response content here
 * </agent>
 * 
 * <system>
 * {
 *   "entities": [...],
 *   "relationships": [...]
 * }
 * </system>
 * ```
 * 
 * If either section is missing, the function will warn but not fail.
 * If the entire response lacks both tags, it treats the whole response as the agent response.
 * 
 * @param llmResponse - The raw response string from the LLM
 * @returns ParsedLLMResponse object containing the parsed agent response, system context, and any warnings
 */
export function parseLLMResponse(llmResponse: string): ParsedLLMResponse {
    const result: ParsedLLMResponse = {
        agentResponse: '',
        systemContext: null,
        warnings: []
    };

    // Check if the response contains the expected tags
    const hasAgentTag = llmResponse.includes('<agent>') && llmResponse.includes('</agent>');
    const hasSystemTag = llmResponse.includes('<system>') && llmResponse.includes('</system>');

    if (!hasAgentTag && !hasSystemTag) {
        // No tags found, treat entire response as agent response
        result.agentResponse = llmResponse.trim();
        result.warnings.push('No <agent> or <system> tags found in LLM response. Treating entire response as agent response.');
        return result;
    }

    // Extract agent section
    if (hasAgentTag) {
        const agentMatch = llmResponse.match(/<agent>([\s\S]*?)<\/agent>/);
        if (agentMatch) {
            result.agentResponse = agentMatch[1].trim();
        } else {
            result.warnings.push('Found <agent> tag but could not extract content properly.');
        }
    } else {
        result.warnings.push('No <agent> section found in LLM response.');
    }

    // Extract system section
    if (hasSystemTag) {
        const systemMatch = llmResponse.match(/<system>([\s\S]*?)<\/system>/);
        if (systemMatch) {
            const systemContent = systemMatch[1].trim();
            try {
                // Try to parse as JSON
                const parsed = JSON.parse(systemContent);
                
                // Validate the structure
                if (typeof parsed === 'object' && parsed !== null) {
                    // Process entities with defaults for missing fields
                    const entities: Entity[] = [];
                    if (Array.isArray(parsed.entities)) {
                        for (const entity of parsed.entities) {
                            if (typeof entity === 'object' && entity !== null && entity.name && entity.type) {
                                entities.push({
                                    name: entity.name,
                                    description: entity.description || '',
                                    type: entity.type,
                                    tags: Array.isArray(entity.tags) ? entity.tags : [],
                                    properties: entity.properties && typeof entity.properties === 'object' ? entity.properties : {}
                                });
                            } else {
                                result.warnings.push(`Skipping invalid entity: missing required name or type fields.`);
                            }
                        }
                    } else if (parsed.entities !== undefined) {
                        result.warnings.push('System context entities is not an array. Using empty array.');
                    }
                    
                    // Process relationships with defaults for missing fields
                    const relationships: Relationship[] = [];
                    if (Array.isArray(parsed.relationships)) {
                        for (const relationship of parsed.relationships) {
                            if (typeof relationship === 'object' && relationship !== null && 
                                relationship.from && relationship.to && relationship.type) {
                                relationships.push({
                                    from: relationship.from,
                                    to: relationship.to,
                                    type: relationship.type,
                                    properties: relationship.properties && typeof relationship.properties === 'object' ? relationship.properties : {}
                                });
                            } else {
                                result.warnings.push(`Skipping invalid relationship: missing required from, to, or type fields.`);
                            }
                        }
                    } else if (parsed.relationships !== undefined) {
                        result.warnings.push('System context relationships is not an array. Using empty array.');
                    }
                    
                    result.systemContext = {
                        entities,
                        relationships
                    };
                } else {
                    result.warnings.push('System context is not a valid object. Ignoring system context.');
                }
            } catch (parseError) {
                result.warnings.push(`Failed to parse system context as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Ignoring system context.`);
            }
        } else {
            result.warnings.push('Found <system> tag but could not extract content properly.');
        }
    } else if (hasAgentTag) {
        // Only warn about missing system tag if agent tag was present (indicating structured response was expected)
        result.warnings.push('No <system> section found in LLM response.');
    }

    return result;
}

/**
 * Processes an LLM response by logging warnings and updating memory service.
 * 
 * This function handles the complete processing of a parsed LLM response:
 * - Logs any warnings encountered during parsing
 * - Updates the memory service with entities and relationships from system context
 * 
 * @param parsedResponse - The parsed LLM response containing agent response, system context, and warnings
 * @param memoryService - The memory service instance to update
 * @returns The updated memory service instance (same instance, modified in place)
 */
export function processLLMResponse(
    parsedResponse: ParsedLLMResponse,
    memoryService: MemoryService
): MemoryService {
    // Log any warnings from parsing
    if (parsedResponse.warnings.length > 0) {
        parsedResponse.warnings.forEach(warning => {
            dbg(`Warning: ${warning}`);
        });
    }
    
    // Update memory service with entities and relationships if present
    return updateMemoryWithSystemContext(memoryService, parsedResponse.systemContext);
}

/**
 * Updates the memory service with entities and relationships from parsed system context.
 * 
 * This function processes the system context extracted from an LLM response and adds
 * the entities and relationships to the provided memory service. It handles errors
 * gracefully and provides debug logging for successful operations and warnings.
 * 
 * @param memoryService - The memory service instance to update
 * @param systemContext - The parsed system context containing entities and relationships, or null
 * @returns The updated memory service instance (same instance, modified in place)
 */
export function updateMemoryWithSystemContext(
    memoryService: MemoryService,
    systemContext: ParsedLLMResponse['systemContext']
): MemoryService {
    if (!systemContext) {
        return memoryService;
    }

    // Add entities to memory service
    if (systemContext.entities.length > 0) {
        for (const entity of systemContext.entities) {
            try {
                memoryService.addOrUpdateEntity(entity);
                dbg(`Added/updated entity: ${entity.name} (type: ${entity.type})`);
            } catch (error) {
                dbg(`Warning: Failed to add entity ${entity.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    }
    
    // Add relationships to memory service
    if (systemContext.relationships.length > 0) {
        for (const relationship of systemContext.relationships) {
            try {
                const success = memoryService.addOrUpdateRelationship(relationship);
                if (success) {
                    dbg(`Added relationship: ${relationship.from} --[${relationship.type}]--> ${relationship.to}`);
                } else {
                    dbg(`Warning: Failed to add relationship from ${relationship.from} to ${relationship.to} of type ${relationship.type}`);
                }
            } catch (error) {
                dbg(`Warning: Error adding relationship from ${relationship.from} to ${relationship.to}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    }

    return memoryService;
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
    inputs: Record<string, string> | undefined,
    promptType: 'initial' | 'followup' | 'final',
    modelName: string,
    memoryService: MemoryService,
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


    context.systemContext = memoryService.getContextAsString();
    // dbg(`Context: ${JSON.stringify(context)}`);
    dbg(`System Context: ${memoryService.getContextAsString()}`);
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
        const memoryService = MemoryService.fromState(state.system_context);
        const finalOutput = await callLLM(currentHistory, state.inputs, PROMPT_TYPE_FINAL, modelName, memoryService, promptService);
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
        const determinedPromptType = currentHistory.length <= 1 && currentHistory.every(m => m.role === 'user') ? PROMPT_TYPE_INITIAL : PROMPT_TYPE_FOLLOWUP;
        const memoryService = MemoryService.fromState(state.system_context);
        const rawLLMResponse = await callLLM(currentHistory, state.inputs, determinedPromptType, modelName, memoryService, promptService);
        
        // Parse the LLM response to extract agent response and system context
        const parsedResponse = parseLLMResponse(rawLLMResponse);
        
        // Process the LLM response (log warnings and update memory service)
        const updatedMemoryService = processLLMResponse(parsedResponse, memoryService);
        dbg(`Updated Memory Service: ${updatedMemoryService.getContextAsString()}`);
        
        // Use the parsed agent response (or fallback to raw response if parsing failed)
        const agentResponseText = parsedResponse.agentResponse || rawLLMResponse;
        const agentMsg = { role: 'agent' as const, content: agentResponseText };

        // Prepare the state update to be returned for the interrupt node
        const stateUpdate: Partial<AppState> = {
            // Update history INCLUDING the latest agent response
            analysisHistory: currentHistory.concat(agentMsg),
            currentAnalysisQuery: agentResponseText, // Store the agent's response/question for interrupt
            userInput: "", // Clear the input used in this turn
            system_context: updatedMemoryService.getCurrentState() // Update the system context with new entities/relationships
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
    const promptService = (config?.configurable as AppGraphConfigurable)?.promptService;
    if (!promptService) {
        throw new Error("Critical Error: PromptService not found in config. Analysis cannot proceed.");
    }

    dbg("--- Analysis Prepare Node Running ---");

    // Input validation
    if (!state.inputs || Object.keys(state.inputs).length === 0) {
        dbg("Error: Input documents (state.inputs) were not found or are empty.");
        throw new Error("Critical Error: Input documents (state.inputs) were not found or are empty. Analysis cannot proceed.");
    }

    // Summarize input files
    // const fileSummaries = summarizeFiles(state.inputs);

    // const memoryService = MemoryService.fromState(state.system_context);

    // Prepare LLM call
    // const promptType = 'analysis_prepare';
    // const promptContext = {
    //     query: state.currentAnalysisQuery,
    //     fileSummaries: fileSummaries,
    //     systemContext: memoryService.getContextAsString(), // Add system context to prompt
    // };

    const currentUserInput = state.userInput;
    let currentHistory: HistoryMessage[] = state.analysisHistory || [];
    
    currentHistory = addUserInputToHistory(currentHistory, currentUserInput);
    
    const lastUserMessageContent = currentHistory.filter(m => m.role === 'user').pop()?.content || "";
    if (userIsDone(lastUserMessageContent)) {
        return await returnFinalOutput(currentHistory, lastUserMessageContent, state, promptService);
    }

    dbg("Analysis Prepare: Calling LLM for next step.");
    const llmResponse = await callLLMForNextStep(currentHistory, state, promptService);

    return llmResponse;

    // const constructedPrompt = await promptService.getFormattedPrompt("AnalysisPrepareNode", promptType, promptContext);

    // // History for LLM
    // const llmHistory: HistoryMessage[] = [];

    // try {
    //     // Call LLM
    //     const llmResponse = await callTheLLM(llmHistory, constructedPrompt, state.modelName);

    //     // Parse LLM response for entities and relationships
    //     try {
    //         const parsedResponse = JSON.parse(llmResponse);
    //         if (parsedResponse.entities && Array.isArray(parsedResponse.entities)) {
    //             for (const entity of parsedResponse.entities) {
    //                 memoryService.addOrUpdateEntity(entity);
    //             }
    //         }
    //         if (parsedResponse.relationships && Array.isArray(parsedResponse.relationships)) {
    //             for (const relationship of parsedResponse.relationships) {
    //                 const success = memoryService.addOrUpdateRelationship(relationship);
    //                 if (!success) {
    //                     dbg(`Warning: Failed to add relationship from ${relationship.from} to ${relationship.to} of type ${relationship.type}`);
    //                 }
    //             }
    //         }
    //     } catch (parseError) {
    //         dbg(`Warning: Could not parse LLM response for entities/relationships: ${parseError}`);
    //     }

    //     // Return updated state
    //     return {
    //         analysisOutput: llmResponse,
    //         userInput: "" // Clear userInput as it's been processed
    //     };
    // } catch (error) {
    //     console.error("Error in AnalysisPrepareNode LLM call:", error);
    //     throw new Error("LLM communication failed during analysis preparation.");
    // }
}