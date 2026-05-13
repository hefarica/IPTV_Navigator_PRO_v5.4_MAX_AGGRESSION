/**
 * GEN-TAB Controller V4.1
 * Accordion + APE Engine + Headers Advanced
 * @version 4.1.0
 * @description Progressive Disclosure accordion for M3U8 PRO Generator
 */

(function () {
  'use strict';

  // =====================================================
  // CONSTANTS
  // =====================================================

  const APE_LEVELS = {
    1: { name: 'NORMAL', icon: '⭐', description: 'Compatibilidad esencial', encoding: 'identity' },
    2: { name: 'PRO', icon: '⭐⭐', description: 'Evasión CORS básica', encoding: 'gzip' },
    3: { name: 'ADVANCED', icon: '⭐⭐⭐', description: 'Suplantación de dispositivo', encoding: 'gzip, deflate' },
    4: { name: 'EXTREME', icon: '⭐⭐⭐⭐', description: 'Ecosistema moderno + Client Hints', encoding: 'gzip, deflate, br' },
    5: { name: 'ULTRA', icon: '🔥', description: 'Evasión CDN agresivos', encoding: 'gzip, deflate, br, zstd' }
  };

  const STORAGE_KEY = 'gen-tab-v41-state';

  // =====================================================
  // CONTROLLER
  // =====================================================

  window.GenTabController = {

    // State
    sectionStates: {
      config: true,
      ape: false,
      headers: false,
      generate: false
    },

    formState: {
      apeMode: 'auto',
      manualLevel: 3,
      compatProfile: 'auto',
      enableClientHints: true,
      removeObsolete: true,
      autoResolveConflicts: true
    },

    telemetry: {
      success: 0,
      warnings: 0,
      errors: 0,
      avgLevel: 0
    },

    // =====================================================
    // INITIALIZATION
    // =====================================================

    init() {
      this.loadState();
      this.bindAccordionEvents();
      this.bindApeEngineEvents();
      this.bindHeadersAdvancedEvents();
      this.updateAllDisplays();
      console.log('[GenTabController] V4.1 initialized');
    },

    // =====================================================
    // ACCORDION LOGIC
    // =====================================================

    toggleAccordion(sectionId) {
      const panel = document.getElementById(`gen-tab__panel-${sectionId}`);
      const header = document.querySelector(`[data-section="${sectionId}"]`);

      if (!panel || !header) {
        console.warn(`[GenTabController] Section not found: ${sectionId}`);
        return;
      }

      const isExpanded = this.sectionStates[sectionId];

      // Toggle state
      this.sectionStates[sectionId] = !isExpanded;

      // Update ARIA
      header.setAttribute('aria-expanded', !isExpanded);

      // Animate panel
      if (!isExpanded) {
        panel.classList.add('gen-tab__panel--expanded');
        panel.style.maxHeight = panel.scrollHeight + 'px';
      } else {
        panel.classList.remove('gen-tab__panel--expanded');
        panel.style.maxHeight = '0';
      }

      this.saveState();
    },

    bindAccordionEvents() {
      const headers = document.querySelectorAll('.gen-tab__section-header');
      headers.forEach(header => {
        header.addEventListener('click', (e) => {
          const sectionId = header.dataset.section;
          if (sectionId) {
            this.toggleAccordion(sectionId);
          }
        });

        // Keyboard accessibility
        header.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const sectionId = header.dataset.section;
            if (sectionId) {
              this.toggleAccordion(sectionId);
            }
          }
        });
      });
    },

    // =====================================================
    // APE ENGINE (Fase 1)
    // =====================================================

    bindApeEngineEvents() {
      // Mode selector
      const modeSelect = document.getElementById('ape-engine__mode-select');
      if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
          this.formState.apeMode = e.target.value;
          this.updateApeLevelVisibility();
          this.saveState();
        });
      }

      // Level slider
      const levelSlider = document.getElementById('ape-engine__level-slider');
      if (levelSlider) {
        levelSlider.addEventListener('input', (e) => {
          this.formState.manualLevel = parseInt(e.target.value, 10);
          this.updateLevelDisplay();
          this.saveState();
        });
      }

      // Compression profile
      const profileSelect = document.getElementById('ape-engine__compression-profile');
      if (profileSelect) {
        profileSelect.addEventListener('change', (e) => {
          this.formState.compatProfile = e.target.value;
          this.saveState();
        });
      }
    },

    updateApeLevelVisibility() {
      const slider = document.getElementById('ape-engine__level-slider');
      const sliderContainer = document.getElementById('ape-engine__level-container');

      if (sliderContainer) {
        if (this.formState.apeMode === 'manual') {
          sliderContainer.style.display = 'flex';
          if (slider) slider.disabled = false;
        } else {
          sliderContainer.style.display = 'none';
          if (slider) slider.disabled = true;
        }
      }
    },

    updateLevelDisplay() {
      const display = document.getElementById('ape-engine__level-display');
      const level = this.formState.manualLevel;
      const info = APE_LEVELS[level];

      if (display && info) {
        display.textContent = `Nivel ${level}: ${info.name}`;
        display.title = info.description;
      }
    },

    updateCompressionDistribution(modernPct = 80, legacyPct = 20) {
      const modernBar = document.getElementById('ape-engine__bar-modern');
      const legacyBar = document.getElementById('ape-engine__bar-legacy');
      const modernValue = document.getElementById('ape-engine__value-modern');
      const legacyValue = document.getElementById('ape-engine__value-legacy');

      if (modernBar) modernBar.style.width = `${modernPct}%`;
      if (legacyBar) legacyBar.style.width = `${legacyPct}%`;
      if (modernValue) modernValue.textContent = `${modernPct}%`;
      if (legacyValue) legacyValue.textContent = `${legacyPct}%`;
    },

    updateTelemetry(stats = {}) {
      this.telemetry = { ...this.telemetry, ...stats };

      const successEl = document.getElementById('ape-engine__telemetry-success');
      const warningsEl = document.getElementById('ape-engine__telemetry-warnings');
      const errorsEl = document.getElementById('ape-engine__telemetry-errors');
      const avgLevelEl = document.getElementById('ape-engine__telemetry-avglevel');

      if (successEl) successEl.textContent = this.telemetry.success;
      if (warningsEl) warningsEl.textContent = this.telemetry.warnings;
      if (errorsEl) errorsEl.textContent = this.telemetry.errors;
      if (avgLevelEl) avgLevelEl.textContent = this.telemetry.avgLevel.toFixed(1);
    },

    // =====================================================
    // HEADERS ADVANCED (Fase 2)
    // =====================================================

    bindHeadersAdvancedEvents() {
      const toggles = [
        { id: 'headers-adv__client-hints', key: 'enableClientHints' },
        { id: 'headers-adv__remove-obsolete', key: 'removeObsolete' },
        { id: 'headers-adv__auto-resolve', key: 'autoResolveConflicts' }
      ];

      toggles.forEach(({ id, key }) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('change', (e) => {
            this.formState[key] = e.target.checked;
            this.updateHeadersStats();
            this.saveState();
          });
        }
      });
    },

    updateHeadersStats() {
      const clientHintsStatus = document.getElementById('headers-adv__status-client-hints');
      const obsoleteStatus = document.getElementById('headers-adv__status-obsolete');

      if (clientHintsStatus) {
        clientHintsStatus.textContent = this.formState.enableClientHints ? 'Enabled ✅' : 'Disabled ❌';
      }
      if (obsoleteStatus) {
        obsoleteStatus.textContent = this.formState.removeObsolete ? 'Yes ✅' : 'No ❌';
      }
    },

    // =====================================================
    // STATE PERSISTENCE
    // =====================================================

    saveState() {
      try {
        const state = {
          sectionStates: this.sectionStates,
          formState: this.formState,
          timestamp: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.warn('[GenTabController] Failed to save state:', e);
      }
    },

    loadState() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const state = JSON.parse(saved);
          this.sectionStates = { ...this.sectionStates, ...state.sectionStates };
          this.formState = { ...this.formState, ...state.formState };
          console.log('[GenTabController] State loaded from storage');
        }
      } catch (e) {
        console.warn('[GenTabController] Failed to load state:', e);
      }
    },

    // =====================================================
    // DISPLAY UPDATES
    // =====================================================

    updateAllDisplays() {
      // Restore section states
      Object.keys(this.sectionStates).forEach(sectionId => {
        const panel = document.getElementById(`gen-tab__panel-${sectionId}`);
        const header = document.querySelector(`[data-section="${sectionId}"]`);

        if (panel && header) {
          const isExpanded = this.sectionStates[sectionId];
          header.setAttribute('aria-expanded', isExpanded);

          if (isExpanded) {
            panel.classList.add('gen-tab__panel--expanded');
            panel.style.maxHeight = panel.scrollHeight + 'px';
          } else {
            panel.classList.remove('gen-tab__panel--expanded');
            panel.style.maxHeight = '0';
          }
        }
      });

      // Restore form values
      const modeSelect = document.getElementById('ape-engine__mode-select');
      if (modeSelect) modeSelect.value = this.formState.apeMode;

      const levelSlider = document.getElementById('ape-engine__level-slider');
      if (levelSlider) levelSlider.value = this.formState.manualLevel;

      const profileSelect = document.getElementById('ape-engine__compression-profile');
      if (profileSelect) profileSelect.value = this.formState.compatProfile;

      // Restore toggles
      const clientHints = document.getElementById('headers-adv__client-hints');
      if (clientHints) clientHints.checked = this.formState.enableClientHints;

      const removeObsolete = document.getElementById('headers-adv__remove-obsolete');
      if (removeObsolete) removeObsolete.checked = this.formState.removeObsolete;

      const autoResolve = document.getElementById('headers-adv__auto-resolve');
      if (autoResolve) autoResolve.checked = this.formState.autoResolveConflicts;

      // Update displays
      this.updateApeLevelVisibility();
      this.updateLevelDisplay();
      this.updateCompressionDistribution();
      this.updateHeadersStats();
      this.updateTelemetry();
    },

    // =====================================================
    // PUBLIC API
    // =====================================================

    getConfig() {
      return {
        apeMode: this.formState.apeMode,
        apeLevel: this.formState.apeMode === 'manual' ? this.formState.manualLevel : null,
        compressionProfile: this.formState.compatProfile,
        enableClientHints: this.formState.enableClientHints,
        removeObsolete: this.formState.removeObsolete,
        autoResolveConflicts: this.formState.autoResolveConflicts
      };
    },

    setTelemetry(stats) {
      this.updateTelemetry(stats);
    }
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GenTabController.init());
  } else {
    // DOM already ready
    setTimeout(() => GenTabController.init(), 100);
  }

})();
