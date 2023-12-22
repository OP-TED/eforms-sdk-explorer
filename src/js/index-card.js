import { BootstrapWebComponent } from "./bootstrap-web-component.js";

export class IndexCard extends BootstrapWebComponent {

    static get observedAttributes() {
        return ['title', 'subtitle', 'action-name', 'status'];
    }

    constructor() {
        super('index-card-template');
        this.propertyCards = [];
        this.actionHandler = null;
    }

    setActionHandler(handler) {
        this.actionHandler = handler;
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) {
            return;
        }

        if (name === 'title') {
            this.title = newValue;
        } else if (name === 'subtitle') {
            this.subTitle = newValue;
        } else if (name === 'action-name') {
            this.actionName = newValue;
        } else if (name === 'status') {
            this.status = newValue;
        }

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

    connectedCallback() {
        super.connectedCallback()
        if (!this.status) {
            this.getStatusCallback().then(status => {this.status = status
             this.render();
            })
        }
    }

    setStatusCallback(statusCallback) {
        this.getStatusCallback = statusCallback;
    }
    
    appendProperty(propertyCard) {
        this.propertyCards.push(propertyCard[0]);
        if (this.isConnected) {
            this.render();
        }
    }
}

customElements.define('index-card', IndexCard);