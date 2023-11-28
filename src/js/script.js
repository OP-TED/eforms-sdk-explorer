const appConfig = {
    tagsBaseUrl: 'https://api.github.com/repos/OP-TED/eForms-SDK',
    fieldsBaseUrl: 'https://raw.githubusercontent.com/OP-TED/eForms-SDK'
};

const appState = {
    sortedData: [],
    versionData: [],
    comparisonData: []
};

const domElements = {
    loadingSpinner: $('#loadingSpinner'),
    apiStatus: $('#apiStatus'),
    xmlStructureTree: $('#xmlStructureTree'),
    tagsDropdown: $('#tagsDropdown'),
    comparisonDropdown: $('#comparisonDropdown')
};

function toggleLoadingSpinner(show) {
    if (show) {
        domElements.loadingSpinner.show();
    } else {
        domElements.loadingSpinner.hide();
    }
}

function clearApiStatus() {
    domElements.apiStatus.text('');
}

function buildTreeData(xmlStructure, fieldsComparisonResults) {

    const treeDataMap = new Map(xmlStructure.map(node => [node.id, {
        id: node.id,
        parent: node.parentId || "#",
        text: node.name || node.id,
        state: {
            opened: true
        },
        li_attr: node.nodeChange === 'removed' ? { class: 'removed-node' } :
            node.nodeChange === 'added' ? { class: 'added-node' } : {}
    }]));

    fieldsComparisonResults.forEach(field => {
        treeDataMap.set(field.id, {
            id: field.id,
            parent: field.parentNodeId,
            text: field.name || field.id,
            icon: 'jstree-file',
            state: {
                opened: true
            },
            li_attr: field.nodeChange === 'removed' ? { class: 'removed-node' } :
                field.nodeChange === 'added' ? { class: 'added-node' } : {}
        });
    });

    return Array.from(treeDataMap.values());
}



function initializeTree(xmlStructure, fieldsComparisonResults) {
    if (domElements.xmlStructureTree.jstree(true)) {
        domElements.xmlStructureTree.jstree("destroy");
    }

    domElements.xmlStructureTree.jstree({
        core: {
            data: buildTreeData(xmlStructure, fieldsComparisonResults),
            check_callback: true
        },
        plugins: ["wholerow"]
    })

    domElements.xmlStructureTree.on("select_node.jstree", function (e, data) {
        const selectedFieldId = data.node.id;
        const fieldDetails = fieldsComparisonResults.find(field => field.id === selectedFieldId);
        if (fieldDetails) {
            displayFieldDetails(fieldDetails);
        }
    });
}

function displayFieldDetails(details) {
    function createAccordion(key, value, uniqueId) {
        return $(`
            <div class="accordion" id="${uniqueId}">
                <div class="card">
                    <div class="card-header p-0" id="heading-${uniqueId}">
                        <h2 class="mb-0">
                            <button class="btn btn-link btn-block text-left" type="button" data-toggle="collapse" data-target="#collapse-${uniqueId}" aria-expanded="true" aria-controls="collapse-${uniqueId}">
                                ${key} (click to expand)
                            </button>
                        </h2>
                    </div>
                    <div id="collapse-${uniqueId}" class="collapse" aria-labelledby="heading-${uniqueId}" data-parent="#${uniqueId}">
                        <div class="card-body">
                            ${value.join(', ')}
                        </div>
                    </div>
                </div>
            </div>
        `);
    }

    function createTree(obj, parentKey = '') {
        const $ul = $('<ul class="list-group">');
        Object.entries(obj).forEach(([key, value], index) => {
            const $li = $('<li class="list-group-item">');
            const uniqueId = 'accordion-' + parentKey + key + '-' + index;

            if ($.isPlainObject(value) || Array.isArray(value)) {
                const $keySpan = $('<span class="font-weight-bold">').text(key + ': ');

                if (Array.isArray(value) && key === 'noticeTypes') {
                    $li.append($keySpan).append(createAccordion(key, value, uniqueId));
                } else {
                    $li.append($keySpan).append(createTree(value, key));
                }
            } else {
                const $keySpan = $('<span class="font-weight-bold">').text(key + ': ');
                const $valueSpan = $('<span>').text(value);
                $li.append($keySpan).append($valueSpan);
            }
            $ul.append($li);
        });
        return $ul;
    }

    $('#detailsContent').empty().append(createTree(details));
}


