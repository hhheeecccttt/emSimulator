const OBJECT_TYPES = [];

export function registerType(cls) {
    OBJECT_TYPES.push(cls);
}

export function getType(id) {
    return OBJECT_TYPES.find(t => t.id === id);
}

export function getAllTypes() {
    return OBJECT_TYPES;
}

export async function loadAllModels() {
    const results = await Promise.allSettled(
        OBJECT_TYPES.map(Cls => Cls.loadModel())
    );
    for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
            console.warn(`Failed to load model for "${OBJECT_TYPES[i].id}":`, results[i].reason);
        }
    }
}
