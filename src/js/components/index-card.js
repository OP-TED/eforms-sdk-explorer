import { BootstrapWebComponent } from "./bootstrap-web-component.js";
import { PropertyCard } from "./property-card.js";
import { Diff } from "../diff.js";

export class IndexCard extends BootstrapWebComponent {

    /**
     * Array containing the names of all attributes for which the element needs change notifications.
     * 
     * @type {string[]}
     */
    static get observedAttributes() {
        return ['title', 'subtitle', 'action-name', 'status'];
    }

    /**
     * Maintains a list of {@link PropertyCard} instances that are part of the index card.
     * The data is stored in a Map so that it can be accessed by property name so that we 
     * can later retrieve the values of specific properties.
     *  
     * @type {Map<string, PropertyCard>} 
     */
    propertyCards = new Map();

    constructor() {
        super('index-card-template');
        this.actionHandler = null;
    }

    /**
     * Provides a handler that will be called when the action button is clicked.
     * 
     * @param {function(Event): void} handler 
     */
    setActionHandler(handler) {
        this.actionHandler = handler;
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
            case 'title': this.title = newValue; break;
            case 'subtitle': this.subTitle = newValue; break;
            case 'action-name': this.actionName = newValue; break;
            case 'status': this.status = newValue; break;
        }

        // If the element is already connected to the DOM, then re-render it.
        if (this.isConnected) {
            this.render();
        }
    }

    #propertyListContainer() {
        return this.shadowRoot.querySelector('#property-list');
    }


    render() {
        super.render();
    
        this.propertyCards.forEach((propertyCard, key) => this.#propertyListContainer().append(propertyCard));
    
        this.shadowRoot.querySelector('#title').textContent = this.title;
        this.shadowRoot.querySelector('#subtitle').textContent = this.subTitle;
        this.shadowRoot.querySelector('#card-header').classList.add(this.status + '-card');
        if (this.status) {
            this.classList.add(this.status + '-card');
        }

        // Retrieve or create the button element
        let button = this.shadowRoot.querySelector('#action-button');
        if (!button) {
            button = document.createElement('button');
            button.setAttribute('id', 'action-button');
            button.setAttribute('type', 'button');
            if ([Diff.TypeOfChange.ADDED, Diff.TypeOfChange.REMOVED].includes(this.status)) {
                button.setAttribute('disabled', '');
                button.classList.add('btn', 'btn-outline-secondary');
            } else {
                button.classList.add('btn', 'btn-outline-primary');
            }
            this.shadowRoot.querySelector('#card-header').appendChild(button);
        }
    
        // Conditionally configure and display the button
        if (this.actionName && this.actionHandler) {
            button.textContent = this.actionName;
            button.onclick = this.actionHandler;
            button.style.display = ''; 
        } else {
            button.style.display = 'none';
        }
    }
    

    /**
     * Called each time the element is added to the document.
     */
    connectedCallback() {
        super.connectedCallback();

        // If the status is not set, and a callback is provided, then call the callback to get the status.
        if (!this.status && this.getStatusCallback) {
            this.getStatusCallback().then(status => {
                this.setAttribute('status', status);    // This will also trigger a re-render
            });
        }
    }

    /**
     * Provides a callback that will be called when the status is not set directly.
     * The idea is that the callback will be invoked asynchronously because it needs to fetch and compare files from GitHub.
     * 
     * @param {function(): string} statusCheckCallback 
     */
    setStatusCheckCallback(statusCheckCallback) {
        this.getStatusCallback = statusCheckCallback;
    }

    /**
     * Returns the value of the specified property.
     * 
     * @param {string} propertyName 
     * @returns 
     */
    getPropertyValue(propertyName)  {
        const propertyCard = this.propertyCards.get(propertyName);
        if (propertyCard) {
            return propertyCard.getPropertyValue();
        }
        return undefined;
    }

    /**
     * Adds a {@link PropertyCard} to the index card.
     * 
     * @param {PropertyCard} propertyCard 
     */
    appendProperty(propertyCard) {
        this.propertyCards.set(propertyCard.getPropertyName(), propertyCard);
        if (this.isConnected) {
            this.#propertyListContainer().append(propertyCard);
        }
    }

    /**
     * Creates a new index card.
     * 
     * @param {string} title 
     * @param {string} subTitle 
     * @param {string} actionName 
     * @param {string} status 
     * @returns {IndexCard}
     */
    static create(title, subTitle, actionName, status = undefined) {
        const component = document.createElement('index-card');
        component.setAttribute('title', title);
        component.setAttribute('subtitle', subTitle);
        component.setAttribute('action-name', actionName);
        if (status) {
            component.setAttribute('status', status);
        }
        return component;
    }
}

customElements.define('index-card', IndexCard);