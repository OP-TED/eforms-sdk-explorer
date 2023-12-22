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
        try {
            const newVersionUrl = this.constructNoticeTypesUrl(appState.newVersion, appState.selectedNoticeTypeFile);
            const comparisonVersionUrl = this.constructNoticeTypesUrl(appState.comparisonVersion, appState.selectedNoticeTypeFile);
            const [newVersionNoticeTypesData, comparisonNoticeTypesData] = await Promise.all([
                this.fetchNoticeTypesData(newVersionUrl),
                this.fetchNoticeTypesData(comparisonVersionUrl)
            ]);
           const compareFileList = this.fetchVersionFileLists();//fetch the list of files to compare
            this.showComparisonView();
            const comparisonResults = Comparer.compareDataStructures(comparisonNoticeTypesData.noticeSubTypes, newVersionNoticeTypesData.noticeSubTypes, 'subTypeId', true);
            let oldMap = new Map(newVersionNoticeTypesData.noticeSubTypes.map(node => [node.subTypeId, node]));
            let newMap = new Map(comparisonNoticeTypesData.noticeSubTypes.map(node => [node.subTypeId, node]));
            this.displayNoticeTypeCard(comparisonResults, oldMap, newMap, domElements.noticeTypesComparisonContent, 'subTypeId');
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
                const $itemTree = this.createTree(item, newMap, oldMap, uniqueKey);
                $(container).append($itemTree);
            });
        } else {
            const $tree = this.createTree(item, newMap, oldMap, uniqueKey);
            $(container).append($tree);
        }
    }

    createTree(item, newMap, oldMap, uniqueKey) {
        const uniqueId = item[uniqueKey];
        const newField = newMap.get(uniqueId);
        const oldField = oldMap.get(uniqueId);
        const component = document.createElement('index-card');
        const fieldToIterate = newField || oldField;

        for (const [key, value] of Object.entries(fieldToIterate)) {
            const newValue = newField ? newField[key] : undefined;
            const oldValue = oldField ? oldField[key] : undefined;
            const $propertyTemplate = PropertyCard.create(key, newValue, oldValue, item.nodeChange);
            component.appendProperty($propertyTemplate);
            component.setAttribute('action-name', 'Compare');
            if(this.item.nodeChange === Comparer.TypeOfChange.ADDED || this.item.nodeChange === Comparer.TypeOfChange.REMOVED){
                component.setAttribute('status', item.nodeChange);
            }else{
                component.setStatusCallback();
            }
            
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
        const mainUrl = this.constructNoticeTypesUrl(appState.newVersion, filename);
        const baseUrl = this.constructNoticeTypesUrl(appState.comparisonVersion, filename);
        const [selectedNoticeTypesData, comparisonNoticeTypesData] = await Promise.all([
            this.fetchNoticeTypesData(mainUrl),
            this.fetchNoticeTypesData(baseUrl)
        ]);
        let oldMap = this.flattenToMap(selectedNoticeTypesData.content);
        let newMap = this.flattenToMap(comparisonNoticeTypesData.content);
        if (selectedNoticeTypesData.metadata) {
            for (const item of selectedNoticeTypesData.metadata) {
                oldMap.set(item.id, item);
            }
        }
        if (comparisonNoticeTypesData.metadata) {
            for (const item of comparisonNoticeTypesData.metadata) {
                newMap.set(item.id, item);
            }
        }
        const comparisonResults = Comparer.compareNestedStructures(selectedNoticeTypesData.content, comparisonNoticeTypesData.content);
        const comparisonResultsMetadata = Comparer.compareNestedStructures(selectedNoticeTypesData.metadata, comparisonNoticeTypesData.metadata);
        this.showTreeView(comparisonResults, comparisonResultsMetadata, oldMap, newMap);
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

    showTreeView(contentData, metadataData, oldMap, newMap) {
        // Check if the tree view is already initialized
        if (domElements.noticeTypesTree.jstree(true)) {
            // If already initialized, destroy the existing tree before creating a new one
            domElements.noticeTypesTree.jstree("destroy");
        }
        // Remove comparison view if it exists
        $('.notice-types-comparison').hide();
        $('#noticeTypesComparisonContent').hide();

        // Show the tree view and details view
        $('#noticeTypesTreeContainer').show();
        $('#noticeTypesDetails').show();

        $('<div/>', {
            id: 'noticeTypesTree'
        }).appendTo('#noticeTypesTreeContainer');

        let contentTreeData = this.processNoticeTypesJsTree(contentData, 'contentRoot');
        let metadataTreeData = this.processNoticeTypesJsTree(metadataData, 'metadataRoot');

        let jsTreeData = [
            { id: 'contentRoot', parent: '#', text: 'Content', state: { opened: true } },
            ...contentTreeData,
            { id: 'metadataRoot', parent: '#', text: 'Metadata', state: { opened: true } },
            ...metadataTreeData
        ];
        $('#noticeTypesComparisonContainer').hide();
        $('#noticeTypesTreeContainer').show();
        domElements.noticeTypesTree.jstree({
            core: {
                data: jsTreeData,
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

        domElements.noticeTypesTree.on("select_node.jstree", (e, data) => {
            const selectedFieldId = data.node.id;
            const fieldDetails = this.findFieldById(jsTreeData, selectedFieldId)
            this.displayFieldDetails(fieldDetails, oldMap, newMap, domElements.noticeTypesDetails);

        });
        $('#noticeTypesTreeContainer').show();

        $('#notice-tree-search').keyup(searchTree);
        $('#notice-tree-filter').change(searchTree);

        function searchTree() {
            let searchString = $('#notice-tree-filter').val() + '::' + $('#notice-tree-search').val();
            domElements.noticeTypesTree.jstree('search', searchString);
        }
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
                        item.nodeChange === Comparer.TypeOfChange.MODIFIED ? { class: 'modified-node' } : {},
                data: {
                    btId: item.id,
                    description: item.description,
                    status: item.nodeChange
                }
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

    async fetchVersionFileLists() {
        const baseVersionPath = `${appConfig.noticeTypesFileUrl}?ref=${appState.newVersion}`
        const comparisonVersionPath = `${appConfig.noticeTypesFileUrl}?ref=${appState.comparisonVersion}`
        try {
            const [baseVersionResponse, comparisonVersionResponse] = await Promise.all([
                $.ajax({ url: baseVersionPath, dataType: 'json' }),
                $.ajax({ url: comparisonVersionPath, dataType: 'json' })
            ]);
            const baseVersionFiles = baseVersionResponse.map(file => file.name);
            const comparisonVersionFiles = comparisonVersionResponse.map(file => file.name);
            await this.compareFiles(baseVersionResponse, comparisonVersionResponse);

            return {
                baseVersionFiles: baseVersionFiles,
                comparisonVersionFiles: comparisonVersionFiles
            };

        } catch (error) {
            console.error('Error fetching version file lists:', error);
            throw new Error('Failed to load version file lists');
        }
    }

    async compareFiles(baseVersionResponse, comparisonVersionResponse) {
        let comparisonResults = [];
        const comparisonVersionFiles = comparisonVersionResponse.map(file => file.name);

        for (let baseFile of baseVersionResponse) {
            if (comparisonVersionFiles.includes(baseFile.name)) {
                let comparisonFile = comparisonVersionResponse.find(file => file.name === baseFile.name);

                try {
                    let baseFileContent = await $.ajax({ url: baseFile.download_url, dataType: 'text' });
                    let comparisonFileContent = await $.ajax({ url: comparisonFile.download_url, dataType: 'text' });

                    let { ublVersion, sdkVersion, metadataDatabase, ...baseFileFiltered } = JSON.parse(baseFileContent);
                    let { ublVersion: _, sdkVersion: __, metadataDatabase: ___, ...comparisonFileFiltered } = JSON.parse(comparisonFileContent);

                    let modifiedBaseContent = JSON.stringify(baseFileFiltered);
                    let modifiedComparisonContent = JSON.stringify(comparisonFileFiltered);

                    let nodeChange = modifiedBaseContent === modifiedComparisonContent ? Comparer.TypeOfChange.UNCHANGED : Comparer.TypeOfChange.MODIFIED;

                    comparisonResults.push({
                        ...comparisonFile,
                        nodeChange: nodeChange
                    });
                } catch (error) {
                    console.error(`Error processing files for ${baseFile.name}:`, error);
                }
            }
        }
        return comparisonResults;
    }

}