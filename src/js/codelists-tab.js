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

    async fetchAndRender() {
        this.fetchAndRenderOverview();
    }


    /**
     * Fetches thecodelists.json index files for both versions and renders the overview display.
     */
    async fetchAndRenderOverview() {    
        SdkExplorerApplication.startSpinner();
        try {

            // Get code-lists.json index files for both versions.
            const [mainVersionData, baseVersionData] = await Promise.all([
                this.#fetchCodeListsIndexFile(appState.mainVersion),
                this.#fetchCodeListsIndexFile(appState.baseVersion)
            ]);

            // Compare the two index files
            const diff = Diff.fromArrayComparison(mainVersionData.codelists, baseVersionData.codelists, 'id');

            // Clear existing index-cards.
            $('#code-lists-overview-card-group').empty();

            // Create and add an index-card for each code list.
            diff.forEach((entry, index) => {
                setTimeout(() => {
                    const card = this.#createIndexCard(entry);
                    $('#code-lists-overview-card-group').append(card);
                }, 0);
            });
             this.#switchToOverview();
        } catch (error) {
            console.error('Error while generating overview:', error);
            throw new Error('Failed to load code list');
        } finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

        /**
     * Fetches the code-lists.json index file for the specified SDK version.
     */
        async #fetchCodeListsIndexFile(sdkVersion) {
            const url = this.#getCodeListsIndexFileUrl(sdkVersion);
            try {
                const response = await $.ajax({ url, dataType: 'json' });
                return response;
            } catch (error) {
                console.error('Error fetching code-lists.json:', error);
                throw error;
            }
        }

        
    #getCodeListsIndexFileUrl(sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/codelists/codelists.json`;
    }

    
    #switchToOverview() {
        //$('#code-lists-explorer-view').hide();
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
        // Not needed for now
        // component.setActionHandler((e) => {
        //     e.preventDefault();
        //     this.fetchAndRenderExplorerView(diffEntry.get('id'));
        // });
        // If the code list is not new or removed, then we will need to check for changes inside the code list file.
        if (diffEntry.typeOfChange !== Diff.TypeOfChange.ADDED && diffEntry.typeOfChange !== Diff.TypeOfChange.REMOVED) {
            component.removeAttribute('status');
            component.setStatusCheckCallback(() => Promise.resolve(this.#checkForChanges(diffEntry.baseItem.filename)));
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
            let mainUrl = this.#getUrlCodeListsAndVersion(filename, appState.mainVersion);
            let baseUrl = this.#getUrlCodeListsAndVersion(filename, appState.baseVersion);
            let mainFile = await $.ajax({ url: mainUrl, dataType: 'text' });
            let baseFile = await $.ajax({ url: baseUrl, dataType: 'text' });

            let versionRegex = /<Version>(.*?)<\/Version>/;
            
            // Extract version information from the XML content
            let mainVersionMatch = mainFile.match(versionRegex);
            let baseVersionMatch = baseFile.match(versionRegex);
    
            // If version tag is not found, return null to indicate an error or unknown state
            if (!mainVersionMatch || !baseVersionMatch) {
                console.error(`Version tag not found in one of the files for ${filename}.json`);
                return null;
            }
    
            let mainVersion = mainVersionMatch[1];
            let baseVersion = baseVersionMatch[1];
    
            let nodeChange = mainVersion === baseVersion ? Diff.TypeOfChange.UNCHANGED : Diff.TypeOfChange.MODIFIED;
            
            return nodeChange;
        } catch (error) {
            
            console.error(`Error processing files for ${filename}.json:`, error);
            return null;
        }
        finally {
            SdkExplorerApplication.stopSpinner();
        }   
    }
    

    #getUrlCodeListsAndVersion(filename, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/codelists/${filename}`;
    }
}