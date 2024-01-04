import { appState } from "./state.js";
import { appConfig } from "./config.js";
import { Diff, DiffEntry } from "./diff.js";
import { TabController } from "./tab-controller.js";
import { PropertyCard } from "./property-card.js";
import { IndexCard } from "./index-card.js";
import { SdkExplorerApplication } from "./app.js";
export class ViewTemplatesTab extends TabController {

    constructor() {
        super('view-templates-tab');
    }

  
    async fetchAndRender() {
        this.fetchAndRenderOverview();
    }


    /**
     * Fetches view-templates.json index files for both versions and renders the overview display.
     */
    async fetchAndRenderOverview() {
        SdkExplorerApplication.startSpinner();
        try {

            // Get view-templates.json index files for both versions.
            const [mainVersionData, baseVersionData] = await Promise.all([
                this.#fetch1viewTemplateIndexFile(appState.mainVersion),
                this.#fetch1viewTemplateIndexFile(appState.baseVersion)
            ]);
            // Compare the two index files
            const diff = Diff.fromArrayComparison(mainVersionData.viewTemplates, baseVersionData.viewTemplates, 'id');

            // Clear existing index-cards.
            $('#view-templates-overview-card-group').empty();

            // Create and add an index-card for each view templates.
            diff.forEach((entry, index) => {
                setTimeout(() => {
                    const card = this.#createIndexCard(entry);
                    $('#view-templates-overview-card-group').append(card);
                }, 0);
            });
            this.#switchToOverview();
        } catch (error) {
            console.error('Error while generating overview:', error);
            throw new Error('Failed to load view templates');
        } finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    /**
 * Fetches the view-templates.json index file for the specified SDK version.
 */
    async #fetch1viewTemplateIndexFile(sdkVersion) {
        const url = this.#getViewTemplatesIndexFileUrl(sdkVersion);
        try {
            const response = await $.ajax({ url, dataType: 'json' });
            return response;
        } catch (error) {
            console.error('Error fetching view-templates.json:', error);
            throw error;
        }
    }


    #getViewTemplatesIndexFileUrl(sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/view-templates/view-templates.json`;
    }


    #switchToOverview() {
        //$('#view-templates-explorer-view').hide();
        $('#view-templates-overview').show();
    }

    /**
    * Creates an index-card for the specified view templates.
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
        // If the view templates is not new or removed, then we will need to check for changes inside the view templates file.
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
    * Checks for changes in the view templates file.
    * It will ignore the values of certain properties that are expected to change between versions: 
    * (ublVersion, sdkVersion, metadataDatabase.version and metadataDatabase.createdOn).
    * 
    * @param {string} filename The view templates file to check for changes
    * @returns {Promise<Diff.TypeOfChange>} The type of change detected
    */
    async #checkForChanges(filename) {
        try {
            SdkExplorerApplication.startSpinner();
            let mainUrl = this.#getUrlViewTemplatesListsAndVersion(filename, appState.mainVersion);
            let baseUrl = this.#getUrlViewTemplatesListsAndVersion(filename, appState.baseVersion);
            let mainFile = await $.ajax({ url: mainUrl, dataType: 'text' });
            let baseFile = await $.ajax({ url: baseUrl, dataType: 'text' });
            
            let nodeChange = mainFile === baseFile ? Diff.TypeOfChange.UNCHANGED : Diff.TypeOfChange.MODIFIED;
            return nodeChange;
        } catch (error) {

            console.error(`Error processing files for ${filename}.json:`, error);
            return null;
        }
        finally {
            SdkExplorerApplication.stopSpinner();
        }
    }


    #getUrlViewTemplatesListsAndVersion(filename, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/view-templates/${filename}`;
    }
}