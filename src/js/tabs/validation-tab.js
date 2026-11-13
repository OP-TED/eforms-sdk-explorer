/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

import { appState } from "../state.js";
import { Diff, DiffEntry } from "../diff.js";
import { TabController } from "./tab-controller.js";
import { SdkExplorerApplication } from "../app.js";
import { CardGroup } from "../components/card-group.js";
import { AjaxError, CustomError } from "../custom-error.js";
import { ERROR_GENERATING_OVERVIEW, ERROR_CHECKING_CHANGES, ERROR_GENERATING_DIFF, ERROR_FETCHING_FILE } from "../error-messages.js";
import { EfxRulesSource } from "../validation/efx-rules-source.js";
import { SchematronSource } from "../validation/schematron-source.js";

/**
 * Compares the validation files of the two selected versions, from one of two sources selected in the tab:
 * the EFX rules (the validation folder) or the schematrons (the schematrons folder).
 * The tab is shown only when at least one of the selected versions has EFX rules.
 */
export class ValidationTab extends TabController {

    /** The file whose presence tells that a version has EFX rules. */
    static #RULES_FILE = 'rules.efx';

    /** @type {EfxRulesSource} */
    #efxRulesSource = new EfxRulesSource(this);

    /**
     * The sources, keyed by the values of the radio inputs of the source selector.
     *
     * @type {Map<string, EfxRulesSource|SchematronSource>}
     */
    #sources = new Map([
        ['efx-rules', this.#efxRulesSource],
        ['schematron', new SchematronSource(this)]
    ]);

    /**
     * Whether each version has EFX rules, keyed by version (tag or branch name).
     * The probes are kept as promises so that concurrent questions about the same version share one request.
     *
     * @type {Map<string, Promise<boolean>>}
     */
    #rulesProbes = new Map();

    constructor() {
        super('validation-tab');
    }

    /**
     * Overridden to hook up event handlers.
     */
    init() {
        super.init();

        // Handle clicks on the "Overview" link to return to the Overview display.
        $('#validation-overview-link').on('click', async (e) => {
            this.#switchToOverview();
        });

        // Render the overview again when a different source is selected (Bootstrap fires change on the radio input of
        // the button). The application renders it, once the tabs that apply to the selected versions are known.
        this.$sourceSelector().on('change', 'input[type="radio"]', () => SdkExplorerApplication.instance.activeTabOptionsChanged());
    }

    async fetchAndRender() {
        await this.fetchAndRenderOverview();
    }

    /**
     * Overridden to show the tab only when at least one of the selected versions has EFX rules.
     *
     * @returns {Promise<boolean>}
     */
    async isApplicable() {
        const [mainVersionHasRules, baseVersionHasRules] = await Promise.all([
            this.#hasRules(appState.mainVersion),
            this.#hasRules(appState.baseVersion)
        ]);
        return mainVersionHasRules || baseVersionHasRules;
    }

    /**
     * Overridden: the Schematrons tab, shown when this tab is hidden, replaces it, since the schematrons are then the
     * only validation files of the selected versions.
     *
     * @returns {string}
     */
    replacementTabId() {
        return 'schematrons-tab';
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
        return document.getElementById('validation-overview-card-group');
    }

    /**
     *
     * @returns {HTMLElement}
     */
    #diffContainer() {
        return document.getElementById('validation-diff');
    }

    /**
     *
     * @returns {JQuery<HTMLElement>}
     */
    $diffContainer() {
        return $(this.#diffContainer());
    }

    /**
     *
     * @returns {HTMLElement} The toggle button group of the sources, one radio input per source.
     */
    #sourceSelector() {
        return document.getElementById('validation-source');
    }

    /**
     *
     * @returns {JQuery<HTMLElement>}
     */
    $sourceSelector() {
        return $(this.#sourceSelector());
    }

    /**
     * @returns {EfxRulesSource|SchematronSource} The source selected in the source selector.
     */
    #selectedSource() {
        return this.#sources.get(this.$sourceSelector().find('input[type="radio"]:checked').val());
    }

    /**
     * Fetches the index of the selected source for both versions and renders the overview display.
     */
    async fetchAndRenderOverview() {
        SdkExplorerApplication.startSpinner();
        try {
            const source = this.#selectedSource();

            const [mainVersionData, baseVersionData] = await Promise.all([
                source.fetchIndex(appState.mainVersion),
                source.fetchIndex(appState.baseVersion)
            ]);

            try {
                const diff = this.#compareIndexes(source, mainVersionData, baseVersionData);

                // Clear the card group, including the filter values of the previous source, and filter by the property of the selected source.
                this.#cardGroup().empty();
                if (source.filterProperty) {
                    this.#cardGroup().setAttribute('filter-property', source.filterProperty);
                } else {
                    this.#cardGroup().removeAttribute('filter-property');
                }

                // Create and add an index-card for each validation file.
                diff.forEach((entry, index) => {
                    this.defer(() => {
                        const card = source.createIndexCard(entry);
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
     * Compares the indexes of the two versions by filename.
     * Index items that carry the text of their file (those of the EFX rules) are compared right away by their
     * normalised texts, so that their index cards are created with their status known; their texts are then dropped.
     * The other files found in both versions are checked by their index cards in the background (see {@link checkForChanges}).
     *
     * @param {EfxRulesSource|SchematronSource} source
     * @param {Object[]} mainIndex
     * @param {Object[]} baseIndex
     * @returns {Diff}
     */
    #compareIndexes(source, mainIndex, baseIndex) {
        const diff = Diff.fromArrayComparison(mainIndex, baseIndex, 'filename');
        return new Diff(diff.map(entry => {
            const mainText = entry.mainItem?.text;
            const baseText = entry.baseItem?.text;
            if (mainText === undefined && baseText === undefined) {
                return entry;
            }

            let typeOfChange = entry.typeOfChange;
            if (mainText !== undefined && baseText !== undefined) {
                typeOfChange = source.normaliseForComparison(mainText, entry.id) === source.normaliseForComparison(baseText, entry.id)
                    ? Diff.TypeOfChange.UNCHANGED : Diff.TypeOfChange.MODIFIED;
            }
            return new DiffEntry(entry.id, ValidationTab.#withoutText(entry.mainItem), ValidationTab.#withoutText(entry.baseItem), typeOfChange);
        }));
    }

    /**
     * @param {Object|null} indexItem
     * @returns {Object|null} A copy of the index item without the text of its file.
     */
    static #withoutText(indexItem) {
        if (!indexItem) {
            return indexItem;
        }
        const { text, ...description } = indexItem;
        return description;
    }

    /**
     * Checks for changes in a file of the selected source.
     * Called by the index cards of the {@link SchematronSource}.
     *
     * @param {string} filename The file to check for changes
     * @returns {Promise<Diff.TypeOfChange>} The type of change detected
     */
    async checkForChanges(filename) {
        try {
            SdkExplorerApplication.startSpinner();

            // Get the two versions of the file.
            let [mainFile, baseFile] = await Promise.all([
                this.#fetchFile(filename, appState.mainVersion),
                this.#fetchFile(filename, appState.baseVersion)
            ]);

            try {
                // Compare the two files to determine the type of change.
                const source = this.#selectedSource();
                const typeOfChange = source.normaliseForComparison(mainFile, filename) === source.normaliseForComparison(baseFile, filename)
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
     * Tells whether the specified version has EFX rules. Each version is probed once.
     *
     * @param {string} sdkVersion
     * @returns {Promise<boolean>}
     */
    #hasRules(sdkVersion) {
        if (!this.#rulesProbes.has(sdkVersion)) {
            const probe = this.#probeRules(sdkVersion);
            this.#rulesProbes.set(sdkVersion, probe);

            // A probe that failed (or was aborted) is not remembered, so that it is tried again next time.
            probe.catch(() => this.#rulesProbes.delete(sdkVersion));
        }
        return this.#rulesProbes.get(sdkVersion);
    }

    /**
     * Requests the headers of the EFX rules file of the specified version, through the application.
     *
     * @param {string} sdkVersion
     * @returns {Promise<boolean>} false if the version does not have the file.
     */
    async #probeRules(sdkVersion) {
        try {
            // A request of the application, not of this tab: a probe answers which tabs apply to a version, and it is
            // shared by the questions asked for several selections, so cancelling this tab's loads must not abort it.
            await SdkExplorerApplication.instance.ajaxRequest({ url: this.#efxRulesSource.fileUrl(ValidationTab.#RULES_FILE, sdkVersion), method: 'HEAD' });
            return true;
        } catch (error) {
            if (error.status === 404) {
                return false;
            }
            throw new AjaxError(ERROR_FETCHING_FILE(ValidationTab.#RULES_FILE, sdkVersion), error);
        }
    }

    // #endregion Overview display

    // #region Diff display -----------------------------------------------

    /**
     * Fetches both versions of a file of the selected source and renders the diff view.
     *
     * @param {string} filename
     */
    async fetchAndRenderDiffView(filename) {
        SdkExplorerApplication.startSpinner();
        try {

            const [mainData, baseData] = await Promise.all([
                this.#fetchFile(filename, appState.mainVersion),
                this.#fetchFile(filename, appState.baseVersion)
            ]);

            try {
                Diff.injectTextDiff(mainData, baseData, 'validation-diff', `${filename}`);
                this.#switchToDiffView();
            } catch (error) {
                throw new CustomError(ERROR_GENERATING_DIFF(filename), error);
            }
        } finally {
            SdkExplorerApplication.stopSpinner();
        }
    }

    /**
     * Fetches a file of the selected source for the specified SDK version.
     *
     * @param {string} filename
     * @param {string} sdkVersion
     * @returns {Promise<string>}
     */
    async #fetchFile(filename, sdkVersion) {
        try {
            return await this.ajaxRequest({
                url: this.#selectedSource().fileUrl(filename, sdkVersion),
                dataType: 'text'
            });
        } catch (error) {
            throw new AjaxError(ERROR_FETCHING_FILE(filename, sdkVersion), error);
        }
    }

    /**
     * Shows the overview display for validation files.
     */
    #switchToOverview() {
        $('#validation-diff-view').addClass('hide-important');     // Hide the diff view.
        $('#validation-overview').removeClass('hide-important');   // Show the overview.
        this.$diffContainer().empty();                             // Clear the diff view to save memory.
    }

    /**
     * Shows the diff view for validation files.
     */
    #switchToDiffView() {
        $('#validation-overview').addClass('hide-important');      // Hide the overview.
        $('#validation-diff-view').removeClass('hide-important');  // Show the diff view.
    }

    // #endregion Diff display
}
