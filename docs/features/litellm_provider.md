# Feature Specification

I would like to enable Archie to work with a different LLM provider (other than OpenAI).
This would mean that all the calls to an LLM will be done by a different provider, a different API, but with the same prompts.

Currently, all LLM-related API is centralized in [./src/agents/LLMUtils.ts].

At this point, I would like to only introduce a separate provider - LiteLLM, specifically its [chat completions](https://docs.litellm.ai/docs/completion) API support.
It's probably good to use the [LiteLLM.js](https://github.com/zya/litellmjs) library for implementation.

We should think of how to implement this, so the code *using* the LLM is oblivious to the actual LLM used, as much as possible.
Any LLM provider-specific code should be encapsulated and co-located in one place.

Of course, documentation should be updated as well (e.g. [README file](../../README.MD)).

# Plan

**Refined Plan:**

**Constants:**

*   Define constants for provider names and environment variable keys early, likely in `LLMUtils.ts`.
    ```typescript
    // In LLMUtils.ts or a new constants file (e.g., src/agents/llmConstants.ts)
    export const LLM_PROVIDER_ENV_VAR = 'LLM_PROVIDER';
    export const OPENAI_PROVIDER = 'openai';
    export const LITELLM_PROVIDER = 'litellm';
    export const OPENAI_API_KEY_ENV_VAR = 'OPENAI_API_KEY';
    export const LITELLM_API_KEY_ENV_VAR = 'LITELLM_API_KEY'; // Key for LiteLLM Proxy/Service
    export const DEFAULT_MODEL_NAME = 'gpt-3.5-turbo'; // General default
    ```

**1. Project Setup:**

*   Add the `litellm` npm package dependency to the project.

**2. Define Core Interface & Types:**

*   Create/Modify file: `src/agents/ILLMClient.ts`
*   Import `Role` type from `src/agents/graph.ts`.
*   Define the `ChatMessage` type using the imported `Role`:
    ```typescript
    import { Role } from './graph'; // Adjust path if needed

    // Expand Role slightly if system/assistant roles are needed internally by clients
    type ExtendedRole = Role | 'assistant' | 'system';

    export type ChatMessage = {
        role: ExtendedRole;
        content: string;
    };
    ```
*   Define the `ILLMClient` interface:
    ```typescript
    import { ChatMessage } from './ILLMClient'; // Adjust path if needed

    export interface ILLMClient {
        chatCompletion(
            history: Array<ChatMessage>,
            prompt: string,
            options?: { modelName?: string }
        ): Promise<string>;
    }
    ```

**3. Implement OpenAI Client:**

*   Create file: `src/agents/OpenAIClient.ts`
*   Import necessary constants (`OPENAI_API_KEY_ENV_VAR`, `DEFAULT_MODEL_NAME`).
*   Implement `OpenAIClient` class implementing `ILLMClient`.
*   Move existing OpenAI logic here.
*   Check for `process.env[OPENAI_API_KEY_ENV_VAR]` within the constructor or `chatCompletion`.
*   Map incoming `ChatMessage` roles (`agent` -> `assistant`) for the OpenAI API call.
*   Use `DEFAULT_MODEL_NAME` if `options.modelName` is not provided.

**4. Implement LiteLLM Client:**

*   Create file: `src/agents/LiteLLMClient.ts`
*   Import necessary constants (`LITELLM_API_KEY_ENV_VAR`, `DEFAULT_MODEL_NAME`).
*   Implement `LiteLLMClient` class implementing `ILLMClient`.
*   Check for `process.env[LITELLM_API_KEY_ENV_VAR]` within the constructor or `chatCompletion`.
    *   **Note:** The standard `litellmjs` library usage shown relies on provider-specific keys (e.g., `OPENAI_API_KEY`). Using a single `LITELLM_API_KEY` usually implies connecting to a LiteLLM *proxy*. We will attempt to pass this key to the `litellm.completion` function via an `apiKey` parameter. Verification is needed during implementation to confirm `litellmjs` supports this for proxy authentication. If not, this step might require adjustment (e.g., using `fetch` with an Authorization header).
*   Map incoming `ChatMessage` roles (`agent` -> `assistant`) for the `litellm.completion` call.
*   Use `litellm.completion`. Pass the retrieved `LITELLM_API_KEY` if the library supports it (e.g., `apiKey: process.env[LITELLM_API_KEY_ENV_VAR]`).
*   Use `options.modelName` directly. If `options.modelName` is undefined, use `DEFAULT_MODEL_NAME` as a fallback for LiteLLM.
*   Add documentation within the code regarding the expected environment variables (`LITELLM_API_KEY` and potentially others depending on the underlying model if not using a proxy).

**5. Refactor `LLMUtils.ts`:**

*   Import `ILLMClient`, `OpenAIClient`, `LiteLLMClient`, `ChatMessage`, and the defined constants (`LLM_PROVIDER_ENV_VAR`, `OPENAI_PROVIDER`, `LITELLM_PROVIDER`, `DEFAULT_MODEL_NAME`).
*   Keep `dotenv.config()`.
*   Create factory function `getLLMClient()`:
    ```typescript
    import { OpenAIClient } from './OpenAIClient';
    import { LiteLLMClient } from './LiteLLMClient';
    import { ILLMClient } from './ILLMClient';
    import * as dotenv from 'dotenv';
    import { LLM_PROVIDER_ENV_VAR, OPENAI_PROVIDER, LITELLM_PROVIDER, OPENAI_API_KEY_ENV_VAR, LITELLM_API_KEY_ENV_VAR, DEFAULT_MODEL_NAME } from './llmConstants'; // Adjust path

    dotenv.config();

    let clientInstance: ILLMClient | null = null;

    function getLLMClient(): ILLMClient {
        if (clientInstance) {
            return clientInstance;
        }

        const provider = process.env[LLM_PROVIDER_ENV_VAR]?.toLowerCase();

        if (provider === LITELLM_PROVIDER) {
            console.log("Using LiteLLM provider.");
            // Check for LiteLLM key existence here for early failure,
            // although the client itself will also check.
            if (!process.env[LITELLM_API_KEY_ENV_VAR]) {
                 console.warn(`${LITELLM_API_KEY_ENV_VAR} is not set for LiteLLM provider.`);
                 // Potentially throw an error here or let the client handle it
            }
            clientInstance = new LiteLLMClient();
        } else {
            if (provider && provider !== OPENAI_PROVIDER) {
                 console.warn(`Unrecognized ${LLM_PROVIDER_ENV_VAR} "${provider}". Defaulting to OpenAI.`);
            }
            console.log("Using OpenAI provider.");
             // Check for OpenAI key existence here for early failure
            if (!process.env[OPENAI_API_KEY_ENV_VAR]) {
                console.warn(`${OPENAI_API_KEY_ENV_VAR} is not set for OpenAI provider.`);
                // Potentially throw an error here or let the client handle it
            }
            clientInstance = new OpenAIClient();
        }
        return clientInstance;
    }
    ```
*   Rename `callOpenAI` to `callLLM`. Update its signature and implementation:
    ```typescript
    import { Role } from './graph'; // Adjust path
    // ... other imports ...

     export async function callLLM(
         history: Array<{ role: Role; content: string }>, // Use imported Role
         prompt: string,
         modelName?: string
     ): Promise<string> {
         const client = getLLMClient();

         // Map internal roles to 'user' or 'assistant' before passing to any client
         // The ChatMessage type uses ExtendedRole ('user' | 'agent' | 'assistant' | 'system')
         const mappedHistory: ChatMessage[] = history.map(msg => ({
             // Role mapping happens here, consistent for all clients
             role: msg.role === 'agent' ? 'assistant' : 'user',
             content: msg.content
         }));

        // Combine history with the current prompt as a user message
        const messages: ChatMessage[] = [
            ...mappedHistory,
            { role: 'user', content: prompt }
        ];


         // Determine the effective model name. Clients handle their own defaults if undefined.
         const effectiveModel = modelName && modelName.trim() !== '' ? modelName : undefined;

         try {
             dbg(`Calling LLM provider (${process.env[LLM_PROVIDER_ENV_VAR] || OPENAI_PROVIDER}). Model requested: ${effectiveModel || 'Provider Default'}`);
             // Pass only mapped history and prompt to client. Let client combine if needed.
             // Correction: Pass history and prompt separately as per interface design
             const responseContent = await client.chatCompletion(mappedHistory, prompt, { modelName: effectiveModel });
             dbg('--- LLM Call Complete ---');
             return responseContent;
         } catch (error: any) {
             console.error("Error calling LLM:", error);
             throw new Error(`LLM API call failed: ${error.message}`);
         }
     }
    ```
*   Remove direct OpenAI logic, key checks, and unnecessary imports.

**6. Update Documentation (`README.md`):**

*   Explain `LLM_PROVIDER` (`openai` or `litellm`), defaulting to `openai`.
*   Explain `OPENAI_API_KEY` needed for `openai` provider.
*   Explain `LITELLM_API_KEY` needed for `litellm` provider (assuming proxy usage). Add a note about potential other keys if *not* using a proxy (`litellmjs` default behavior).
*   Update environment variable examples.

**7. Update Feature Specification (`docs/features/litellm_provider.md`):**

*   Replace the old plan/checklist with this refined plan and the updated checklist below.

**8. Testing Plan:**

*   **Unit Tests:**
    *   Test the `getLLMClient()` factory function:
        *   Verify it returns `OpenAIClient` when `LLM_PROVIDER` is `openai` or unset/invalid.
        *   Verify it returns `LiteLLMClient` when `LLM_PROVIDER` is `litellm`.
        *   Verify it logs warnings for invalid providers or missing keys.
    *   Test `OpenAIClient`: Mock the `openai` library. Verify it's called with correct parameters (API key, model, mapped messages). Verify it handles API key errors.
    *   Test `LiteLLMClient`: Mock the `litellm` library. Verify it's called with correct parameters (API key if applicable, model, mapped messages). Verify it handles API key errors (based on the planned check).
    *   Test the role mapping logic within `callLLM` or implicitly via client tests.
*   **Integration Tests:**
    *   Requires setting environment variables (`LLM_PROVIDER`, `OPENAI_API_KEY`, `LITELLM_API_KEY`) and potentially running a local LiteLLM proxy or having access to live APIs.
    *   Test `callLLM` with `LLM_PROVIDER=openai`: Make a real (or mocked endpoint) call using a simple prompt and verify a valid response structure.
    *   Test `callLLM` with `LLM_PROVIDER=litellm`:
        *   If using a proxy: Start a local LiteLLM proxy configured with a model (e.g., Ollama). Set `LITELLM_API_KEY`. Make a call via `callLLM` and verify response.
        *   If using `litellmjs` direct-to-provider: Set `LITELLM_API_KEY` (if implementation requires it) and the necessary provider key (e.g., `OPENAI_API_KEY`). Call `callLLM` with a corresponding model (e.g., `gpt-3.5-turbo`) and verify response.
    *   Test error handling for both providers (e.g., invalid API key, invalid model).
*   **Manual Testing:**
    *   Run the application with different `LLM_PROVIDER` settings and verify core functionality still works as expected.

---

**REFINED IMPLEMENTATION CHECKLIST:**

1.  [ ] Add `litellm` dependency: Run `npm install litellm`.
2.  [ ] Create/Update `src/agents/llmConstants.ts` with provider names and ENV VAR keys.
3.  [ ] Create/Update `src/agents/ILLMClient.ts`: Define `ChatMessage` (using `Role` from `graph.ts`) and `ILLMClient` interface.
4.  [ ] Create `src/agents/OpenAIClient.ts`: Implement `ILLMClient`, handle `OPENAI_API_KEY`, map roles, use `openai` lib.
5.  [ ] Create `src/agents/LiteLLMClient.ts`: Implement `ILLMClient`, handle `LITELLM_API_KEY` (check if `litellmjs` supports it), map roles, use `litellm` lib. Document key expectations.
6.  [ ] Refactor `src/agents/LLMUtils.ts`: Import constants. Add `getLLMClient()` factory (checks provider, defaults to OpenAI, checks keys).
7.  [ ] Refactor `src/agents/LLMUtils.ts`: Rename `callOpenAI` to `callLLM`. Update implementation (use factory, map roles centrally, call client's `chatCompletion`).
8.  [ ] Refactor `src/agents/LLMUtils.ts`: Remove redundant OpenAI logic/imports.
9.  [ ] Update `README.md`: Explain `LLM_PROVIDER`, `OPENAI_API_KEY`, `LITELLM_API_KEY`, and default behavior.
10. [ ] Update `docs/features/litellm_provider.md`: Replace previous plan with this refined plan and checklist. Add "Implementation Log" section if missing. (This step is done by this action).
11. [ ] Implement Unit Tests for factory and clients (mocking external libraries).
12. [ ] Implement Integration Tests (requires setup) for `callLLM` with both providers.

---

# Implementation Log