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
import { CardGroup } from "../components/card-group.js";
import { CustomError, AjaxError } from "../custom-error.js";
import { ERROR_GENERATING_OVERVIEW, ERROR_CHECKING_CHANGES, ERROR_GENERATING_DIFF, ERROR_FETCHING_FILE } from "../error-messages.js";

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
            this.#switchToOverview();
        });
    }

    async fetchAndRender() {
        // Render the overview display by default
        await this.fetchAndRenderOverview();
    }

    // #region Overview display -----------------------------------------------

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
        return document.getElementById('code-lists-overview-card-group');
    }

    #diffContainer() {
        return document.getElementById('code-lists-diff');
    }

    $diffContainer() {
        return $(this.#diffContainer());
    }

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

            try {
                // Compare the two index files
                const diff = Diff.fromArrayComparison(mainVersionData.codelists, baseVersionData.codelists, 'id');

                // Clear existing index-cards.
                this.#cardGroup().empty();

                // Create and add an index-card for each codelist.
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
     * Fetches the code-lists.json index file for the specified SDK version.
     */
    async #fetchIndexFile(sdkVersion) {
        try {
            const url = this.#getIndexFileUrl(sdkVersion);
            const response = await this.ajaxRequest({ url, dataType: 'json' });
            return response;
        } catch (error) {
            throw new AjaxError(ERROR_FETCHING_FILE('codelists.json', sdkVersion), error);
        }
    }


    #getIndexFileUrl(sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/codelists/codelists.json`;
    }


    #switchToOverview() {
        $('#code-list-diff-view').addClass('hide-important');
        $('#code-lists-overview').removeClass('hide-important');
        this.$diffContainer().empty();
    }

     /**
     * Creates an index-card for the specified code list.
     * 
     * @param {DiffEntry} diffEntry 
     * @returns 
     */
     #createIndexCard(diffEntry) {
        const component = IndexCard.create(diffEntry.get('id'), diffEntry.get('parentId') ?? '', 'Compare', diffEntry.typeOfChange);
        component.setActionHandler(async (e) => {
            await this.fetchAndRenderDiffView(diffEntry.get('filename'));
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
                    const card = PropertyCard.create(propertyName, undefined, diffEntry.baseItem[propertyName], Diff.TypeOfChange.REMOVED);
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

            // Fetch the two versions of the file
            let [mainFile, baseFile] = await Promise.all([
                this.#fetchCodelist(filename, appState.mainVersion),
                this.#fetchCodelist(filename, appState.baseVersion)
            ]);

            try {
                // Ignore version information when comparing
                const versionRegex = /<Version>(.*?)<\/Version>/; // Remove the global flag to replace only the first match
                let mainFileModified = mainFile.replace(versionRegex, '<Version>-</Version>');
                let baseFileModified = baseFile.replace(versionRegex, '<Version>-</Version>');

                // Also remove all XML comments before comparing
                const commentRegex = /<!--[\s\S]*?-->/g; // Matches all XML comments
                mainFileModified = mainFileModified.replace(commentRegex, '');
                baseFileModified = baseFileModified.replace(commentRegex, '');

                // Compare to determine the type of change
                const typeOfChange = mainFileModified === baseFileModified ? Diff.TypeOfChange.UNCHANGED : Diff.TypeOfChange.MODIFIED;

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

    #getCodelistUrlForVersion(filename, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/codelists/${filename}`;
    }

    // #endregion Overview display


    // #region Diff display -----------------------------------------------

    /**
     * Fetches both versions of codelist files and renders the diff view.
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

            try {
                Diff.injectTextDiff(mainData, baseData, 'code-list-diff', `${filename}`);
                this.#switchToDiffView();
            } catch (error) {
                throw new CustomError(ERROR_GENERATING_DIFF(filename), error);
            }
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
        return this.ajaxRequest({ url, dataType: 'text' }).catch(error => {
            throw new AjaxError(ERROR_FETCHING_FILE(filename, sdkVersion), error);
        });
    }

    /**
     * Shows the tree/detail explorer for the notice type.
     */
    #switchToDiffView() {
        $('#code-lists-overview').addClass('hide-important');
        $('#code-list-diff-view').removeClass('hide-important');
    }

    // #endregion Diff display

}