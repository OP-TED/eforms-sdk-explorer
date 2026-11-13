/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

import { SdkExplorerApplication } from './app.js';
import { VersionPicker } from './version-picker.js';


$(document).ready(() => {
    // Start the application. The version picker starts once the version dropdowns are filled, before the tabs are
    // probed, so that the user can choose versions meanwhile. Without versions (their list could not be downloaded),
    // neither starts: the error toast says why.
    SdkExplorerApplication.initVersions()
        .then(versionsSelected => {
            if (!versionsSelected) {
                return;
            }
            new VersionPicker().start();
            return SdkExplorerApplication.initTabs();
        });

    // Enable Bootstrap popovers everywhere
    $('[data-bs-toggle="popover"]').popover({html:true});

    // The EU banner's "How do you know?" button shows and hides its explanation; Escape hides it again
    const $globanToggle = $('.ted-globan__toggle');
    const showGlobanExplanation = (shown) => {
        $globanToggle.attr('aria-expanded', String(shown));
        $('#ted-globan-dropdown').prop('hidden', !shown);
    };
    $globanToggle.on('click', () => showGlobanExplanation($globanToggle.attr('aria-expanded') !== 'true'));
    $(document).on('keydown', (event) => {
        if (event.key === 'Escape' && $globanToggle.attr('aria-expanded') === 'true') {
            showGlobanExplanation(false);
            $globanToggle.trigger('focus');
        }
    });

    // Keep --ted-bar-height at the height of the pinned bar, for the elements of the work area that stick under it
    const bar = document.querySelector('.ted-bar');
    new ResizeObserver(() => document.documentElement.style.setProperty('--ted-bar-height', `${bar.offsetHeight}px`)).observe(bar);

    // After a tab switch, bring the start of the work area under the pinned bar if the page was scrolled past it (the
    // new tab may be shorter than the offset it inherits); a page still at the top stays there, with the header in view
    $('ul.nav-tabs').on('shown.bs.tab', () => {
        const workAreaTop = document.querySelector('main').getBoundingClientRect().top + window.scrollY - bar.offsetHeight;
        if (window.scrollY > workAreaTop) {
            window.scrollTo({ top: workAreaTop, behavior: 'instant' });
        }
    });

    var currentStep = 0;

    // Whether an element is entirely inside the window, below the pinned bar
    const isInViewBelowBar = (element) => {
        const box = element.getBoundingClientRect();
        return box.top >= bar.offsetHeight && box.bottom <= window.innerHeight;
    };

    // Show the popover of a step, after bringing its anchor into the window below the pinned bar if it is not entirely
    // there. Once shown, if the popover itself does not fit there (it opens below its anchor), scroll just enough to
    // bring it in: its scroll margins (ted-page.css) keep it clear of the bar and of the window's edge, and Popper
    // keeps it on its anchor. An anchor in the bar, and its popover, are always in view.
    const showTourStep = (step) => {
        const anchor = document.querySelector('[data-step="' + step + '"]');
        if (!anchor) {
            return;
        }
        if (!bar.contains(anchor)) {
            if (!isInViewBelowBar(anchor)) {
                anchor.scrollIntoView({ block: 'center', behavior: 'instant' });
            }
            $(anchor).one('shown.bs.popover', () => {
                // Bootstrap names the popover in its anchor's aria-describedby while it is shown
                const popover = document.getElementById(anchor.getAttribute('aria-describedby'));
                if (popover && !isInViewBelowBar(popover)) {
                    popover.scrollIntoView({ block: 'nearest', behavior: 'instant' });
                }
            });
        }
        $(anchor).popover('show');
    };

    // Move to the next step when the "Next" button is clicked (a link: it must not take the page back to its top)
    $(document).on('click', '.next-step', function (event) {
        event.preventDefault();
        $('[data-step="' + currentStep + '"]').popover('hide');
        currentStep++;
        showTourStep(currentStep);
    });

    // Cancel the tour when the "Cancel" button is clicked
    $(document).on('click', '.cancel-tour', function (event) {
        event.preventDefault();
        $('[data-step="' + currentStep + '"]').popover('hide');
        currentStep = 0;
    });

    // Start the tour when the "Start Tour" button is clicked
    $('#start-tour').click(function (event) {
        event.preventDefault();
        $('[data-step="' + currentStep + '"]').popover('hide');
        currentStep = 0;
        showTourStep(currentStep);
    });
});

