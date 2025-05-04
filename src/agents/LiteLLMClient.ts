import * as litellm from 'litellm';
import * as dotenv from 'dotenv';
import { ILLMClient, ChatMessage } from "./ILLMClient";
import { LITELLM_API_KEY_ENV_VAR, DEFAULT_MODEL_NAME } from "./llmConstants";
import { dbg } from "../utils";

// Load environment variables
dotenv.config();

export class LiteLLMClient implements ILLMClient {
    private apiKey: string | undefined;

    constructor() {
        // LiteLLM can often infer keys from environment (e.g., OPENAI_API_KEY)
        // However, if a specific LITELLM_API_KEY is provided (e.g., for a proxy),
        // we store it to pass explicitly.
        this.apiKey = process.env[LITELLM_API_KEY_ENV_VAR];
        if (this.apiKey) {
            dbg(`Found ${LITELLM_API_KEY_ENV_VAR}, will pass it to litellm.`);
        } else {
             dbg(`${LITELLM_API_KEY_ENV_VAR} not found. Relying on provider-specific keys (e.g., OPENAI_API_KEY) for litellm.`);
        }
    }

    async chatCompletion(
        history: ChatMessage[],
        prompt: string,
        options?: { modelName?: string }
    ): Promise<string> {

        // Combine history with the current prompt as the last user message
        // Ensure roles are compatible with LiteLLM ('user' or 'assistant')
        const messages = [
            ...history.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant', // Already mapped in callLLM
                content: msg.content
            })),
            { role: 'user', content: prompt }
        ];

        try {
            // Determine effective model, using default if not provided
            const effectiveModel = options?.modelName && options.modelName.trim() !== '' 
                ? options.modelName 
                : DEFAULT_MODEL_NAME;

            dbg('\n--- Calling LiteLLM API --- (via LiteLLMClient)');
            dbg(`Using model for API call: ${effectiveModel}`);
            if (this.apiKey) {
                dbg('Using LITELLM_API_KEY for authentication.');
            }

            // Prepare parameters for litellm.completion
            const params: any = {
                model: effectiveModel,
                messages: messages,
                temperature: 0.7,
                max_tokens: 1500,
            };

            // Add apiKey only if it was explicitly found
            // Check if litellmjs supports passing apiKey directly like this
            // Might need adjustment if it expects keys only via environment.
            if (this.apiKey) {
                params.apiKey = this.apiKey;
            }

            const response = await litellm.completion(params);
            dbg('--- LiteLLM API Call Complete --- (via LiteLLMClient)');

            // Accessing response content, structure might vary slightly based on underlying provider
            // Using optional chaining for safety.
            const responseContent = response.choices?.[0]?.message?.content;

            if (!responseContent) {
                console.warn("LiteLLM API call returned successfully but contained no content.", response);
                throw new Error("LiteLLM API call returned successfully but contained no content.");
            }

            return responseContent;
        } catch (error: any) {
            console.error("Error calling LiteLLM API via LiteLLMClient:", error);
            // Include model name in error for better debugging
            throw new Error(`Failed to communicate with LiteLLM (Model: ${options?.modelName || DEFAULT_MODEL_NAME}): ${error.message}`);
        }
    }
} 