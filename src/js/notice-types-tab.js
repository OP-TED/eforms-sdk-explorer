import { appState } from "./state.js";
import { appConfig, domElements } from "./config.js";
import { Comparer } from "./comparer.js";
import { TabController } from "./tab-controller.js";
import { PropertyCard } from "./property-card.js";
import { IndexCard } from "./index-card.js";

export class NoticeTypesTab extends TabController {

    constructor() {
        super('notice-types-tab');
    }

    init() {
        $('#overviewLink').on('click', async (e) => {
            appState.selectedNoticeTypeFile = 'notice-types.json';
            await this.fetchAndRender();
        });
    }

    async fetchAndRender() {
        debugger
        try {
            const mainUrl = this.constructNoticeTypesUrl(appState.sdkVersion, appState.selectedNoticeTypeFile);
            const baseUrl = this.constructNoticeTypesUrl(appState.baseVersion, appState.selectedNoticeTypeFile);
            const [selectedNoticeTypesData, comparisonNoticeTypesData] = await Promise.all([
                this.fetchNoticeTypesData(mainUrl),
                this.fetchNoticeTypesData(baseUrl)
            ]);
            const isMainNoticeTypesFile = appState.selectedNoticeTypeFile === 'notice-types.json';
            if (isMainNoticeTypesFile) {
                this.showComparisonView();
                const comparisonResults = this.compareNoticeTypes(selectedNoticeTypesData, comparisonNoticeTypesData);
                let oldMap = new Map(selectedNoticeTypesData.noticeSubTypes.map(node => [node.subTypeId, node]));
                let newMap = new Map(comparisonNoticeTypesData.noticeSubTypes.map(node => [node.subTypeId, node]));
                this.displayNoticeTypeCard(comparisonResults, oldMap, newMap, domElements.noticeTypesComparisonContent, 'subTypeId');
            }
        } catch (error) {
            console.error('Error during notice types operation:', error);
            throw new Error('Failed to load notice types');
        }
    }

    async fetchNoticeTypesData(url) {
        try {
            const response = await $.ajax({ url, dataType: 'json' });
            return response;
        } catch (error) {
            console.error('Error fetching notice types:', error);
            throw error;
        }
    }

    compareNoticeTypes(selectedData, comparisonData) {
        const selectedKey = selectedData.noticeSubTypes ? 'noticeSubTypes' : 'content';
        const comparisonKey = comparisonData.noticeSubTypes ? 'noticeSubTypes' : 'content';
        const uniqueKey = selectedData.noticeSubTypes ? 'subTypeId' : 'id';

        const comparisonResults = Comparer.compareDataStructures(selectedData[selectedKey], comparisonData[comparisonKey], uniqueKey, true);
        return comparisonResults;
    }

    constructNoticeTypesUrl(tagName, fileName) {
        return `${appConfig.rawBaseUrl}/${tagName}/notice-types/${fileName}`;
    }

    showComparisonView() {
        // Hide the tree view and details view
        $('#noticeTypesTreeContainer').hide();
        $('#noticeTypesDetails').hide();

        // Show the comparison view
        $('.notice-types-comparison').show();
        $('#noticeTypesComparisonContent').show();
    }

    displayNoticeTypeCard(data, oldMap, newMap, container, uniqueKey = 'id') {

        // Clear existing content
        $(container).empty();

        if (Array.isArray(data)) {
            data.forEach(item => {
                const $itemTree = this.createTree(item[uniqueKey], newMap, oldMap);
                const $itemContainer = $('<div class="notice-type-card mb-3"></div>').append($itemTree);
                $(container).append($itemTree);
            });
        } else {
            const $tree = this.createTree(data[uniqueKey], newMap, oldMap);
            $(container).append($tree);
        }
    }

    createTree(uniqueId, newMap, oldMap) {
        const newField = newMap.get(uniqueId);
        const oldField = oldMap.get(uniqueId);

        const component = document.createElement('index-card');

        const fieldToIterate = newField || oldField;

        for (const [key, value] of Object.entries(fieldToIterate)) {
            if (key === 'content') {
                continue;
            }
            const newValue = newField ? newField[key] : undefined;
            const oldValue = oldField ? oldField[key] : undefined;
            const $propertyTemplate = PropertyCard.create(key, newField ? newValue : undefined, oldValue);

            component.appendProperty($propertyTemplate);
            component.setAttribute('action-name', 'Compare');

            if (key === 'subTypeId') {
                component.setAttribute('title', value);
                component.setActionHandler((e) => {
                    e.preventDefault();
                    this.selectNoticeSubtype(newValue + '.json');
                });
            } else if (key === 'type') {
                component.setAttribute('subtitle', value);
            }
        }

        // Handle removed properties in oldField that are not in newField
        if (newField) {
            for (const key in oldField) {
                if (!newField.hasOwnProperty(key) && key !== 'content') {
                    const $removedPropertyTemplate = PropertyCard.create(key, undefined, oldField[key]);
                    component.appendProperty($removedPropertyTemplate);
                }
            }
        }

        return component;
    }

