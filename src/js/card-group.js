import { BootstrapWebComponent } from "./bootstrap-web-component.js";

export class CardGroup extends BootstrapWebComponent {

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
                this.style.setProperty('--compact-view-unchanged-display', 'block');
            }
        }.bind(this));

        this.indexCards.forEach(indexCard => this.#renderCard(indexCard));
    }

    empty() {
        this.indexCards = [];
        this.$cardsContainer().empty();
    }

    #renderCard(indexCard) {
        this.#cardsContainer().append(indexCard);
    }

    appendCard(indexCard) {
        this.indexCards.push(indexCard);
        if (this.isConnected) {
            this.#renderCard(indexCard);
        }
    }
}

customElements.define('card-group', CardGroup);