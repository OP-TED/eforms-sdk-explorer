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
import { ERROR_FETCHING_DIRECTORY_LISTING, ERROR_GENERATING_OVERVIEW, ERROR_CHECKING_CHANGES, ERROR_GENERATING_DIFF, ERROR_FETCHING_FILE } from "../error-messages.js";

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
            this.#switchToOverview();
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

    /**
     * 
     * @returns {CardGroup}
     */
    #cardGroup() {
        return document.getElementById('schematrons-overview-card-group');
    }

    #diffContainer() {
        return document.getElementById('schematrons-diff');
    }

    $diffContainer() {
        return $(this.#diffContainer());
    }

    /**
     * Fetches schematron files for both versions and renders the overview display.
     */
    async fetchAndRenderOverview() {
        SdkExplorerApplication.startSpinner();
        try {

            const [mainVersionData, baseVersionData] = await Promise.all([
                this.#fetchIndex(appState.mainVersion),
                this.#fetchIndex(appState.baseVersion)
            ]);

            try {
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
                throw new CustomError(ERROR_GENERATING_OVERVIEW, error);
            }
        } finally {
            SdkExplorerApplication.stopSpinner();
        }
    }
    
    async #fetchIndex(sdkVersion) {
        const apiUrl = `${appConfig.contentsFileUrl}/schematrons?ref=${sdkVersion}`;
        const directoryStructure = await this.#fetchGithubDirectory(apiUrl, '');
        return this.#buildIndexFromGithubDirectory(directoryStructure);
    }

    async #fetchGithubDirectory(url, path) {

        const response = await this.ajaxRequest({
            url: url,
            headers: { 'Accept': 'application/vnd.github.v3+json' },
        }).catch(error => {
            throw new AjaxError(ERROR_FETCHING_DIRECTORY_LISTING, error);
        });

        let directoryStructure = {};
        for (const item of response) {
            if (item.type === 'file') {
                const extension = item.name.split('.').pop();
                if (extension === 'sch') {
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

    #buildIndexFromGithubDirectory(directoryData) {
        let index = [];

        for (const [path, files] of Object.entries(directoryData)) {
            const trimmedPath = path.split('/').pop();

            files.forEach(file => {
                const filenameWithoutExtension = file.replace('.sch', '');
                let stage = null;

                if (filenameWithoutExtension.startsWith('validation-stage')) {
                    const parts = filenameWithoutExtension.split('-');
                    stage = parts[2]; // The stage is the third part of the filename
                }

                index.push({
                    name: filenameWithoutExtension,
                    stage: stage,
                    folder: trimmedPath,
                    filename: `${trimmedPath}/${file}`
                });
            });
        }

        return index;
    }

    
    /**
     * Creates an index-card for the specified Schematrons.
     * 
     * @param {DiffEntry} diffEntry 
     * @returns 
     */
    #createIndexCard(diffEntry) {
        const component = IndexCard.create(diffEntry.get('name'), diffEntry.get('folder') ?? '', 'Compare', diffEntry.typeOfChange);
        component.setActionHandler(async (e) => {
            await this.fetchAndRenderDiffView(diffEntry.get('filename'));
        });
        // If the Schematrons is not new or removed, then we will need to check for changes inside the Schematrons file.
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
    * Checks for changes in the Schematrons file.
    * @param {string} filename The Schematrons file to check for changes
    * @returns {Promise<Diff.TypeOfChange>} The type of change detected
    */
    async #checkForChanges(filename) {
        try {
            SdkExplorerApplication.startSpinner();

            let [mainFile, baseFile] = await Promise.all([
                this.#fetchSchematronFile(filename, appState.mainVersion),
                this.#fetchSchematronFile(filename, appState.baseVersion)
            ]);

            try {
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

    #getSchematronFileUrl(filename, sdkVersion) {
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
                this.#fetchSchematronFile(filename, appState.mainVersion),
                this.#fetchSchematronFile(filename, appState.baseVersion)
            ]);
            try {
                Diff.injectTextDiff(mainData, baseData, 'schematrons-diff', `${filename}`);
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
    async #fetchSchematronFile(filename, sdkVersion) {
        try {
            return await this.ajaxRequest({
                url: this.#getSchematronFileUrl(filename, sdkVersion),
                dataType: 'text'
            });
        } catch (error) {
            throw new AjaxError(ERROR_FETCHING_FILE(filename, sdkVersion), error);
        }
    }

    /**
     * Shows the overview display for schematron files.
     */
    #switchToOverview() {
        $('#schematrons-diff-view').addClass('hide-important');     // Hide the diff view.
        $('#schematrons-overview').removeClass('hide-important');   // Show the overview.
        this.$diffContainer().empty();                              // Clear the diff view to save memory.
    }

    /**
     * Shows the diff view for schematron files.
     */
    #switchToDiffView() {
        $('#schematrons-overview').addClass('hide-important');      // Hide the overview.
        $('#schematrons-diff-view').removeClass('hide-important');  // Show the diff view.
    }
}