async function fetchAndDisplayFieldsContent(tagName, isTagsDropdown) {
    toggleLoadingSpinner(true);
    clearApiStatus();

    const url = `${appConfig.fieldsBaseUrl}/${tagName}/fields/fields.json`;
    try {
        const response = await $.ajax({ url, dataType: 'json' });
        const fieldsData = response;

        if (isTagsDropdown) {
            appState.versionData = fieldsData.xmlStructure;
            appState.versionDataFields = fieldsData.fields;
            fieldsData.xmlStructure[0].version = fieldsData.sdkVersion;

        } else {
            fieldsData.xmlStructure[0].version = fieldsData.sdkVersion;
            appState.comparisonData = fieldsData.xmlStructure;
            appState.comparisonDataFields = fieldsData.fields;
            if (appState.versionData && appState.comparisonData) {

                const xmlComparisonResults = compareXMLStructures(appState.comparisonData, appState.versionData);
                const fieldsComparisonResults = compareXMLStructures(appState.comparisonDataFields, appState.versionDataFields);
                initializeTree(xmlComparisonResults, fieldsComparisonResults);

            }
        }
        updateApiStatus(`API call succeeded for file version "${tagName}"`, true);
    } catch (error) {
        updateApiStatus(`API call succeeded for file version "${tagName}"`, false);
        console.error('Error fetching and displaying fields content:', error);
    } finally {
        toggleLoadingSpinner(false);
    }
}


function compareXMLStructures(oldXmlStructure, newXmlStructure) {
    let comparisonResults = [];

    let oldMap = new Map(oldXmlStructure.map(node => [node.id, node]));
    let newMap = new Map(newXmlStructure.map(node => [node.id, node]));

    oldXmlStructure.forEach(oldNode => {
        if (newMap.has(oldNode.id)) {
            comparisonResults.push({ ...oldNode, nodeChange: 'unchanged' });
        } else {
            comparisonResults.push({ ...oldNode, nodeChange: 'removed' });
        }
    });

    newXmlStructure.forEach(newNode => {
        if (!oldMap.has(newNode.id)) {
            comparisonResults.push({ ...newNode, nodeChange: 'added' });
        }
    });

    return comparisonResults;
}



function findIndexByVersion(versionName) {
    return sortedData.findIndex(function (item) {
        return item.name === versionName;
    });
}


async function populateDropdown() {
    toggleLoadingSpinner(true);
    clearApiStatus();

    try {
        const response = await $.ajax({
            url: `${appConfig.tagsBaseUrl}/tags`,
            dataType: 'json'
        });
        const data = response.sort((a, b) => b.name.localeCompare(a.name));

        appState.sortedData = data;
        domElements.tagsDropdown.empty();
        domElements.comparisonDropdown.empty();

        data.forEach(item => {
            const option = $('<option>', { value: item.name, text: item.name });
            domElements.tagsDropdown.append(option.clone());
            domElements.comparisonDropdown.append(option);
        });

        domElements.tagsDropdown.val(data[0].name);
        domElements.comparisonDropdown.val(data.length > 1 ? data[1].name : data[0].name);

        await fetchAndDisplayFieldsContent(data[0].name, true);
        await fetchAndDisplayFieldsContent(data[1].name, false);
    } catch (error) {
        updateApiStatus('API call failed to fetch tags.', false);
        console.error('Error populating dropdowns:', error);
    } finally {
        toggleLoadingSpinner(false);
    }
}

function updateApiStatus(message, isSuccess = true) {
    domElements.apiStatus.text(message);

    if (isSuccess) {
        domElements.apiStatus.addClass('alert-success').removeClass('alert-danger');
    } else {
        domElements.apiStatus.addClass('alert-danger').removeClass('alert-success');
    }

    domElements.apiStatus.show();

    setTimeout(() => {
        domElements.apiStatus.fadeOut('slow');
    }, 5000);
}

$(document).ready(() => {
    populateDropdown();
});

domElements.tagsDropdown.change(async function () {
    const selectedTagName = $(this).val();
    await fetchAndDisplayFieldsContent(selectedTagName, true);
});

domElements.comparisonDropdown.change(async function () {
    const selectedComparisonTagName = $(this).val();
    await fetchAndDisplayFieldsContent(selectedComparisonTagName, false);
});
