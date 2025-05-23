// @ts-nocheck
import { expect } from 'chai';
import sinon from 'sinon';
import { MemoryService } from '../src/memory/MemoryService';
import { DEFAULT_MEMORY_STATE } from '../src/memory/memory_types';

describe('MemoryService', () => {
    let memoryService: MemoryService;
    const mockFilePath = 'test-context.json';
    let readFileMock: sinon.SinonStub;
    let writeFileMock: sinon.SinonStub;

    beforeEach(() => {
        readFileMock = sinon.stub().resolves(JSON.stringify(DEFAULT_MEMORY_STATE));
        writeFileMock = sinon.stub().resolves();
        memoryService = MemoryService.fromState(undefined, readFileMock, writeFileMock);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('loadMemory', () => {
        it('should initialize with empty state when file does not exist', async () => {
            readFileMock.rejects({ code: 'ENOENT' });
            
            await memoryService.loadMemory(mockFilePath);
            
            expect(memoryService.getCurrentState()).to.deep.equal(DEFAULT_MEMORY_STATE);
        });

        it('should load valid memory state from file', async () => {
            const mockState = {
                entities: [
                    { name: 'test-entity', description: 'test', type: 'service', tags: [], properties: {} }
                ],
                relationships: []
            };
            readFileMock.resolves(JSON.stringify(mockState));
            
            await memoryService.loadMemory(mockFilePath);
            
            expect(memoryService.getCurrentState()).to.deep.equal(mockState);
        });

        it('should throw error for corrupted JSON file', async () => {
            readFileMock.resolves('invalid json');
            
            let error;
            try {
                await memoryService.loadMemory(mockFilePath);
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
        });

        it('should throw error for other I/O errors', async () => {
            readFileMock.rejects(new Error('Permission denied'));
            
            let error;
            try {
                await memoryService.loadMemory(mockFilePath);
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
            expect(error.message).to.include('Permission denied');
        });
    });

    describe('saveMemory', () => {
        it('should throw error if file path not set', async () => {
            let error;
            try {
                await memoryService.saveMemory();
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
            expect(error.message).to.include('file path not set');
        });

        it('should save memory state successfully', async () => {
            readFileMock.rejects({ code: 'ENOENT' });
            await memoryService.loadMemory(mockFilePath);
            writeFileMock.resolves();
            
            await memoryService.saveMemory();
            
            expect(writeFileMock.calledOnce).to.be.true;
            expect(writeFileMock.firstCall.args[0]).to.equal(memoryService['memoryFilePath']);
        });

        it('should throw error for write failures', async () => {
            readFileMock.rejects({ code: 'ENOENT' });
            await memoryService.loadMemory(mockFilePath);
            writeFileMock.rejects(new Error('Write failed'));
            
            let error;
            try {
                await memoryService.saveMemory();
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
            expect(error.message).to.include('Write failed');
        });
    });

    describe('addOrUpdateEntity', () => {
        beforeEach(async () => {
            readFileMock.rejects({ code: 'ENOENT' });
            await memoryService.loadMemory(mockFilePath);
        });

        it('should add new entity', () => {
            const newEntity = {
                name: 'new-service',
                description: 'A new service',
                type: 'service',
                tags: ['api', 'backend'],
                properties: { version: '1.0.0' }
            };
            
            const result = memoryService.addOrUpdateEntity(newEntity);
            
            expect(result).to.be.true;
            expect(memoryService.findEntityByName('new-service')).to.deep.equal(newEntity);
        });

        it('should update existing entity', () => {
            const existingEntity = {
                name: 'existing-service',
                description: 'Original description',
                type: 'service',
                tags: ['old-tag'],
                properties: { version: '1.0.0' }
            };
            memoryService.addOrUpdateEntity(existingEntity);

            const updatedEntity = {
                name: 'existing-service',
                description: 'Updated description',
                type: 'service',
                tags: ['new-tag'],
                properties: { version: '2.0.0' }
            };
            
            const result = memoryService.addOrUpdateEntity(updatedEntity);
            
            expect(result).to.be.false;
            const found = memoryService.findEntityByName('existing-service');
            expect(found?.description).to.equal('Updated description');
            expect(found?.tags).to.include('new-tag');
            expect(found?.properties.version).to.equal('2.0.0');
        });

        it('should merge tags without duplicates', () => {
            const entity = {
                name: 'test-service',
                description: 'test',
                type: 'service',
                tags: ['tag1', 'tag2'],
                properties: {}
            };
            memoryService.addOrUpdateEntity(entity);

            const update = {
                name: 'test-service',
                description: 'test',
                type: 'service',
                tags: ['tag2', 'tag3'],
                properties: {}
            };
            
            memoryService.addOrUpdateEntity(update);
            
            const found = memoryService.findEntityByName('test-service');
            expect(found?.tags).to.deep.equal(['tag1', 'tag2', 'tag3']);
        });
    });

    describe('addOrUpdateRelationship', () => {
        beforeEach(async () => {
            readFileMock.rejects({ code: 'ENOENT' });
            await memoryService.loadMemory(mockFilePath);
            // Add test entities
            memoryService.addOrUpdateEntity({
                name: 'service-a',
                description: 'Service A',
                type: 'service',
                tags: [],
                properties: {}
            });
            memoryService.addOrUpdateEntity({
                name: 'service-b',
                description: 'Service B',
                type: 'service',
                tags: [],
                properties: {}
            });
        });

        it('should add new relationship between existing entities', () => {
            const relationship = {
                from: 'service-a',
                to: 'service-b',
                type: 'depends-on',
                properties: { version: '1.0.0' }
            };
            
            const result = memoryService.addOrUpdateRelationship(relationship);
            
            expect(result).to.be.true;
            const found = memoryService.findRelations({ from: 'service-a', to: 'service-b' });
            expect(found).to.have.lengthOf(1);
            expect(found[0]).to.deep.equal(relationship);
        });

        it('should update existing relationship properties', () => {
            const relationship = {
                from: 'service-a',
                to: 'service-b',
                type: 'depends-on',
                properties: { version: '1.0.0' }
            };
            memoryService.addOrUpdateRelationship(relationship);

            const update = {
                from: 'service-a',
                to: 'service-b',
                type: 'depends-on',
                properties: { version: '2.0.0', newProp: 'value' }
            };
            
            const result = memoryService.addOrUpdateRelationship(update);
            
            expect(result).to.be.true;
            const found = memoryService.findRelations({ from: 'service-a', to: 'service-b' });
            expect(found[0].properties).to.deep.equal({ version: '2.0.0', newProp: 'value' });
        });

        it('should reject relationship with non-existent from entity', () => {
            const relationship = {
                from: 'non-existent',
                to: 'service-b',
                type: 'depends-on',
                properties: {}
            };
            
            const result = memoryService.addOrUpdateRelationship(relationship);
            
            expect(result).to.be.false;
            const found = memoryService.findRelations({ from: 'non-existent' });
            expect(found).to.have.lengthOf(0);
        });

        it('should reject relationship with non-existent to entity', () => {
            const relationship = {
                from: 'service-a',
                to: 'non-existent',
                type: 'depends-on',
                properties: {}
            };
            
            const result = memoryService.addOrUpdateRelationship(relationship);
            
            expect(result).to.be.false;
            const found = memoryService.findRelations({ to: 'non-existent' });
            expect(found).to.have.lengthOf(0);
        });
    });

    describe('findRelations', () => {
        beforeEach(async () => {
            readFileMock.rejects({ code: 'ENOENT' });
            await memoryService.loadMemory(mockFilePath);
            // Add test entities and relationships
            memoryService.addOrUpdateEntity({ name: 'a', description: '', type: 'service', tags: [], properties: {} });
            memoryService.addOrUpdateEntity({ name: 'b', description: '', type: 'service', tags: [], properties: {} });
            memoryService.addOrUpdateEntity({ name: 'c', description: '', type: 'service', tags: [], properties: {} });
            
            memoryService.addOrUpdateRelationship({
                from: 'a',
                to: 'b',
                type: 'depends-on',
                properties: {}
            });
            memoryService.addOrUpdateRelationship({
                from: 'b',
                to: 'c',
                type: 'depends-on',
                properties: {}
            });
            memoryService.addOrUpdateRelationship({
                from: 'a',
                to: 'c',
                type: 'communicates-with',
                properties: {}
            });
        });

        it('should find relationships by from entity', () => {
            const found = memoryService.findRelations({ from: 'a' });
            expect(found).to.have.lengthOf(2);
        });

        it('should find relationships by to entity', () => {
            const found = memoryService.findRelations({ to: 'c' });
            expect(found).to.have.lengthOf(2);
        });

        it('should find relationships by type', () => {
            const found = memoryService.findRelations({ type: 'depends-on' });
            expect(found).to.have.lengthOf(2);
        });

        it('should find relationships by multiple criteria', () => {
            const found = memoryService.findRelations({ from: 'a', type: 'depends-on' });
            expect(found).to.have.lengthOf(1);
            expect(found[0].to).to.equal('b');
        });
    });

    describe('getContextAsString', () => {
        it('should return pretty-printed JSON string of current state', async () => {
            readFileMock.rejects({ code: 'ENOENT' });
            await memoryService.loadMemory(mockFilePath);
            const entity = {
                name: 'test-service',
                description: 'test',
                type: 'service',
                tags: ['tag1'],
                properties: { version: '1.0.0' }
            };
            memoryService.addOrUpdateEntity(entity);
            
            const contextString = memoryService.getContextAsString();
            const parsed = JSON.parse(contextString);
            
            expect(parsed).to.deep.equal({
                entities: [entity],
                relationships: []
            });
        });
    });
}); 