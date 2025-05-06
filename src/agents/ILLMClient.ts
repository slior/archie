import { Role } from './graph';

// Expand Role slightly for internal use by clients if needed,
// while the main callLLM function uses the stricter 'user' | 'agent'.
type ExtendedRole = Role | 'assistant' | 'system';

export type ChatMessage = {
    role: ExtendedRole;
    content: string;
};

export interface ILLMClient {
    /**
     * Calls the underlying LLM provider's chat completions API.
     *
     * @param history The conversation history (already mapped to provider roles).
     * @param prompt The specific user prompt for this turn.
     * @param options Optional parameters like model name.
     * @returns The content of the LLM's response.
     * @throws Error on API errors or missing configuration.
     */
    chatCompletion(
        // Expect history mapped to roles like 'user', 'assistant'
        history: Array<ChatMessage>, 
        prompt: string, // Pass prompt separately
        options?: { modelName?: string }
    ): Promise<string>;
} 