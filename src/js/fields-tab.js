import { TabController } from "./tab-controller.js";
import { appState } from "./state.js";
import { appConfig } from "./config.js";
import { Diff, DiffEntry } from "./diff.js"; 
import { PropertyCard } from "./property-card.js";

export class FieldsTab extends TabController {

    constructor() {
        super('fields-tab');
    }

    /**
     * Overridden to hook up event handlers.
     */
    init() {
        super.init();

        // Listen for changes in the search fields
        $('#fields-tree-search').keyup(this.#searchJsTree);
        $('#fields-tree-filter').change(this.#searchJsTree);

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
                this.initialiseJsTree(() => this.#createJsTreeNodes(nodesDiff, fieldsDiff), this.#searchCallback);
            }
        } catch (error) {
            console.error('Error fetching and displaying fields.json contents: ', error);
            throw new Error('Failed to load data');
        }
    }


    /**
     * Creates the tree-nodes for the JsTree from {@link Diff} objects of SDK Nodes and SDK Fields.
     * 
     * @param {Diff} nodesDiff A Diff object containing the differences between the main and base versions of the SDK Nodes. 
     * @param {Diff} fieldsDiff A Diff object containing the differences between the main and base versions of the SDK Fields.
     * 
     * @returns {Array} An array of tree-nodes ready for loading onto a JsTree. 
     */
    #createJsTreeNodes(nodesDiff, fieldsDiff) {

        const treeDataMap = new Map(nodesDiff.map(diffEntry => {
            return [diffEntry.id, {
                id: diffEntry.id,
                parent: diffEntry.get('parentId') || "#",
                text: diffEntry.get('name') || diffEntry.id,
                state: {
                    opened: true
                },
                li_attr: { class: `${diffEntry.typeOfChange}-node` },
                data: diffEntry
            }];
        }));


        fieldsDiff.forEach(diffEntry => {
            treeDataMap.set(diffEntry.id, {
                id: diffEntry.id,
                parent: diffEntry.get('parentNodeId'),
                text: diffEntry.get('name') || diffEntry.id,
                icon: 'jstree-file',
                state: {
                    opened: true
                },
                li_attr: { class: `${diffEntry.typeOfChange}-node` },
                data: diffEntry
            });
        });

        return Array.from(treeDataMap.values());
    }

    /**
     * Initiates a search in the JsTree.
     */
    #searchJsTree() {
        // Get the value of the search input field
        let searchString = $('#fields-tree-filter').val() + '::' + $('#fields-tree-search').val();

        // Search the tree
        $('#xmlStructureTree').jstree('search', searchString);
    }

    /**
     * 
     * @param {DiffEntry} diffEntry 
     * @param {string} status 
     * @param {string} searchText
     * 
     * @returns {boolean} 
     */
    #searchCallback(diffEntry, status, searchText = '') {
        let textMatch = false;

        if (searchText.length > 0 && !searchText.startsWith('|')) {
            let combined = (diffEntry?.get('name') || '') + '|' + (diffEntry?.get('btId') || '') + '|' + (diffEntry?.get('id') || '') + '|' + (diffEntry?.get('xpathRelative') || '');
            textMatch = combined.toLowerCase().indexOf(searchText) > -1;
        }

        if (status === 'all') {
            return textMatch;
        } else {
            return (diffEntry?.typeOfChange === status) && (textMatch || searchText === '');
        }
    }

    initialiseJsTree(getTreeNodesCallback, searchCallback) {
        if ($('#xmlStructureTree').jstree(true)) {
            $('#xmlStructureTree').jstree("destroy");
        }
        $('#xmlStructureTree').jstree({
            core: {
                data: getTreeNodesCallback(),
                check_callback: true
            },
            plugins: ["wholerow", "search"],
            search: {
                show_only_matches: true,
                search_callback: (str, node) => searchCallback(DiffEntry.fromObject(node?.data), ...str.split('::'))
            }
        });
        
        // Listen for selection changes in the tree
        $('#xmlStructureTree').on("select_node.jstree", (e, data) => {
            this.displayDetails(DiffEntry.fromObject(data.node.data));
        });
    }

    /**
     * Called when a tree-node is selected in the JsTree.
     * Displays the details of the selected node.
     * 
     * @param {DiffEntry} diffEntry 
     */
    displayDetails(diffEntry) {
    
        // Clear existing content
        $('#fieldDetailsContent').empty();
    
        const $ul = $('<ul class="list-group">');
    
        for (const [key, value] of Object.entries(diffEntry.getItem())) {
            const mainValue = diffEntry?.mainItem ? diffEntry?.mainItem[key] ?? undefined : undefined;
            const baseValue = diffEntry?.baseItem ? diffEntry?.baseItem[key] ?? undefined : undefined;
            const card = PropertyCard.create(key, diffEntry.mainItem ? mainValue : undefined, baseValue);
            $ul.append(card);
        }

        // Handle removed properties in diffEntry.baseItem that are not in diffEntry.mainItem
        if (diffEntry.mainItem) {
            for (const key in diffEntry.baseItem) {
                if (!diffEntry.mainItem.hasOwnProperty(key) && key !== 'content') {
                    const card = PropertyCard.create(key, undefined, diffEntry.baseItem[key]);
                    $ul.append(card);
                }
            }
        }

        $('#fieldDetailsContent').append($ul);
    }
}
