/* Copyright (c) 2021 European Union
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at:
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.
 */

/** @typedef {import('./tabs/tab-controller.js').TabController} TabController */

/**
 * The buttons of the tab bar: which tabs are shown and enabled, and which one is active. It decides nothing: the
 * application tells it which tabs apply.
 */
export class TabBar {

    /**
     * Shows and enables the button of each tab that applies, and hides and disables the others: disabled as well as
     * hidden, because the arrow keys of the tab bar skip disabled buttons, not hidden ones.
     *
     * @param {Map<TabController, boolean>} applicable Whether each tab applies to the selected versions.
     */
    showApplicable(applicable) {
        applicable.forEach((isApplicable, tab) => {
            $(this.#navItem(tab)).toggleClass('d-none', !isApplicable);
            this.#button(tab).disabled = !isApplicable;
        });
    }

    /**
     * Disables the button of every tab but one.
     *
     * @param {Iterable<TabController>} tabs
     * @param {TabController} keptTab The tab whose button stays enabled.
     */
    disableAllBut(tabs, keptTab) {
        for (const tab of tabs) {
            if (tab !== keptTab) {
                this.#button(tab).disabled = true;
            }
        }
    }

    /**
     * Shows a tab, as a click on its button does: Bootstrap then fires `shown.bs.tab` on the button.
     *
     * @param {TabController} tab
     */
    show(tab) {
        $(this.#button(tab)).tab('show');
    }

    /**
     * Calls a listener whenever a tab is shown, with the id of its button.
     *
     * @param {(tabId: string) => void} listener
     */
    onTabShown(listener) {
        $('ul.nav-tabs').on('shown.bs.tab', 'li.nav-item > button.nav-link', event => listener($(event.target).attr('id')));
    }

    /**
     * @returns {string|undefined} The id of the button of the active tab.
     */
    activeTabId() {
        return $('ul.nav-tabs button.nav-link.active').attr('id');
    }

    /**
     * @param {TabController} tab
     * @returns {HTMLButtonElement} The button of the tab.
     */
    #button(tab) {
        return document.getElementById(tab.getId());
    }

    /**
     * @param {TabController} tab
     * @returns {HTMLElement} The list item that holds the button of the tab.
     */
    #navItem(tab) {
        return this.#button(tab).closest('li.nav-item');
    }
}
