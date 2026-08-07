/**
 * amoCRM widget: "Service Banner"
 *
 * Shows an admin-managed text notice above the deals list (kanban/card view),
 * below the search and filter bar. The text is stored directly in amoCRM's
 * own widget settings (manifest field "banner_text") - no external backend,
 * no OAuth. Only users who can open Settings -> Integrations (amoCRM's own
 * access control) can change it; every user of the account sees the same
 * text.
 *
 * Freshness note: self.get_settings() reflects the value saved at the time
 * amoCRM (re)initializes the widget for a given browser session - i.e. a
 * user already on the deals list page will see an updated text after
 * reloading the page (or navigating away from and back to the deals list),
 * not instantly. For a "service notice" style banner this is an acceptable
 * trade-off for not needing any server at all.
 */
define(['jquery'], function ($) {
  return function () {
    var self = this;

    var BANNER_ID = 'service-banner-widget__banner';

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

    function renderBanner() {
      var settings = (self.get_settings && self.get_settings()) || {};
      var text = String(settings.banner_text || '').trim();

      var $banner = ensureBannerNode();
      if (!$banner) {
        return;
      }

      if (!text) {
        $banner.empty();
        return;
      }

      $banner.text(text);
    }

    this.callbacks = {
      // Uses amoCRM's own auto-generated settings dialog for the
      // manifest-defined "banner_text" field - no custom UI needed.
      // Re-render immediately for the current session right after save.
      onSave: function () {
        renderBanner();
        return true;
      },

      render: function () {
        return true;
      },

      init: function () {
        renderBanner();
        return true;
      },

      bind_actions: function () {
        return true;
      },

      settings: function () {
        return true;
      },

      destroy: function () {
        $('#' + BANNER_ID).remove();
      }
    };

    return this;
  };
});
