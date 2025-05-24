import * as fs from 'fs/promises';
import * as path from 'path';
import { Entity, Relationship, MemoryState, DEFAULT_MEMORY_STATE } from './memory_types';
import { dbg, say } from '../utils';

type ReadFileFn = (path: string) => Promise<string>;
type WriteFileFn = (path: string, data: string) => Promise<void>;

/**
 * Manages the in-memory knowledge graph, including entities and relationships.
 * It supports loading from and saving to a JSON file, and provides
 * methods for querying and modifying the graph.
 */
export class MemoryService {
    /** The file path where the memory state is stored. Null if not yet loaded or saved. */
    private memoryFilePath: string | null = null;
    /** The current state of the memory, holding entities and relationships. */
    private state: MemoryState = DEFAULT_MEMORY_STATE;
    /** Function used to read files, allowing for dependency injection (e.g., for testing). */
    private readFile: ReadFileFn;
    /** Function used to write files, allowing for dependency injection (e.g., for testing). */
    private writeFile: WriteFileFn;

    /**
     * Creates a new MemoryService instance from a given state.
     * If no state is provided, it initializes with the default empty state.
     * Allows overriding file read/write functions for testing or custom storage.
     * @param state - The initial memory state. Defaults to `DEFAULT_MEMORY_STATE` if null or undefined.
     * @param readFile - Optional function to read files. Defaults to `fs.readFile`.
     * @param writeFile - Optional function to write files. Defaults to `fs.writeFile`.
     * @returns A new instance of MemoryService.
     */
    static fromState(state: MemoryState | undefined | null,
                     readFile: ReadFileFn = (path: string) => fs.readFile(path, 'utf-8'),
                     writeFile: WriteFileFn = (path: string, data: string) => fs.writeFile(path, data, 'utf-8')): MemoryService {
       const ret = new MemoryService(state ?? DEFAULT_MEMORY_STATE, readFile, writeFile);
       return ret;
    }

    /**
     * Private constructor to initialize the MemoryService.
     * Use `MemoryService.fromState()` for creating instances.
     * @param _state - The initial memory state. Defaults to `DEFAULT_MEMORY_STATE`.
     * @param readFileFn - Function to read files.
     * @param writeFileFn - Function to write files.
     */
    private constructor(
        _state: MemoryState = DEFAULT_MEMORY_STATE,
        readFileFn: ReadFileFn = (path: string) => fs.readFile(path, 'utf-8'),
        writeFileFn: WriteFileFn = (path: string, data: string) => fs.writeFile(path, data, 'utf-8')
    ) {
        this.readFile = readFileFn;
        this.writeFile = writeFileFn;
        // Initialize with default empty state, ensuring a deep copy
        this.state = JSON.parse(JSON.stringify(_state));
    }

