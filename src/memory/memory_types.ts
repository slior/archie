export interface Entity {
    name: string;
    description: string;
    type: string;
    tags: string[];
    properties: Record<string, any>;
}

export interface Relationship {
    from: string;
    to: string;
    type: string;
    properties: Record<string, any>;
}

export interface MemoryState {
    entities: Entity[];
    relationships: Relationship[];

    // asString(): string {
    //     return JSON.stringify(this, null, 2);
    // }
}

export const DEFAULT_MEMORY_STATE: MemoryState = {
    entities: [],
    relationships: [],
}; 