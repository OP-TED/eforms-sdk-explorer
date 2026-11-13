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
import { AjaxError, CustomError } from "../custom-error.js";
import { ERROR_GENERATING_OVERVIEW, ERROR_CHECKING_CHANGES, ERROR_FETCHING_FILE, ERROR_GENERATING_DIFF } from "../error-messages.js";

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
            this.#switchToOverview();
        });
    }

    async fetchAndRender() {
        // Render the overview display by default
        await this.fetchAndRenderOverview();
    }

    /**
     * Overridden to remove the cards and the diff.
     */
    clear() {
        this.#cardGroup().empty();
        this.$diffContainer().empty();
    }

    // #region Overview display -----------------------------------------------

    /**
     * 
     * @returns {CardGroup}
     */
    #cardGroup() {
        return document.getElementById('view-templates-overview-card-group');
    }

    /**
     * 
     * @returns {HTMLElement}
     */
    #diffContainer() {
        return document.getElementById('view-templates-diff');
    }

    /**
     * 
     * @returns {JQuery<HTMLElement>}
     */
    $diffContainer() {
        return $(this.#diffContainer());
    }

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

            try {
                // Compare the two index files
                const diff = Diff.fromArrayComparison(mainVersionData.viewTemplates, baseVersionData.viewTemplates, 'id');

                // Clear existing index-cards.
                this.#cardGroup().empty();

                // Create and add an index-card for each view templates.
                diff.forEach((entry, index) => {
                    this.defer(() => {
                        const card = this.#createIndexCard(entry);
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
     * Fetches the view-templates.json index file for the specified SDK version.
     * The view templates of appConfig.unindexedViewTemplates that the version has but its index does not list are
     * added to the index, so that they get a card too.
     */
    async #fetchIndexFile(sdkVersion) {
        const indexFile = await this.ajaxRequest({
            url: this.#getIndexFileUrl(sdkVersion),
            dataType: 'json'
        }).catch(error => {
            throw new AjaxError(ERROR_FETCHING_FILE('view-templates.json', sdkVersion), error);
        });

        // An index without its list is reported when the overview is generated.
        if (!Array.isArray(indexFile.viewTemplates)) {
            return indexFile;
        }
        const unindexedViewTemplates = await this.#fetchUnindexedViewTemplates(indexFile.viewTemplates, sdkVersion);
        return { ...indexFile, viewTemplates: [...indexFile.viewTemplates, ...unindexedViewTemplates] };
    }

    /**
     * Finds the view templates of appConfig.unindexedViewTemplates that the version has but its index does not list.
     *
     * @param {Object[]} indexedViewTemplates The view templates listed in view-templates.json.
     * @param {string} sdkVersion
     * @returns {Promise<Object[]>} An index item for each of them, with only an id and a filename (the index has nothing else to tell about them).
     */
    async #fetchUnindexedViewTemplates(indexedViewTemplates, sdkVersion) {
        const candidates = appConfig.unindexedViewTemplates.filter(filename => !indexedViewTemplates.some(viewTemplate => viewTemplate.filename === filename));
        const present = await Promise.all(candidates.map(filename => this.#hasViewTemplateFile(filename, sdkVersion)));
        return candidates
            .filter((filename, index) => present[index])
            .map(filename => ({ id: filename.replace(/\.efx$/, ''), filename: filename }));
    }

    /**
     * Tells whether the specified version has a view template file.
     *
     * @param {string} filename
     * @param {string} sdkVersion
     * @returns {Promise<boolean>} false if the version does not have the file.
     */
    async #hasViewTemplateFile(filename, sdkVersion) {
        try {
            await this.ajaxRequest({ url: `${appConfig.rawBaseUrl}/${sdkVersion}/view-templates/${filename}`, dataType: 'text' });
            return true;
        } catch (error) {
            if (error.status === 404) {
                return false;
            }
            throw new AjaxError(ERROR_FETCHING_FILE(filename, sdkVersion), error);
        }
    }

    #getIndexFileUrl(sdkVersion) {
        return `${appConfig.rawBaseUrl}/${sdkVersion}/view-templates/view-templates.json`;
    }


    #switchToOverview() {
        $('#view-templates-diff-view').addClass('hide-important');
        $('#view-templates-overview').removeClass('hide-important');
        this.$diffContainer().empty();
    }

    /**
    * Creates an index-card for the specified view template.
    * 
    * @param {DiffEntry} diffEntry 
    * @returns 
    */
    #createIndexCard(diffEntry) {
        const component = IndexCard.create(diffEntry.get('filename'), '', 'Compare', diffEntry.typeOfChange);
  
        component.setActionHandler(async (e) => {
            await this.fetchAndRenderDiffView(diffEntry.get('id'));
        });
        // If the view template is not new or removed, then we will need to check for changes inside the view template file.
        if (diffEntry.typeOfChange !== Diff.TypeOfChange.ADDED && diffEntry.typeOfChange !== Diff.TypeOfChange.REMOVED) {
            // We will need to open the files and check for changes.
            // We will do that in the background
            component.removeAttribute('status');
            component.setStatusCheckCallback(async () => await Promise.resolve(this.#checkForChanges(diffEntry.id)));
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

            // Get the two versions of the view template file.
            let [mainFile, baseFile] = await Promise.all([
                this.#fetchViewTemplate(id, appState.mainVersion),
                this.#fetchViewTemplate(id, appState.baseVersion)
            ]);

            try {
                // Remove EFX comments before comparing the files.
                const commentLineRegex = /^\/\/.*$/gm;
                mainFile = mainFile.replace(commentLineRegex, '');
                baseFile = baseFile.replace(commentLineRegex, '');

                // Compare the two files to determine the type of change.
                const typeOfChange = mainFile === baseFile ? Diff.TypeOfChange.UNCHANGED : Diff.TypeOfChange.MODIFIED;

                // Nullify the two variables holding the file contents to free up memory.
                mainFile = null;
                baseFile = null;

                return typeOfChange;
            } catch (error) {
                throw new CustomError(ERROR_CHECKING_CHANGES(`${id}.efx`), error);
            }
        }
        finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    #getUrlByIdAndSdkVersion(id, sdkVersion) {
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
            
            try {
                Diff.injectTextDiff(mainData, baseData, 'view-templates-diff', `${id}.efx`);
                this.#switchToDiffView();
            } catch (error) {
                throw new CustomError(ERROR_GENERATING_DIFF(`${id}.efx`), error);
            }
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
        try {
            return await this.ajaxRequest({
                url: this.#getUrlByIdAndSdkVersion(id, sdkVersion),
                dataType: 'text'
            });
        } catch (error) {
            throw new AjaxError(ERROR_FETCHING_FILE(`${id}.efx`, sdkVersion), error);
        }
    }

    /**
     * Shows the tree/detail explorer for the notice type.
     */
    #switchToDiffView() {
        $('#view-templates-overview').addClass('hide-important');
        $('#view-templates-diff-view').removeClass('hide-important');
    }

    // #endregion Diff display

}