import * as dotenv from 'dotenv';
import { dbg } from "../utils";
import { OpenAIClient } from './OpenAIClient';
import { LiteLLMClient } from './LiteLLMClient';
import { ILLMClient, ChatMessage } from './ILLMClient';
import { Role } from './graph';
import { 
    LLM_PROVIDER_ENV_VAR, 
    OPENAI_PROVIDER, 
    LITELLM_PROVIDER, 
    OPENAI_API_KEY_ENV_VAR, 
    LITELLM_API_KEY_ENV_VAR, 
    DEFAULT_MODEL_NAME
} from './llmConstants';

// Load environment variables
dotenv.config();

// Keep the default model exported if other parts of the code might use it
export const DEFAULT_MODEL = DEFAULT_MODEL_NAME; 

// Singleton instance for the LLM client
let clientInstance: ILLMClient | null = null;

/**
 * Factory function to get the configured LLM client instance.
 * Creates the instance on first call based on environment variables.
 * @returns The singleton instance of the configured ILLMClient.
 * @throws Error if the required API key for the selected provider is missing.
 */
function getLLMClient(): ILLMClient {
    if (clientInstance) {
        return clientInstance;
    }

    const provider = process.env[LLM_PROVIDER_ENV_VAR]?.toLowerCase();

    if (provider === LITELLM_PROVIDER) {
        console.log("Using LiteLLM provider.");
        // Check for LiteLLM key existence here for early warning,
        // although the client constructor will throw the error.
        if (!process.env[LITELLM_API_KEY_ENV_VAR]) {
             console.warn(`${LITELLM_API_KEY_ENV_VAR} is not set. LiteLLMClient might fail if it requires it (e.g., for a proxy).`);
             // Note: We don't throw here, let the client constructor handle the strict requirement.
        }
        try {
            clientInstance = new LiteLLMClient();
        } catch (error) {
            console.error(`Failed to initialize LiteLLMClient: ${error}`);
            throw error; // Re-throw error after logging
        }
    } else {
        if (provider && provider !== OPENAI_PROVIDER) {
             console.warn(`Unrecognized ${LLM_PROVIDER_ENV_VAR} "${provider}". Defaulting to OpenAI.`);
        }
        console.log("Using OpenAI provider (default)." );
         // Check for OpenAI key existence here for early warning.
        if (!process.env[OPENAI_API_KEY_ENV_VAR]) {
            console.warn(`${OPENAI_API_KEY_ENV_VAR} is not set. OpenAIClient initialization will fail.`);
            // Note: Let OpenAIClient constructor throw the actual error.
        }
        try {
            clientInstance = new OpenAIClient();
        } catch (error) {
             console.error(`Failed to initialize OpenAIClient: ${error}`);
            throw error; // Re-throw error after logging
        }
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
    history: Array<{ role: Role; content: string }>, 
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
        // Use dbg for logging the call details
        const providerName = process.env[LLM_PROVIDER_ENV_VAR]?.toLowerCase() || OPENAI_PROVIDER;
        dbg(`\n--- Calling LLM provider (${providerName}) ---`);
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