import { TabController } from "./tab-controller.js";
import { appState } from "./state.js";
import { appConfig } from "./config.js";
import { Diff, DiffEntry } from "./diff.js"; 
import { TreeDetailSplitView } from "./tree-detail-split-view.js";

export class FieldsTab extends TabController {

    constructor() {
        super('fields-tab');
    }

    async fetchAndRender() {

        const mainVersionUrl = `${appConfig.rawBaseUrl}/${appState.mainVersion}/fields/fields.json`;
        const comparisonVersionUrl = `${appConfig.rawBaseUrl}/${appState.baseVersion}/fields/fields.json`;

        try {
            const [response1, response2] = await Promise.all([
                this.ajaxRequest({ url: mainVersionUrl, dataType: 'json' }),
                this.ajaxRequest({ url: comparisonVersionUrl, dataType: 'json' })
            ]);

            const mainVersionNodes = response1.xmlStructure;
            const mainVersionFields = response1.fields;
            const baseVersionNodes = response2.xmlStructure;
            const baseVersionFields = response2.fields;

            if (mainVersionNodes && baseVersionNodes) {
                const nodesDiff = Diff.fromArrayComparison(mainVersionNodes, baseVersionNodes, 'id');
                const fieldsDiff = Diff.fromArrayComparison(mainVersionFields, baseVersionFields, 'id');
                this.#splitView().initialise({
                    dataCallback: () => this.#createTreeNodes(nodesDiff, fieldsDiff),
                    searchableProperties: ['id', 'btId', 'name', 'xpathRelative'],
                    titleProperty: 'id',
                    subtitleProperty: 'type',
                });
            }
        } catch (error) {
            console.error('Error fetching and displaying fields.json contents: ', error);
            throw new Error('Failed to load data');
        }
    }

    /**
     * Gets the {@link TreeDetailSplitView} element for this tab.
     * @returns {TreeDetailSplitView}
     */
    #splitView() {
        return document.getElementById('fields-explorer');
    }


    /**
     * Creates the tree-nodes for the JsTree from {@link Diff} objects of SDK Nodes and SDK Fields.
     * 
     * @param {Diff} nodesDiff A Diff object containing the differences between the main and base versions of the SDK Nodes. 
     * @param {Diff} fieldsDiff A Diff object containing the differences between the main and base versions of the SDK Fields.
     * 
     * @returns {Array} An array of tree-nodes ready for loading onto a JsTree. 
     */
    #createTreeNodes(nodesDiff, fieldsDiff) {

        const treeNodes = new Map(nodesDiff.map(diffEntry => {
            return [diffEntry.id, {
                id: diffEntry.id,
                parent: diffEntry.get('parentId') ?? "#",
                text: diffEntry.get('name') ?? diffEntry.id,
                icon: 'jstree-folder',
                state: {
                    opened: true
                },
                li_attr: { class: `${diffEntry.typeOfChange}-node` },
                data: diffEntry
            }];
        }));


        fieldsDiff.forEach(diffEntry => {
            treeNodes.set(diffEntry.id, {
                id: diffEntry.id,
                parent: diffEntry.get('parentNodeId'),
                text: diffEntry.get('name') ?? diffEntry.id,
                icon: 'jstree-file',
                state: {
                    opened: true
                },
                li_attr: { class: `${diffEntry.typeOfChange}-node` },
                data: diffEntry
            });
        });

        return Array.from(treeNodes.values());
    }
}
