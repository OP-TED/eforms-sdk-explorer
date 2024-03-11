/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { appState } from "../state.js";
import { appConfig } from "../config.js";
import { Diff, DiffEntry } from "../diff.js";
import { TabController } from "./tab-controller.js";
import { PropertyCard } from "../components/property-card.js";
import { IndexCard } from "../components/index-card.js";
import { SdkExplorerApplication } from "../app.js";
import { AjaxError, CustomError } from "../custom-error.js";
import { ERROR_GENERATING_OVERVIEW, ERROR_CHECKING_CHANGES, ERROR_GENERATING_DIFF, ERROR_FETCHING_FILE, ERROR_FETCHING_DIRECTORY_LISTING } from "../error-messages.js";

export class SchemasTab extends TabController {

    constructor() {
        super('schemas-tab');
    }

    /**
     * Overridden to hook up event handlers.
     */
    init() {
        super.init();

        // Handle clicks on the "Overview" link to return to the Overview display.
        $('#schemas-overview-link').on('click', async (e) => {
            await this.#switchToOverview();
        });
    }

    async fetchAndRender() {
        await this.fetchAndRenderOverview();
    }

    deactivated() {
        super.deactivated();
        this.#cardGroup().dispose();
        this.$diffContainer().empty();
    }

    // #region Overview display -----------------------------------------------


