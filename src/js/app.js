/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

import { appState } from "./state.js";
import { SdkRepository } from "./sdk-repository.js";
import { VersionSelection } from "./version-selection.js";
import { TabBar } from "./tab-bar.js";
import { ErrorToast } from "./error-toast.js";
import { HomeTab } from "./tabs/home-tab.js";
import { FieldsTab } from "./tabs/fields-tab.js";
import { NoticeTypesTab } from "./tabs/notice-types-tab.js";
import { CodelistsTab } from "./tabs/codelists-tab.js";
import { SchemasTab } from "./tabs/schemas-tab.js";
import { SchematronsTab } from "./tabs/schematrons-tab.js";
import { ValidationTab } from "./tabs/validation-tab.js";
import { TranslationsTab } from "./tabs/translations-tab.js";
import { ViewTemplatesTab } from "./tabs/view-templates-tab.js";
import { ReleaseNotesTab } from "./tabs/release-notes-tab.js";
import { RELOAD_TO_RETRY } from "./error-messages.js";

/** @typedef {import('./tabs/tab-controller.js').TabController} TabController */

/**
 * The phases of the application (see {@link SdkExplorerApplication}).
 */
const Phase = Object.freeze({
    /** Start-up, before a pair of versions is selected. */
    LOADING_VERSIONS: 'loading versions',
    /** The list of versions could not be used: only a reload starts again. */
    STOPPED: 'stopped',
    /** The tabs that apply to the selection are being probed. */
    CHECKING: 'checking',
    /** The tabs that apply to the selection are known and shown (a tab whose probe failed is hidden). */
    READY: 'ready'
});

/**
 * One selection of the versions to compare: made at start-up and by every version change. Its identity tells whether
 * work begun for it still applies: a probe's result, and its errors, are applied only while the application's state
 * holds the same selection.
 */
class Selection {

    /**
     * @param {string} mainVersion The target version.
     * @param {string} baseVersion The base version.
     */
    constructor(mainVersion, baseVersion) {
        this.mainVersion = mainVersion;
        this.baseVersion = baseVersion;
        Object.freeze(this);
    }
}

/**
 * The state of the application: its phase and, once the versions are selected, the selection it works for.
 */
class ApplicationState {

    /**
     * @param {string} phase One of {@link Phase}.
     * @param {Selection|null} [selection]
     */
    constructor(phase, selection = null) {
        this.phase = phase;
        this.selection = selection;
        Object.freeze(this);
    }

    /**
     * @returns {boolean} Whether the tabs have started: from the start-up probe on, unless start-up stopped. Before,
     *          a tab switch is only recorded, and a tab's own options wait in their controls.
     */
    get tabsStarted() {
        return this.phase !== Phase.LOADING_VERSIONS && this.phase !== Phase.STOPPED;
    }
}

/**
 * The application: the tabs, the selection of the versions to compare, and the decisions about when a tab renders.
 *
 * Its state answers three questions:
 * - Which pair is selected? {@link appState}, also held by the hidden version selects.
 * - Which pair does the content on screen belong to? The current selection, or none: every change of selection first
 *   cancels and clears the active tab, every render is for the current selection, and a tab drops the responses of
 *   its cancelled loads (see TabController).
 * - Which request may still change the content or the error? A tab's requests, only those of its current load; a
 *   probe's result and error, only for the current selection; the version list's error, only during start-up.
 *
 * Phases, and what a tab switch and a change of a tab's own option (Fields' or Validation's source) do in each:
 * - Loading versions: start-up, until a pair is selected. A tab switch is recorded; an option change waits in its
 *   control. Then Checking, or Stopped if the versions cannot be listed.
 * - Stopped: Home is shown, the other tabs are disabled, and the error stays until the user closes it.
 * - Checking: the tabs that apply to the selection are probed. Tab switches and option changes render nothing: the
 *   probe's end renders the active tab. Then Ready, even if some probes failed: a tab whose probe failed is hidden,
 *   the error is shown, and the other tabs work as usual. The next version change probes it again.
 * - Ready: a tab switch or an option change renders the active tab at once.
 * A version change, from Checking or Ready, clears the active tab and starts Checking for the new pair; the work of
 * the selection it supersedes is dropped.
 */
export class SdkExplorerApplication {

    /** @type {SdkExplorerApplication} */
    static instance = new SdkExplorerApplication();

    /** @type {Map<string, TabController>} */
    tabs = new Map();

    /** @type {TabController} The active tab, known from the start (see {@link initVersions}). */
    #activeTab = null;

    /** @type {ApplicationState} */
    #state = new ApplicationState(Phase.LOADING_VERSIONS);

    /** @type {VersionSelection} */
    #versionSelection = new VersionSelection(new SdkRepository(this));

    /** @type {TabBar} */
    #tabBar = new TabBar();

    /** @type {ErrorToast} */
    #errorToast = new ErrorToast();

    /** @type {number} */
    #spinnerCounter = 0;

