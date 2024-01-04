import { BootstrapWebComponent } from "./bootstrap-web-component.js";

export class IndexCard extends BootstrapWebComponent {

    /**
     * Array containing the names of all attributes for which the element needs change notifications.
     * 
     * @type {string[]}
     */
    static get observedAttributes() {
        return ['title', 'subtitle', 'action-name', 'status'];
    }

    constructor() {
        super('index-card-template');
        this.propertyCards = [];
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

    render() {
        super.render();

        const propertyList = this.shadowRoot.querySelector('#property-list');
        this.propertyCards.forEach(propertyCard => propertyList.append(propertyCard));

        this.shadowRoot.querySelector('#title').textContent = this.title;
        this.shadowRoot.querySelector('#subtitle').textContent = this.subTitle;
        this.shadowRoot.querySelector('#card-header').classList.add(this.status + '-card');

        const button = this.shadowRoot.querySelector('#action-button');
        button.textContent = this.actionName;
        button.onclick = this.actionHandler;
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

    appendProperty(propertyCard) {
        this.propertyCards.push(propertyCard);
        if (this.isConnected) {
            this.render();
        }
    }

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