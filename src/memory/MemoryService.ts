import * as fs from 'fs/promises';
import * as path from 'path';
import { Entity, Relationship, MemoryState, DEFAULT_MEMORY_STATE } from './memory_types';

type ReadFileFn = (path: string) => Promise<string>;
type WriteFileFn = (path: string, data: string) => Promise<void>;

export class MemoryService {
    private memoryFilePath: string | null = null;
    private state: MemoryState = DEFAULT_MEMORY_STATE;
    private readFile: ReadFileFn;
    private writeFile: WriteFileFn;

    static fromState(state: MemoryState | undefined | null,
                     readFile: ReadFileFn = (path: string) => fs.readFile(path, 'utf-8'),
                     writeFile: WriteFileFn = (path: string, data: string) => fs.writeFile(path, data, 'utf-8')): MemoryService {
       const ret = new MemoryService(state ?? DEFAULT_MEMORY_STATE, readFile, writeFile);
       return ret;
    }


    private constructor(
        _state: MemoryState = DEFAULT_MEMORY_STATE,
        readFileFn: ReadFileFn = (path: string) => fs.readFile(path, 'utf-8'),
        writeFileFn: WriteFileFn = (path: string, data: string) => fs.writeFile(path, data, 'utf-8')
    ) {
        this.readFile = readFileFn;
        this.writeFile = writeFileFn;
        // Initialize with default empty state
        this.state = JSON.parse(JSON.stringify(_state)); // Deep copy
    }

    /**
     * Loads the memory state from the specified JSON file.
     * If the file doesn't exist, initializes with an empty state.
     * Throws an error for any I/O or parsing errors except ENOENT.
     */
    async loadMemory(filePath: string): Promise<void> {
        this.memoryFilePath = path.resolve(filePath);
        console.log(`MemoryService: Attempting to load memory from ${this.memoryFilePath}`);
        try {
            const data = await this.readFile(this.memoryFilePath);
            this.state = JSON.parse(data) as MemoryState;
            console.log(`MemoryService: Successfully loaded memory with ${this.state.entities.length} entities and ${this.state.relationships.length} relations.`);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.log(`MemoryService: Memory file not found at ${this.memoryFilePath}. Initializing with empty state.`);
                this.state = JSON.parse(JSON.stringify(DEFAULT_MEMORY_STATE)); // Deep copy
            } else {
                console.error(`MemoryService: Error loading memory file ${this.memoryFilePath}:`, error);
                throw error; // Re-throw for any other errors
            }
        }
    }

    /**
     * Saves the current memory state to the JSON file.
     * Throws an error if the save operation fails.
     */
    async saveMemory(): Promise<void> {
        if (!this.memoryFilePath) {
            throw new Error("MemoryService: Cannot save memory, file path not set (loadMemory was likely not called).");
        }
        console.log(`MemoryService: Saving memory to ${this.memoryFilePath}`);
        try {
            const data = JSON.stringify(this.state, null, 2); // Pretty print JSON
            await this.writeFile(this.memoryFilePath, data);
            console.log(`MemoryService: Successfully saved memory.`);
        } catch (error) {
            console.error(`MemoryService: Error saving memory file ${this.memoryFilePath}:`, error);
            throw error; // Re-throw the error
        }
    }

    /**
     * Adds or updates an entity in the memory state.
     * Ensures the entity name is unique.
     * @returns True if the entity was added, false if an entity with the same name already exists.
     */
    addOrUpdateEntity(entity: Entity): boolean {
        const existingEntity = this.state.entities.find(e => e.name === entity.name);
        if (existingEntity) {
            // Update existing entity
            existingEntity.description = entity.description;
            existingEntity.type = entity.type;
            existingEntity.tags = Array.from(new Set([...existingEntity.tags, ...entity.tags]));
            existingEntity.properties = { ...existingEntity.properties, ...entity.properties };
            console.log(`MemoryService: Updated entity "${entity.name}".`);
            return false;
        } else {
            // Add new entity
            this.state.entities.push(entity);
            console.log(`MemoryService: Added entity "${entity.name}".`);
            return true;
        }
    }

    /**
     * Adds or updates a relationship in the memory state.
     * Checks if the source and target entities exist.
     * @returns True if the relationship was added/updated, false if rejected (e.g., if entity check fails).
     */
    addOrUpdateRelationship(relationship: Relationship): boolean {
        // Check if related entities exist
        const fromExists = this.state.entities.some(e => e.name === relationship.from);
        const toExists = this.state.entities.some(e => e.name === relationship.to);
        if (!fromExists || !toExists) {
            console.warn(`MemoryService: Cannot add relation "${relationship.type}" from "${relationship.from}" to "${relationship.to}". One or both entities do not exist.`);
            return false;
        }

        // Find existing relationship
        const existingRelationship = this.state.relationships.find(r => 
            r.from === relationship.from && 
            r.to === relationship.to && 
            r.type === relationship.type
        );

        if (existingRelationship) {
            // Update existing relationship
            existingRelationship.properties = { ...existingRelationship.properties, ...relationship.properties };
            console.log(`MemoryService: Updated relation "${relationship.type}" from "${relationship.from}" to "${relationship.to}".`);
        } else {
            // Add new relationship
            this.state.relationships.push(relationship);
            console.log(`MemoryService: Added relation "${relationship.type}" from "${relationship.from}" to "${relationship.to}".`);
        }
        return true;
    }

    /**
     * Finds an entity by its unique name.
     */
    findEntityByName(name: string): Entity | undefined {
        return this.state.entities.find(e => e.name === name);
    }

    /**
     * Finds relationships matching specific criteria (from, to, type).
     * Any combination of criteria can be provided.
     */
    findRelations(query: Partial<Pick<Relationship, 'from' | 'to' | 'type'>>): Relationship[] {
        return this.state.relationships.filter(r => {
            const matchFrom = !query.from || r.from === query.from;
            const matchTo = !query.to || r.to === query.to;
            const matchType = !query.type || r.type === query.type;
            return matchFrom && matchTo && matchType;
        });
    }

    /**
     * Returns the current memory state as a string.
     */
    getContextAsString(): string {
        return JSON.stringify(this.state, null, 2);
    }

    /**
     * Updates the current memory state with new state data.
     * Used to sync the global memory instance with updated state from graph execution.
     */
    updateFromState(newState: MemoryState): void {
        this.state = JSON.parse(JSON.stringify(newState)); // Deep copy for safety
        console.log(`MemoryService: Updated state with ${this.state.entities.length} entities and ${this.state.relationships.length} relationships.`);
    }

    // Example method to get the entire state (use with caution)
    getCurrentState(): Readonly<MemoryState> {
        return this.state;
    }
}

