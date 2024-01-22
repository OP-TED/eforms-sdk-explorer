/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { SdkExplorerApplication } from './app.js';


$(document).ready(() => {
    SdkExplorerApplication.init();

    // Enable Bootstrap popovers everywhere
    $('[data-toggle="popover"]').popover({html:true});

    var currentStep = 0;

    // Move to the next step when the "Next" button is clicked
    $(document).on('click', '.next-step', function () {
        $('[data-step="' + currentStep + '"]').popover('hide');
        currentStep++;
        $('[data-step="' + currentStep + '"]').popover('show');
    });

    // Cancel the tour when the "Cancel" button is clicked
    $(document).on('click', '.cancel-tour', function () {
        $('[data-step="' + currentStep + '"]').popover('hide');
        currentStep = 0;
    });

    // Start the tour when the "Start Tour" button is clicked
    $('#start-tour').click(function () {
        $('[data-step="' + currentStep + '"]').popover('hide');
        currentStep = 0;
        $('[data-step="' + currentStep + '"]').popover('show');
    });
});

