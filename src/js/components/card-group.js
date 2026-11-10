/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { BootstrapWebComponent } from "./bootstrap-web-component.js";
import { IndexCard } from "./index-card.js";

export class CardGroup extends BootstrapWebComponent {

    filterValues = [];

    selectedStatusFilterValue = 'all';

    selectedPropertyFilterValue = '(all)';

    /**
     * Array containing the names of all attributes for which the element needs change notifications.
     * 
     * @type {string[]}
     */
    static get observedAttributes() {
        return ['filter-property', 'filter-prompt', 'default-filter-value'];
    }

    constructor() {
        super('card-group-template');
        this.indexCards = [];
    }

    /**
     * Overridden to free up resources.
     */
    dispose() {
        super.dispose();
        this.empty();
    }

    /**
     * Called when attributes are changed, added, removed, or replaced.
     * 
     * @param {string} name 
     * @param {*} oldValue 
     * @param {*} newValue 
     * @returns 
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) {
            return;
        }

        switch (name) {
            case 'filter-property': this.filterProperty = newValue; break;
            case 'filter-prompt': this.filterPrompt = newValue; break;
            case 'default-filter-value': this.defaultFilterValue = newValue; break;
        }

        // If the element is already connected to the DOM, then re-render it.
        if (this.isConnected) {
            this.render();
        }
    }

    #filterOptions() {
        return this.shadowRoot.querySelector('#filter-options');
    }

    $filterOptions() {
        return $(this.#filterOptions());
    }

    #cardsContainer() {
        return this.shadowRoot.querySelector('#cards-container');
    }

    $cardsContainer() {
        return $(this.#cardsContainer());
    }

    #statusFilter() {
        return this.shadowRoot.querySelector('#status-filter');
    }

    $statusFilter() {
        return $(this.#statusFilter());
    }

    setSelectedStatusFilterValue(newValue) {
        if (this.selectedStatusFilterValue !== newValue) {
            const oldValue = this.selectedStatusFilterValue;
            this.selectedStatusFilterValue = newValue;
            this.selectedStatusFilterChanged(newValue, oldValue);
        }
    }

    getSelectedStatusFilterValue() {
        return this.selectedStatusFilterValue;
    }

    getSelectedPropertyFilterValue() {
        return this.selectedPropertyFilterValue;
    }

    setSelectedPropertyFilterValue(newValue) {
        if (this.selectedPropertyFilterValue !== newValue) {
            const oldValue = this.selectedPropertyFilterValue;
            this.selectedPropertyFilterValue = newValue;
            this.selectedPropertyFilterChanged(newValue, oldValue);
        }
    }

    render() {
        super.render();

        // Listen for changes in the compact view switch
        this.shadowRoot.querySelector('#compactViewSwitch').addEventListener('change', function (event) {
            if (event.target.checked) {
                this.style.setProperty('--compact-view-warning-display', 'block');
                this.style.setProperty('--compact-view-unchanged-display', 'none');
            } else {
                this.style.setProperty('--compact-view-warning-display', 'none');
                this.style.removeProperty('--compact-view-unchanged-display');
            }
        }.bind(this));

        this.$statusFilter().on('change', (event) => {
            const status = event.target.value;
            this.setSelectedStatusFilterValue(status);
        });

        if (this.filterProperty) {
            this.shadowRoot.querySelector('#filter-prompt').textContent = this.filterPrompt ?? this.filterProperty;
            if (this.filterValues.length > 1) {
                this.filterValues.push('(all)');
            }
            this.filterValues.forEach(filterValue => {
                this.#renderFilterOption(filterValue);
            });
        } else {
            this.shadowRoot.querySelector('#nav').style.display = 'none';
        }

        this.indexCards.forEach(indexCard => this.#renderCard(indexCard));

        // The template comes with "all" and "(all)" selected: show the stored selections instead.
        this.#showSelectedFilters();
    }

    /**
     * Removes the cards and the values of the property filter, so that the card group can be filled from nothing
     * (for example after the versions change). Emptying a card group resets its filters: "(all)" and "all" are
     * selected again. Use {@link dispose} to release the component.
     */
    empty() {
        this.indexCards = [];
        this.filterValues = [];
        this.$filterOptions().empty();
        this.$cardsContainer().empty();
        this.selectedPropertyFilterValue = '(all)';
        this.selectedStatusFilterValue = 'all';
        this.#showSelectedFilters();
    }

