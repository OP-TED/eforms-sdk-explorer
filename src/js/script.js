import { SdkExplorerApplication } from './app.js';


$(document).ready(() => {
    SdkExplorerApplication.init();

    // Enable Bootstrap popovers everywhere
    $('[data-toggle="popover"]').popover();
});

