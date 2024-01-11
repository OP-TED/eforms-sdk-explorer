import { appState } from "./state.js";
import { appConfig } from "./config.js";
import { Diff, DiffEntry } from "./diff.js";
import { TabController } from "./tab-controller.js";
import { PropertyCard } from "./property-card.js";
import { IndexCard } from "./index-card.js";
import { SdkExplorerApplication } from "./app.js";
export class SchematronsTab extends TabController {

    constructor() {
        super('schematrons-tab');
    }

    /**
 * Overridden to hook up event handlers.
 */
    init() {
        super.init();

        // Handle clicks on the "Overview" link to return to the Overview display.
        $('#schematrons-overview-link').on('click', async (e) => {
            await this.fetchAndRenderOverview();
        });
    }

    async fetchAndRender() {
        // Render the overview display by default
        this.fetchAndRenderOverview();
    }

    // #region Overview display -----------------------------------------------


    /**
     * 
     * @returns {CardGroup}
     */
    #cardGroup() {
        return document.getElementById('schematrons-overview-card-group');
    }

      /**
   * Fetches schematron files for both versions and renders the overview display.
   */
      async fetchAndRenderOverview() {
        SdkExplorerApplication.startSpinner();
        try {

            const [mainVersionData, baseVersionData] = await Promise.all([
                this.#fetchFilenamesFromSchematronFolder(appState.mainVersion),
                this.#fetchFilenamesFromSchematronFolder(appState.baseVersion)
            ]);
            const diff = Diff.fromArrayComparison(mainVersionData, baseVersionData, 'filename');

            // Clear existing index-cards.
            this.#cardGroup().empty();

            // Create and add an index-card for each schematron.
            diff.forEach((entry, index) => {
                setTimeout(() => {
                    const card = this.#createIndexCard(entry);
                    this.#cardGroup().appendCard(card);
                }, 0);
            });
            this.#switchToOverview();
        } catch (error) {
            console.error('Error while generating overview:', error);
            throw new Error('Failed to load schematrons');
        } finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    #switchToOverview() {
        $('#schematron-overview').show();
    }

    
    async #fetchFilenamesFromSchematronFolder(sdkVersion) {
        const apiUrl = `${appConfig.contentsFileUrl}/schematrons?ref=${sdkVersion}`;
        try {
            const directoryStructure = await this.#fetchGithubDirectory(apiUrl, '');
            const directoryStructureConst = Object.assign({}, directoryStructure);
            return this.#processDirectoryData(directoryStructureConst);
        } catch (error) {
            console.error('Error fetching filenames from GitHub API:', error);
            throw error;
        }
    }
    async #fetchGithubDirectory(url, path) {
        const response = await $.ajax({
            url: url,
            headers: { 'Accept': 'application/vnd.github.v3+json' },
        });

        let directoryStructure = {};
        for (const item of response) {
            if (item.type === 'file') {
                if (!directoryStructure[path]) {
                    directoryStructure[path] = [];
                }
                directoryStructure[path].push(item.name);
            } else if (item.type === 'dir') {
                const subDirStructure = await this.#fetchGithubDirectory(item.url, item.path);
                directoryStructure = { ...directoryStructure, ...subDirStructure };
            }
        }
        return directoryStructure;
    }

    #processDirectoryData(data) {
        let processedData = [];

        for (const [path, files] of Object.entries(data)) {
            const trimmedPath = path.split('/').pop();

            files.forEach(file => {
                const filenameWithoutExtension = file.replace('.sch', '');
                processedData.push({
                    filename: filenameWithoutExtension,
                    path: trimmedPath,
                    file: `${trimmedPath}/${file}`,
                });
            });
        }

        return processedData;
    }

    
    /**
  * Creates an index-card for the specified Schematrons.
  * 
  * @param {DiffEntry} diffEntry 
  * @returns 
  */
    #createIndexCard(diffEntry) {
        const component = IndexCard.create(diffEntry.get('filename'), '', 'Compare', diffEntry.typeOfChange);
        component.setActionHandler((e) => {
            e.preventDefault();
            this.fetchAndRenderDiffView(diffEntry.get('file'));
        });
        // If the Schematrons is not new or removed, then we will need to check for changes inside the Schematrons file.
        if (diffEntry.typeOfChange !== Diff.TypeOfChange.ADDED && diffEntry.typeOfChange !== Diff.TypeOfChange.REMOVED) {
            component.removeAttribute('status');
            component.setStatusCheckCallback(() => Promise.resolve(this.#checkForChanges(diffEntry.baseItem.file)));
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
* Checks for changes in the Schematrons file.
* @param {string} filename The Schematrons file to check for changes
* @returns {Promise<Diff.TypeOfChange>} The type of change detected
*/
    async #checkForChanges(filename) {
        try {
            SdkExplorerApplication.startSpinner();
            let mainUrl = this.#getUrSchematronsListsAndVersion(filename, appState.mainVersion);
            let baseUrl = this.#getUrSchematronsListsAndVersion(filename, appState.baseVersion);
            let mainFile = await $.ajax({ url: mainUrl, dataType: 'text' });
            let baseFile = await $.ajax({ url: baseUrl, dataType: 'text' });
            let nodeChange = mainFile === baseFile ? Diff.TypeOfChange.UNCHANGED : Diff.TypeOfChange.MODIFIED;
            return nodeChange;
        } catch (error) {

            console.error(`Error processing files for ${filename}.sch:`, error);
            return null;
        }
        finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    #getUrSchematronsListsAndVersion(filename, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/schematrons/${filename}`;
    }

    
    /**
     * Fetches both versions of label files and renders the diff view.
     * 
     * @param {string} filename 
     */
    async fetchAndRenderDiffView(filename) {
        SdkExplorerApplication.startSpinner();
        try {
            
            const [mainData, baseData] = await Promise.all([
                this.#fetchLabels(filename, appState.mainVersion),
                this.#fetchLabels(filename, appState.baseVersion)
            ]);
            
            Diff.injectTextDiff(mainData, baseData, 'schematrons-diff', `${filename}`);
            this.#switchToDiffView();

        } finally {
            SdkExplorerApplication.stopSpinner();
        }
    }
        /**
         * Fetches the labels XML file for the specified SDK version.
         * 
         * @param {string} filename 
         * @param {string} sdkVersion
         *  
         * @returns 
         */
            async #fetchLabels(filename, sdkVersion) {
                const url = this.#getUrSchematronsListsAndVersion(filename, sdkVersion);
                
                try {
                    const response = await $.ajax({ url, dataType: 'text' });
                    return response;
                } catch (error) {
                    console.error(`Error fetching Schematron "${filename}" for SDK ${sdkVersion}:  `, error);
                    throw error;
                }
            }

    /**
     * Shows the tree/detail explorer for the notice type.
     */
    #switchToDiffView() {
        $('#schematrons-overview').hide();
        $('#schematrons-diff-view').show();
    }

}