    /**
     * Makes the filter controls and the cards follow the stored selections: the status filter shows the selected
     * status, the link of the selected property value is highlighted, and the cards container holds the one CSS
     * variable of the selected pair, which the cards' display reads.
     */
    #showSelectedFilters() {
        const container = this.#cardsContainer();
        if (!container) {
            return; // Not rendered yet: render() shows them.
        }
        this.$statusFilter().val(this.selectedStatusFilterValue);
        Array.from(container.style)
            .filter(propertyName => propertyName.startsWith('--filter-'))
            .forEach(propertyName => container.style.removeProperty(propertyName));
        container.style.setProperty(CardGroup.#filterValueToCssVariableName(this.selectedPropertyFilterValue, this.selectedStatusFilterValue), 'block');

        const selectedLink = Array.from(this.#filterOptions().querySelectorAll('.nav-link')).find(link => link.textContent === this.selectedPropertyFilterValue);
        if (selectedLink) {
            this.#highlightNavLink(selectedLink);
        }
    }

    #renderCard(indexCard) {
        this.#cardsContainer().append(indexCard);
    }

    /**
     * 
     * @param {IndexCard} indexCard 
     */
    appendCard(indexCard) {
        this.indexCards.push(indexCard);
        if (this.isConnected) {
            this.#renderCard(indexCard);
        }

        const filterValue = indexCard.getPropertyValue(this.filterProperty) ?? '(blank)';
        if (!this.filterValues.includes(filterValue)) {
            if (this.filterValues.length === 1) {
                this.#addNoFilterOption();
            }
            this.filterValues.push(filterValue);
            if (this.isConnected) {
                this.#renderFilterOption(filterValue);
            }
        }

        if (!indexCard.getStatus()) {
            // Until its status arrives (or if its check fails), the card follows the filters as a card whose status is
            // not known: it is shown only while no particular status is selected.
            indexCard.style.display = CardGroup.#displayWhilePending(filterValue);

            // Create the event listener function
            let updateStatusFilter = (event) => {
                indexCard.style.display = CardGroup.#displayWithStatus(filterValue, indexCard.getStatus());

                // Remove the event listener
                indexCard.removeEventListener('statusChanged', updateStatusFilter);
            };

            // Attach the event listener
            indexCard.addEventListener('statusChanged', updateStatusFilter);
        } else {
            indexCard.style.display = CardGroup.#displayWithStatus(filterValue, indexCard.getStatus());
        }
    }

