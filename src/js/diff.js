
/**
 * Encapsulates the result of the comparison between two sets (arrays) of objects.
 * 
 * It holds the comparison results in a Map, where the key is the id of the object and the value is a {@link DiffEntry} object.
 * To create a Diff object, use the static method {@link Diff.fromArrayComparison}.
 */
export class Diff {

    static TypeOfChange = Object.freeze({
        ADDED: 'added',
        REMOVED: 'removed',
        MODIFIED: 'modified',
        UNCHANGED: 'unchanged'
    });

    /** @type {Map<string, DiffEntry>} */
    #map;

    /**
     * 
     * @param {DiffEntry[]} entries 
     */
    constructor(entries = []) {
        this.#map = new Map(entries.map(entry => [entry.id, entry]));
    }

    /**
     * Creates a Diff from the comparison of two arrays of objects.
     * It takes a "main" and "base" array and and tries to identify what has been added, removed or modified from the base array to the main array.
     * For example, if an object exists only in the main array, it is considered to have been "added".
     * If an object exists only in the base array, it is considered to have been "removed".
     * 
     * @param {Object[]} mainArray The array that is used as "current" in the comparison.
     * @param {Object[]} baseArray The array that is used as the base for the comparison.
     * @param {string} idPropertyName The name of property that is present in both arrays and can be used as an id for the contained objects.
     * @returns {Diff}
     */
    static fromArrayComparison(mainArray, baseArray, idPropertyName = 'id') {
        const entries = [];

        // Create maps for quick lookup
        const mainMap = new Map(mainArray.map(obj => [obj[idPropertyName], obj]));
        const baseMap = new Map(baseArray.map(obj => [obj[idPropertyName], obj]));

        // First, check for removed nodes
        baseArray.forEach(obj => {
            const id = obj[idPropertyName];
            if (!mainMap.has(id)) {
                entries.push(new DiffEntry(id, null, obj, Diff.TypeOfChange.REMOVED));
            }
        });

        // Then, check for added or modified nodes
        mainArray.forEach(mainObj => {
            const id = mainObj[idPropertyName];
            const baseObj = baseMap.get(id);
            if (baseObj === undefined) {
                entries.push(new DiffEntry(id, mainObj, null, Diff.TypeOfChange.ADDED));
            } else {
                if (Diff.areEquivalent(baseObj, mainObj)) {
                    entries.push(new DiffEntry(id, mainObj, baseObj, Diff.TypeOfChange.UNCHANGED));
                } else {
                    entries.push(new DiffEntry(id, mainObj, baseObj, Diff.TypeOfChange.MODIFIED));
                }
            }
        });

        // Sort the entries so that they follow the same order as in the provided arrays. 
        const mainMapKeys = Array.from(mainMap.keys());
        const baseMapKeys = Array.from(baseMap.keys());
        entries.sort((a, b) => {
            const aOrder = a.typeOfChange === Diff.TypeOfChange.REMOVED ? baseMapKeys.indexOf(a.id) : mainMapKeys.indexOf(a.id);
            const bOrder = b.typeOfChange === Diff.TypeOfChange.REMOVED ? baseMapKeys.indexOf(b.id) : mainMapKeys.indexOf(b.id);
            return aOrder - bOrder;
        });

        return new Diff(entries);
    }

