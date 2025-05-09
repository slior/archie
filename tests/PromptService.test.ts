import { expect } from 'chai';
import sinon from 'sinon';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { PromptService, PromptServiceDependencies } from '../src/services/PromptService';
import { FullPromptsConfig } from '../src/services/promptTypes';

// Mock implementations for dependencies
let mockReadFileFn: sinon.SinonStub;
let mockResolvePathFn: sinon.SinonStub;
let mockDirnameFn: sinon.SinonStub;
let mockIsAbsoluteFn: sinon.SinonStub;

let dependencies: PromptServiceDependencies;

describe('PromptService Unit Tests', () => {
    beforeEach(() => {
        // Create fresh stubs for each test
        mockReadFileFn = sinon.stub();
        mockResolvePathFn = sinon.stub().callsFake((...args) => args.join('/')); // Simple mock for resolve
        mockDirnameFn = sinon.stub().callsFake(p => p.substring(0, p.lastIndexOf('/') > -1 ? p.lastIndexOf('/') : p.length)); // Simple mock for dirname
        mockIsAbsoluteFn = sinon.stub().callsFake(p => p.startsWith('/')); // Simple mock for isAbsolute

        dependencies = {
            readFileFn: mockReadFileFn,
            resolvePathFn: mockResolvePathFn,
            dirnameFn: mockDirnameFn,
            isAbsoluteFn: mockIsAbsoluteFn,
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Constructor and Config Loading', () => {
        it('Test 1.1: should instantiate without a configFilePath without errors', () => {
            const service = new PromptService(undefined, dependencies);
            expect(service).to.be.instanceOf(PromptService);
            // No file operations should be called by constructor itself directly
            expect(mockReadFileFn.called).to.be.false;
        });

        it('Test 1.2: should load and parse a valid config file when getFormattedPrompt is called', async () => {
            const configPath = './prompts.json';
            const mockConfigContent: FullPromptsConfig = {
                prompts: {
                    agent1: {
                        prompt1: { inputs: [], path: 'custom/p1.txt' }
                    }
                }
            };
            mockReadFileFn.withArgs(configPath, 'utf-8').resolves(JSON.stringify(mockConfigContent));
            // Mock path functions for constructor
            mockResolvePathFn.withArgs(configPath).returns(configPath); // Simulate it's already resolved or a simple case
            mockDirnameFn.withArgs(configPath).returns('.');

            const service = new PromptService(configPath, dependencies);
            // Trigger loading by calling getFormattedPrompt (even if it fails later due to missing prompt file)
            try {
                await service.getFormattedPrompt('agent1', 'prompt1', {});
            } catch (e) {
                // Expected to fail if 'custom/p1.txt' isn't mocked by readFileFn, but config should be loaded.
            }
            expect(mockReadFileFn.calledWith(configPath, 'utf-8')).to.be.true;
            // Further tests will verify that loadedConfig is used.
        });

        it('Test 1.3: should throw an error if config file reading fails', async () => {
            const configPath = './nonexistent.json';
            mockResolvePathFn.withArgs(configPath).returns(configPath);
            mockDirnameFn.withArgs(configPath).returns('.');
            mockReadFileFn.withArgs(configPath, 'utf-8').rejects(new Error('File not found'));

            const service = new PromptService(configPath, dependencies);
            try {
                await service.getFormattedPrompt('anyAgent', 'anyPrompt', {});
                expect.fail('Should have thrown an error');
            } catch (error: any) {
                expect(error.message).to.contain('Failed to load or parse prompt configuration file');
                expect(error.message).to.contain(configPath);
                expect(error.message).to.contain('File not found');
            }
        });

        it('Test 1.4: should throw an error if config file content is malformed JSON', async () => {
            const configPath = './malformed.json';
            mockResolvePathFn.withArgs(configPath).returns(configPath);
            mockDirnameFn.withArgs(configPath).returns('.');
            mockReadFileFn.withArgs(configPath, 'utf-8').resolves('this is not json');

            const service = new PromptService(configPath, dependencies);
            try {
                await service.getFormattedPrompt('anyAgent', 'anyPrompt', {});
                expect.fail('Should have thrown an error');
            } catch (error: any) {
                expect(error.message).to.contain('Failed to load or parse prompt configuration file');
                expect(error.message).to.contain(configPath);
                // SyntaxError message for JSON.parse can vary, so check for part of it
                expect(error.message.toLowerCase()).to.contain('json'); 
            }
        });
    });

    describe('getFormattedPrompt - Custom Prompts', () => {
        const agentName = 'TestAgent';
        const promptKey = 'testPrompt1';
        const customPromptContent = 'Hello {{name}} from custom prompt!';
        const customPromptPath = 'custom/prompts/custom1.txt';
        const resolvedCustomPath = './config_dir/custom/prompts/custom1.txt'; // Assuming config dir is ./config_dir
        const configPath = './config_dir/prompts.json';

        const mockConfig: FullPromptsConfig = {
            prompts: {
                [agentName]: {
                    [promptKey]: { inputs: ['name'], path: customPromptPath }
                }
            }
        };

        beforeEach(() => {
            // Mock config file loading for these tests
            mockReadFileFn.withArgs(configPath, 'utf-8').resolves(JSON.stringify(mockConfig));
            mockResolvePathFn.withArgs(configPath).returns(configPath);
            mockDirnameFn.withArgs(configPath).returns('./config_dir');
        });

        it('Test 2.1: should load and format a custom prompt', async () => {
            mockIsAbsoluteFn.withArgs(customPromptPath).returns(false);
            mockResolvePathFn.withArgs('./config_dir', customPromptPath).returns(resolvedCustomPath);
            mockReadFileFn.withArgs(resolvedCustomPath, 'utf-8').resolves(customPromptContent);
            
            const service = new PromptService(configPath, dependencies);
            const result = await service.getFormattedPrompt(agentName, promptKey, { name: 'Tester' });

            expect(result).to.equal('Hello Tester from custom prompt!');
            expect(mockReadFileFn.calledWith(configPath, 'utf-8')).to.be.true; // Config loaded
            expect(mockReadFileFn.calledWith(resolvedCustomPath, 'utf-8')).to.be.true; // Custom prompt loaded
        });

        it('Test 2.2: should correctly resolve a relative custom prompt path against configDir', async () => {
            mockIsAbsoluteFn.withArgs(customPromptPath).returns(false);
            mockResolvePathFn.withArgs('./config_dir', customPromptPath).returns(resolvedCustomPath);
            mockReadFileFn.withArgs(resolvedCustomPath, 'utf-8').resolves(customPromptContent);

            const service = new PromptService(configPath, dependencies);
            await service.getFormattedPrompt(agentName, promptKey, { name: 'Tester' });

            expect(mockIsAbsoluteFn.calledWith(customPromptPath)).to.be.true;
            expect(mockResolvePathFn.calledWith('./config_dir', customPromptPath)).to.be.true;
        });

        it('Test 2.3: should use an absolute custom prompt path directly', async () => {
            const absolutePath = '/abs/path/custom.txt';
            const configWithAbsolute: FullPromptsConfig = {
                prompts: { [agentName]: { [promptKey]: { inputs: [], path: absolutePath } } }
            };
            // Override config mock for this test
            mockReadFileFn.withArgs(configPath, 'utf-8').resolves(JSON.stringify(configWithAbsolute));
            mockReadFileFn.withArgs(absolutePath, 'utf-8').resolves('Absolute {{val}}');
            
            mockIsAbsoluteFn.withArgs(absolutePath).returns(true); // Crucial mock for this test
            // mockResolvePathFn should NOT be called for the custom prompt path itself if it's absolute

            const service = new PromptService(configPath, dependencies);
            const result = await service.getFormattedPrompt(agentName, promptKey, { val: 'Path' });

            expect(result).to.equal('Absolute Path');
            expect(mockIsAbsoluteFn.calledWith(absolutePath)).to.be.true;
            // Check that resolve was NOT called for the custom path itself (it was called for configPath)
            const resolveCallsForCustomPath = mockResolvePathFn.getCalls().filter(call => call.args.includes(absolutePath));
            expect(resolveCallsForCustomPath.length).to.equal(0);
            expect(mockReadFileFn.calledWith(absolutePath, 'utf-8')).to.be.true;
        });

        it('Test 2.4: should throw an error if custom prompt file reading fails', async () => {
            mockIsAbsoluteFn.withArgs(customPromptPath).returns(false);
            mockResolvePathFn.withArgs('./config_dir', customPromptPath).returns(resolvedCustomPath);
            mockReadFileFn.withArgs(resolvedCustomPath, 'utf-8').rejects(new Error('Custom prompt not found'));

            const service = new PromptService(configPath, dependencies);
            try {
                await service.getFormattedPrompt(agentName, promptKey, {});
                expect.fail('Should have thrown an error');
            } catch (error: any) {
                expect(error.message).to.contain(`Error loading custom prompt file ${resolvedCustomPath}`);
                expect(error.message).to.contain('Custom prompt not found');
            }
        });
    });

    describe('getFormattedPrompt - Default Prompts', () => {
        const agentName = 'DefaultAgent';
        const promptKey = 'defaultKey1';
        const defaultPromptContent = 'This is a default prompt for {{entity}}.';
        const defaultPromptFileName = `${promptKey}.txt`; // e.g., defaultKey1.txt
        const defaultPromptDir = `src/agents/prompts/${agentName}`;
        // Path.resolve (mocked by mockResolvePathFn) will be called with this relative path
        // and it should resolve it (e.g. against a mocked process.cwd() implicitly if no configDir)
        const constructedDefaultPath = `${defaultPromptDir}/${defaultPromptFileName}`;
        // Let's assume our mockResolvePathFn simply joins or returns the path if it looks "resolved enough"
        // For default paths, it might be called as resolvePathFn('src/agents/prompts/DefaultAgent/defaultKey1.txt')
        const resolvedDefaultPath = '/abs/project/root/src/agents/prompts/DefaultAgent/defaultKey1.txt';

        it('Test 3.1: should load and format a default prompt when no custom config is provided', async () => {
            mockIsAbsoluteFn.withArgs(sinon.match.string).returns(false); // Default paths are relative
            // Crucial: mockResolvePathFn for the specific default path construction
            // The service constructs 'src/agents/prompts/DefaultAgent/defaultKey1.txt' and passes it to _resolvePath
            // _resolvePath calls resolvePathFn(constructedPath) if no configDir
            mockResolvePathFn.withArgs(constructedDefaultPath).returns(resolvedDefaultPath);
            mockReadFileFn.withArgs(resolvedDefaultPath, 'utf-8').resolves(defaultPromptContent);

            // No config file path passed to constructor, so it should use default logic
            const service = new PromptService(undefined, dependencies);
            const result = await service.getFormattedPrompt(agentName, promptKey, { entity: 'Fallback' });

            expect(result).to.equal('This is a default prompt for Fallback.');
            expect(mockResolvePathFn.calledWith(constructedDefaultPath)).to.be.true;
            expect(mockReadFileFn.calledOnceWith(resolvedDefaultPath, 'utf-8')).to.be.true;
        });

        it('Test 3.1.b: should load default if config exists but agent/key not found', async () => {
            const configDir = './config_dir';
            const configPath = `${configDir}/prompts.json`;
            const emptyConfig: FullPromptsConfig = { prompts: {} }; // Empty config
            

            const localMockReadFileFn = sinon.stub().onFirstCall().returns(JSON.stringify(emptyConfig));
            const localMockDirnameFn = sinon.stub().withArgs(configPath).returns(configDir);

            const localMockIsAbsoluteFn = sinon.stub().withArgs(sinon.match.string).returns(false);
            const localResolvedDefaultPath = `${configDir}/${constructedDefaultPath}`;
            const localMockResolvePathFn = sinon.stub().withArgs(configDir,constructedDefaultPath)
                                                       .returns(localResolvedDefaultPath); //constructedDefaultPath is relative => will resolve against configDir
            
            localMockReadFileFn.onSecondCall().returns(defaultPromptContent);

            const localDependencies = {
                readFileFn: localMockReadFileFn,
                resolvePathFn: localMockResolvePathFn,
                dirnameFn: localMockDirnameFn,
                isAbsoluteFn: localMockIsAbsoluteFn,
            };

            const service = new PromptService(configPath, localDependencies);
            const result = await service.getFormattedPrompt(agentName, promptKey, { entity: 'Fallback' });
            
            expect(result).to.equal('This is a default prompt for Fallback.');
            expect(localMockReadFileFn.callCount).to.equal(2);
        });

        it('Test 3.2: should throw an error if default prompt file reading fails', async () => {
            mockIsAbsoluteFn.withArgs(sinon.match.string).returns(false);
            mockResolvePathFn.withArgs(constructedDefaultPath).returns(resolvedDefaultPath);
            mockReadFileFn.withArgs(resolvedDefaultPath, 'utf-8').rejects(new Error('Default prompt missing'));

            const service = new PromptService(undefined, dependencies);
            try {
                await service.getFormattedPrompt(agentName, promptKey, {});
                expect.fail('Should have thrown an error');
            } catch (error: any) {
                expect(error.message).to.contain(`Error loading default prompt file ${resolvedDefaultPath}`);
                expect(error.message).to.contain('Default prompt missing');
            }
        });
    });

    describe('getFormattedPrompt - Placeholder Replacement', () => {
        const agentName = 'ReplaceAgent';
        const promptKey = 'replaceKey';
        const mockPromptContent = 'Hello {{name}}, welcome to {{place}}. Status: {{status}}.';
        const defaultPromptPath = '/abs/project/root/src/agents/prompts/ReplaceAgent/replaceKey.txt';

        beforeEach(() => {
            // For these tests, we'll assume the prompt (default or custom) is loaded successfully.
            // We'll use the default prompt loading mechanism without a config file.
            mockIsAbsoluteFn.withArgs(sinon.match.string).returns(false);
            mockResolvePathFn.withArgs(`src/agents/prompts/${agentName}/${promptKey}.txt`).returns(defaultPromptPath);
            mockReadFileFn.withArgs(defaultPromptPath, 'utf-8').resolves(mockPromptContent);
        });

        it('Test 4.1: should correctly replace a single placeholder', async () => {
            const service = new PromptService(undefined, dependencies);
            const result = await service.getFormattedPrompt(agentName, promptKey, { name: 'Alice' });
            expect(result).to.equal('Hello Alice, welcome to {{place}}. Status: {{status}}.');
        });

        it('Test 4.2: should correctly replace multiple distinct placeholders', async () => {
            const service = new PromptService(undefined, dependencies);
            const context = { name: 'Bob', place: 'Wonderland', status: 'Ready' };
            const result = await service.getFormattedPrompt(agentName, promptKey, context);
            expect(result).to.equal('Hello Bob, welcome to Wonderland. Status: Ready.');
        });

        it('Test 4.3: should leave placeholders if keys are not in context', async () => {
            const service = new PromptService(undefined, dependencies);
            const result = await service.getFormattedPrompt(agentName, promptKey, { name: 'Charlie' });
            // String(undefined) is "undefined"
            expect(result).to.equal('Hello Charlie, welcome to {{place}}. Status: {{status}}.');
        });

        it('Test 4.4: should correctly replace placeholders with special regex characters in their names (if key has them)', async () => {
            const specialKeyPrompt = 'Value for {{key.name.v1}} is {{key.name.v1}}.';
            mockReadFileFn.withArgs(defaultPromptPath, 'utf-8').resolves(specialKeyPrompt);
            const service = new PromptService(undefined, dependencies);
            const result = await service.getFormattedPrompt(agentName, promptKey, { 'key.name.v1': 'SpecialValue' });
            expect(result).to.equal('Value for SpecialValue is SpecialValue.');
        });
        
        it('Test 4.4.b: should handle prompt content with characters that are special for regex (e.g. $)', async () => {
            const dollarPrompt = 'Price: ${{amount}}. Cost: $${{cost}}'; // Test with $ inside and outside placeholder
            mockReadFileFn.withArgs(defaultPromptPath, 'utf-8').resolves(dollarPrompt);
            const service = new PromptService(undefined, dependencies);
            const result = await service.getFormattedPrompt(agentName, promptKey, { amount: '100', cost: '50' });
            expect(result).to.equal('Price: $100. Cost: $$50');
        });

        it('Test 4.5: should return the prompt unmodified if context is empty', async () => {
            const service = new PromptService(undefined, dependencies);
            const result = await service.getFormattedPrompt(agentName, promptKey, {});
            expect(result).to.equal('Hello {{name}}, welcome to {{place}}. Status: {{status}}.');
        });

        it('should replace all occurrences of a placeholder', async () => {
            const multiOccurrencePrompt = '{{name}} says hello to {{name}}.';
            mockReadFileFn.withArgs(defaultPromptPath, 'utf-8').resolves(multiOccurrencePrompt);
            const service = new PromptService(undefined, dependencies);
            const result = await service.getFormattedPrompt(agentName, promptKey, { name: 'Eve' });
            expect(result).to.equal('Eve says hello to Eve.');
        });
    });
}); 