// App state and configuration
const appConfig = {
    tagsBaseUrl: 'https://api.github.com/repos/OP-TED/eForms-SDK',
    fieldsBaseUrl: 'https://raw.githubusercontent.com/OP-TED/eForms-SDK'
};

const appState = {
    sortedData: [],
    versionData: [],
    comparisonData: []
};

// DOM elements cache
const domElements = {
    loadingSpinner: $('#loadingSpinner'),
    apiStatus: $('#apiStatus'),
    xmlStructureTree: $('#xmlStructureTree'),
    tagsDropdown: $('#tagsDropdown'),
    comparisonDropdown: $('#comparisonDropdown')
};

// Show and hide loading spinner
function toggleLoadingSpinner(show) {
    if (show) {
        domElements.loadingSpinner.show();
    } else {
        domElements.loadingSpinner.hide();
    }
}

// Clear API status text
function clearApiStatus() {
    domElements.apiStatus.text('');
}

// Build tree data for jstree from XML structure
function buildTreeData(xmlStructure) {
    return xmlStructure.map(node => ({
        id: node.id,
        parent: node.parentId || "#",
        text: node.id,
        state: {
            opened: true
        }
    }));
}


function initializeTree(xmlStructure, treeElement) {
    // Destroy any existing tree to avoid conflicts
    if ( domElements.xmlStructureTree.jstree(true)) {
        domElements.xmlStructureTree.jstree("destroy");
    }

    domElements.xmlStructureTree.jstree({
        core: {
            data: buildTreeData(xmlStructure),
            check_callback: true // Allow all modifications
        },
        plugins: ["wholerow"] // Optional: to highlight the entire row when selected
    });
}

// Fetch and display fields content
async function fetchAndDisplayFieldsContent(tagName, isTagsDropdown) {
    toggleLoadingSpinner(true);
    clearApiStatus();
    
    const url = `${appConfig.fieldsBaseUrl}/${tagName}/fields/fields.json`;
    
    try {
        const response = await $.ajax({ url, dataType: 'json' });
        const fieldsData = response;
        
        if (isTagsDropdown) {
            appState.versionData = fieldsData.xmlStructure;
            fieldsData.xmlStructure[0].version =fieldsData.sdkVersion;

        } else {
            fieldsData.xmlStructure[0].version =fieldsData.sdkVersion;
            appState.comparisonData = fieldsData.xmlStructure;
            if (appState.versionData && appState.comparisonData) {
                const treeData = compareXMLStructures(appState.comparisonData, appState.versionData);
                console.log('treeData',treeData)
                initializeTree(treeData);
            }
        }

        domElements.apiStatus.text(`API call succeeded for file version "${tagName}"`);
    } catch (error) {
        domElements.apiStatus.text(`API call failed for file version "${tagName}"`);
        console.error('Error fetching and displaying fields content:', error);
    } finally {
        toggleLoadingSpinner(false);
    }
}


function compareXMLStructures(oldXmlStructure, newXmlStructure) {
    let comparisonResults = [];

    // Create maps for quick lookups by id
    let oldMap = new Map(oldXmlStructure.map(node => [node.id, node]));
    let newMap = new Map(newXmlStructure.map(node => [node.id, node]));

    // Check for removed and unchanged nodes
    oldXmlStructure.forEach(oldNode => {
        if (newMap.has(oldNode.id)) {
            // Node exists in both structures
            comparisonResults.push({ ...oldNode, nodeChange: 'unchanged' });
        } else {
            // Node only exists in old structure
            comparisonResults.push({ ...oldNode, nodeChange: 'removed' });
        }
    });

    // Check for added nodes
    newXmlStructure.forEach(newNode => {
        if (!oldMap.has(newNode.id)) {
            // Node only exists in new structure
            comparisonResults.push({ ...newNode, nodeChange: 'added' });
        }
        // 'Unchanged' nodes are already handled in the previous loop
    });
    console.log( { comparisonResults })

    return comparisonResults;
}



function findIndexByVersion(versionName) {
    return sortedData.findIndex(function(item) {
        return item.name === versionName;
    });
}


// Populate dropdowns with tags
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
        domElements.apiStatus.text('API call failed to fetch tags.');
        console.error('Error populating dropdowns:', error);
    } finally {
        toggleLoadingSpinner(false);
    }
}

// Document ready function
$(document).ready(() => {
    populateDropdown();
});

// Event handlers for dropdown changes
domElements.tagsDropdown.change(async function() {
    const selectedTagName = $(this).val();
    const comparisonTagName = domElements.comparisonDropdown.val();
    await fetchAndDisplayFieldsContent(selectedTagName, true);
    await fetchAndDisplayFieldsContent(comparisonTagName, false);
});

domElements.comparisonDropdown.change(async function() {
    const selectedTagName = $(this).val();
    const comparisonTagName = domElements.comparisonDropdown.val();
    await fetchAndDisplayFieldsContent(selectedTagName, true);
    await fetchAndDisplayFieldsContent(comparisonTagName, false);
});