    static areEquivalent(a, b) {
        if (_.isEqual(a, b)) {
            return true;
        }

        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (!_.isEqual(a[i], b[i])) return false;
            }
            return true;
        }

        return false;
    }


    /**
     * Adds a {@link DiffEntry} to the diff.
     * 
     * @param {DiffEntry} entry 
     */
    add(entry) {
        this.#map.set(entry.id, entry);
    }

    /**
     * Gets the {@link DiffEntry} for the specified id.
     * 
     * @param {string} id 
     * @returns {DiffEntry}
     */
    get(id) {
        return this.#map.get(id);
    }

    /**
     * Allows iteration over the entries in the diff.
     * 
     * @param {function(DiffEntry):void} callback 
     */
    forEach(callback) {
        this.#map.forEach((value, key) => callback(value));
    }

    /**
     * Maps the entries in the diff to a new array.
     * 
     * @param {function(DiffEntry):*} callback 
     * @returns 
     */
    map(callback) {
        return Array.from(this.#map.values()).map(callback);
    }

    /**
     * Generator method for iterating over the entries in the diff.
     */
    *[Symbol.iterator]() {
        for (let entry of this.#map.values()) {
            yield entry;
        }
    }
}

/**
 * Encapsulates the comparison result between two objects as an entry in a {@link Diff} object.
 */
export class DiffEntry {

    /** @type {string} */
    id;

    /** @type {Object} */
    mainItem;

    /** @type {Object} */
    baseItem;
    
    /** @type {string} */
    typeOfChange;

    /**
     * 
     * @param {string} id 
     * @param {*} mainItem 
     * @param {*} baseItem 
     * @param {string} typeOfChange 
     */
    constructor(id, mainItem, baseItem, typeOfChange) {
        this.id = id;
        this.mainItem = mainItem;
        this.baseItem = baseItem;
        this.typeOfChange = typeOfChange;
    }

    /**
     * The DiffEntry stores two copies of the items: 
     * a main copy of the item and a copy of another version of the same which is used as the base for the comparison. 
     * This. function always returns the main copy of the item unless it has been "removed" in the main version, 
     * in which case it returns the base copy.
     * 
     * @returns {Object}
     */
    getItem() {
        if (this.typeOfChange === Diff.TypeOfChange.REMOVED) {
            return this.baseItem;
        }
        return this.mainItem;
    }

    /**
     * Gets the value of the specified property from the item.
     * 
     * @param {string} propertyName 
     * @returns 
     */
    get(propertyName) {
        return this.getItem()?.[propertyName];
    }

    /**
     * Get the {@link Diff.TypeOfChange} for the specified property.
     * 
     * @param {string} propertyName 
     * @returns {Diff.TypeOfChange | undefined}
     */
    propertyChange(propertyName) {
        if (!this.mainItem?.hasOwnProperty(propertyName) && !this.baseItem?.hasOwnProperty(propertyName)) {
            return undefined;
        }
        if (this.typeOfChange === Diff.TypeOfChange.UNCHANGED) {
            return Diff.TypeOfChange.UNCHANGED;
        }
        if (this.typeOfChange === Diff.TypeOfChange.REMOVED) {
            return Diff.TypeOfChange.REMOVED;
        }
        if (this.typeOfChange === Diff.TypeOfChange.ADDED) {
            return Diff.TypeOfChange.ADDED;
        }
        if (Diff.areEquivalent(this.mainItem?.[propertyName], this.baseItem?.[propertyName])) {
            return Diff.TypeOfChange.UNCHANGED;
        }
        if (this.mainItem?.[propertyName] === undefined) {  
            return Diff.TypeOfChange.REMOVED;
        }
        if (this.baseItem?.[propertyName] === undefined) {
            return Diff.TypeOfChange.ADDED;
        }
        return Diff.TypeOfChange.MODIFIED;
    }

    /**
     * Used to reconstruct a DiffEntry from a deserialized object.
     * 
     * We store the DiffEntry objects in the DOM as data attributes, 
     * which means that they are serialized to strings.
     * So, we need a way to reconstruct them from the data attributes in order to be able to call methods like {@link DiffEntry#get}.
     * 
     * @param {*} obj 
     * @returns 
     */
    static fromObject(obj) {
        let diffEntry = new DiffEntry(/* appropriate arguments */);
        // Assign properties from obj to diffEntry
        for (let prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                diffEntry[prop] = obj[prop];
            }
        }
        return diffEntry;
    }
}
