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

    /**
     * Overridden to hook up event handlers.
     */
    init() {
        super.init();

        // Handle clicks on the "Overview" link to return to the Overview display.
        $('#view-templates-overview-link').on('click', async (e) => {
            await this.fetchAndRenderOverview();
        });
    }

    async fetchAndRender() {
        // Render the overview display by default
        this.fetchAndRenderOverview();
    }

    // #region Overview display -----------------------------------------------

    /**
     * Fetches view-templates.json index files for both versions and renders the overview display.
     */
    async fetchAndRenderOverview() {
        SdkExplorerApplication.startSpinner();
        try {

            // Get view-templates.json index files for both versions.
            const [mainVersionData, baseVersionData] = await Promise.all([
                this.#fetchIndexFile(appState.mainVersion),
                this.#fetchIndexFile(appState.baseVersion)
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
    async #fetchIndexFile(sdkVersion) {
        const url = this.#getIndexFileUrl(sdkVersion);
        try {
            const response = await $.ajax({ url, dataType: 'json' });
            return response;
        } catch (error) {
            console.error('Error fetching view-templates.json:', error);
            throw error;
        }
    }


    #getIndexFileUrl(sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/view-templates/view-templates.json`;
    }


    #switchToOverview() {
        $('#view-templates-diff-view').hide();
        $('#view-templates-overview').show();
    }

    /**
    * Creates an index-card for the specified view template.
    * 
    * @param {DiffEntry} diffEntry 
    * @returns 
    */
    #createIndexCard(diffEntry) {
        const component = IndexCard.create(diffEntry.get('filename'), '', 'Compare', diffEntry.typeOfChange);
  
        component.setActionHandler((e) => {
            e.preventDefault();
            this.fetchAndRenderDiffView(diffEntry.get('id'));
        });
        // If the view template is not new or removed, then we will need to check for changes inside the view template file.
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
                if (!diffEntry.mainItem.hasOwnProperty(propertyName)) {
                    const card = PropertyCard.create(propertyName, undefined, diffEntry.baseItem[propertyName]);
                    component.appendProperty(card);
                }
            }
        }

        return component;
    }

    /**
    * Checks for changes in the view template file.
    * It will ignore the values of certain properties that are expected to change between versions: 
    * (ublVersion, sdkVersion, metadataDatabase.version and metadataDatabase.createdOn).
    * 
    * @param {string} id The view template file to check for changes
    * @returns {Promise<Diff.TypeOfChange>} The type of change detected
    */
    async #checkForChanges(id) {
        try {
            SdkExplorerApplication.startSpinner();
            let mainUrl = this.#getUrlViewTemplateIdAndVersion(id, appState.mainVersion);
            let baseUrl = this.#getUrlViewTemplateIdAndVersion(id, appState.baseVersion);
            let mainFile = await $.ajax({ url: mainUrl, dataType: 'text' });
            let baseFile = await $.ajax({ url: baseUrl, dataType: 'text' });

            let commentLineRegex = /^\/\/.*$/gm;
            mainFile = mainFile.replace(commentLineRegex, '');
            baseFile = baseFile.replace(commentLineRegex, '');
            
            let nodeChange = mainFile === baseFile ? Diff.TypeOfChange.UNCHANGED : Diff.TypeOfChange.MODIFIED;
            return nodeChange;
        } catch (error) {

            console.error(`Error processing files for ${id}.efx:`, error);
            return null;
        }
        finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    #getUrlViewTemplateIdAndVersion(id, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/view-templates/${id}.efx`;
    }


    // #endregion Overview display


    // #region Diff display -----------------------------------------------

    /**
     * Fetches both versions of notice type definition JSON files for the specified notice subtype and renders the explorer view.
     * 
     * @param {string} id 
     */
    async fetchAndRenderDiffView(id) {
        SdkExplorerApplication.startSpinner();
        try {

            const [mainData, baseData] = await Promise.all([
                this.#fetchViewTemplate(id, appState.mainVersion),
                this.#fetchViewTemplate(id, appState.baseVersion)
            ]);
            Diff.injectTextDiff(mainData, baseData, 'view-template-diff', `${id}.efx`);
            this.#switchToDiffView();

        } finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    /**
     * Fetches the view template EFX file for the specified id and SDK version.
     * 
     * @param {string} id 
     * @param {string} sdkVersion
     *  
     * @returns 
     */
    async #fetchViewTemplate(id, sdkVersion) {
        const url = this.#getUrlByViewTemplateIdAndVersion(id, sdkVersion);
        try {
            const response = await $.ajax({ url, dataType: 'text' });
            return response;
        } catch (error) {
            console.error(`Error fetching view template "${id}.efx" for SDK ${sdkVersion}:  `, error);
            throw error;
        }
    }

    
    /**
     * Shows the tree/detail explorer for the notice type.
     */
    #switchToDiffView() {
        $('#view-templates-overview').hide();
        $('#view-templates-diff-view').show();
    }

    #getUrlByViewTemplateIdAndVersion(id, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/view-templates/${id}.efx`;
    }
    
    // #endregion Diff display

}