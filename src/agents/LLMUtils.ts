import * as dotenv from 'dotenv';
import { dbg } from "../utils";
import { OpenAIClient } from './OpenAIClient';
import { ILLMClient, ChatMessage } from './ILLMClient';
import { Role } from './graph';

// Load environment variables
dotenv.config();

// Define and export HistoryMessage type
export type HistoryMessage = { role: Role; content: string };

// Singleton instance for the LLM client
let clientInstance: ILLMClient | null = null;

/**
 * Factory function to get the configured LLM client instance.
 * Creates the instance on first call based on environment variables.
 * @returns The singleton instance of the configured ILLMClient.
 * @throws Error if the required API key for the selected provider is missing.
 */
export function getLLMClient(): ILLMClient {
    if (clientInstance) {
        return clientInstance;
    }

    try {
        clientInstance = new OpenAIClient();
    } catch (error) {
         console.error(`Failed to initialize OpenAIClient: ${error}`);
        throw error; // Re-throw error after logging
    }

    return clientInstance;
}

/**
 * Calls the configured LLM provider's Chat Completions API.
 * 
 * @param history The conversation history, using internal roles ('user', 'agent').
 * @param prompt The specific user prompt/instruction for this turn.
 * @param modelName Optional model name to override the provider's default.
 * @returns The content of the LLM's response.
 * @throws Error if API key is missing, API call fails, or response is empty.
 */
export async function callTheLLM(
    // Use internal Role type for input history
    history: HistoryMessage[], // Updated to use the exported HistoryMessage type
    prompt: string,
    modelName?: string
): Promise<string> {
    const client = getLLMClient();

    // Map internal roles ('user', 'agent') to standard roles ('user', 'assistant') 
    // expected by the client interface (ChatMessage type)
    const mappedHistory: ChatMessage[] = history.map(msg => ({
        role: msg.role === 'agent' ? 'assistant' : 'user',
        content: msg.content
    }));

    // Determine the effective model name. Pass undefined to let clients handle defaults.
    const effectiveModel = modelName && modelName.trim() !== '' ? modelName : undefined;

    try {
        dbg(`Model requested: ${effectiveModel || 'Provider Default'}`);
        
        // Call the client's chatCompletion method, passing mapped history and the prompt separately
        const responseContent = await client.chatCompletion(mappedHistory, prompt, { modelName: effectiveModel });
        
        dbg('--- LLM Call Complete ---');

        // Basic check if response is valid (client implementations should ensure non-empty responses)
        if (!responseContent) {
            console.warn("LLM call returned empty content.");
            throw new Error("LLM call returned empty content.");
        }

        return responseContent;
    } catch (error: any) {
        // Log the error centrally
        console.error("Error during LLM call:", error);
        // Rethrow a standardized error message
        throw new Error(`LLM API call failed: ${error.message}`);
    }
} 