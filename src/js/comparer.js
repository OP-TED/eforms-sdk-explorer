export class Comparer {

    static TypeOfChange = Object.freeze({
        ADDED: 'added',
        REMOVED: 'removed',
        MODIFIED: 'modified',
        UNCHANGED: 'unchanged'
    });

    static compareDataStructures(oldStructure, newStructure, uniqueKey = 'id', performDeepComparison = false) {
        let comparisonResults = [];

        let oldMap = new Map(oldStructure.map(node => [node[uniqueKey], node]));
        let newMap = new Map(newStructure.map(node => [node[uniqueKey], node]));

        // First, check for removed nodes
        oldStructure.forEach(oldNode => {
            if (!newMap.has(oldNode[uniqueKey])) {
                comparisonResults.push({ ...oldNode, nodeChange: this.TypeOfChange.REMOVED });
            }
        });

        // Then, check for added nodes
        newStructure.forEach(newNode => {
            if (!oldMap.has(newNode[uniqueKey])) {
                comparisonResults.push({ ...newNode, nodeChange: this.TypeOfChange.ADDED });
            }
            if (oldMap.has(newNode[uniqueKey])) {
                const oldNode = oldMap.get(newNode[uniqueKey]);
                if (performDeepComparison && !Comparer.#areValuesEquivalent(oldNode, newNode)) {
                    comparisonResults.push({ ...newNode, nodeChange: this.TypeOfChange.MODIFIED });
                } else if (!comparisonResults.some(node => node[uniqueKey] === oldNode)) {
                    comparisonResults.push({ ...newNode, nodeChange: this.TypeOfChange.UNCHANGED });
                }
            }
        });

        return comparisonResults;
    }

    static #areValuesEquivalent(a, b) {
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


    static flattenStructure(structure, parentId = null) {
        let flatMap = new Map();

        structure.forEach(node => {
            flatMap.set(node.id, { ...node, parentId });
            if (node.contentType === 'group' && node.content) {
                const childMap = Comparer.flattenStructure(node.content, node.id);
                childMap.forEach((value, key) => flatMap.set(key, value));
            }
        });

        return flatMap;
    }

    static reconstructStructure(flatMap, parentId = null) {
        let structure = [];

        flatMap.forEach((node, id) => {
            if (node.parentId === parentId) {
                if (node.contentType === 'group') {
                    node.content = Comparer.reconstructStructure(flatMap, id);
                }
                structure.push(node);
            }
        });

        return structure;
    }

    static compareFlatStructures(oldFlatMap, newFlatMap) {
        const comparisonResults = new Map();
    
        oldFlatMap.forEach((oldNode, id) => {
            if (!newFlatMap.has(id)) {
                comparisonResults.set(id, { ...oldNode, nodeChange: this.TypeOfChange.REMOVED });
            } else {
                const newNode = newFlatMap.get(id);
                let nodeChange;
                if (newNode.contentType === "group") {
                    // Clone nodes without the content property for comparison
                    const oldNodeWithoutContent = { ...oldNode };
                    const newNodeWithoutContent = { ...newNode };
                    delete oldNodeWithoutContent.content;
                    delete newNodeWithoutContent.content;
    
                    // Compare the nodes without the content property
                    nodeChange = Comparer.#areValuesEquivalent(oldNodeWithoutContent, newNodeWithoutContent)
                        ? this.TypeOfChange.UNCHANGED
                        : this.TypeOfChange.MODIFIED;
                } else {
                    // If not a group, compare normally
                    nodeChange = Comparer.#areValuesEquivalent(oldNode, newNode) 
                        ? this.TypeOfChange.UNCHANGED 
                        : this.TypeOfChange.MODIFIED;
                }
                comparisonResults.set(id, { ...newNode, nodeChange });
            }
        });
    
        newFlatMap.forEach((newNode, id) => {
            if (!oldFlatMap.has(id)) {
                comparisonResults.set(id, { ...newNode, nodeChange: this.TypeOfChange.ADDED });
            }
        });
    
        return comparisonResults;
    }
    

    static compareNestedStructures(oldStructure, newStructure) {
        const oldFlatMap = Comparer.flattenStructure(oldStructure);
        const newFlatMap = Comparer.flattenStructure(newStructure);
        const comparisonResults = Comparer.compareFlatStructures(oldFlatMap, newFlatMap);
        return Comparer.reconstructStructure(comparisonResults);
    }
}