    async selectNoticeSubtype(filename) {
        const mainUrl = this.constructNoticeTypesUrl(appState.sdkVersion, filename);
        const baseUrl = this.constructNoticeTypesUrl(appState.baseVersion, filename);
        const [selectedNoticeTypesData, comparisonNoticeTypesData] = await Promise.all([
            this.fetchNoticeTypesData(mainUrl),
            this.fetchNoticeTypesData(baseUrl)
        ]);
        let oldMap = this.flattenToMap(selectedNoticeTypesData.content);
        let newMap = this.flattenToMap(comparisonNoticeTypesData.content);
        const comparisonResults = Comparer.compareNestedStructures(selectedNoticeTypesData.content, comparisonNoticeTypesData.content);
        this.showTreeView(comparisonResults, oldMap, newMap);
    }

    flattenToMap(data, map = new Map()) {
        data.forEach(item => {
            map.set(item.id, item);
            if (Array.isArray(item.content)) {
                this.flattenToMap(item.content, map); // Recursively process nested arrays
            }
        });
        return map;
    }

    showTreeView(treeData, oldMap, newMap) {
        // Remove comparison view if it exists
        $('.notice-types-comparison').hide();
        $('#noticeTypesComparisonContent').hide();

        // Show the tree view and details view
        $('#noticeTypesTreeContainer').show();
        $('#noticeTypesDetails').show();

        $('<div/>', {
            id: 'noticeTypesTree'
        }).appendTo('#noticeTypesTreeContainer');

        // initializeNoticeTypesTree(treeData);
        let jsTreeData = this.processNoticeTypesJsTree(treeData);
        $('#noticeTypesComparisonContainer').hide();
        $('#noticeTypesTreeContainer').show();

        // Check if the tree view is already initialized
        if (domElements.noticeTypesTree.jstree(true)) {
            // If already initialized, destroy the existing tree before creating a new one
            domElements.noticeTypesTree.jstree("destroy");
        }
        domElements.noticeTypesTree.jstree({
            core: {
                data: jsTreeData,
                check_callback: true
            },
            plugins: ["wholerow"]
        });

        domElements.noticeTypesTree.on("select_node.jstree", (e, data) => {
            const selectedFieldId = data.node.id;
            const fieldDetails = this.findFieldById(treeData, selectedFieldId)
            this.displayFieldDetails(fieldDetails, oldMap, newMap, domElements.noticeTypesDetails);

        });
        $('#noticeTypesTreeContainer').show();
    }

    processNoticeTypesJsTree(content, parentId = "#") {
        let treeData = [];
        content.forEach(item => {
            let node = {
                id: item.id,
                parent: parentId,
                text: item.id,
                state: { opened: true },
                type: item.contentType === 'group' ? "default" : "field",
                li_attr: item.nodeChange === Comparer.TypeOfChange.REMOVED ? { class: 'removed-node' } :
                    item.nodeChange === Comparer.TypeOfChange.ADDED ? { class: 'added-node' } :
                        item.nodeChange === Comparer.TypeOfChange.MODIFIED ? { class: 'modified-node' } : {}
            };
            // Adding icon for items with contentType "file"
            if (item.contentType === "field") {
                node.icon = 'jstree-file';
            }
            treeData.push(node);
            if (item.contentType === 'group' && item.content) {
                let children = this.processNoticeTypesJsTree(item.content, item.id);
                treeData = treeData.concat(children);
            }
        });

        return treeData;
    }

    findFieldById(data, fieldId) {
        let result = null;
        function searchContent(content) {
            for (let item of content) {
                if (item.id === fieldId) {
                    result = item;
                    return true;
                }
                if (Array.isArray(item.content)) {
                    if (searchContent(item.content)) {
                        return true;
                    }
                }
            }
            return false;
        }

        searchContent(data);
        return result;
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