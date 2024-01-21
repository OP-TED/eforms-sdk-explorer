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
export class TranslationsTab extends TabController {

    constructor() {
        super('translations-tab');
    }

    /**
     * Overridden to hook up event handlers.
     */
    init() {
        super.init();

        // Handle clicks on the "Overview" link to return to the Overview display.
        $('#translations-overview-link').on('click', async (e) => {
            this.#switchToOverview();
        });
    }

    async fetchAndRender() {
        this.fetchAndRenderOverview();
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
        return document.getElementById('translations-overview-card-group');
    }

    #diffContainer() {
        return document.getElementById('translations-diff');
    }

    $diffContainer() {
        return $(this.#diffContainer());
    }
    
    /**
     * Fetches translations.json index files for both versions and renders the overview display.
     */
    async fetchAndRenderOverview() {
        SdkExplorerApplication.startSpinner();
        try {

            // Get translations.json index files for both versions.
            const [mainVersionData, baseVersionData] = await Promise.all([
                this.#fetchTranslationsIndexFile(appState.mainVersion),
                this.#fetchTranslationsIndexFile(appState.baseVersion)
            ]);

            // Compare the two index files
            const diff = Diff.fromArrayComparison(mainVersionData.files, baseVersionData.files, 'filename');

            // Clear existing index-cards.
            this.#cardGroup().empty();

            // Create and add an index-card for each Translations.
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
            console.error('Error while generating overview:', error);
            throw new Error('Failed to load Translations');
        } finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    /**
     * Fetches the translations.json index file for the specified SDK version.
     */
    async #fetchTranslationsIndexFile(sdkVersion) {
        const url = this.#getTranslationsIndexFileUrl(sdkVersion);
        try {
            const response = await this.ajaxRequest({ 
                url: url, 
                dataType: 'json'
            });
            return response;
        } catch (error) {
            if (error.status === 404) {
                console.warn(`translations.json not found for SDK version ${sdkVersion}, fetching filenames from translations folder`);
                return this.#fetchFilenamesFromTranslationsFolder(sdkVersion);
            }
            console.error('Error fetching translations.json:', error);
            throw error;
        }
    }


    async #fetchFilenamesFromTranslationsFolder(sdkVersion) {
        const apiUrl = `${appConfig.contentsFileUrl}/translations?ref=${sdkVersion}`;
        try {
            const response = await this.ajaxRequest({
                url: apiUrl,
                headers: { 'Accept': 'application/vnd.github.v3+json' },
            });
            return this.#processFilenames(response.map(file => file.name));
        } catch (error) {
            console.error('Error fetching filenames from GitHub API:', error);
            throw error;
        }
    }

    #fetchCountryCodeMappings() {
        return this.ajaxRequest({ 
            url: './src/assets/eu_countries_three_letter_code_mappings.json', 
            dataType: 'json' 
        });
    }
    
    async #processFilenames(filenames) {
        const euCountriesCodeMappings = await this.#fetchCountryCodeMappings();
        const processedFilenames = filenames.map(filename => {
            const parts = filename.split('_');
            const assetType = parts[0];
            const twoLetterCode = parts[1].split('.')[0];
            const threeLetterCode = euCountriesCodeMappings[twoLetterCode] || '';

            return {
                assetType: assetType,
                twoLetterCode: twoLetterCode,
                threeLetterCode: threeLetterCode,
                filename: filename
            };
        });
        return { files: processedFilenames };
    }
    

    #getTranslationsIndexFileUrl(sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/translations/translations.json`;
    }


    #switchToOverview() {
        $('#translations-diff-view').addClass('hide-important');
        $('#translations-overview').removeClass('hide-important');
        this.$diffContainer().empty();
    }

    /**
    * Creates an index-card for the specified Translations.
    * 
    * @param {DiffEntry} diffEntry 
    * @returns 
    */
    #createIndexCard(diffEntry) {
        const component = IndexCard.create(diffEntry.get('assetType'), diffEntry.get('twoLetterCode'), 'Compare', diffEntry.typeOfChange);
        component.setActionHandler((e) => {
            e.preventDefault();
            this.fetchAndRenderDiffView(diffEntry.get('filename'));
        });
        // If the Translations is not new or removed, then we will need to check for changes inside the Translations file.
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
    * Checks for changes in the Translations file.
    * It will ignore the values of certain properties that are expected to change between versions: 
    * (ublVersion, sdkVersion, metadataDatabase.version and metadataDatabase.createdOn).
    * 
    * @param {string} filename The Translations file to check for changes
    * @returns {Promise<Diff.TypeOfChange>} The type of change detected
    */
    async #checkForChanges(filename) {
        try {
            SdkExplorerApplication.startSpinner();

            // Get the two versions of the file.
            const mainUrl = this.#getLabelsUrlForVersion(filename, appState.mainVersion);
            const baseUrl = this.#getLabelsUrlForVersion(filename, appState.baseVersion);
            let [mainFile, baseFile] = await Promise.all([
                this.ajaxRequest({ url: mainUrl, dataType: 'text' }),
                this.ajaxRequest({ url: baseUrl, dataType: 'text' })
            ]);         

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
                console.error(`Error processing files for ${filename}:`, error);
            }
            return null;
        }
        finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    #getLabelsUrlForVersion(filename, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/translations/${filename}`;
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
                this.#fetchLabels(filename, appState.mainVersion),
                this.#fetchLabels(filename, appState.baseVersion)
            ]);
            Diff.injectTextDiff(mainData, baseData, 'translations-diff', `${filename}`);
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
        const url = this.#getLabelsUrlForVersion(filename, sdkVersion);
        return this.ajaxRequest({ url, dataType: 'text' });
    }

    /**
     * Shows the tree/detail explorer for the notice type.
     */
    #switchToDiffView() {
        $('#translations-overview').addClass('hide-important');
        $('#translations-diff-view').removeClass('hide-important');
    }
    
    // #endregion Diff display

}