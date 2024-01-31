/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { appConfig } from "./config.js";
import { appState } from "./state.js";
import { HomeTab } from "./tabs/home-tab.js";
import { FieldsTab } from "./tabs/fields-tab.js";
import { NoticeTypesTab } from "./tabs/notice-types-tab.js";
import { CodelistsTab } from "./tabs/codelists-tab.js";
import { SchemasTab } from "./tabs/schemas-tab.js";
import { SchematronsTab } from "./tabs/schematrons-tab.js";
import { TranslationsTab } from "./tabs/translations-tab.js";
import { ViewTemplatesTab } from "./tabs/view-templates-tab.js";
import { ReleaseNotesTab } from "./tabs/release-notes-tab.js";
import { TabController } from "./tabs/tab-controller.js";

export class SdkExplorerApplication {

    /** @type {SdkExplorerApplication} */
    static instance = new SdkExplorerApplication();

    /** @type {Map<string, TabController>} */
    tabs = new Map();

    /** @type {TabController} */
    #activeTab = null

    /** @type {number} */
    #spinnerCounter = 0;

    /** @type {string} */
    apiStatusMessage = '';

    /** @returns {string} */
    get newVersion() {
        return appState.mainVersion;
    }

    /** @returns {string} */
    getComparisonVersion() {
        return appState.baseVersion;
    }

    constructor() {
        if (SdkExplorerApplication.instance) {
            throw new Error("Do not instantiate this class by calling the constructor. It's a singleton. Use the instance property instead.");
        }

        this.#addTab(new HomeTab());
        this.#addTab(new FieldsTab());
        this.#addTab(new NoticeTypesTab());
        this.#addTab(new CodelistsTab());
        this.#addTab(new SchemasTab());
        this.#addTab(new SchematronsTab());
        this.#addTab(new TranslationsTab());
        this.#addTab(new ViewTemplatesTab());
        this.#addTab(new ReleaseNotesTab());
    }

    static async init() {
        await SdkExplorerApplication.instance.populateDropdown();

        $('ul.nav-tabs').on('shown.bs.tab', 'li.nav-item > button.nav-link', function (event) {
            const activeTabId = $(event.target).attr('id');
            console.log('Active tab changed:', activeTabId);
            SdkExplorerApplication.instance.activeTabChanged(activeTabId);
        });

        SdkExplorerApplication.instance.$mainVersionDropdown().change(function () {
            appState.mainVersion = $(this).val();
            $('#fieldDetailsContent').html('Select an item to see details.');
            SdkExplorerApplication.instance.versionChanged(appState.mainVersion, appState.baseVersion);
        });

        SdkExplorerApplication.instance.$baseVersionDropdown().change(function () {
            appState.baseVersion = $(this).val();
            $('#fieldDetailsContent').html('Select an item to see details.');
            SdkExplorerApplication.instance.versionChanged(appState.mainVersion, appState.baseVersion);
        });
    }