    /**
     * The display of a card whose status is known: shown when the selected filters (property value and status) match it.
     *
     * @param {string} filterValue The card's value of the filter property.
     * @param {string} status
     * @returns {string} A CSS display value that reads the CSS variable set for the selected filters.
     */
    static #displayWithStatus(filterValue, status) {
        const filterOptionStatus = CardGroup.#filterValueToCssVariableName(filterValue, status);
        const filterOptionAll = CardGroup.#filterValueToCssVariableName(filterValue, 'all');
        const filterOptionAllStatus = CardGroup.#filterValueToCssVariableName('(all)', status);
        const filterOptionAllAll = CardGroup.#filterValueToCssVariableName('(all)', 'all');
        return `var(${filterOptionStatus}, var( ${filterOptionAll}, var(${filterOptionAllStatus}, var(${filterOptionAllAll}, none)))`;
    }

    /**
     * The display of a card whose status is still pending: shown only when the status filter is "all" and the
     * property filter matches it (or is "(all)").
     *
     * @param {string} filterValue The card's value of the filter property.
     * @returns {string} A CSS display value that reads the CSS variable set for the selected filters.
     */
    static #displayWhilePending(filterValue) {
        const filterOptionAll = CardGroup.#filterValueToCssVariableName(filterValue, 'all');
        const filterOptionAllAll = CardGroup.#filterValueToCssVariableName('(all)', 'all');
        return `var(${filterOptionAll}, var(${filterOptionAllAll}, none))`;
    }

    /**
     * Adds the (all) filter option if it doesn't exist yet.
     */
    #addNoFilterOption() {
        if (!this.filterValues.includes('(all)')) {
            this.filterValues.push('(all)');
            if (this.isConnected) {
                const filterOption = this.#renderFilterOption('(all)');
                this.#highlightNavLink(filterOption.firstElementChild);
            }
        }
    }

    /**
     * Adds a filter option to the nav links for the specified filter value.
     * 
     * @param {string} filterValue 
     */
    #renderFilterOption(filterValue) {
        const filterOption = document.createElement('li');
        filterOption.classList.add('nav-item');
        const link = document.createElement('a');
        link.classList.add('nav-link');
        link.setAttribute('href', '#');
        link.textContent = filterValue;
        filterOption.appendChild(link);

        // Keep the filter options sorted alphabetically.
        // Get the index at which to insert the new option.
        const index = this.#findNavLink(filterValue);
        if (index === -1) {
            // If no such index is found, append the option at the end
            this.#filterOptions().appendChild(filterOption);
        } else {
            // Otherwise, insert the option at the found index
            this.#filterOptions().insertBefore(filterOption, this.#filterOptions().children[index]);
        }

        // Add a click listener to apply selected filter
        filterOption.addEventListener('click', (event) => {
            event.preventDefault();
            this.setSelectedPropertyFilterValue(filterValue);

            // Highlight the selected filter option
            this.#highlightNavLink(event.target);
        });

        return filterOption;
    }

    /**
     * CSS variables are used to show/hide the indexCards based on the filter value.
     * 
     * @param {string} propertyFilter 
     * @returns 
     */
    static #filterValueToCssVariableName(propertyFilter, statusFilter) {
        return `--filter-${propertyFilter === '(all)' ? 'all' : propertyFilter === '(blank)' ? 'undefined' : propertyFilter}-${statusFilter}`;
    }

    /**
     * Gets the index at which to insert the new option to keep the filter options sorted alphabetically.
     * 
     * @param {string} filterValue 
     * @returns 
     */
    #findNavLink(filterValue) {
        // Find the index at which to insert the new option
        return Array.from(this.#filterOptions().children).findIndex(option => option.textContent > filterValue);
    }

    /**
     * Highlights the selected filter option.
     * 
     * @param {string} filterOption 
     */
    #highlightNavLink(filterOption) {
        // Get active nav links
        var navLinks = this.#filterOptions().querySelectorAll('.nav-link.active');

        // Remove active class from all nav links that have it
        navLinks.forEach(function(navLink) {
            navLink.classList.remove('active');
        });

        // Add active class to the clicked nav link
        filterOption.classList.add('active');
    }

    selectedStatusFilterChanged(newValue, oldValue) {
        setTimeout(() => {
            this.#cardsContainer().style.removeProperty(`${CardGroup.#filterValueToCssVariableName(this.getSelectedPropertyFilterValue(), oldValue)}`);
            this.#cardsContainer().style.setProperty(`${CardGroup.#filterValueToCssVariableName(this.getSelectedPropertyFilterValue(), newValue)}`, 'block');
        }, 0);
    }

    selectedPropertyFilterChanged(newValue, oldValue) {
        setTimeout(() => {
            this.#cardsContainer().style.removeProperty(`${CardGroup.#filterValueToCssVariableName(oldValue, this.getSelectedStatusFilterValue())}`);
            this.#cardsContainer().style.setProperty(`${CardGroup.#filterValueToCssVariableName(newValue, this.getSelectedStatusFilterValue())}`, 'block');
        }, 0);
    }   

}

customElements.define('card-group', CardGroup);