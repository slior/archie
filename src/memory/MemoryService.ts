import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryState, Entity, Relation } from './types';

const DEFAULT_MEMORY_STATE: MemoryState = { entities: [], relations: [] };

export class MemoryService {
    private memoryFilePath: string = '';
    private state: MemoryState = DEFAULT_MEMORY_STATE;

    constructor() {
        // Initialize with default empty state
        this.state = JSON.parse(JSON.stringify(DEFAULT_MEMORY_STATE)); // Deep copy
    }

    /**
     * Loads the memory state from the specified JSON file.
     * If the file doesn't exist, initializes with an empty state.
     */
    async loadMemory(filePath: string): Promise<void> {
        this.memoryFilePath = path.resolve(filePath);
        console.log(`MemoryService: Attempting to load memory from ${this.memoryFilePath}`);
        try {
            const data = await fs.readFile(this.memoryFilePath, 'utf-8');
            this.state = JSON.parse(data) as MemoryState;
            // TODO: Add validation for the loaded state structure?
            console.log(`MemoryService: Successfully loaded memory with ${this.state.entities.length} entities and ${this.state.relations.length} relations.`);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.log(`MemoryService: Memory file not found at ${this.memoryFilePath}. Initializing with empty state.`);
                this.state = JSON.parse(JSON.stringify(DEFAULT_MEMORY_STATE)); // Deep copy
                // Optionally save the initial empty state immediately
                // await this.saveMemory();
            } else {
                console.error(`MemoryService: Error loading memory file ${this.memoryFilePath}:`, error);
                // Decide how to handle corrupted files - throw, reset, etc.
                // For now, we reset to default to allow the application to start.
                this.state = JSON.parse(JSON.stringify(DEFAULT_MEMORY_STATE));
            }
        }
    }

    /**
     * Saves the current memory state to the JSON file.
     */
    async saveMemory(): Promise<void> {
        if (!this.memoryFilePath) {
            console.error("MemoryService: Cannot save memory, file path not set (loadMemory was likely not called).");
            return;
        }
        console.log(`MemoryService: Saving memory to ${this.memoryFilePath}`);
        try {
            const data = JSON.stringify(this.state, null, 2); // Pretty print JSON
            await fs.writeFile(this.memoryFilePath, data, 'utf-8');
            console.log(`MemoryService: Successfully saved memory.`);
        } catch (error) {
            console.error(`MemoryService: Error saving memory file ${this.memoryFilePath}:`, error);
        }
    }

    /**
     * Adds a new entity to the memory state.
     * Ensures the entity name is unique.
     * @returns True if the entity was added, false if an entity with the same name already exists.
     */
    addEntity(entity: Entity): boolean {
        if (this.state.entities.some(e => e.name === entity.name)) {
            console.warn(`MemoryService: Entity with name "${entity.name}" already exists. Cannot add duplicate.`);
            return false;
        }
        this.state.entities.push(entity);
        console.log(`MemoryService: Added entity "${entity.name}".`);
        return true;
    }

    /**
     * Adds a new relation to the memory state.
     * Optionally checks if the source and target entities exist.
     * @returns True if the relation was added, false otherwise (e.g., if entity check fails).
     */
    addRelation(relation: Relation): boolean {
        // Optional: Check if related entities exist
        const fromExists = this.state.entities.some(e => e.name === relation.from);
        const toExists = this.state.entities.some(e => e.name === relation.to);
        if (!fromExists || !toExists) {
            console.warn(`MemoryService: Cannot add relation "${relation.label}" from "${relation.from}" to "${relation.to}". One or both entities do not exist.`);
            return false;
        }

        // Optional: Check for duplicate relations?
        // For now, allow multiple relations of the same type between entities.
        this.state.relations.push(relation);
        console.log(`MemoryService: Added relation "${relation.label}" from "${relation.from}" to "${relation.to}".`);
        return true;
    }

    /**
     * Finds an entity by its unique name.
     */
    findEntityByName(name: string): Entity | undefined {
        return this.state.entities.find(e => e.name === name);
    }

    /**
     * Finds relations matching specific criteria (from, to, label).
     * Any combination of criteria can be provided.
     */
    findRelations(query: Partial<Pick<Relation, 'from' | 'to' | 'label'>>): Relation[] {
        return this.state.relations.filter(r => {
            const matchFrom = !query.from || r.from === query.from;
            const matchTo = !query.to || r.to === query.to;
            const matchLabel = !query.label || r.label === query.label;
            return matchFrom && matchTo && matchLabel;
        });
    }

    // Example method to get the entire state (use with caution)
    getCurrentState(): Readonly<MemoryState> {
        return this.state;
    }
} 