    /**
     * @type {boolean} Whether the next tab switch keeps the error toast: after a probe failed, the toast says why a
     *       tab is hidden, and the switch that follows (the one replacing that tab, or the one the version dialog
     *       makes) must not clear it before it has been seen.
     */
    #keepToastOnNextSwitch = false;

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
        this.#addTab(new ValidationTab());
        this.#addTab(new TranslationsTab());
        this.#addTab(new ViewTemplatesTab());
        this.#addTab(new ReleaseNotesTab());
    }

    /**
     * Starts the version selection: follows the tab bar, fills the two version selects and listens to their changes.
     * Call {@link initTabs} after it, only if it succeeded.
     *
     * @returns {Promise<boolean>} Whether a pair of versions is selected. If not (their list could not be
     *          downloaded), start-up stops: every tab but Home is disabled, and the error toast says why.
     */
    static async initVersions() {
        const application = SdkExplorerApplication.instance;
        application.#followTabBar();
        if (!(await application.#selectVersions())) {
            application.#stop();
            return false;
        }
        application.#followVersionSelects();
        return true;
    }

    /**
     * Starts the tabs, after {@link initVersions}: shows the tabs that apply to the selected versions (which probes
     * some of their files), then renders the active tab.
     */
    static async initTabs() {
        const application = SdkExplorerApplication.instance;
        application.startSpinner();
        try {
            await application.#check(application.#newSelection());
        }
        finally {
            application.stopSpinner();
        }
    }

    /**
     * Knows the active tab from now on, including one the user opens while the versions are loading: until the tabs
     * have started, a tab switch is only recorded, and the start-up probe's end renders the tab.
     */
    #followTabBar() {
        this.#activeTab = this.tabs.get(this.#tabBar.activeTabId());
        this.#tabBar.onTabShown(tabId => {
            console.log('Active tab changed:', tabId);
            this.activeTabChanged(tabId);
        });
    }

    /**
     * Listens to the version selects, before the tabs are probed, so that a change made meanwhile is not lost.
     */
    #followVersionSelects() {
        $('#main-version-dropdown').on('change', event => {
            appState.mainVersion = $(event.currentTarget).val();
            this.#versionChanged();
        });
        $('#base-version-dropdown').on('change', event => {
            appState.baseVersion = $(event.currentTarget).val();
            this.#versionChanged();
        });
    }

    /**
     * Selects the versions to compare at start-up.
     *
     * @returns {Promise<boolean>} Whether a pair is selected: false if the versions could not be listed (the error
     *          is then shown, and stays).
     */
    async #selectVersions() {
        this.startSpinner();
        this.clearApiStatus();
        try {
            await this.#versionSelection.select();
            return true;
        } catch (error) {
            // Start-up stops here, so the error stays shown, with what to do about it: a reload, which must then
            // download the list again, whatever made the selection fail.
            this.#versionSelection.forget();
            this.#errorToast.show(`${error.message}. ${RELOAD_TO_RETRY}`, error.detail, true);
            console.error('Error populating dropdowns:', error);
            return false;
        } finally {
            this.stopSpinner();
        }
    }

    /**
     * Stops start-up without versions: shows Home and disables every other tab, so that no tab stays or can be
     * opened empty, not even one the user opened while the versions were loading. (A tab switch is only recorded in
     * this phase, so showing Home renders nothing and leaves the error shown. The version chips and Home's buttons
     * stay disabled, as the page starts them: the version picker never starts.)
     */
    #stop() {
        this.#state = new ApplicationState(Phase.STOPPED);
        const home = this.tabs.get('home-tab');
        this.#tabBar.show(home);
        this.#tabBar.disableAllBut(this.tabs.values(), home);
    }

    /**
     * @param {TabController} tab
     */
    #addTab(tab) {
        tab.init();
        this.tabs.set(tab.getId(), tab);
    }

    /**
     * Called when a tab is shown: deactivates the previous tab and renders the new one (see
     * {@link #renderActiveTab}); before the tabs have started, only records it.
     *
     * @param {string} activeTabId
     */
    async activeTabChanged(activeTabId) {
        const tab = this.tabs.get(activeTabId);
        if (!this.#state.tabsStarted) {
            this.#activeTab = tab;
            return;
        }
        this.startSpinner();
        if (this.#keepToastOnNextSwitch) {
            this.#keepToastOnNextSwitch = false;
        } else {
            this.clearApiStatus();
        }
        try {
            await this.#activeTab.deactivated();
            this.#activeTab = tab;
            await this.#renderActiveTab();
        } catch (error) {
            SdkExplorerApplication.updateApiStatus(error.message, error.detail);
        }
        finally {
            this.stopSpinner();
        }
    }

    /**
     * Called by the active tab when one of its own options changes (Fields' metadata source, Validation's source),
     * to render it again with that option (see {@link #renderActiveTab}). The option is held by the tab's control,
     * so the render that follows, now or at the end of the probe in flight, uses it. Before the tabs have started,
     * nothing: the start-up probe's end renders the active tab.
     */
    async activeTabOptionsChanged() {
        if (!this.#state.tabsStarted) {
            return;
        }
        this.startSpinner();
        this.clearApiStatus();
        try {
            this.#activeTab.cancelRequests();
            this.#activeTab.clear();
            await this.#renderActiveTab();
        } catch (error) {
            SdkExplorerApplication.updateApiStatus(error.message, error.detail);
        }
        finally {
            this.stopSpinner();
        }
    }

    /**
     * Renders the active tab for the selected versions, once the tabs that apply to them are known:
     * - Checking: nothing; the probe's end renders the active tab, and rendering it here too would load it twice;
     * - Ready: renders the active tab.
     */
    async #renderActiveTab() {
        if (this.#state.phase === Phase.READY) {
            await this.#activeTab.activated();
        }
    }

    /**
     * Called when a version select changes: clears the active tab first, so that the previous comparison never stays
     * under the new selection; then probes the tabs for the new pair.
     */
    async #versionChanged() {
        this.startSpinner();
        this.clearApiStatus();
        this.#activeTab.cancelRequests();
        this.#activeTab.clear();
        try {
            await this.#check(this.#newSelection());
        }
        finally {
            this.stopSpinner();
        }
    }

    /**
     * @returns {Selection} A new selection of the versions held by {@link appState}.
     */
    #newSelection() {
        return new Selection(appState.mainVersion, appState.baseVersion);
    }

    /**
     * Probes the tabs that apply to a selection, then shows them and renders the active tab, unless a newer
     * selection is made meanwhile: that newer selection then does all of it, and the result and errors of this one
     * are dropped. A tab activated while the tabs are probed is rendered here, once the probe has ended (see
     * {@link #renderActiveTab}). A tab whose probe fails is hidden, and the error is shown; the other tabs are
     * shown and rendered as usual.
     *
     * @param {Selection} selection
     */
    async #check(selection) {
        this.#state = new ApplicationState(Phase.CHECKING, selection);
        this.#keepToastOnNextSwitch = false;
        const { applicable, errors } = await this.#probeApplicableTabs();
        if (this.#state.selection !== selection) {
            return;
        }
        this.#state = new ApplicationState(Phase.READY, selection);
        const reported = errors.filter(error => error.statusText !== 'abort');
        reported.forEach(error => SdkExplorerApplication.updateApiStatus(error.message, error.detail));
        this.#keepToastOnNextSwitch = reported.length > 0;
        try {
            if (this.#showApplicableTabs(applicable)) {
                await this.#activeTab.versionChanged();
            }
        } catch (error) {
            if (this.#state.selection === selection && error.statusText !== 'abort') {
                SdkExplorerApplication.updateApiStatus(error.message, error.detail);
            }
        }
    }

    /**
     * Asks every tab whether it applies to the selected versions. A tab whose probe fails does not apply: the others
     * do not depend on it.
     *
     * @returns {Promise<{applicable: Map<TabController, boolean>, errors: Error[]}>} Whether each tab applies, and the
     *          errors of the probes that failed, each once (two tabs can share a probe).
     */
    async #probeApplicableTabs() {
        const tabs = Array.from(this.tabs.values());
        const results = await Promise.allSettled(tabs.map(tab => tab.isApplicable()));
        const applicable = new Map(tabs.map((tab, index) => [tab, results[index].status === 'fulfilled' && results[index].value]));
        const errors = [...new Set(results.filter(result => result.status === 'rejected').map(result => result.reason))];
        return { applicable, errors };
    }

    /**
     * Shows the tabs that apply and hides the others. If the active tab is hidden, the tab that replaces it (see
     * {@link TabController#replacementTabId}) is shown instead, if it applies, or else Home; showing a tab activates
     * it (see {@link activeTabChanged}).
     *
     * @param {Map<TabController, boolean>} applicable Whether each tab applies to the selected versions.
     * @returns {boolean} true if the active tab is still shown, false if another tab is being shown instead.
     */
    #showApplicableTabs(applicable) {
        this.#tabBar.showApplicable(applicable);
        if (applicable.get(this.#activeTab)) {
            return true;
        }
        const replacement = this.tabs.get(this.#activeTab.replacementTabId());
        this.#tabBar.show(replacement && applicable.get(replacement) ? replacement : this.tabs.get('home-tab'));
        return false;
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

    /**
     * Removes the messages of the error toast and hides it (see {@link ErrorToast#clear}).
     */
    clearApiStatus() {
        this.#errorToast.clear();
    }

    /**
     * Shows a message in the error toast (see {@link ErrorToast#show}).
     *
     * @param {string} message
     * @param {string} [detail] For example why a request failed (see CustomError.detail).
     * @param {boolean} [staysShown] Whether the toast stays shown until the user closes it, instead of hiding itself
     *          15 s later: for an error that leaves nothing else to do (start-up without versions).
     */
    static updateApiStatus(message, detail = '', staysShown = false) {
        SdkExplorerApplication.instance.#errorToast.show(message, detail, staysShown);
    }

    /**
     * Performs a request of the application rather than of a tab: the list of versions (by the application's
     * {@link SdkRepository}) and the probes that decide which tabs apply to the selected versions.
     * These requests are not tracked, so cancelling a tab's requests never aborts them.
     *
     * @param {Object} options The options to pass to $.ajax().
     * @returns {Promise} A promise that resolves with the AJAX response.
     */
    ajaxRequest(options) {
        return $.ajax(options);
    }
}
