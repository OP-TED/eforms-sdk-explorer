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
    
}