    /**
     * 
     * @returns {CardGroup}
     */
    #cardGroup() {
        return document.getElementById('schemas-overview-card-group');
    }

    #diffContainer() {
        return document.getElementById('schemas-diff');
    }

    $diffContainer() {
        return $(this.#diffContainer());
    }
    
    /**
     * Fetches schemas files for both versions and renders the overview display.
     */
    async fetchAndRenderOverview() {
        SdkExplorerApplication.startSpinner();
        try {

            // Get schemas.json index files for both versions.
            const [mainVersionData, baseVersionData] = await Promise.all([
                this.#fetchIndexFile(appState.mainVersion),
                this.#fetchIndexFile(appState.baseVersion)
            ]);

            try {
                const diff = Diff.fromArrayComparison(mainVersionData, baseVersionData, 'filename');

                // Clear existing index-cards.
                this.#cardGroup().empty();

                // Create and add an index-card for each schema.
                diff.forEach((entry, index) => {
                    setTimeout(() => {
                        if (!this.aborting) {
                            const card = this.#createIndexCard(entry);
                            this.#cardGroup().appendCard(card);
                        }
                    }, 0);
                });
                this.#switchToOverview();
            } catch (error) {
                throw new CustomError(ERROR_GENERATING_OVERVIEW, error);
            }
        } finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    /**
     * Fetches the schemas.json index file for the specified SDK version.
     */
      async #fetchIndexFile(sdkVersion) {
        try {
            const url = this.#getIndexFileUrl(sdkVersion);
            const { schemas } = await this.ajaxRequest({ url, dataType: 'json' });
            return schemas;
        } catch (error) {
            if (error.status === 404) {
                console.warn(`schemas.json not found for SDK ${sdkVersion}, fetching filenames from schema folder.`);
                return this.#fetchFilenames(sdkVersion);
            }
            throw new AjaxError(ERROR_FETCHING_FILE('schemas.json', sdkVersion), error);
        }
    }


    #getIndexFileUrl(sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/schemas/schemas.json`;
    }

    async #fetchFilenames(sdkVersion) {
        const apiUrl = `${appConfig.contentsFileUrl}/schemas?ref=${sdkVersion}`;
        const directoryStructure = await this.#fetchGithubDirectory(apiUrl, '');
        const directoryStructureConst = Object.assign({}, directoryStructure);
        return this.#processDirectoryData(directoryStructureConst);
    }

    async #fetchGithubDirectory(url, path) {

        const response = await this.ajaxRequest({
            url: url,
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        }).catch(error => {
            throw new AjaxError(ERROR_FETCHING_DIRECTORY_LISTING, error);
        });

        let directoryStructure = {};
        for (const item of response) {
            if (item.type === 'file') {
                const extension = item.name.split('.').pop();
                if (['xsd', 'json', 'xml'].includes(extension)) {
                    if (!directoryStructure[path]) {
                        directoryStructure[path] = [];
                    }
                    directoryStructure[path].push(item.name);
                }
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
            const folder = path.split('/').pop();

            files.forEach(file => {
                const filenameParts = file.split('.');
                const extension = filenameParts.pop();
                const filenameWithoutExtension = filenameParts.join('.');

                let standard = null;
                let name = filenameWithoutExtension;
                let version = null;

                if (extension === 'xsd') {
                    [standard, name, version] = filenameWithoutExtension.split('-');
                }

                name = name.replace(/_/g, ' ');

                processedData.push({
                    standard: standard,
                    name: name,
                    version: version,
                    folder: folder,
                    filename: `${folder}/${file}`,
                });
            });
        }

        processedData.sort((a, b) => a.name.localeCompare(b.name));

        return processedData;
    }
    /**
    * Creates an index-card for the specified Schema.
    * 
    * @param {DiffEntry} diffEntry 
    * @returns 
    */
    #createIndexCard(diffEntry) {
        const component = IndexCard.create(diffEntry.get('name'), diffEntry.get('standard'), 'Compare', diffEntry.typeOfChange);
        component.setActionHandler(async (e) => {
            await this.fetchAndRenderDiffView(diffEntry.get('filename'));
        });
        // If the Schema is not new or removed, then we will need to check for changes inside the Schemas file.
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
                    const card = PropertyCard.create(propertyName, undefined, diffEntry.baseItem[propertyName], Diff.TypeOfChange.REMOVED);
                    component.appendProperty(card);
                }
            }
        }

        return component;
    }

    /**
    * Checks for changes in the Schema.
    * It will ignore the values of certain properties that are expected to change between versions: 
    * (ublVersion, sdkVersion, metadataDatabase.version and metadataDatabase.createdOn).
    * 
    * @param {string} filename The Schema to check for changes
    * @returns {Promise<Diff.TypeOfChange>} The type of change detected
    */
    async #checkForChanges(filename) {
        try {
            SdkExplorerApplication.startSpinner();

            // Get the two versions of the file.
            let [mainFile, baseFile] = await Promise.all([
                this.#fetchSchema(filename, appState.mainVersion),
                this.#fetchSchema(filename, appState.baseVersion)
            ]);

            try {
                // Compare to determine the type of change.
                const typeOfChange = mainFile === baseFile ? Diff.TypeOfChange.UNCHANGED : Diff.TypeOfChange.MODIFIED;

                // Nullify the two variables holding the file contents to free up memory.
                mainFile = null;
                baseFile = null;

                return typeOfChange;
            } catch (error) {
                throw new CustomError(ERROR_CHECKING_CHANGES(filename), error);
            }
        }
        finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    #getSchemaUrForVersion(filename, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/schemas/${filename}`;
    }

    // #endregion Overview display

    // #region Diff display -----------------------------------------------

    /**
     * Fetches both versions of label files and renders the diff view.
     * 
     * @param {string} filename 
     */
    async fetchAndRenderDiffView(filename) {
        SdkExplorerApplication.startSpinner();
        try {

            const [mainData, baseData] = await Promise.all([
                this.#fetchSchema(filename, appState.mainVersion),
                this.#fetchSchema(filename, appState.baseVersion)
            ]);

            try {
                Diff.injectTextDiff(mainData, baseData, 'schemas-diff', `${filename}`);
                this.#switchToDiffView();
            } catch (error) {
                throw new CustomError(ERROR_GENERATING_DIFF(filename), error);
            }
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
    async #fetchSchema(filename, sdkVersion) {
        const url = this.#getSchemaUrForVersion(filename, sdkVersion);
        return this.ajaxRequest({ url, dataType: 'text' });
    }

    #switchToOverview() {
        $('#schemas-diff-view').addClass('hide-important');
        $('#schemas-overview').removeClass('hide-important');
        this.$diffContainer().empty();
    }

    /**
     * Shows the tree/detail explorer for the schemas.
     */
    #switchToDiffView() {
        $('#schemas-overview').addClass('hide-important');
        $('#schemas-diff-view').removeClass('hide-important');
    }
    
    // #endregion Diff display

}