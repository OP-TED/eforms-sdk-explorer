import { appState } from "./state.js";
import { appConfig } from "./config.js";
import { Diff, DiffEntry } from "./diff.js";
import { TabController } from "./tab-controller.js";
import { PropertyCard } from "./property-card.js";
import { IndexCard } from "./index-card.js";
import { SdkExplorerApplication } from "./app.js";

export class TranslationsTab extends TabController {

    constructor() {
        super('translations-tab');
    }

    async fetchAndRender() {
        this.fetchAndRenderOverview();
    }

    /**
     * Fetches translations.json index files for both versions and renders the overview display.
     */
    async fetchAndRenderOverview() {
        SdkExplorerApplication.startSpinner();
        try {

            // Get translations.json index files for both versions.
            const [mainVersionData, baseVersionData] = await Promise.all([
                this.#fetch1TranslationsIndexFile(appState.mainVersion),
                this.#fetch1TranslationsIndexFile(appState.baseVersion)
            ]);

            // Compare the two index files
            const diff = Diff.fromArrayComparison(mainVersionData.files, baseVersionData.files, 'filename');

            // Clear existing index-cards.
            $('#translations-overview-card-group').empty();

            // Create and add an index-card for each Translations.
            diff.forEach((entry, index) => {
                setTimeout(() => {
                    const card = this.#createIndexCard(entry);
                    $('#translations-overview-card-group').append(card);
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
    async #fetch1TranslationsIndexFile(sdkVersion) {
        const url = this.#getTranslationsIndexFileUrl(sdkVersion);
        try {
            const response = await $.ajax({
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
        const apiUrl = `https://api.github.com/repos/OP-TED/eForms-SDK/contents/translations?ref=${sdkVersion}`;
        try {
            const response = await $.ajax({
                url: apiUrl,
                headers: { 'Accept': 'application/vnd.github.v3+json' },
            });
            return this.#processFilenames(response.map(file => file.name));
        } catch (error) {
            console.error('Error fetching filenames from GitHub API:', error);
            throw error;
        }
    }

    async  fetchCountryCodeMappings() {
        const response = await fetch('./src/assets/eu_countries_three_letter_code_mappings.json');
        if (!response.ok) {
            throw new Error('Failed to fetch country codes');
        }
        const mappings = await response.json();
        return mappings;
    }
    

    async #processFilenames(filenames) {
        const euCountriesCodeMappings = await this.fetchCountryCodeMappings();
            const processedFilenames = filenames.map(filename => {
            const parts = filename.split('_');
            const assetType = parts[0];
            const twoLetterCode = parts[1].split('.')[0];
            const threeLetterCode = euCountriesCodeMappings[twoLetterCode] || 'unknown';
    
            return {
                assetType: assetType,
                twoLetterCode: twoLetterCode,
                threeLetterCode: threeLetterCode,
                filename: filename
            };
        });
    
        const resolvedFilenames = await Promise.all(processedFilenames);
    
        return { files: resolvedFilenames };
    }
    

    #getTranslationsIndexFileUrl(sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/translations/translations.json`;
    }


    #switchToOverview() {
        //$('#translations-explorer-view').hide();
        $('#translations-overview').show();
    }

    /**
    * Creates an index-card for the specified Translations.
    * 
    * @param {DiffEntry} diffEntry 
    * @returns 
    */
    #createIndexCard(diffEntry) {
        const component = IndexCard.create(diffEntry.get('filename'), '', 'Compare', diffEntry.typeOfChange);
        // Not needed for now
        // component.setActionHandler((e) => {
        //     e.preventDefault();
        //     this.fetchAndRenderExplorerView(diffEntry.get('id'));
        // });
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
                    const card = PropertyCard.create(propertyName, undefined, diffEntry.baseItem[propertyName]);
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
            let mainUrl = this.#getUrlTranslationsListsAndVersion(filename, appState.mainVersion);
            let baseUrl = this.#getUrlTranslationsListsAndVersion(filename, appState.baseVersion);
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

    #getUrlTranslationsListsAndVersion(filename, sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/translations/${filename}`;
    }
}