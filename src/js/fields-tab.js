import { TabController } from "./tab-controller.js";
import { appState } from "./state.js";
import { appConfig, domElements } from "./config.js";
import { Diff } from "./diff.js"; 
import { PropertyCard } from "./property-card.js";

export class FieldsTab extends TabController {

    constructor() {
        super('fields-tab');
    }

    async fetchAndRender() {

        const mainVersionUrl = `${appConfig.rawBaseUrl}/${appState.mainVersion}/fields/fields.json`;
        const comparisonVersionUrl = `${appConfig.rawBaseUrl}/${appState.baseVersion}/fields/fields.json`;

        try {
            const response1 = await $.ajax({ url: mainVersionUrl, dataType: 'json' });
            appState.versionData = response1.xmlStructure;
            appState.versionDataFields = response1.fields;
            appState.versionData[0].version = response1.newVersion;

            const response2 = await $.ajax({ url: comparisonVersionUrl, dataType: 'json' });
            response2.xmlStructure[0].version = response2.newVersion;
            appState.comparisonData = response2.xmlStructure;
            appState.comparisonDataFields = response2.fields;

            if (appState.versionData && appState.comparisonData) {
                const nodesDiff = Diff.fromArrayComparison(appState.versionData, appState.comparisonData, 'id');
                const fieldsDiff = Diff.fromArrayComparison(appState.versionDataFields, appState.comparisonDataFields, 'id');
                this.initializeTree(nodesDiff, fieldsDiff);
            }
        } catch (error) {
            console.error('Error fetching and displaying fields content:', error);
            throw new Error('Failed to load data');
        } 
    }


    /**
     * 
     * @param {Diff} nodesDiff 
     * @param {Diff} fieldsDiff 
     * @returns 
     */
    buildTreeData(nodesDiff, fieldsDiff) {

        const treeDataMap = new Map(nodesDiff.map(diffEntry => {
            return [diffEntry.id, {
                id: diffEntry.id,
                parent: diffEntry.get('parentId') || "#",
                text: diffEntry.get('name') || diffEntry.id,
                state: {
                    opened: true
                },
                li_attr: { class: `${diffEntry.typeOfChange}-node` },
                data: {
                    btId: diffEntry.get('btId'),
                    xpathRelative: diffEntry.get('xpathRelative'),
                    status: diffEntry.typeOfChange
                }
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
                data: {
                    id: diffEntry.id,
                    btId: diffEntry.get('btId'),
                    xpathRelative: diffEntry.get('xpathRelative'),
                    status: diffEntry.typeOfChange
                }
            });
        });

        return Array.from(treeDataMap.values());
    }

    initializeTree(xmlStructureDiff, fieldsDiff) {
        if (domElements.xmlStructureTree.jstree(true)) {
            domElements.xmlStructureTree.jstree("destroy");
        }
        domElements.xmlStructureTree.jstree({
            core: {
                data: this.buildTreeData(xmlStructureDiff, fieldsDiff),
                check_callback: true
            },
            plugins: ["wholerow", "search"],
            'search': {
                'show_only_matches': true,
                search_callback: function (str, node) {

                    let terms = str.split('::');
                    let status = terms[0];
                    let searchText = terms.length > 1 ? terms[1] : '';

                    let textMatch = false;
                    if (searchText.length > 0 && !searchText.startsWith('|')) {
                        let combined = (node?.text || '') + '|' + (node?.data?.btId || '') + '|' + (node?.data?.id || '') + '|' + (node?.data?.xpathRelative || '');
                        textMatch = combined.toLowerCase().indexOf(searchText) > -1;
                    }

                    if (status === 'all') {
                        return textMatch;
                    } else {
                        return (node?.data?.status === status) && (textMatch || searchText === '');
                    }
                }
            }
        });

        domElements.xmlStructureTree.on("select_node.jstree", (e, data) => {
            const selectedFieldId = data.node.id;
            const fieldDetails = fieldsDiff.get(selectedFieldId);
            if (fieldDetails) {
                let oldMap = new Map(appState.comparisonDataFields.map(node => [node.id, node]));
                let newMap = new Map(appState.versionDataFields.map(node => [node.id, node]));
                this.displayFieldDetails(fieldDetails, oldMap, newMap, domElements.fieldDetailsContent, 'id');
            }
            const nodeDetails = xmlStructureDiff.get(selectedFieldId);
            if (nodeDetails) {
                let oldMap = new Map(appState.comparisonData.map(node => [node.id, node]));
                let newMap = new Map(appState.versionData.map(node => [node.id, node]));
                this.displayFieldDetails(nodeDetails, oldMap, newMap, domElements.fieldDetailsContent, 'id');
            }
        });

        // Listen for changes in the search fields
        $('#fields-tree-search').keyup(searchTree);
        $('#fields-tree-filter').change(searchTree);

        function searchTree() {
            // Get the value of the search input field
            let searchString = $('#fields-tree-filter').val() + '::' + $('#fields-tree-search').val();

            // Search the tree
            domElements.xmlStructureTree.jstree('search', searchString);
        }
    }

    displayFieldDetails(data, oldMap, newMap, container, uniqueKey = 'id') {
        function createTree(uniqueId) {
            const newField = newMap.get(uniqueId);
            const oldField = oldMap.get(uniqueId);
            const $ul = $('<ul class="list-group">');
    
            const fieldToIterate = newField || oldField;
    
            for (const [key, value] of Object.entries(fieldToIterate)) {
                if (key === 'content') {
                    continue;
                }
                const newValue = newField ? newField[key] : undefined;
                const oldValue = oldField ? oldField[key] : undefined;
                const $propertyTemplate = PropertyCard.create(key, newField ? newValue : undefined, oldValue);
                $ul.append($propertyTemplate);
            }
    
            // Handle removed properties in oldField that are not in newField
            if (newField) {
                for (const key in oldField) {
                    if (!newField.hasOwnProperty(key) && key !== 'content') {
                        const $removedPropertyTemplate = PropertyCard.create(key, undefined, oldField[key]);
                        $ul.append($removedPropertyTemplate);
                    }
                }
            }
    
            return $ul;
        }
    
        // Clear existing content
        $(container).empty();
    
        if (Array.isArray(data)) {
            data.forEach(item => {
                const $itemTree = createTree(item[uniqueKey]);
                const $itemContainer = $('<div class="notice-type-card mb-3"></div>').append($itemTree);
                $(container).append($itemContainer);
            });
        } else {
            const $tree = createTree(data[uniqueKey]);
            $(container).append($tree);
        }
    }
    
}