    #mainVersionDropdown() {
        return document.querySelector('#main-version-dropdown');
    }
    $mainVersionDropdown() {
        return $(this.#mainVersionDropdown());
    }

    #baseVersionDropdown() {
        return document.querySelector('#base-version-dropdown');
    }

    $baseVersionDropdown() {
        return $(this.#baseVersionDropdown());
    }

    #apiStatus() {
        return document.querySelector('#apiStatus');
    }

    $apiStatus() {
        return $(this.#apiStatus());
    }

    #toastBody() {
        return document.querySelector('#apiStatus .toast-body');
    }

    /**
     * 
     * @param {TabController} tab 
     * @returns 
     */
    #addTab(tab) {
        tab.init();
        this.tabs.set(tab.getId(), tab);
    }

    async activeTabChanged(activeTabId) {
        this.startSpinner();
        this.clearApiStatus();
        try {
            await this.#activeTab?.deactivated();
            this.#activeTab = this.tabs.get(activeTabId);
            await this.#activeTab.activated();
        } catch (error) {
            SdkExplorerApplication.updateApiStatus(error.message);
        }
        finally {
            this.stopSpinner();
        }
    }

    async versionChanged() {
        this.startSpinner();
        this.clearApiStatus();
        try {
            await this.#activeTab?.versionChanged();
        } catch (error) {
            SdkExplorerApplication.updateApiStatus(error.message);
        }
        finally {
            this.stopSpinner();
        }
    }

    static startSpinner() {
        SdkExplorerApplication.instance.startSpinner();
    }

    static stopSpinner() {
        SdkExplorerApplication.instance.stopSpinner();
    }

    startSpinner() {
        this.#spinnerCounter++;
        this.#toggleSpinner();
    }

    stopSpinner() {
        this.#spinnerCounter--;
        this.#toggleSpinner();
    }

    #toggleSpinner() {
        if (this.#spinnerCounter > 0) {
            $('#centralLoadingSpinner').css('visibility', 'visible');
        } else {
            $('#centralLoadingSpinner').css('visibility', 'hidden');
        }
    }

    clearApiStatus() {
        // Clear the message inside the toast body
        SdkExplorerApplication.instance.#toastBody().textContent = '';

        // Hide the toast
        SdkExplorerApplication.instance.$apiStatus().toast('hide');
    }

    static updateApiStatus(message) {

        SdkExplorerApplication.instance.apiStatusMessage += '<li>' + message + '</li>';
        SdkExplorerApplication.instance.#toastBody().innerHTML = SdkExplorerApplication.instance.apiStatusMessage;

        clearTimeout(SdkExplorerApplication.instance.fadeTimeOut);

        setTimeout(() => {
            // Display the toast
            SdkExplorerApplication.instance.$apiStatus().toast('show');
            SdkExplorerApplication.instance.fadeTimeOut = setTimeout(() => {
                SdkExplorerApplication.instance.$apiStatus().toast('hide');
                SdkExplorerApplication.instance.apiStatusMessage = '';
            }, 15000);
        }, 0);
    }

    /**
     * Compares two version numbers but returns the opposite of the result.
     * 
     * @param {string} a 
     * @param {string} b 
     * @returns {number} -1 if a > b, 1 if a < b, 0 if a === b
     */
    #reverseCompareVersions(a, b) {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);

        for (let i = 0; i < aParts.length; i++) {
            if (aParts[i] > bParts[i]) {
                return -1;
            } else if (aParts[i] < bParts[i]) {
                return 1;
            }
        }

        return 0;
    }

    /**
     * Gets the two latest non-pre-release versions.
     * 
     * @param {string[]} versions 
     * @returns 
     */
    #getLastTwoReleasedVersions(versions) {

        // Filter out pre-release versions
        const releasedVersions = versions.filter(version => version.indexOf('-') === -1);

        releasedVersions.sort(this.#reverseCompareVersions.bind(this));

        const latestVersion = releasedVersions[0];

        // Find the latest patch of the preceding minor version
        const latestVersionParts = latestVersion.split('.').map(Number);
        const previousVersion = releasedVersions.find(version => {
            const versionParts = version.split('.').map(Number);
            return versionParts[0] === latestVersionParts[0] && versionParts[1] < latestVersionParts[1];
        });

        return [latestVersion, previousVersion];
    }

    /**
     * Gets the previous version of the provided version.
     * 
     * @param {string} latestVersion 
     * @param {string[]} versions 
     * @returns 
     */
    #getPreviousVersion(latestVersion, versions) {

        // Filter out pre-release versions
        const releasedVersions = versions.filter(version => version.indexOf('-') === -1);

        releasedVersions.sort(this.#reverseCompareVersions.bind(this));

        // Find the latest patch of the preceding minor version
        const latestVersionParts = latestVersion.split('.').map(Number);
        const previousVersion = releasedVersions.find(version => {
            const versionParts = version.split('.').map(Number);
            return versionParts[0] === latestVersionParts[0] && versionParts[1] < latestVersionParts[1];
        });

        return previousVersion;
    }

    /**
     * Gets the main and base versions from the query string if provided.
     * 
     * @returns 
     */
    #getVersionsFromQueryString() {
        // Parse the query string
        let params = new URLSearchParams(window.location.search);
        let versionParam = params.get('version');
        let baseParam = params.get('base');

        if (window.location.search) {
            // Remove the query string from the URL
            history.replaceState(null, null, window.location.pathname);
        }

        return [versionParam, baseParam];
    }

    async populateDropdown() {
        this.startSpinner();
        this.clearApiStatus();
        try {
            const response = await $.ajax({
                url: `${appConfig.eformsBaseUrl}/tags?per_page=100&page=1`,
                dataType: 'json'
            });

            let availableVersions = response.map(item => item.name);

            // Filter out versions older than the threshold
            let listedVersions = availableVersions.filter(version => this.#reverseCompareVersions(version, appConfig.thresholdVersion) <= 0);
            // Sort versions by version number
            listedVersions.sort(this.#reverseCompareVersions.bind(this));

            // Filter out pre-releases of released versions
            const releasedVersions = listedVersions.filter(version => !version.includes('-'));
            const latestRelease = releasedVersions[0];
            const preReleasesOfLatestVersion = listedVersions.filter(version => {
                const baseVersion = version.split('-')[0];
                return version.includes('-') && baseVersion === latestRelease;
                });
            const preReleasesOfUnreleasedVersions = listedVersions.filter(version => {
                const baseVersion = version.split('-')[0];
                return version.includes('-') && !releasedVersions.includes(baseVersion);
            });
            listedVersions = [...releasedVersions, ...preReleasesOfLatestVersion, ...preReleasesOfUnreleasedVersions];

            // Sort versions by version number
            listedVersions.sort(this.#reverseCompareVersions.bind(this));

            // Populate the dropdowns
            this.$mainVersionDropdown().empty();
            this.$baseVersionDropdown().empty();

            // Add hardcoded "develop" option to the top of the main version dropdown.
            // This will allow us to compare any version to the develop branch.
            const developOption = $('<option>', { value: 'develop', text: 'develop' });
            this.$mainVersionDropdown().prepend(developOption);


            listedVersions.forEach(version => {
                const option = $('<option>', { value: version, text: version });
                this.$mainVersionDropdown().append(option.clone());
                this.$baseVersionDropdown().append(option);
            });

            // Get versions from the query string if provided
            let [mainVersion, baseVersion] = this.#getVersionsFromQueryString(listedVersions);

            // Validate the versions passed in the query string
            if (!listedVersions.includes(mainVersion)) {
                if (availableVersions.includes(mainVersion)) {
                    const option = $('<option>', { value: mainVersion, text: mainVersion });
                    this.$mainVersionDropdown().append(option);
                } else {
                    mainVersion = latestRelease;
                }
            }
            if (!listedVersions.includes(baseVersion)) {
                if (availableVersions.includes(baseVersion)) {
                    const option = $('<option>', { value: baseVersion, text: baseVersion });
                    this.$baseVersionDropdown().append(option);
                } else {
                    baseVersion = this.#getPreviousVersion(mainVersion, availableVersions) ?? mainVersion;
                    if (!listedVersions.includes(baseVersion)) {
                        const option = $('<option>', { value: baseVersion, text: baseVersion });
                        this.$baseVersionDropdown().append(option);
                    }
                }
            }
            
            this.$mainVersionDropdown().val(mainVersion);
            this.$baseVersionDropdown().val(baseVersion);
            appState.mainVersion = mainVersion;
            appState.baseVersion = baseVersion;
        } catch (error) {
            SdkExplorerApplication.updateApiStatus('API call failed to fetch tags.', false);
            console.error('Error populating dropdowns:', error);
        } finally {
            this.stopSpinner();
        }
    }
}