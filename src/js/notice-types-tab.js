import { appState } from "./state.js";
import { appConfig } from "./config.js";
import { Diff, DiffEntry } from "./diff.js";
import { TabController } from "./tab-controller.js";
import { PropertyCard } from "./property-card.js";
import { IndexCard } from "./index-card.js";
import { SdkExplorerApplication } from "./app.js";

export class NoticeTypesTab extends TabController {

    constructor() {
        super('notice-types-tab');
    }

    /**
     * Overridden to hook up event handlers.
     */
    init() {
        super.init();

        // Handle clicks on the "Overview" link to return to the Overview display.
        $('#overview-link').on('click', async (e) => {
            await this.fetchAndRenderOverview();
        });

        // Listen for changes in the search fields
        $('#notice-tree-search').keyup(this.#searchJsTree);
        $('#notice-tree-filter').change(this.#searchJsTree);
    }

    async fetchAndRender() {
        // Render the overview display by default
        this.fetchAndRenderOverview();
    }

    // #region Overview display -----------------------------------------------

    /**
     * Fetches the notice-types.json index files for both versions and renders the overview display.
     */
    async fetchAndRenderOverview() {    
        SdkExplorerApplication.startSpinner();
        try {

            // Get notice-types.json index files for both versions.
            const [mainVersionData, baseVersionData] = await Promise.all([
                this.#fetchNoticeTypesIndexFile(appState.mainVersion),
                this.#fetchNoticeTypesIndexFile(appState.baseVersion)
            ]);

            // Compare the two index files
            const diff = Diff.fromArrayComparison(mainVersionData.noticeSubTypes, baseVersionData.noticeSubTypes, 'subTypeId');

            // Clear existing index-cards.
            $('#noticeTypesOverview').empty();

            // Create and add an index-card for each notice type.
            diff.forEach(entry => {
                const card = this.#createIndexCard(entry);
                $('#noticeTypesOverview').append(card);
            });

            this.#switchToOverview();
        } catch (error) {
            console.error('Error while generating overview:', error);
            throw new Error('Failed to load notice types');
        } finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    /**
     * Fetches the notice-types.json index file for the specified SDK version.
     */
    async #fetchNoticeTypesIndexFile(sdkVersion) {
        const url = this.#getNoticeTypesIndexFileUrl(sdkVersion);
        try {
            const response = await $.ajax({ url, dataType: 'json' });
            return response;
        } catch (error) {
            console.error('Error fetching notice-types.json:', error);
            throw error;
        }
    }

    #switchToOverview() {
        $('#notice-type-explorer').hide();
        $('#notice-types-overview').show();
    }

    /**
     * Creates an index-card for the specified notice type.
     * 
     * @param {DiffEntry} diffEntry 
     * @returns 
     */
    #createIndexCard(diffEntry) {
        const component = IndexCard.create(diffEntry.get('subTypeId'), diffEntry.get('type'), 'Compare', diffEntry.typeOfChange);
        component.setActionHandler((e) => {
            e.preventDefault();
            this.fetchAndRenderExplorerView(diffEntry.get('subTypeId'));
        });

        // If the notice type is not new or removed, then we will need to check for changes inside the notice type file.
        if (diffEntry.typeOfChange !== Diff.TypeOfChange.ADDED && diffEntry.typeOfChange !== Diff.TypeOfChange.REMOVED) {
            // We will need to open the files and check for changes.
            // We will do that in the background
            component.removeAttribute('status');
            component.setStatusCheckCallback(() => Promise.resolve(this.#checkForChanges(diffEntry.id)));
        }

        for (const [key, value] of Object.entries(diffEntry.getItem())) {
            const mainValue = diffEntry?.mainItem ? diffEntry?.mainItem[key] ?? undefined : undefined;
            const baseValue = diffEntry?.baseItem ? diffEntry?.baseItem[key] ?? undefined : undefined;

            const card = PropertyCard.create(key, mainValue, baseValue, diffEntry.typeOfChange);
            component.appendProperty(card);
        }

        // Handle removed properties (the ones in baseItem that do not exit in mainItem).
        if (diffEntry.mainItem) {
            for (const propertyName in diffEntry.baseItem) {
                if (propertyName === 'content') {
                    continue;   // Ignore the content property
                }

                if (!diffEntry.mainItem.hasOwnProperty(propertyName)) {
                    const card = PropertyCard.create(propertyName, undefined, diffEntry.baseItem[propertyName]);
                    component.appendProperty(card);
                }
            }
        }

        return component;
    }

    
    /**
     * Checks for changes in the notice type file.
     * It will ignore the values of certain properties that are expected to change between versions: 
     * (ublVersion, sdkVersion, metadataDatabase.version and metadataDatabase.createdOn).
     * 
     * @param {string} noticeSubtypeId The notice subtype to check for changes
     * @returns {Promise<Diff.TypeOfChange>} The type of change detected
     */
    async #checkForChanges(noticeSubtypeId) {
        try {
            SdkExplorerApplication.startSpinner();
            let mainUrl = this.#getUrlByNoticeSubtypeAndVersion(noticeSubtypeId, appState.mainVersion);
            let baseUrl = this.#getUrlByNoticeSubtypeAndVersion(noticeSubtypeId, appState.baseVersion);
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

    #getNoticeTypesIndexFileUrl(sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/notice-types/notice-types.json`;
    }


    // #endregion Overview display


    // #region Explorer display -----------------------------------------------

    /**
     * Fetches both versions of notice type definition JSON files for the specified notice subtype and renders the explorer view.
     * 
     * @param {string} subTypeId 
     */
    async fetchAndRenderExplorerView(subTypeId) {
        SdkExplorerApplication.startSpinner();
        try {

            const [mainData, baseData] = await Promise.all([
                this.#fetchNoticeTypeDefinition(subTypeId, appState.mainVersion),
                this.#fetchNoticeTypeDefinition(subTypeId, appState.baseVersion)
            ]);
            const contentDiff = this.#compareNestedHierarchies(mainData.content, baseData.content);
            const metadataDiff = this.#compareNestedHierarchies(mainData.metadata, baseData.metadata);

            this.initialiseJsTree(() => this.#createJsTreeNodes(metadataDiff, contentDiff), this.#searchCallback);
            this.#switchToExplorerView();

        } finally {
            SdkExplorerApplication.stopSpinner();
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
        const url = this.#getUrlByNoticeSubtypeAndVersion(subTypeId, sdkVersion);
        try {
            const response = await $.ajax({ url, dataType: 'json' });
            return response;
        } catch (error) {
            console.error(`Error fetching notice type "${subTypeId}.json" for SDK ${sdkVersion}:  `, error);
            throw error;
        }
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
     */
    #switchToExplorerView() {
        $('#notice-types-overview').hide();
        $('#notice-type-explorer').show();
    }

    


    /**
     * 
     * @param {*} metadataDiff 
     * @param {*} contentDiff 
     */
    #createJsTreeNodes(metadataDiff, contentDiff) {

        let metadataTreeNodes = createJsTreeNodesForSection('metadataRoot', metadataDiff);
        let contentTreeNodes = createJsTreeNodesForSection('contentRoot', contentDiff);

        return [
            { id: 'metadataRoot', parent: '#', text: 'Metadata', state: { opened: true, disabled: true } },
            ...metadataTreeNodes,
            { id: 'contentRoot', parent: '#', text: 'Content', state: { opened: true, disabled: true } },
            ...contentTreeNodes
        ];

        /**
         * Internal function to create JsTree nodes from a {@link Diff} object.
         * @param {string} sectionId 
         * @param {Diff} diff 
         * @returns 
         */
        function createJsTreeNodesForSection(sectionId, diff) {
            let treeNodes = [];

            diff.forEach(diffEntry => {
                let isGroup = diffEntry?.get('contentType') === 'group' ?? false;
                let treeNode = {
                    id: diffEntry?.id,
                    parent: diffEntry?.get('parentId') || sectionId,
                    text: diffEntry?.id,
                    state: { opened: true },
                    // type: isGroup ? "display-group" : "input-field",
                    icon: isGroup ? "jstree-folder" : "jstree-file",
                    li_attr: { class: `${diffEntry?.typeOfChange}-node` },
                    data: diffEntry
                };

                treeNodes.push(treeNode);
            });

            return treeNodes;
        }
    }

    /**
     * Initiates a search in the JsTree.
     */
    #searchJsTree() {
        let searchString = $('#notice-tree-filter').val() + '::' + $('#notice-tree-search').val();
        $('#noticeStructureTree').jstree('search', searchString);
    }

    /**
     * Checks if the specified node matches the specified search terms.
     * Used by the search_callback for the JsTree search plugin.
     * 
     * @param {DiffEntry} diffEntry The {@link DiffEntry} that the node represents.
     * @param {string} status The status to filter by (added, removed, modified, unchanged, all)
     * @param {string} searchText The search text to match against.
     * @returns {boolean} True if the node matches the search terms, false otherwise.
     */
    #searchCallback(diffEntry, status, searchText = '') {
        let textMatch = false;

        if (searchText.length > 0 && !searchText.startsWith('|')) {
            let combined = (diffEntry?.get('description') || '') + '|' + '|' + (diffEntry?.get('id') || '');
            textMatch = combined.toLowerCase().indexOf(searchText) > -1;
        }

        if (status === 'all') {
            return textMatch;
        } else {
            return (diffEntry?.typeOfChange === status) && (textMatch || searchText === '');
        }
    }

    initialiseJsTree(getTreeNodesCallback, searchCallback) {
        // Check if the tree view is already initialized
        if ($('#noticeStructureTree').jstree(true)) {
            // If already initialized, destroy the existing tree before creating a new one
            $('#noticeStructureTree').jstree("destroy");
        }

        $('#noticeStructureTree').jstree({
            core: {
                data: getTreeNodesCallback(),
                check_callback: true
            },
            plugins: ["wholerow", "search"],
            'search': {
                'show_only_matches': true,
                search_callback: (str, node) => searchCallback(DiffEntry.fromObject(node?.data), ...str.split('::'))
            }
        });

        $('#noticeStructureTree').on("select_node.jstree", (e, data) => {
            this.displayDetails(DiffEntry.fromObject(data.node.data), ['parentId']);
        });
    }

    /**
     * Called when a tree-node is selected in the JsTree.
     * Displays the details of the selected node.
     * 
     * @param {DiffEntry} diffEntry 
     */
    displayDetails(diffEntry, except = []) {

        // Clear existing content
        $('#noticeStructureElementDetails').empty();

        const $ul = $('<ul class="list-group">');

        for (const [key, value] of Object.entries(diffEntry.getItem())) {
            const mainValue = diffEntry.mainItem ? diffEntry.mainItem[key] ?? undefined : undefined;
            const baseValue = diffEntry.baseItem ? diffEntry.baseItem[key] ?? undefined : undefined;

            if (except.includes(key) && mainValue === baseValue) {
                continue;
            }

            const card = PropertyCard.create(key, mainValue, baseValue);
            $ul.append(card);
        }

        // Handle removed properties in oldField that are not in newField
        if (diffEntry.mainItem) {
            for (const key in diffEntry.baseItem) {
                if (!diffEntry.mainItem.hasOwnProperty(key) && key !== 'content') {
                    const card = PropertyCard.create(key, undefined, diffEntry.baseItem[key]);
                    $ul.append(card);
                }
            }
        }
        $('#noticeStructureElementDetails').append($ul);
    }

    #getUrlByNoticeSubtypeAndVersion(subtypeId, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/notice-types/${subtypeId}.json`;
    }

    // #endregion Explorer display

}