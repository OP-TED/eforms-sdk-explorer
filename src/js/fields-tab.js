import { TabController } from "./tab-controller.js";
import { appState } from "./state.js";
import { appConfig } from "./config.js";
import { Diff, DiffEntry } from "./diff.js"; 
import { TreeDetailSplitView } from "./tree-detail-split-view.js";

export class FieldsTab extends TabController {

    constructor() {
        super('fields-tab');
    }

    async fetchAndRender() {

        const mainVersionUrl = `${appConfig.rawBaseUrl}/${appState.mainVersion}/fields/fields.json`;
        const comparisonVersionUrl = `${appConfig.rawBaseUrl}/${appState.baseVersion}/fields/fields.json`;

        try {
            const response1 = await $.ajax({ url: mainVersionUrl, dataType: 'json' });
            const mainVersionNodes = response1.xmlStructure;
            const mainVersionFields = response1.fields;

            const response2 = await $.ajax({ url: comparisonVersionUrl, dataType: 'json' });
            const baseVersionNodes = response2.xmlStructure;
            const baseVersionFields = response2.fields;

            if (mainVersionNodes && baseVersionNodes) {
                const nodesDiff = Diff.fromArrayComparison(mainVersionNodes, baseVersionNodes, 'id');
                const fieldsDiff = Diff.fromArrayComparison(mainVersionFields, baseVersionFields, 'id');
                this.#splitView().initialise({
                    dataCallback: () => this.#createTreeNodes(nodesDiff, fieldsDiff),
                    searchCallback: this.#searchCallback,
                    popover: {
                        title: 'Looking for a particular item?',
                        content: 
                            `<p>Search and highlight items by id, name, BT or relative XPath.</p>
                            <ul><li>Example: search for <code>cbc:ID</code> to find all items with "cbc:ID" in their xpathRelative.</li></ul>
                            <p>Use space or comma (<code>,</code>) to separate multiple search terms:</p>
                            <ul><li><code>term1 term2,term3</code> means "(term1 AND term2) OR term3"</li></ul>
                            <p>Prefix a property name with plus (<code>+</code>), minus (<code>-</code>) or tilde (<code>~</code>) to search for items with the specified property added, removed or modified.</p>
                            <ul><li>Example: search for <code>~codeList</code> to find all items with their "codeList" property modified.</li></ul>
                            <p>Prefix with asterisk (<code>*</code>) to detect any change in the property.</p>
                            <ul><li>Example: search for <code>*codeList</code> to find all items with their "codeList" property added, removed or modified.</li></ul>
                            <p>Property names are <code>caseSensitive</code>.</p>`
                    }
                });
            }
        } catch (error) {
            console.error('Error fetching and displaying fields.json contents: ', error);
            throw new Error('Failed to load data');
        }
    }

    /**
     * Gets the {@link TreeDetailSplitView} element for this tab.
     * @returns {TreeDetailSplitView}
     */
    #splitView() {
        return document.getElementById('fields-explorer');
    }


    /**
     * Creates the tree-nodes for the JsTree from {@link Diff} objects of SDK Nodes and SDK Fields.
     * 
     * @param {Diff} nodesDiff A Diff object containing the differences between the main and base versions of the SDK Nodes. 
     * @param {Diff} fieldsDiff A Diff object containing the differences between the main and base versions of the SDK Fields.
     * 
     * @returns {Array} An array of tree-nodes ready for loading onto a JsTree. 
     */
    #createTreeNodes(nodesDiff, fieldsDiff) {

        const treeNodes = new Map(nodesDiff.map(diffEntry => {
            return [diffEntry.id, {
                id: diffEntry.id,
                parent: diffEntry.get('parentId') ?? "#",
                text: diffEntry.get('name') ?? diffEntry.id,
                icon: 'jstree-folder',
                state: {
                    opened: true
                },
                li_attr: { class: `${diffEntry.typeOfChange}-node` },
                data: diffEntry
            }];
        }));


        fieldsDiff.forEach(diffEntry => {
            treeNodes.set(diffEntry.id, {
                id: diffEntry.id,
                parent: diffEntry.get('parentNodeId'),
                text: diffEntry.get('name') ?? diffEntry.id,
                icon: 'jstree-file',
                state: {
                    opened: true
                },
                li_attr: { class: `${diffEntry.typeOfChange}-node` },
                data: diffEntry
            });
        });

        return Array.from(treeNodes.values());
    }

    /**
     * Checks if the {@link DiffEntry} matches the search criteria.
     * 
     * @param {DiffEntry} diffEntry 
     * @param {string} status 
     * @param {string} searchText
     * @returns {boolean} 
     */
    #searchCallback(diffEntry, status, searchText = '') {
        let textMatch = false;

        searchText = searchText.trim();
    
        if (searchText.length > 0 && !searchText.startsWith('|')) {
            let combined = (diffEntry?.get('name') || '') + '|' + (diffEntry?.get('btId') || '') + '|' + (diffEntry?.get('id') || '') + '|' + (diffEntry?.get('xpathRelative') || '');
            let orTerms = searchText.split(','); // Split the searchText at comma
    
            // Check if any of the OR terms are in the combined string
            textMatch = orTerms.some(orTerm => {
                orTerm = orTerm.trim();
                let andTerms = orTerm.split(' '); // Split the OR term at whitespace

                // Check if all of the AND terms are in the combined string
                return andTerms.every(term => {
                    term = term.trim();
                    if (term === '') {
                        return true;    // This effectively ignores empty terms (caused by multiple spaces)
                    }

                    switch (term.charAt(0)) {
                        case '+': return diffEntry?.propertyChange(term.substring(1)) === Diff.TypeOfChange.ADDED;
                        case '-': return diffEntry?.propertyChange(term.substring(1)) === Diff.TypeOfChange.REMOVED;
                        case '~': return diffEntry?.propertyChange(term.substring(1)) === Diff.TypeOfChange.MODIFIED;
                        case '*': return [Diff.TypeOfChange.ADDED, Diff.TypeOfChange.REMOVED, Diff.TypeOfChange.MODIFIED].includes(diffEntry?.propertyChange(term.substring(1)));
                        default: return combined.toLowerCase().indexOf(term.toLowerCase()) > -1;
                    }
                });
            });
        }
    
        if (status === 'all') {
            return textMatch;
        } else {
            return (diffEntry?.typeOfChange === status) && (textMatch || searchText === '');
        }
    }
}
