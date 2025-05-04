import * as uuid from 'uuid'; 

export function dbg(s: string) {
    console.debug(s);
}

export function say(s: string) {
    console.log(s);
}

export function newGraphConfig() {
    const thread_id = uuid.v4();
    return { configurable: { thread_id } };
}