    /**
     * Loads the memory state from the specified JSON file.
     * If the file doesn't exist, initializes with an empty state.
     * Throws an error for any I/O or parsing errors except ENOENT (file not found).
     * @param filePath - The path to the memory file to load.
     * @returns A promise that resolves when the memory is loaded.
     */
    async loadMemory(filePath: string): Promise<void> {
        this.memoryFilePath = path.resolve(filePath);
        say(`MemoryService: Attempting to load memory from ${this.memoryFilePath}`);
        try {
            const data = await this.readFile(this.memoryFilePath);
            this.state = JSON.parse(data) as MemoryState;
            dbg(`MemoryService: Successfully loaded memory with ${this.state.entities.length} entities and ${this.state.relationships.length} relations.`);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                dbg(`MemoryService: Memory file not found at ${this.memoryFilePath}. Initializing with empty state.`);
                this.state = JSON.parse(JSON.stringify(DEFAULT_MEMORY_STATE)); // Deep copy
            } else {
                console.error(`MemoryService: Error loading memory file ${this.memoryFilePath}:`, error);
                throw error; // Re-throw for any other errors
            }
        }
    }

    /**
     * Saves the current memory state to the JSON file.
     * The file path must have been set by a prior call to `loadMemory`.
     * Throws an error if the save operation fails or if the file path is not set.
     * @returns A promise that resolves when the memory is saved.
     */
    async saveMemory(): Promise<void> {
        if (!this.memoryFilePath) {
            throw new Error("MemoryService: Cannot save memory, file path not set (loadMemory was likely not called).");
        }
        say(`MemoryService: Saving memory to ${this.memoryFilePath}`);
        try {
            const data = JSON.stringify(this.state, null, 2); // Pretty print JSON
            await this.writeFile(this.memoryFilePath, data);
            dbg(`MemoryService: Successfully saved memory.`);
        } catch (error) {
            console.error(`MemoryService: Error saving memory file ${this.memoryFilePath}:`, error);
            throw error; // Re-throw the error
        }
    }

    /**
     * Adds a new entity or updates an existing one in the memory state.
     * Entities are identified by their unique `name`. If an entity with the
     * same name exists, its properties are updated. Otherwise, a new entity is added.
     * Tags are merged, and properties are shallow-merged (new properties overwrite old ones).
     * @param entity - The entity to add or update.
     * @returns `true` if a new entity was added, `false` if an existing entity was updated.
     */
    addOrUpdateEntity(entity: Entity): boolean {
        const existingEntity = this.state.entities.find(e => e.name === entity.name);
        if (existingEntity) {
            // Update existing entity
            existingEntity.description = entity.description;
            existingEntity.type = entity.type;
            existingEntity.tags = Array.from(new Set([...existingEntity.tags, ...entity.tags]));
            existingEntity.properties = { ...existingEntity.properties, ...entity.properties };
            dbg(`MemoryService: Updated entity "${entity.name}".`);
            return false;
        } else {
            // Add new entity
            this.state.entities.push(entity);
            dbg(`MemoryService: Added entity "${entity.name}".`);
            return true;
        }
    }

    /**
     * Adds a new relationship or updates an existing one in the memory state.
     * A relationship is uniquely identified by its `from` entity, `to` entity, and `type`.
     * If a matching relationship exists, its properties are updated (shallow merge).
     * Before adding/updating, it checks if the `from` and `to` entities exist in memory.
     * @param relationship - The relationship to add or update.
     * @returns `true` if the relationship was successfully added or updated.
     *          `false` if the `from` or `to` entity does not exist, preventing the operation.
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
            dbg(`MemoryService: Updated relation "${relationship.type}" from "${relationship.from}" to "${relationship.to}".`);
        } else {
            // Add new relationship
            this.state.relationships.push(relationship);
            dbg(`MemoryService: Added relation "${relationship.type}" from "${relationship.from}" to "${relationship.to}".`);
        }
        return true;
    }

    /**
     * Finds an entity by its unique name.
     * @param name - The name of the entity to find.
     * @returns The `Entity` object if found, otherwise `undefined`.
     */
    findEntityByName(name: string): Entity | undefined {
        return this.state.entities.find(e => e.name === name);
    }

    /**
     * Finds relationships matching specific criteria (from entity, to entity, type).
     * Finds relationships matching specific criteria (from, to, type).
     * Any combination of criteria can be provided.
     * @param query - The query object containing optional criteria for matching relationships.
     * @returns An array of relationships that match the provided criteria.
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
     * @returns The current memory state as a JSON string.
     */
    getContextAsString(): string {
        return JSON.stringify(this.state, null, 2);
    }

    /**
     * Updates the current memory state with new state data.
     * Used to sync the global memory instance with updated state from graph execution.
     * @param newState - The new memory state to update from.
     */
    updateFromState(newState: MemoryState): void {
        this.state = JSON.parse(JSON.stringify(newState)); // Deep copy for safety
        dbg(`MemoryService: Updated state with ${this.state.entities.length} entities and ${this.state.relationships.length} relationships.`);
    }

    
    /**
     * Returns the current memory state.
     * @returns The current memory state.
     */
    getCurrentState(): Readonly<MemoryState> {
        return this.state;
    }
}

