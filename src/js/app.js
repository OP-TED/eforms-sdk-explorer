import { appConfig, domElements } from "./config.js";
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

        domElements.newVersionDropdown.change(function () {
            appState.mainVersion = $(this).val();
            $('#fieldDetailsContent').html('Select an item to see details.');
            SdkExplorerApplication.instance.versionChanged(appState.mainVersion, appState.baseVersion);
        });
        
        domElements.comparisonDropdown.change(function () {
            appState.baseVersion = $(this).val();
            $('#fieldDetailsContent').html('Select an item to see details.');
            SdkExplorerApplication.instance.versionChanged(appState.mainVersion, appState.baseVersion);
        });
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
            this.updateApiStatus(error.message, false);
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
            this.updateApiStatus(error.message, false);
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
            $('#centralLoadingSpinner').show();
        } else {
            $('#centralLoadingSpinner').hide();
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
        this.startSpinner();
        this.clearApiStatus();
        try {
            const response = await $.ajax({
                url: `${appConfig.eformsBaseUrl}/tags`,
                dataType: 'json'
            });

            domElements.newVersionDropdown.empty();
            domElements.comparisonDropdown.empty();

            response.forEach(item => {
                const option = $('<option>', { value: item.name, text: item.name });
                domElements.newVersionDropdown.append(option.clone());
                domElements.comparisonDropdown.append(option);
            });

            domElements.newVersionDropdown.val(response[0].name);
            domElements.comparisonDropdown.val(response.length > 1 ? response[1].name : response[0].name);
            appState.mainVersion = response[0].name;
            appState.baseVersion = response[1].name;
        } catch (error) {
            this.updateApiStatus('API call failed to fetch tags.', false);
            console.error('Error populating dropdowns:', error);
        } finally {
            this.stopSpinner();
        }
    }
}