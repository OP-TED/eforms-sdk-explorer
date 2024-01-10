import { BootstrapWebComponent } from "./bootstrap-web-component.js";
import { IndexCard } from "./index-card.js";

export class CardGroup extends BootstrapWebComponent {

    filterValues = [];

    /**
     * Array containing the names of all attributes for which the element needs change notifications.
     * 
     * @type {string[]}
     */
    static get observedAttributes() {
        return ['filter-property', 'default-filter-value'];
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
        this.indexCards = [];
        this.filterValues = [];
        this.$filterOptions().empty();
        this.$cardsContainer().empty();
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

        if (this.filterProperty) {
            this.shadowRoot.querySelector('#filter-property-name').textContent = this.filterProperty;
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
    }

    empty() {
        this.indexCards = [];
        this.$cardsContainer().empty();
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

        // Use CSS variables to show/hide the indexCard based on the filter value
        indexCard.style.display = `var(${this.#filterValueToCssVariableName(filterValue)}, var(--filter-all, none))`;
    }

    /**
     * Adds the (all) filter option if it doesn't exist yet.
     */
    #addNoFilterOption() {
        if (!this.filterValues.includes('(all)')) {
            this.filterValues.push('(all)');
            if (this.isConnected) {
                this.#renderFilterOption('(all)');
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

            // Loop through the filterValues and remove the corresponding CSS properties
            this.filterValues.forEach(filterValue => {
                this.#cardsContainer().style.removeProperty(`${this.#filterValueToCssVariableName(filterValue)}`);
            });

            this.#cardsContainer().style.setProperty(`${this.#filterValueToCssVariableName(filterValue)}`, 'block');

            // Highlight the selected filter option
            this.#highlightNavLink(event.target);
        });
    }

    /**
     * CSS variables are used to show/hide the indexCards based on the filter value.
     * 
     * @param {string} filterOption 
     * @returns 
     */
    #filterValueToCssVariableName(filterOption) {
        return `--filter-${filterOption === '(all)' ? 'all' : filterOption === '(blank)' ? 'undefined' : filterOption}`;
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
}

customElements.define('card-group', CardGroup);