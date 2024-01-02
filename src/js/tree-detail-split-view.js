import { BootstrapWebComponent } from "./bootstrap-web-component.js";
import { DiffEntry } from "./diff.js";
import { PropertyCard } from "./property-card.js";

export class TreeDetailSplitView extends BootstrapWebComponent {

    static get observedAttributes() {
        return ['tree-data', 'detail-data'];
    }

    constructor() {
        super('tree-detail-split-view-template');
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (newValue === oldValue) {
            return;
        }
        switch (name) {
            case 'tree-data': this.treeData = newValue; break;
            case 'detail-data': this.detailData = newValue; break;
        }

        if (this.isConnected) {
            this.render();
        }
    }

    requiredCss() {
        return [ ...super.requiredCss(),
            'https://cdnjs.cloudflare.com/ajax/libs/jstree/3.2.1/themes/default/style.min.css'
        ];
    }

    render() {
        super.render();

        // Listen for changes in the search fields
        this.$treeSearch().keyup(this.#searchJsTree.bind(this));
        this.$treeFilter().change(this.#searchJsTree.bind(this));
        
       this.$treeSearch().popover();
    }


    setTreeDataCallback(callback) {
        this.getTreeDataCallback = callback;
    }

    #treeView() {
        return this.shadowRoot.querySelector('#treeView');
    }

    $treeView() {
        return $(this.#treeView());
    }

    #treeFilter() {
        return this.shadowRoot.querySelector('#tree-filter');
    }

    $treeFilter() {
        return $(this.#treeFilter());
    }

    #treeSearch() {
        return this.shadowRoot.querySelector('#tree-search');
    }

    $treeSearch() {
        return $(this.#treeSearch());
    }

    #detailView() {
        return this.shadowRoot.querySelector('#detail-view');
    }

    $detailView() {
        return $(this.#detailView());
    }
    /**
     * Initialises the tree-detail-split-view component.
     * 
     * @param {Object} options - The options for initialising the component.
     * @param {Function(): Array} options.dataCallback - A callback function that should return the nodes for the tree.
     * @param {Function(DiffEntry, string, string): boolean} options.searchCallback - A callback function that should perform a search operation.
     * @param {Array} [options.hiddenProperties=[]] - An optional array of properties to exclude.
     */
    initialise({ dataCallback, searchCallback, hiddenProperties = [] }) {
        if (this.$treeView().jstree(true)) {
            this.$treeView().jstree("destroy");
        }
        this.$treeView().jstree({
            core: {
                data: dataCallback(),
                check_callback: true
            },
            plugins: ["wholerow", "search"],
            search: {
                show_only_matches: true,
                search_callback: (str, node) => searchCallback(DiffEntry.fromObject(node?.data), ...str.split('::'))
            }
        });
        
        // Listen for selection changes in the tree
        this.$treeView().on("select_node.jstree", (e, data) => {
            this.displayDetails(DiffEntry.fromObject(data.node.data), hiddenProperties);
        });   
    }

    /**
     * Initiates a search in the JsTree.
     */
    #searchJsTree() {
        // Get the value of the search input field
        let searchString = this.$treeFilter().val() + '::' + this.$treeSearch().val();

        // Search the tree
        this.$treeView().jstree('search', searchString);
    }

    /**
     * Called when a tree-node is selected in the JsTree.
     * Displays the details of the selected node.
     * 
     * @param {DiffEntry} diffEntry 
     */
    displayDetails(diffEntry, except = []) {

        // Clear existing content
        this.$detailView().empty();

        const $ul = $('<ul class="list-group">');

        for (const [key, value] of Object.entries(diffEntry.getItem())) {

            const mainValue = diffEntry.mainItem ? diffEntry.mainItem[key] : undefined;
            const baseValue = diffEntry.baseItem ? diffEntry.baseItem[key] : undefined;

            if (except.includes(key) && mainValue === baseValue) {
                continue;
            }

            const $propertyTemplate = PropertyCard.create(key, diffEntry.mainItem ? mainValue : undefined, baseValue);
            $ul.append($propertyTemplate);
        }

        // Handle removed properties in diffEntry.baseItem that are not in diffEntry.mainItem
        if (diffEntry.mainItem) {
            for (const key in diffEntry.baseItem) {
                if (!diffEntry.mainItem.hasOwnProperty(key) && key !== 'content') {
                    const $removedPropertyTemplate = PropertyCard.create(key, undefined, diffEntry.baseItem[key]);
                    $ul.append($removedPropertyTemplate);
                }
            }
        }

        this.$detailView().append($ul);
    }

}

customElements.define('tree-detail-split-view', TreeDetailSplitView);