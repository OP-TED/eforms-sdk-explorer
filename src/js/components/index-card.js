/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { BootstrapWebComponent } from "./bootstrap-web-component.js";
import { PropertyCard } from "./property-card.js";
import { Diff } from "../diff.js";
import { SdkExplorerApplication } from "../app.js";

export class IndexCard extends BootstrapWebComponent {

    /**
     * Array containing the names of all attributes for which the element needs change notifications.
     * 
     * @type {string[]}
     */
    static get observedAttributes() {
        return ['title', 'subtitle', 'action-name', 'status'];
    }

    /** @type {(e: Event) => Promise<void>} */    
    actionHandler = null;

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
     * @param {function(Event): Promise<void>} handler 
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
            case 'status':
                this.status = newValue;
                // Dispatch a custom event when the status changes
                let event = new CustomEvent('statusChanged', { detail: { status: newValue } });
                this.dispatchEvent(event);
                break;
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
            button.onclick = async (event) => {
                try {
                    await this.actionHandler(event);
                } catch (error) {
                    SdkExplorerApplication.updateApiStatus(error.message);
                }
            };
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
            }).catch(error => {
                if (error.statusText !== 'abort') {
                    SdkExplorerApplication.updateApiStatus(error.message);
                }
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

    getStatus() {
        return this.status;
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