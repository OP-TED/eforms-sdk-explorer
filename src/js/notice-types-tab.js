import { appState } from "./state.js";
import { appConfig, domElements } from "./config.js";
import { Diff, DiffEntry } from "./diff.js";
import { TabController } from "./tab-controller.js";
import { PropertyCard } from "./property-card.js";
import { IndexCard } from "./index-card.js";
import { SdkExplorerApplication } from "./app.js";

export class NoticeTypesTab extends TabController {

    constructor() {
        super('notice-types-tab');
    }

    init() {
        $('#overviewLink').on('click', async (e) => {
            appState.selectedNoticeTypeFile = 'notice-types';
            await this.fetchAndRender();
        });
    }

    async fetchAndRender() {
        this.fetchAndRenderOverview();
    }

    async fetchAndRenderOverview() {    
        try {

            this.showOverview();

            // Get notice-types.json index files for both versions.
            const [mainVersionData, baseVersionData] = await Promise.all([
                this.#fetchNoticeTypesIndexFile(appState.mainVersion),
                this.#fetchNoticeTypesIndexFile(appState.baseVersion)
            ]);

            // Compare the two index files
            const diff = Diff.fromArrayComparison(mainVersionData.noticeSubTypes, baseVersionData.noticeSubTypes, 'subTypeId');

            // Clear existing index-cards.
            $(domElements.noticeTypesOverview).empty();

            // Create and add an index-card for each notice type.
            diff.forEach(entry => {
                const $card = this.createIndexCard(entry);
                $(domElements.noticeTypesOverview).append($card);
            });

        } catch (error) {
            console.error('Error while generating overview:', error);
            throw new Error('Failed to load notice types');
        }
    }

