/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { appState } from "../state.js";
import { Diff } from "../diff.js";
import { TabController } from "./tab-controller.js";
import { SdkExplorerApplication } from "../app.js";
import { AjaxError, CustomError } from "../custom-error.js";
import { ERROR_GENERATING_OVERVIEW, ERROR_CHECKING_CHANGES, ERROR_GENERATING_DIFF, ERROR_FETCHING_FILE } from "../error-messages.js";
import { SchematronSource } from "../validation/schematron-source.js";

export class SchematronsTab extends TabController {

    /** @type {SchematronSource} */
    #source = new SchematronSource(this);

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

    /**
     * Overridden to hide the tab while the Validation tab is shown: the Validation tab then offers the schematrons as one of its sources.
     * If the Validation tab's probe fails, that tab is hidden, so this one is shown: the schematrons stay reachable.
     *
     * @returns {Promise<boolean>}
     */
    async isApplicable() {
        try {
            return !(await SdkExplorerApplication.instance.tabs.get('validation-tab').isApplicable());
        } catch {
            return true;
        }
    }

    /**
     * Overridden: the Validation tab, shown when this tab is hidden, replaces it, since it offers the schematrons as
     * one of its sources.
     *
     * @returns {string}
     */
    replacementTabId() {
        return 'validation-tab';
    }

    /**
     * Overridden to remove the cards and the diff.
     */
    clear() {
        this.#cardGroup().empty();
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
                this.#source.fetchIndex(appState.mainVersion),
                this.#source.fetchIndex(appState.baseVersion)
            ]);

            try {
                const diff = Diff.fromArrayComparison(mainVersionData, baseVersionData, 'filename');

                // Clear existing index-cards.
                this.#cardGroup().empty();

                // Create and add an index-card for each schematron.
                diff.forEach((entry, index) => {
                    this.defer(() => {
                        const card = this.#source.createIndexCard(entry);
                        this.#cardGroup().appendCard(card);
                    });
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
    * Checks for changes in the Schematrons file.
    * Called by the index cards of the {@link SchematronSource}.
    * 
    * @param {string} filename The Schematrons file to check for changes
    * @returns {Promise<Diff.TypeOfChange>} The type of change detected
    */
    async checkForChanges(filename) {
        try {
            SdkExplorerApplication.startSpinner();

            let [mainFile, baseFile] = await Promise.all([
                this.#fetchSchematronFile(filename, appState.mainVersion),
                this.#fetchSchematronFile(filename, appState.baseVersion)
            ]);

            try {
                const typeOfChange = this.#source.normaliseForComparison(mainFile, filename) === this.#source.normaliseForComparison(baseFile, filename)
                    ? Diff.TypeOfChange.UNCHANGED : Diff.TypeOfChange.MODIFIED;

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
                url: this.#source.fileUrl(filename, sdkVersion),
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



