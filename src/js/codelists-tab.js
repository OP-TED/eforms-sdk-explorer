import { appState } from "./state.js";
import { appConfig } from "./config.js";
import { Diff, DiffEntry } from "./diff.js";
import { TabController } from "./tab-controller.js";
import { PropertyCard } from "./property-card.js";
import { IndexCard } from "./index-card.js";
import { SdkExplorerApplication } from "./app.js";

export class CodelistsTab extends TabController {

    constructor() {
        super('codelists-tab');
    }
    /**
     * Overridden to hook up event handlers.
     */
    init() {
        super.init();

        // Handle clicks on the "Overview" link to return to the Overview display.
        $('#code-lists-overview-link').on('click', async (e) => {
            await this.fetchAndRenderOverview();
        });
    }

    async fetchAndRender() {
        // Render the overview display by default
        this.fetchAndRenderOverview();
    }

    // #region Overview display -----------------------------------------------

    /**
     * Fetches the codelists.json index files for both versions and renders the overview display.
     */
    async fetchAndRenderOverview() {    
        SdkExplorerApplication.startSpinner();
        try {

            // Get codelists.json index files for both versions.
            const [mainVersionData, baseVersionData] = await Promise.all([
                this.#fetchIndexFile(appState.mainVersion),
                this.#fetchIndexFile(appState.baseVersion)
            ]);
            // Compare the two index files
            const diff = Diff.fromArrayComparison(mainVersionData.codelists, baseVersionData.codelists, 'id');

            // Clear existing index-cards.
            $('#code-lists-overview-card-group').empty();

            // Create and add an index-card for each codelist.
            diff.forEach((entry, index) => {
                setTimeout(() => {
                    const card = this.#createIndexCard(entry);
                    $('#code-lists-overview-card-group').append(card);
                }, 0);
            });
             this.#switchToOverview();
        } catch (error) {
            console.error('Error while generating overview:', error);
            throw new Error('Failed to load codelists');
        } finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    /**
     * Fetches the code-lists.json index file for the specified SDK version.
     */
    async #fetchIndexFile(sdkVersion) {
        const url = this.#getIndexFileUrl(sdkVersion);
        try {
            const response = await $.ajax({ url, dataType: 'json' });
            return response;
        } catch (error) {
            console.error('Error fetching code-lists.json:', error);
            throw error;
        }
    }


    #getIndexFileUrl(sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/codelists/codelists.json`;
    }


    #switchToOverview() {
        $('#code-lists-diff-view').hide();
        $('#code-lists-overview').show();
    }

     /**
     * Creates an index-card for the specified code list.
     * 
     * @param {DiffEntry} diffEntry 
     * @returns 
     */
     #createIndexCard(diffEntry) {
        const component = IndexCard.create(diffEntry.get('id'), diffEntry.get('parentId') ?? '', 'Compare', diffEntry.typeOfChange);
        component.setActionHandler((e) => {
            e.preventDefault();
            this.fetchAndRenderDiffView(diffEntry.get('filename'));
        });
        // If the code list is not new or removed, then we will need to check for changes inside the code list file.
        if (diffEntry.typeOfChange !== Diff.TypeOfChange.ADDED && diffEntry.typeOfChange !== Diff.TypeOfChange.REMOVED) {
            // We will need to open the files and check for changes.
            // We will do that in the background
            component.removeAttribute('status');
            component.setStatusCheckCallback(() => Promise.resolve(this.#checkForChanges(diffEntry.get('filename'))));
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
                if (!diffEntry.mainItem.hasOwnProperty(propertyName)) {
                    const card = PropertyCard.create(propertyName, undefined, diffEntry.baseItem[propertyName]);
                    component.appendProperty(card);
                }
            }
        }

        return component;
    }

     /**
     * Checks for changes in the code list  file.
     * It will ignore the values of certain properties that are expected to change between versions: 
     * (ublVersion, sdkVersion, metadataDatabase.version and metadataDatabase.createdOn).
     * 
     * @param {string} filename The codelist file to check for changes
     * @returns {Promise<Diff.TypeOfChange>} The type of change detected
     */
     async #checkForChanges(filename) {
        try {
            SdkExplorerApplication.startSpinner();
            let mainUrl = this.#getCodelistUrlForVersion(filename, appState.mainVersion);
            let baseUrl = this.#getCodelistUrlForVersion(filename, appState.baseVersion);
            let mainFile = await $.ajax({ url: mainUrl, dataType: 'text' });
            let baseFile = await $.ajax({ url: baseUrl, dataType: 'text' });

            let versionRegex = /<Version>(.*?)<\/Version>/; // Remove the global flag to replace only the first match

            // Replace version information in the XML content
            let mainFileModified = mainFile.replace(versionRegex, '<Version>-</Version>');
            let baseFileModified = baseFile.replace(versionRegex, '<Version>-</Version>');
            let commentRegex = /<!--[\s\S]*?-->/g; // Matches all XML comments

            // Remove all XML comments from the content
            mainFileModified = mainFileModified.replace(commentRegex, '');
            baseFileModified = baseFileModified.replace(commentRegex, '');
            
            let nodeChange = mainFileModified === baseFileModified ? Diff.TypeOfChange.UNCHANGED : Diff.TypeOfChange.MODIFIED;

            return nodeChange;
        } catch (error) {
            
            console.error(`Error processing files for ${filename}.json:`, error);
            return null;
        }
        finally {
            SdkExplorerApplication.stopSpinner();
        }   
    }
    

    #getCodelistUrlForVersion(filename, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/codelists/${filename}`;
    }

    // #endregion Overview display


    // #region Diff display -----------------------------------------------

        /**
     * Fetches both versions of notice type definition JSON files for the specified notice subtype and renders the explorer view.
     * 
     * @param {string} filename 
     */
        async fetchAndRenderDiffView(filename) {
            SdkExplorerApplication.startSpinner();
            try {
    
                const [mainData, baseData] = await Promise.all([
                    this.#fetchCodelist(filename, appState.mainVersion),
                    this.#fetchCodelist(filename, appState.baseVersion)
                ]);
                Diff.injectTextDiff(mainData, baseData, 'code-list-diff', `${filename}`);
                this.#switchToDiffView();
    
            } finally {
                SdkExplorerApplication.stopSpinner();
            }
        }

        /**
         * Fetches the codelist GC file for the specified id and SDK version.
         * 
         * @param {string} filename 
         * @param {string} sdkVersion
         *  
         * @returns 
         */
        async #fetchCodelist(filename, sdkVersion) {
            const url = this.#getCodelistUrlForVersion(filename, sdkVersion);
            try {
                const response = await $.ajax({ url, dataType: 'text' });
                return response;
            } catch (error) {
                console.error(`Error fetching codelist "${filename}" for SDK ${sdkVersion}:  `, error);
                throw error;
            }
        }
    /**
     * Shows the tree/detail explorer for the notice type.
     */
    #switchToDiffView() {
        $('#code-lists-overview').hide();
        $('#code-lists-diff-view').show();
    }

    // #endregion Diff display

}