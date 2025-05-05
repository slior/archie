import { expect } from 'chai';
import * as sinon from 'sinon';
import * as dotenv from 'dotenv';

// Need to import the module we want to test
// Using require for dynamic import/re-import during tests to handle singleton pattern
// We also need the actual classes for instanceof checks
import { OpenAIClient } from '../../src/agents/OpenAIClient';
import { LiteLLMClient } from '../../src/agents/LiteLLMClient';
import { 
    LLM_PROVIDER_ENV_VAR, 
    OPENAI_PROVIDER, 
    LITELLM_PROVIDER, 
    OPENAI_API_KEY_ENV_VAR, 
    LITELLM_API_KEY_ENV_VAR 
} from '../../src/agents/llmConstants';

// Stub console.warn and console.log to check warnings/logs
let warnStub: sinon.SinonStub;
let logStub: sinon.SinonStub;

// Keep track of original env vars to restore them
const originalEnv = { ...process.env };

const modulePath = require.resolve('../../src/agents/LLMUtils');

// Helper to safely get the factory function
const getFactoryFunction = () => {
    // Force module re-import to reset the singleton instance
    delete require.cache[modulePath];
    const FreshLLMUtils = require(modulePath);
    // Accessing the non-exported factory function is problematic.
    // Ideally, it should be exported for testing, or tested via callLLM.
    // We'll proceed assuming it *can* be accessed, maybe via a testing export.
    // If this fails, the tests need refactoring (e.g., test via callLLM).
    if (typeof FreshLLMUtils.getLLMClient !== 'function') { 
        // A simple check; might need adjustment based on actual export/access method
        console.error("Cannot access getLLMClient for testing. Module structure:", Object.keys(FreshLLMUtils));
        throw new Error('getLLMClient function is not accessible for testing');
    }
    return FreshLLMUtils.getLLMClient;
};

describe('LLMUtils - getLLMClient Factory', () => {

    beforeEach(() => {
        // Restore original environment variables before each test
        process.env = { ...originalEnv };
        // Clear specific test variables
        delete process.env[LLM_PROVIDER_ENV_VAR];
        delete process.env[OPENAI_API_KEY_ENV_VAR];
        delete process.env[LITELLM_API_KEY_ENV_VAR];

        // Re-stub console methods
        warnStub = sinon.stub(console, 'warn');
        logStub = sinon.stub(console, 'log');
        // Ensure cache is clean before test
        delete require.cache[modulePath]; 
    });

    afterEach(() => {
        // Restore original console methods
        warnStub.restore();
        logStub.restore();
        // Restore environment variables fully
        process.env = { ...originalEnv };
        // Clean cache again after test
        delete require.cache[modulePath];
    });

    it('should return OpenAIClient when LLM_PROVIDER is unset (default)', () => {
        const getLLMClient = getFactoryFunction();
        process.env[OPENAI_API_KEY_ENV_VAR] = 'test-key'; // Provide key to prevent constructor error
        const client = getLLMClient();
        expect(client).to.be.instanceOf(OpenAIClient);
        expect(logStub.calledWith(sinon.match(/Using OpenAI provider/))).to.be.true;
    });

    it('should return OpenAIClient when LLM_PROVIDER is "openai" (case-insensitive)', () => {
        const getLLMClient = getFactoryFunction();
        process.env[LLM_PROVIDER_ENV_VAR] = 'oPeNaI';
        process.env[OPENAI_API_KEY_ENV_VAR] = 'test-key';
        const client = getLLMClient();
        expect(client).to.be.instanceOf(OpenAIClient);
        expect(logStub.calledWith(sinon.match(/Using OpenAI provider/))).to.be.true;
    });

    it('should return LiteLLMClient when LLM_PROVIDER is "litellm" (case-insensitive)', () => {
        const getLLMClient = getFactoryFunction();
        process.env[LLM_PROVIDER_ENV_VAR] = 'lItElLm';
        // Provide necessary keys if LiteLLMClient constructor requires them
        process.env[LITELLM_API_KEY_ENV_VAR] = 'test-key'; 
        const client = getLLMClient();
        expect(client).to.be.instanceOf(LiteLLMClient);
        expect(logStub.calledWith(sinon.match(/Using LiteLLM provider/))).to.be.true;
    });

    it('should default to OpenAIClient and warn when LLM_PROVIDER is unrecognized', () => {
        const getLLMClient = getFactoryFunction();
        process.env[LLM_PROVIDER_ENV_VAR] = 'unknown_provider';
        process.env[OPENAI_API_KEY_ENV_VAR] = 'test-key';
        const client = getLLMClient();
        expect(client).to.be.instanceOf(OpenAIClient);
        expect(warnStub.calledWith(sinon.match(/Unrecognized LLM_PROVIDER/))).to.be.true;
        expect(logStub.calledWith(sinon.match(/Using OpenAI provider/))).to.be.true;
    });

    it('should warn and throw if OpenAI provider is chosen but OPENAI_API_KEY is missing', () => {
        const getLLMClient = getFactoryFunction(); // Defaults to openai
        let errorThrown = false;
        try {
            getLLMClient(); // Should throw inside constructor
        } catch (e: any) {
            errorThrown = true;
            // Check if the error originates from the client initialization failure caught by the factory
             expect(e.message).to.contain('OpenAI API key (OPENAI_API_KEY) is not set');
        } 
        expect(errorThrown, 'Expected an error to be thrown').to.be.true;
        // Check that the factory logged the warning *before* the constructor threw
        expect(warnStub.calledWith(sinon.match(/OPENAI_API_KEY is not set/))).to.be.true;
    });
    
    it('should warn if LiteLLM provider is chosen but LITELLM_API_KEY is missing', () => {
        const getLLMClient = getFactoryFunction(); 
        process.env[LLM_PROVIDER_ENV_VAR] = LITELLM_PROVIDER;
        // LITELLM_API_KEY is missing. Constructor might not throw, but factory warns.
        getLLMClient(); // Call it, don't necessarily expect throw
        expect(warnStub.calledWith(sinon.match(/LITELLM_API_KEY is not set/))).to.be.true;
    });

    it('should return the same client instance on subsequent calls (singleton)', () => {
        const getLLMClient = getFactoryFunction();
        process.env[OPENAI_API_KEY_ENV_VAR] = 'test-key';
        const client1 = getLLMClient();
        // Check log count *before* second call
        const initialLogCount = logStub.withArgs(sinon.match(/Using OpenAI provider/)).callCount;
        const client2 = getLLMClient();
        expect(client1).to.equal(client2); // Check for object equality
        // Check that the log indicating creation wasn't called again
        expect(logStub.withArgs(sinon.match(/Using OpenAI provider/)).callCount).to.equal(initialLogCount);
    });
});

// Placeholder for callLLM tests (would require more mocking)
describe('LLMUtils - callLLM', () => {
    // TODO: Add tests for callLLM function itself, mocking getLLMClient and client.chatCompletion
    it.skip('should call the client method with mapped history', () => {});
    it.skip('should handle errors from the client', () => {});
}); 