    /**
     * Fetches the notice-types.json index file for the specified SDK version.
     */
    async #fetchNoticeTypesIndexFile(sdkVersion) {
        const url = this.getNoticeTypesIndexFileUrl(sdkVersion);
        try {
            const response = await $.ajax({ url, dataType: 'json' });
            return response;
        } catch (error) {
            console.error('Error fetching notice-types.json:', error);
            throw error;
        }
    }

    /**
     * Fetches the notice type definition JSON file for the specified notice subtype and SDK version.
     * 
     * @param {string} subTypeId 
     * @param {string} sdkVersion
     *  
     * @returns 
     */
    async #fetchNoticeTypeDefinition(subTypeId, sdkVersion) {
        const url = this.getUrlByNoticeSubtypeAndVersion(subTypeId, sdkVersion);
        try {
            const response = await $.ajax({ url, dataType: 'json' });
            return response;
        } catch (error) {
            console.error(`Error fetching notice type "${subTypeId}.json" for SDK ${sdkVersion}:  `, error);
            throw error;
        }
    }

    getUrlByNoticeSubtypeAndVersion(subtypeId, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/notice-types/${subtypeId}.json`;
    }

    getNoticeTypesIndexFileUrl(sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/notice-types/notice-types.json`;
    }

    showOverview() {
        // Hide the tree view and details view
        $('#noticeStructureContainer').hide();
        $('#noticeStructureElementDetails').hide();

        // Show the comparison view
        $('.notice-types-comparison').show();
        $('#noticeTypesOverview').show();
    }

    /**
     * Creates an index-card for the specified notice type.
     * 
     * @param {DiffEntry} diffEntry 
     * @returns 
     */
    createIndexCard(diffEntry) {
        const component = document.createElement('index-card');
        const item = diffEntry.mainItem || diffEntry.baseItem;

        for (const [key, value] of Object.entries(item)) {
            const mainValue = diffEntry.mainItem ? diffEntry.mainItem[key] : undefined;
            const baseValue = diffEntry.baseItem ? diffEntry.baseItem[key] : undefined;
            
            const $propertyTemplate = PropertyCard.create(key, mainValue, baseValue, diffEntry.typeOfChange);
            component.appendProperty($propertyTemplate);
            component.setAttribute('action-name', 'Compare');

            if(diffEntry.typeOfChange === Diff.TypeOfChange.ADDED || diffEntry.typeOfChange === Diff.TypeOfChange.REMOVED){
                // We already know the status of the node, so we can set it directly
                component.setAttribute('status', diffEntry.typeOfChange);
            } else {
                // We will need to open the files and check for changes.
                // We will do that in the background
                component.setStatusCheckCallback(() => Promise.resolve(this.checkForChanges(diffEntry.id)));
            }
            
            if (key === 'subTypeId') {
                component.setAttribute('title', value); // Use the subTypeId property as the card's title
                component.setActionHandler((e) => {
                    e.preventDefault();
                    this.selectNoticeSubtype(mainValue);
                });
            } else if (key === 'type') {
                component.setAttribute('subtitle', value);  // Use the type property as the card's subtitle
            }
        }

        // Handle removed properties (the ones in baseItem that do not exit in mainItem).
        if (diffEntry.mainItem) {
            for (const propertyName in diffEntry.baseItem) {
                if (propertyName === 'content') {
                    continue;   // Ignore the content property
                }

                if (!diffEntry.mainItem.hasOwnProperty(propertyName)) {
                    const $removedPropertyTemplate = PropertyCard.create(propertyName, undefined, diffEntry.baseItem[propertyName]);
                    component.appendProperty($removedPropertyTemplate);
                }
            }
        }

        return component;
    }

    async selectNoticeSubtype(subTypeId) {
        const [mainData, baseData] = await Promise.all([
            this.#fetchNoticeTypeDefinition(subTypeId, appState.mainVersion),
            this.#fetchNoticeTypeDefinition(subTypeId, appState.baseVersion)
        ]);
        const contentDiff = this.#compareNestedHierarchies(mainData.content, baseData.content);
        const metadataDiff = this.#compareNestedHierarchies(mainData.metadata, baseData.metadata);
        this.showExplorerView(contentDiff, metadataDiff);
    }

    #compareNestedHierarchies(mainNestedHierarchy, baseNestedHierarchy) {
        const mainArray = this.#flattenNestedHierarchy(mainNestedHierarchy);
        const baseArray = this.#flattenNestedHierarchy(baseNestedHierarchy);
        const diff = Diff.fromArrayComparison(mainArray, baseArray, 'id');
        return diff;
    }

    #flattenNestedHierarchy(nestedHierarchy, parentId = null) {
        let flatHierarchy = [];
    
        nestedHierarchy.forEach(node => {
            const { content, ...nodeWithoutContent } = node;
            flatHierarchy.push({ ...nodeWithoutContent, parentId });
            if (node.contentType === 'group' && node.content) {
                const childArray = this.#flattenNestedHierarchy(node.content, node.id);
                flatHierarchy = flatHierarchy.concat(childArray);
            }
        });
    
        return flatHierarchy;
    }


    /**
     * Shows the tree/detail explorer for the notice type.
     * 
     * @param {*} contentData 
     * @param {*} metadataData 
     */
    showExplorerView(contentData, metadataData) {
        // Check if the tree view is already initialized
        if (domElements.noticeStructureTree.jstree(true)) {
            // If already initialized, destroy the existing tree before creating a new one
            domElements.noticeStructureTree.jstree("destroy");
        }

        // Remove comparison view if it exists
        $('.notice-types-comparison').hide();
        $('#noticeTypesOverview').hide();

        // Show the tree view and details view
        $('#noticeStructureContainer').show();
        $('#noticeStructureElementDetails').show();

        let contentTreeData = this.createTreeNodes(contentData, 'contentRoot');
        let metadataTreeData = this.createTreeNodes(metadataData, 'metadataRoot');

        let jsTreeData = [
            { id: 'metadataRoot', parent: '#', text: 'Metadata', state: { opened: true } },
            ...metadataTreeData,
            { id: 'contentRoot', parent: '#', text: 'Content', state: { opened: true } },
            ...contentTreeData
        ];

        $('#noticeTypesComparisonContainer').hide();
        $('#noticeStructureContainer').show();

        domElements.noticeStructureTree.jstree({
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

        domElements.noticeStructureTree.on("select_node.jstree", (e, data) => {
            this.displayTreeNodeDetails(data.node.data.diff);
        });

        $('#noticeStructureContainer').show();

        $('#notice-tree-search').keyup(searchTree);
        $('#notice-tree-filter').change(searchTree);

        function searchTree() {
            let searchString = $('#notice-tree-filter').val() + '::' + $('#notice-tree-search').val();
            domElements.noticeStructureTree.jstree('search', searchString);
        }
    }

    /**
     * 
     * @param {Diff} diff 
     * @param {*} parentId 
     * @returns 
     */
    createTreeNodes(diff, parentId = "#") {
        let treeNodes = [];

        diff.forEach(diffEntry => {
            let isGroup = diffEntry?.get('contentType') === 'group' ?? false;
            let treeNode = {
                id: diffEntry?.id,
                parent: diffEntry?.get('parentId') || parentId,
                text: diffEntry?.id,
                state: { opened: true },
                // type: isGroup ? "display-group" : "input-field",
                icon: isGroup ? "jstree-folder" : "jstree-file",
                li_attr: { class: `${diffEntry?.typeOfChange}-node` },
                data: {
                    btId: diffEntry?.id,
                    description: diffEntry?.get('description'),
                    diff: diffEntry,
                    status: diffEntry?.typeOfChange
                }
            };

            treeNodes.push(treeNode);
        });

        return treeNodes;
    }

    /**
     * 
     * @param {DiffEntry} diffEntry 
     */
    displayTreeNodeDetails(diffEntry) {

        let mainItem = diffEntry.mainItem; 
        let baseItem = diffEntry.baseItem;

        // Clear existing content
        $(domElements.noticeStructureElementDetails).empty();

        const $ul = $('<ul class="list-group">');

        const item = mainItem || baseItem;

        for (const [key, value] of Object.entries(item)) {
            const mainValue = mainItem ? mainItem[key] ?? undefined : undefined;
            const baseValue = baseItem ? baseItem[key] ?? undefined : undefined;

            if (key === 'parentId' && mainValue === baseValue) {
                continue;
            }

            const $propertyTemplate = PropertyCard.create(key, mainValue, baseValue);
            $ul.append($propertyTemplate);
        }

        // Handle removed properties in oldField that are not in newField
        if (mainItem) {
            for (const key in baseItem) {
                if (!mainItem.hasOwnProperty(key) && key !== 'content') {
                    const $removedPropertyTemplate = PropertyCard.create(key, undefined, baseItem[key]);
                    $ul.append($removedPropertyTemplate);
                }
            }
        }
        $(domElements.noticeStructureElementDetails).append($ul);
    }

    /**
     * Checks for changes in the notice type file.
     * It will ignore the values of certain properties that are expected to change between versions: 
     * (ublVersion, sdkVersion, metadataDatabase.version and metadataDatabase.createdOn).
     * 
     * @param {string} noticeSubtypeId The notice subtype to check for changes
     * @returns {Promise<Diff.TypeOfChange>} The type of change detected
     */
    async checkForChanges(noticeSubtypeId) {
        try {
            SdkExplorerApplication.startSpinner();
            let mainUrl = this.getUrlByNoticeSubtypeAndVersion(noticeSubtypeId, appState.mainVersion);
            let baseUrl = this.getUrlByNoticeSubtypeAndVersion(noticeSubtypeId, appState.baseVersion);
            let mainFile = await $.ajax({ url: mainUrl, dataType: 'text' });
            let baseFile = await $.ajax({ url: baseUrl, dataType: 'text' });

            let propertiesToIgnore = ['"ublVersion" :', '"sdkVersion" :', '"version" :', '"createdOn" :'];
            for (let property of propertiesToIgnore) {
                let regex = new RegExp(`(${property} ".*?")`);
                mainFile = mainFile.replace(regex, `${property} "-"`);
                baseFile = baseFile.replace(regex, `${property} "-"`);
            }

            let nodeChange = mainFile === baseFile ? Diff.TypeOfChange.UNCHANGED : Diff.TypeOfChange.MODIFIED;

            return nodeChange;
        } catch (error) {
            console.error(`Error processing files for ${noticeSubtypeId}.json:`, error);
            return null;
        }
        finally {
            SdkExplorerApplication.stopSpinner();
        }   
    }
}