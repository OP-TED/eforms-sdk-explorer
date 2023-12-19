import { appConfig, domElements } from "./config.js";
import { appState } from "./state.js";
import { HomeTab } from "./home-tab.js";
import { FieldsTab } from "./fields-tab.js";
import { NoticeTypesTab } from "./notice-types-tab.js";
import { CodelistsTab } from "./codelists-tab.js";
import { SchemasTab } from "./schemas-tab.js";
import { TranslationsTab } from "./translations-tab.js";
import { ViewTemplatesTab } from "./view-templates-tab.js";
import { ReleaseNotesTab } from "./release-notes-tab.js";
import { TabController } from "./tab-controller.js";

export class SdkExplorerApplication {

    /** @type {SdkExplorerApplication} */
    static instance = new SdkExplorerApplication();

    /** @type {Map<string, TabController>} */
    tabs = new Map();

    /** @type {TabController} */
    #activeTab = null

    /** @returns {string} */
    get sdkVersion() {
        return appState.sdkVersion;
    }

    /** @returns {string} */
    getBaseVersion() {
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

        domElements.tagsDropdown.change(function () {
            appState.sdkVersion = $(this).val();
            $('#fieldDetailsContent').html('Select an item to see details.');
            SdkExplorerApplication.instance.versionChanged(appState.sdkVersion, appState.baseVersion);
            // fetchDataBasedOnActiveTab();
        });
        
        domElements.comparisonDropdown.change(function () {
            appState.baseVersion = $(this).val();
            $('#fieldDetailsContent').html('Select an item to see details.');
            SdkExplorerApplication.instance.versionChanged(appState.sdkVersion, appState.baseVersion);
            // fetchDataBasedOnActiveTab();
        });
    }

    /**
     * 
     * @param {TabController} tab 
     * @returns 
     */
    #addTab(tab) {
        this.tabs.set(tab.getId(), tab);
    }

    async activeTabChanged(activeTabId) {
        this.toggleLoadingSpinner(true);
        this.clearApiStatus();
        try {
            await this.#activeTab?.deactivated();
            this.#activeTab = this.tabs.get(activeTabId);
            await this.#activeTab.activated();
        } catch (error) {
            this.updateApiStatus(error.message, false);
        }
        finally {
            this.toggleLoadingSpinner(false);
        }
    }

    async versionChanged() {
        this.toggleLoadingSpinner(true);
        this.clearApiStatus();
        try {
            await this.#activeTab?.versionChanged();
        } catch (error) {
            this.updateApiStatus(error.message, false);
        }
        finally {
            this.toggleLoadingSpinner(false);
        }
    }

    toggleLoadingSpinner(show) {
        const spinnerElement = $('#centralLoadingSpinner'); 
        if (show) {
            spinnerElement.show();
        } else {
           spinnerElement.hide();
        }
    }

    clearApiStatus() {
        domElements.apiStatus.text('');
    }

    updateApiStatus(message, isSuccess = true) {
        domElements.apiStatus.text(message);
    
        if (isSuccess) {
            domElements.apiStatus.addClass('alert-success').removeClass('alert-danger');
        } else {
            domElements.apiStatus.addClass('alert-danger').removeClass('alert-success');
        }
    
        domElements.apiStatus.show();
    
        setTimeout(() => {
            domElements.apiStatus.fadeOut('slow');
        }, 5000);
    }


    compareVersions(a, b) {
        const parseVersionPart = (part) => {
            const match = part.match(/(\d+)(.*)/);
            return match ? { number: parseInt(match[1], 10), text: match[2] } : { number: 0, text: '' };
        };

        const aParts = a.split('.').map(parseVersionPart);
        const bParts = b.split('.').map(parseVersionPart);

        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aValue = i < aParts.length ? aParts[i] : { number: 0, text: '' };
            const bValue = i < bParts.length ? bParts[i] : { number: 0, text: '' };

            // Compare numeric
            if (aValue.number > bValue.number) return -1;
            if (aValue.number < bValue.number) return 1;

            // Compare textual parts if needed
            if (aValue.text > bValue.text) return -1;
            if (aValue.text < bValue.text) return 1;
        }

        return 0;
    }


    async populateDropdown() {
        this.toggleLoadingSpinner(true);
        this.clearApiStatus();
        try {
            const response = await $.ajax({
                url: `${appConfig.tagsBaseUrl}/tags`,
                dataType: 'json'
            });
            const data = response.sort((a, b) => this.compareVersions(a.name, b.name));

            appState.sortedData = data;
            domElements.tagsDropdown.empty();
            domElements.comparisonDropdown.empty();

            data.forEach(item => {
                const option = $('<option>', { value: item.name, text: item.name });
                domElements.tagsDropdown.append(option.clone());
                domElements.comparisonDropdown.append(option);
            });

            domElements.tagsDropdown.val(data[0].name);
            domElements.comparisonDropdown.val(data.length > 1 ? data[1].name : data[0].name);
            appState.sdkVersion = data[0].name;
            appState.baseVersion = data[1].name;
            // await fetchAndDisplayFieldsContent(data[0].name, true);
            // await fetchAndDisplayFieldsContent(data[1].name, false);
        } catch (error) {
            this.updateApiStatus('API call failed to fetch tags.', false);
            console.error('Error populating dropdowns:', error);
        } finally {
            this.toggleLoadingSpinner(false);
        }
    }
}