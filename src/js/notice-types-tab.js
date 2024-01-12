import { appState } from "./state.js";
import { appConfig } from "./config.js";
import { Diff, DiffEntry } from "./diff.js";
import { TabController } from "./tab-controller.js";
import { PropertyCard } from "./property-card.js";
import { IndexCard } from "./index-card.js";
import { SdkExplorerApplication } from "./app.js";
import { TreeDetailSplitView } from "./tree-detail-split-view.js";
import { CardGroup } from "./card-group.js";

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
        $('#notice-types-overview-link').on('click', async (e) => {
            this.#switchToOverview();
        });
    }

    async fetchAndRender() {
        // Render the overview display by default
        this.fetchAndRenderOverview();
    }

    /**
     * Overridden to dispose of the card group and diff view.
     */
    deactivated() {
        super.deactivated();
        this.#cardGroup().dispose();
        this.#splitView().dispose();
    }
    
    // #region Overview display -----------------------------------------------

    /**
     * 
     * @returns {CardGroup}
     */
    #cardGroup() {
        return document.getElementById('notice-types-overview-card-group');
    }

    /**
     * Fetches the notice-types.json index files for both versions and renders the overview display.
     */
    async fetchAndRenderOverview() {    
        SdkExplorerApplication.startSpinner();
        try {

            // Get notice-types.json index files for both versions.
            const [mainVersionData, baseVersionData] = await Promise.all([
                this.#fetchIndexFile(appState.mainVersion),
                this.#fetchIndexFile(appState.baseVersion)
            ]);

            // Compare the two index files
            const diff = Diff.fromArrayComparison(mainVersionData.noticeSubTypes, baseVersionData.noticeSubTypes, 'subTypeId');

            // Clear existing index-cards.
            this.#cardGroup().empty();

            // Create and add an index-card for each notice type.
            diff.forEach(entry => {
                setTimeout(() => {
                    if (!this.aborting) {
                        const card = this.#createIndexCard(entry);
                        this.#cardGroup().appendCard(card);
                    }
                }, 0);
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
    async #fetchIndexFile(sdkVersion) {
        const url = this.#getIndexFileUrl(sdkVersion);
        return this.ajaxRequest({ url, dataType: 'json' });
    }

    #switchToOverview() {
        $('#notice-type-explorer-view').addClass('hide-important');
        $('#notice-types-overview').removeClass('hide-important');
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

            // Get the notice type files for both versions.
            const mainUrl = this.#getUrlByNoticeSubtypeAndVersion(noticeSubtypeId, appState.mainVersion);
            const baseUrl = this.#getUrlByNoticeSubtypeAndVersion(noticeSubtypeId, appState.baseVersion);
            let [mainFile, baseFile] = await Promise.all([
                this.ajaxRequest({ url: mainUrl, dataType: 'text' }),
                this.ajaxRequest({ url: baseUrl, dataType: 'text' })
            ]);

            // Ignore version information when comparing
            const propertiesToIgnore = ['"ublVersion" :', '"sdkVersion" :', '"version" :', '"createdOn" :'];
            for (let property of propertiesToIgnore) {
                const regex = new RegExp(`(${property} ".*?")`);
                mainFile = mainFile.replace(regex, `${property} "-"`);
                baseFile = baseFile.replace(regex, `${property} "-"`);
            }

            // Compare to determine the type of change.
            const nodeChange = mainFile === baseFile ? Diff.TypeOfChange.UNCHANGED : Diff.TypeOfChange.MODIFIED;

            // Nullify the two variables holding the file contents to free up memory.
            mainFile = null;
            baseFile = null;

            return nodeChange;
        } catch (error) {
            if (error.statusText === 'abort') {
                console.log('Request was aborted');
            } else {
                console.error(`Error processing files for ${noticeSubtypeId}.json:`, error);
            }
            return null;
        }
        finally {
            SdkExplorerApplication.stopSpinner();
        }   
    }

    #getIndexFileUrl(sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/notice-types/notice-types.json`;
    }


    // #endregion Overview display


    // #region Explorer display -----------------------------------------------

    /**
     * 
     * @returns {TreeDetailSplitView}
     */
    #splitView() {
        return document.getElementById('notice-type-explorer');
    }

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
            this.#splitView().initialise({
                dataCallback: () => this.#createTreeNodes(metadataDiff, contentDiff), 
                searchableProperties: ['id', 'description'],
                titleProperty: 'id',
                subtitleProperty: 'contentType',
                hiddenProperties: ['parentId']
            });
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
        return this.ajaxRequest({ url, dataType: 'json' });
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
        $('#notice-types-overview').addClass('hide-important');
        $('#notice-type-explorer-view').removeClass('hide-important');
    }

    


    /**
     * 
     * @param {*} metadataDiff 
     * @param {*} contentDiff 
     */
    #createTreeNodes(metadataDiff, contentDiff) {

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

    #getUrlByNoticeSubtypeAndVersion(subtypeId, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/notice-types/${subtypeId}.json`;
    }

    // #endregion Explorer display

}