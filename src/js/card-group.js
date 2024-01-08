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
            this.filterValues.forEach(filterValue => {
                this.#renderFilterValue(filterValue);
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

        const filterValue = indexCard.getPropertyValue(this.filterProperty);
        if ( filterValue !== undefined && !this.filterValues.includes(filterValue)) {
            this.filterValues.push(filterValue);
            if (this.isConnected) {
                this.#renderFilterValue(filterValue);
            }
        }

        // Set a CSS variable on the indexCard based on the filter value
        this.#cardsContainer().style.setProperty(`--filter-all`, 'block');

        // Use CSS variables to show/hide the indexCard based on the filter value
        indexCard.style.display = `var(--filter-${filterValue}, var(--filter-all, none))`;
    }

    #renderFilterValue(filterValue) {
        const filterOption = document.createElement('li');
        filterOption.classList.add('nav-item');
        const link = document.createElement('a');
        link.classList.add('nav-link');
        link.setAttribute('href', '#');
        link.textContent = filterValue;
        filterOption.appendChild(link);
        this.shadowRoot.querySelector('#filter-options').appendChild(filterOption);

        // Add a click listener to apply selected filter
        filterOption.addEventListener('click', function (event) {
            event.preventDefault();
            
            // Loop through the filterValues and remove the corresponding CSS properties
            this.filterValues.forEach(filterValue => {
                this.#cardsContainer().style.removeProperty(`--filter-${filterValue}`);
            });

            this.#cardsContainer().style.removeProperty(`--filter-all`);
            this.#cardsContainer().style.removeProperty(`--filter-undefined`); // these correspond to the blank filter option
            this.#cardsContainer().style.setProperty(`--filter-${filterValue}`, 'block');

            this.#indicateActiveItem(event.target);
        }.bind(this));
    }

    selectAll(clickedItem) {
        // Loop through the filterValues and remove the corresponding CSS properties
        this.filterValues.forEach(filterValue => {
            this.#cardsContainer().style.removeProperty(`--filter-${filterValue}`);
        });

        this.#cardsContainer().style.removeProperty(`--filter-undefined`);
        this.#cardsContainer().style.setProperty(`--filter-all`, 'block');
        this.#indicateActiveItem(clickedItem);
    }

    selectBlank(clickedItem) {
        // Loop through the filterValues and remove the corresponding CSS properties
        this.filterValues.forEach(filterValue => {
            this.#cardsContainer().style.removeProperty(`--filter-${filterValue}`);
        });

        this.#cardsContainer().style.removeProperty(`--filter-all`);
        this.#cardsContainer().style.setProperty(`--filter-undefined`, 'block');

        this.#indicateActiveItem(clickedItem);
    }

    #indicateActiveItem(activeItem) {
        // Get all nav links
        var navLinks = this.shadowRoot.querySelectorAll('#filter-options .nav-link');

        // Remove active class from all nav links
        navLinks.forEach(function(navLink) {
            navLink.classList.remove('active');
        });

        // Add active class to the clicked nav link
        activeItem.classList.add('active');
    }
}

customElements.define('card-group', CardGroup);