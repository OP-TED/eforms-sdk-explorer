import { TabController } from "./tab-controller.js";
import { appState } from "./state.js";
import { appConfig, domElements } from "./config.js";
import { Comparer } from "./comparer.js"; 
import { PropertyCard } from "./property-card.js";

export class FieldsTab extends TabController {

    constructor() {
        super('fields-tab');
    }

    async fetchAndRender() {

        const mainVersionUrl = `${appConfig.rawBaseUrl}/${appState.newVersion}/fields/fields.json`;
        const comparisonVersionUrl = `${appConfig.rawBaseUrl}/${appState.comparisonVersion}/fields/fields.json`;

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
                const xmlComparisonResults = Comparer.compareDataStructures(appState.comparisonData, appState.versionData, 'id', true);
                const fieldsComparisonResults = Comparer.compareDataStructures(appState.comparisonDataFields, appState.versionDataFields, 'id', true);
                this.initializeTree(xmlComparisonResults, fieldsComparisonResults);
            }
        } catch (error) {
            console.error('Error fetching and displaying fields content:', error);
            throw new Error('Failed to load data');
        } 
    }


    buildTreeData(xmlStructure, fieldsComparisonResults) {

        const treeDataMap = new Map(xmlStructure.map(node => {
            return [node.id, {
                id: node.id,
                parent: node.parentId || "#",
                text: node.name || node.id,
                state: {
                    opened: true
                },
                li_attr: node.nodeChange === Comparer.TypeOfChange.REMOVED ? { class: 'removed-node' } :
                    node.nodeChange === Comparer.TypeOfChange.ADDED ? { class: 'added-node' } :
                        node.nodeChange === Comparer.TypeOfChange.MODIFIED ? { class: 'modified-node' } : {},
                data: {
                    btId: node.btId,
                    xpathRelative: node.xpathRelative,
                    status: node.nodeChange
                }
            }];
        }));


        fieldsComparisonResults.forEach(field => {
            treeDataMap.set(field.id, {
                id: field.id,
                parent: field.parentNodeId,
                text: field.name || field.id,
                icon: 'jstree-file',
                state: {
                    opened: true
                },
                li_attr: field.nodeChange === Comparer.TypeOfChange.REMOVED ? { class: 'removed-node' } :
                    field.nodeChange === Comparer.TypeOfChange.ADDED ? { class: 'added-node' } :
                        field.nodeChange === Comparer.TypeOfChange.MODIFIED ? { class: 'modified-node' } : {},
                data: {
                    id: field.id,
                    btId: field.btId,
                    xpathRelative: field.xpathRelative,
                    status: field.nodeChange
                }
            });
        });

        return Array.from(treeDataMap.values());
    }

    initializeTree(xmlStructure, fieldsComparisonResults) {
        if (domElements.xmlStructureTree.jstree(true)) {
            domElements.xmlStructureTree.jstree("destroy");
        }
        domElements.xmlStructureTree.jstree({
            core: {
                data: this.buildTreeData(xmlStructure, fieldsComparisonResults),
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
            const fieldDetails = fieldsComparisonResults.find(field => field.id === selectedFieldId);
            if (fieldDetails) {
                let oldMap = new Map(appState.comparisonDataFields.map(node => [node.id, node]));
                let newMap = new Map(appState.versionDataFields.map(node => [node.id, node]));
                this.displayFieldDetails(fieldDetails, oldMap, newMap, domElements.fieldDetailsContent, 'id');
            }
            const nodeDetails = xmlStructure.find(field => field.id === selectedFieldId);
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
