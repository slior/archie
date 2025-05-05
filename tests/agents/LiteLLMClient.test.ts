import { expect } from 'chai';
import * as sinon from 'sinon';
import { LiteLLMClient } from '../../src/agents/LiteLLMClient';
import { LITELLM_API_KEY_ENV_VAR, DEFAULT_MODEL_NAME } from '../../src/agents/llmConstants';
import { ChatMessage } from '../../src/agents/ILLMClient';

// Mock the litellm library
const mockLiteLLMCompletion = sinon.stub();
// Use sinon.replace to mock the specific function from the module
// sinon.replace(require('litellm'), 'completion', mockLiteLLMCompletion);
sinon.replaceGetter(require('litellm'), 'completion',() => mockLiteLLMCompletion);

const originalEnv = { ...process.env };

describe('LiteLLMClient', () => {
    beforeEach(() => {
        // Reset mocks and environment before each test
        mockLiteLLMCompletion.reset();
        process.env = { ...originalEnv };
        delete process.env[LITELLM_API_KEY_ENV_VAR];
    });

    after(() => {
        // Restore original modules and environment after all tests
        sinon.restore();
        process.env = { ...originalEnv };
    });

    // LiteLLMClient constructor doesn't throw on missing key, it just logs/warns later.
    it('should initialize without throwing error if LITELLM_API_KEY is not set', () => {
        expect(() => new LiteLLMClient()).to.not.throw();
    });

    it('should call litellm.completion with correct parameters (default model, no explicit API key)', async () => {
        const client = new LiteLLMClient(); // No LITELLM_API_KEY set
        const history: ChatMessage[] = [{ role: 'user', content: 'LiteLLM history' }];
        const prompt = 'LiteLLM prompt';
        const expectedResponse = 'Mocked LiteLLM response';

        mockLiteLLMCompletion.resolves({
            choices: [{ message: { content: expectedResponse } }]
        });

        const response = await client.chatCompletion(history, prompt);

        expect(response).to.equal(expectedResponse);
        expect(mockLiteLLMCompletion.calledOnce).to.be.true;
        const args = mockLiteLLMCompletion.firstCall.args[0];
        expect(args.model).to.equal(DEFAULT_MODEL_NAME);
        expect(args.messages).to.deep.equal([
            { role: 'user', content: 'LiteLLM history' },
            { role: 'user', content: 'LiteLLM prompt' }
        ]);
        expect(args.temperature).to.be.a('number');
        expect(args.max_tokens).to.be.a('number');
        expect(args.apiKey).to.be.undefined; // Explicit check that apiKey is not passed
    });

    it('should call litellm.completion with specific model name', async () => {
        const client = new LiteLLMClient();
        const history: ChatMessage[] = [];
        const prompt = 'Another prompt';
        const modelName = 'claude-test';

        mockLiteLLMCompletion.resolves({ choices: [{ message: { content: 'Success' } }] });

        await client.chatCompletion(history, prompt, { modelName });

        expect(mockLiteLLMCompletion.calledOnce).to.be.true;
        const args = mockLiteLLMCompletion.firstCall.args[0];
        expect(args.model).to.equal(modelName);
    });

    it('should call litellm.completion with apiKey if LITELLM_API_KEY is set', async () => {
        process.env[LITELLM_API_KEY_ENV_VAR] = 'test-litellm-key';
        const client = new LiteLLMClient(); 
        const history: ChatMessage[] = [];
        const prompt = 'API key test';

        mockLiteLLMCompletion.resolves({ choices: [{ message: { content: 'Success' } }] });

        await client.chatCompletion(history, prompt);

        expect(mockLiteLLMCompletion.calledOnce).to.be.true;
        const args = mockLiteLLMCompletion.firstCall.args[0];
        expect(args.apiKey).to.equal('test-litellm-key');
    });

    it('should map agent role to assistant role for LiteLLM API', async () => {
        const client = new LiteLLMClient();
        // History uses ChatMessage which includes 'assistant'
        const history: ChatMessage[] = [
            { role: 'user', content: 'User query' }, 
            { role: 'assistant', content: 'Agent response' } // Already assistant
        ];
        const prompt = 'Follow up again';

        mockLiteLLMCompletion.resolves({ choices: [{ message: { content: 'OK' } }] });

        await client.chatCompletion(history, prompt);
        const args = mockLiteLLMCompletion.firstCall.args[0];
        expect(args.messages).to.deep.equal([
            { role: 'user', content: 'User query' },
            { role: 'assistant', content: 'Agent response' }, // Remains assistant
            { role: 'user', content: 'Follow up again' }
        ]);
    });

    it('should throw error if litellm.completion call fails', async () => {
        const client = new LiteLLMClient();
        const history: ChatMessage[] = [];
        const prompt = 'Failure test';
        const apiError = new Error('LiteLLM API Failure');

        mockLiteLLMCompletion.rejects(apiError);

        try {
            await client.chatCompletion(history, prompt);
            expect.fail('Expected chatCompletion to throw');
        } catch (error: any) {
            expect(error).to.be.instanceOf(Error);
            expect(error.message).to.contain('Failed to communicate with LiteLLM');
            expect(error.message).to.contain('LiteLLM API Failure');
        }
    });

    it('should throw error if litellm.completion response has no content', async () => {
        const client = new LiteLLMClient();
        const history: ChatMessage[] = [];
        const prompt = 'No content test';

        mockLiteLLMCompletion.resolves({
            choices: [{ message: { content: null } }] // No content
        });

        try {
            await client.chatCompletion(history, prompt);
            expect.fail('Expected chatCompletion to throw');
        } catch (error: any) {
            expect(error).to.be.instanceOf(Error);
            expect(error.message).to.contain('returned successfully but contained no content');
        }
    });
}); 