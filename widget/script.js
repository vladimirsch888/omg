/**
 * amoCRM widget: "Service Banner"
 *
 * Shows an admin-managed text notice above the deals list (kanban/card view),
 * below the search and filter bar. The text is stored in an external
 * Node.js/Express backend (see /server) and is the same for every user of
 * the account - only an account admin can change it (see README.md for the
 * access-control notes).
 */
define(['jquery'], function ($) {
  return function () {
    var self = this;

    var BANNER_ID = 'service-banner-widget__banner';
    var POLL_INTERVAL_MS = 60000;
    var pollTimer = null;
    var lastRenderedText = null;

    // The exact markup of the deals-list page can differ between amoCRM/Kommo
    // interface versions. These selectors are tried in order; the first one
    // that matches is used as the insertion point. Verify/adjust this list
    // against the real DOM (browser devtools) after installing the widget -
    // see README.md "DOM selectors" section.
    var CONTAINER_SELECTORS = [
      '.pipeline_leads__filter',
      '.control-bar',
      '.linked-filter-container',
      '#pipeline_leads',
      '.js-pipeline-content',
      '#content'
    ];

    function log() {
      if (window.console && window.console.log) {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[service-banner-widget]');
        window.console.log.apply(window.console, args);
      }
    }

    function getConfig() {
      var settings = (self.get_settings && self.get_settings()) || {};
      return {
        apiUrl: String(settings.api_url || '').replace(/\/+$/, ''),
        token: String(settings.api_token || '')
      };
    }

    function getDomain() {
      var system = (self.system && self.system()) || {};
      return system.subdomain || '';
    }

    function findContainer() {
      for (var i = 0; i < CONTAINER_SELECTORS.length; i++) {
        var $el = $(CONTAINER_SELECTORS[i]);
        if ($el.length) {
          return $el.first();
        }
      }
      return null;
    }

    function ensureBannerNode() {
      var $existing = $('#' + BANNER_ID);
      if ($existing.length) {
        return $existing;
      }

      var $container = findContainer();
      if (!$container || !$container.length) {
        return null;
      }

      var $banner = $('<div>', {
        id: BANNER_ID,
        'class': 'service-banner-widget'
      });

      // Insert right after the matched container (i.e. directly under the
      // search/filter bar) when possible, otherwise as its first child.
      if ($container.is('#content') || $container.is('.js-pipeline-content')) {
        $container.prepend($banner);
      } else {
        $container.after($banner);
      }

      return $banner;
    }

    function renderText(text) {
      var trimmed = String(text || '').trim();
      if (trimmed === lastRenderedText) {
        return;
      }
      lastRenderedText = trimmed;

      var $banner = ensureBannerNode();
      if (!$banner) {
        return;
      }

      if (!trimmed) {
        $banner.empty();
        return;
      }

      $banner.text(trimmed);
    }

    function fetchAndRender() {
      var config = getConfig();
      var domain = getDomain();

      if (!config.apiUrl || !domain) {
        return;
      }

      $.ajax({
        url: config.apiUrl + '/api/banner',
        method: 'GET',
        data: { domain: domain },
        dataType: 'json',
        cache: false,
        timeout: 8000
      }).done(function (response) {
        renderText(response && response.text);
      }).fail(function (xhr) {
        log('failed to load banner text', xhr && xhr.status);
      });
    }

    function startPolling() {
      stopPolling();
      fetchAndRender();
      pollTimer = window.setInterval(fetchAndRender, POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    this.callbacks = {
      // Uses the manifest-defined settings fields (api_url, api_token) and
      // amoCRM's own auto-generated settings dialog - no custom UI needed
      // here. Access to Settings -> Integrations is restricted to account
      // admins by amoCRM's own permission model, which is how "only an
      // admin can configure the widget" is enforced.
      onSave: function () {
        lastRenderedText = null; // force a re-render with the new config
        fetchAndRender();
        return true;
      },

      render: function () {
        return true;
      },

      init: function () {
        startPolling();
        return true;
      },

      bind_actions: function () {
        return true;
      },

      settings: function () {
        return true;
      },

      destroy: function () {
        stopPolling();
        $('#' + BANNER_ID).remove();
      }
    };

    return this;
  };
});
