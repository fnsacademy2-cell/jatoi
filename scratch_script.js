
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#eff6ff',
              100: '#dbeafe',
              500: '#3b82f6',
              600: '#2563eb',
              700: '#1d4ed8',
              800: '#1e40af',
              900: '#1e3a8a'
            }
          }
        }
      }
    };
  

    // --- Application State & Storage Key ---
    const STORAGE_KEY = 'fleet_fuel_mis_records_v1';
    const ROLE_STORAGE_KEY = 'fleet_fuel_role_v1';
    const ADMIN_PIN_KEY = 'fleet_fuel_admin_pin_v1';
    let currentUserRole = null; // 'admin', 'user', or null (landing)
    const FIREBASE_CONFIG_KEY = 'fleet_fuel_firebase_config_v1';
    const LANG_STORAGE_KEY = 'fleet_fuel_lang_v1';
    const USER_CLEARED_FLAG_KEY = 'fleet_fuel_cleared_by_user_v1';
    const DELETED_DOCS_KEY = 'fleet_fuel_deleted_ids_v1';

    // =========================================================================
    // --- CENTRAL FIREBASE CLOUD CONFIGURATION ---
    // =========================================================================
    // When you paste your Firebase credentials here, EVERY driver, mobile phone,
    // and laptop in EVERY location automatically connects to the same live
    // database without having to configure settings or enter keys on their phone!
    const DEFAULT_FIREBASE_CONFIG = {
      apiKey: "AIzaSyAURd1RlGJ1iMkjMAY_lfbWCN-na-9mIEg",
      authDomain: "aligul-d0875.firebaseapp.com",
      projectId: "aligul-d0875",
      storageBucket: "aligul-d0875.firebasestorage.app",
      messagingSenderId: "36712559408",
      appId: "1:36712559408:web:97aadfe7e8f30b0dbc0ef5",
      measurementId: "G-8B2L63YTN4"
    };

    function getDeletedRecordIds() {
      try {
        const raw = localStorage.getItem(DELETED_DOCS_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
      } catch (e) {
        return new Set();
      }
    }

    function addDeletedRecordId(id) {
      if (!id) return;
      try {
        const set = getDeletedRecordIds();
        set.add(String(id));
        localStorage.setItem(DELETED_DOCS_KEY, JSON.stringify(Array.from(set)));
      } catch (e) { }
    }

    function removeDeletedRecordId(id) {
      if (!id) return;
      try {
        const set = getDeletedRecordIds();
        set.delete(String(id));
        localStorage.setItem(DELETED_DOCS_KEY, JSON.stringify(Array.from(set)));
      } catch (e) { }
    }

    function clearDeletedRecordIds() {
      try {
        localStorage.removeItem(DELETED_DOCS_KEY);
      } catch (e) { }
    }

    let fuelRecords = [];
    let deleteTargetId = null;
    let vehicleChartInstance = null;
    let fuelTypeChartInstance = null;
    let firebaseApp = null;
    let firebaseDb = null;
    let firestoreUnsubscribe = null;
    let isFirebaseActive = false;
    let currentLang = 'en';
    let receiptLang = 'en';
    let currentReceiptRecord = null;


    // --- Robust Numeric Parser (Handles commas, strings, currency formats) ---
    function parseCleanNumber(val) {
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      if (!val) return 0;
      const cleaned = String(val).replace(/,/g, '').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }

    // --- Record Sanitizer & Multi-Device Field Defense ---
    function sanitizeRecord(rec) {
      if (!rec || typeof rec !== 'object') return null;
      const rawLiters = rec.liters ?? rec.quantity ?? rec.volume ?? rec.litres ?? 0;
      const rawRate = rec.ratePerLiter ?? rec.rate ?? rec.price ?? 0;
      const rawTotal = rec.totalCost ?? rec.amount ?? rec.total ?? rec.cost;

      const liters = parseCleanNumber(rawLiters);
      const ratePerLiter = parseCleanNumber(rawRate);
      let totalCost = parseCleanNumber(rawTotal);
      if (!totalCost && liters > 0 && ratePerLiter > 0) {
        totalCost = liters * ratePerLiter;
      }

      const rawFuel = String(rec.fuelType || rec.fuel || '').toLowerCase();
      const fuelType = (rawFuel.includes('petrol') || rawFuel.includes('پيٽرول')) ? 'Petrol' : 'Diesel';
      const id = rec.id || ('rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));

      return {
        id: String(id),
        vehiclePlate: String(rec.vehiclePlate || rec.vehicle || rec.plate || rec.plateNumber || 'FLEET').toUpperCase().trim(),
        fuelType: fuelType,
        liters: Math.max(0, liters),
        ratePerLiter: Math.max(0, ratePerLiter),
        totalCost: Math.max(0, totalCost),
        pumpStation: String(rec.pumpStation || rec.pump || rec.station || 'Station').trim(),
        driverName: String(rec.driverName || rec.driver || 'Unassigned').trim(),
        odometerReading: (rec.odometerReading || rec.odometer || rec.odo) ? parseInt(parseCleanNumber(rec.odometerReading || rec.odometer || rec.odo)) : null,
        entryDateTime: rec.entryDateTime || rec.dateTime || rec.date || new Date().toISOString().slice(0, 16),
        memoNotes: String(rec.memoNotes || rec.memo || rec.notes || '').trim(),
        createdAt: rec.createdAt || new Date().toISOString(),
        updatedAt: rec.updatedAt || new Date().toISOString()
      };
    }

    // --- On Load & Fast DOM Bootstrap ---

    // One-time cleanup: remove old hardcoded demo/sample records from localStorage
    // so they never appear on a fresh load or after being removed from code.
    (function purgeLegacyDemoRecords() {
      const DEMO_IDS = new Set(['rec_101', 'rec_102', 'rec_103', 'rec_104', 'rec_105']);
      const keysToCheck = [STORAGE_KEY, STORAGE_KEY + '_backup'];
      let purged = false;
      keysToCheck.forEach(function (key) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) return;
          // Check if ALL stored records are demo records (nothing real was added yet)
          const realRecords = parsed.filter(function (r) { return r && r.id && !DEMO_IDS.has(r.id); });
          if (realRecords.length < parsed.length) {
            // Some or all records are demo data — keep only real records
            if (realRecords.length === 0) {
              localStorage.removeItem(key);
            } else {
              localStorage.setItem(key, JSON.stringify(realRecords));
            }
            purged = true;
          }
        } catch (e) { }
      });
      if (purged) {
        console.log('[Fuel MIS] Purged legacy demo records from localStorage.');
      }
    })();

    function bootstrapApp() {
      try {
        initData();
        initLanguage();
        initDefaultDateTime();
        initCharts();
        initFirebaseFromStorage();
        updateFormCloudSyncStatus();

        // On refresh or initial load, always open in landing page view
        sessionStorage.removeItem(ROLE_STORAGE_KEY);
        currentUserRole = null;
        showLandingPage();

        // Auto-upload when device reconnects to internet
        window.addEventListener('online', function () {
          if (isFirebaseActive && firebaseDb) {
            flushOfflineSyncQueue();
          } else {
            initFirebaseFromStorage();
          }
        });

        // Periodic auto-sync check every 5 seconds for fast cross-location syncing
        setInterval(function () {
          if (isFirebaseActive && firebaseDb) {
            flushOfflineSyncQueue();
          }
        }, 5000);
      } catch (err) {
        console.error('App bootstrap error:', err);
      }
    }

    // Launch immediately when DOM is parsed - No waiting for slow CDNs!
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrapApp);
    } else {
      bootstrapApp();
    }

    // Secondary hook on window.onload to ensure charts & icons update after CDN scripts finish
    window.addEventListener('load', function () {
      initCharts();
      updateDashboard();
      filterAndRenderTable();
    });

    // Close dropdowns on outside click
    document.addEventListener('click', function (e) {
      const btn = document.getElementById('actionMenuBtn');
      const menu = document.getElementById('actionMenuDropdown');
      if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });

    // --- Data Load & Sync with Backup Protection ---
    function initData() {
      // Clear legacy cleared flag so real entered records are never blocked from displaying
      try {
        localStorage.removeItem(USER_CLEARED_FLAG_KEY);
      } catch (e) { }

      let loaded = [];
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            loaded = parsed.map(sanitizeRecord).filter(Boolean);
          }
        }
      } catch (e) {
        console.warn('Primary storage parse error:', e);
      }

      // Check backup storage ONLY if primary had valid content in past and not user-cleared
      if (loaded.length === 0) {
        try {
          const backup = localStorage.getItem(STORAGE_KEY + '_backup');
          if (backup) {
            const parsedBackup = JSON.parse(backup);
            if (Array.isArray(parsedBackup) && parsedBackup.length > 0) {
              loaded = parsedBackup.map(sanitizeRecord).filter(Boolean);
            }
          }
        } catch (e) { }
      }

      // Never auto-inject demo data into an empty database.
      fuelRecords = loaded;
    }

    function persistData() {
      try {
        const json = JSON.stringify(fuelRecords);
        localStorage.setItem(STORAGE_KEY, json);
        if (fuelRecords && fuelRecords.length > 0) {
          localStorage.setItem(STORAGE_KEY + '_backup', json);
        } else {
          localStorage.removeItem(STORAGE_KEY + '_backup');
        }
      } catch (e) {
        console.error('LocalStorage persist error:', e);
      }
    }

    function initDefaultDateTime() {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      document.getElementById('entryDateTime').value = now.toISOString().slice(0, 16);
    }

    // --- Role-Based Access Control & Landing Page System ---
    function showLandingPage() {
      currentUserRole = null;
      sessionStorage.removeItem(ROLE_STORAGE_KEY);

      // Hide core views
      ['dashboard', 'refuel', 'logs'].forEach(view => {
        const el = document.getElementById(`view-${view}`);
        if (el) el.classList.add('hidden');
      });

      // Show landing portal
      const landingElem = document.getElementById('view-landing');
      if (landingElem) landingElem.classList.remove('hidden');

      // Hide navigation headers & role indicators
      const desktopNav = document.getElementById('desktopNav');
      if (desktopNav) {
        desktopNav.className = 'hidden items-center gap-1 bg-slate-100/90 p-1 rounded-xl shrink-0 border border-slate-200/50';
      }

      const mobileNav = document.getElementById('mobileBottomNav');
      if (mobileNav) mobileNav.classList.add('hidden');

      const cloudBtn = document.getElementById('cloudStatusBtn');
      if (cloudBtn) {
        cloudBtn.classList.add('hidden');
        cloudBtn.classList.remove('inline-flex');
      }

      const actionBtn = document.getElementById('actionMenuBtn');
      if (actionBtn) {
        actionBtn.classList.add('hidden');
        actionBtn.classList.remove('inline-flex');
      }

      const headerRefuel = document.getElementById('headerRefuelBtn');
      if (headerRefuel) {
        headerRefuel.className = 'hidden bg-brand-600 text-white px-2.5 py-1 text-xs font-semibold rounded-lg items-center gap-1 shrink-0 whitespace-nowrap';
      }

      const roleBadge = document.getElementById('roleBadgeContainer');
      if (roleBadge) {
        roleBadge.classList.add('hidden');
        roleBadge.classList.remove('flex');
      }

      const exitBtn = document.getElementById('btnExitPortal');
      if (exitBtn) {
        exitBtn.classList.add('hidden');
        exitBtn.classList.remove('inline-flex');
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // --- Role Password Verification System ---
    let pendingLoginRole = null;
    const ROLE_PASSWORDS = {
      admin: 'admin123',
      user: 'user123'
    };

    function promptRoleLogin(role) {
      pendingLoginRole = role;
      const modal = document.getElementById('rolePasswordModal');
      const input = document.getElementById('rolePasswordInput');
      const err = document.getElementById('rolePasswordError');
      const title = document.getElementById('roleModalTitle');
      const sub = document.getElementById('roleModalSub');
      const icon = document.getElementById('roleModalIcon');
      const iconBox = document.getElementById('roleModalIconBox');
      const submitBtn = document.getElementById('roleModalSubmitBtn');
      const eye = document.getElementById('rolePwdEye');
      const isSd = currentLang === 'sd';

      if (input) {
        input.value = '';
        input.type = 'password';
      }
      if (err) {
        err.classList.add('hidden');
        err.textContent = '';
      }
      if (eye) {
        eye.className = 'ph-bold ph-eye text-base';
      }

      if (role === 'admin') {
        if (title) title.textContent = isSd ? 'ايڊمن پورٽل لاگ ان' : 'Admin Portal Login';
        if (sub) sub.textContent = isSd ? 'ايڊمن پاسورڊ داخل ڪريو' : 'Enter administrator password';
        if (icon) icon.className = 'ph-bold ph-shield-check';
        if (iconBox) iconBox.className = 'w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-2xl shadow-md';
        if (submitBtn) submitBtn.className = 'flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-md transition';
      } else {
        if (title) title.textContent = isSd ? 'يوزر پورٽل لاگ ان' : 'User Portal Login';
        if (sub) sub.textContent = isSd ? 'يوزر پاسورڊ داخل ڪريو' : 'Enter user access password';
        if (icon) icon.className = 'ph-bold ph-gas-pump';
        if (iconBox) iconBox.className = 'w-11 h-11 rounded-2xl bg-brand-600 text-white flex items-center justify-center text-2xl shadow-md shadow-brand-500/25';
        if (submitBtn) submitBtn.className = 'flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md shadow-brand-500/25 transition';
      }

      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => input && input.focus(), 80);
      }
    }

    function closeRolePasswordModal() {
      const modal = document.getElementById('rolePasswordModal');
      const input = document.getElementById('rolePasswordInput');
      const err = document.getElementById('rolePasswordError');
      if (input) input.value = '';
      if (err) {
        err.classList.add('hidden');
        err.textContent = '';
      }
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
      pendingLoginRole = null;
    }

    function toggleRolePasswordVisibility() {
      const input = document.getElementById('rolePasswordInput');
      const eye = document.getElementById('rolePwdEye');
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        if (eye) eye.className = 'ph-bold ph-eye-slash text-base';
      } else {
        input.type = 'password';
        if (eye) eye.className = 'ph-bold ph-eye text-base';
      }
    }

    function submitRolePassword(e) {
      if (e) e.preventDefault();
      const input = document.getElementById('rolePasswordInput');
      const err = document.getElementById('rolePasswordError');
      const pwd = input ? input.value.trim() : '';
      const isSd = currentLang === 'sd';

      if (!pendingLoginRole) return;

      const expectedPwd = ROLE_PASSWORDS[pendingLoginRole];
      if (pwd === expectedPwd) {
        const roleToLogin = pendingLoginRole;
        closeRolePasswordModal();
        if (roleToLogin === 'admin') {
          loginAsAdmin();
        } else {
          loginAsUser();
        }
      } else {
        if (err) {
          err.textContent = isSd ? 'غلط پاسورڊ! مهرباني ڪري ٻيهر ڪوشش ڪريو.' : 'Incorrect password! Please try again.';
          err.classList.remove('hidden');
        }
        if (input) {
          input.focus();
          input.select();
        }
        showToast(isSd ? 'غلط پاسورڊ!' : 'Incorrect password! Access denied.', 'error');
      }
    }

    // Close password modal on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        const modal = document.getElementById('rolePasswordModal');
        if (modal && !modal.classList.contains('hidden')) {
          closeRolePasswordModal();
        }
      }
    });

    function loginAsAdmin() {
      currentUserRole = 'admin';
      sessionStorage.setItem(ROLE_STORAGE_KEY, 'admin');
      applyRolePermissions('admin');
      switchTab('dashboard');
      showToast(currentLang === 'sd' ? 'ايڊمن پورٽل فعال ٿي ويو!' : 'Admin Portal active. Full access granted.', 'success');
    }

    function loginAsUser() {
      currentUserRole = 'user';
      sessionStorage.setItem(ROLE_STORAGE_KEY, 'user');
      applyRolePermissions('user');
      switchTab('refuel');
      showToast(currentLang === 'sd' ? 'يوزر پورٽل فعال ٿي ويو! (صرف اندراج جا حق)' : 'User Portal active (Data Entry Only).', 'info');
    }

    function exitToLanding() {
      sessionStorage.removeItem(ROLE_STORAGE_KEY);
      currentUserRole = null;
      showLandingPage();
      showToast(currentLang === 'sd' ? 'پورٽل مان ٻاهر نڪري ويا آهيو.' : 'Exited to Portal Selection.', 'info');
    }

    function applyRolePermissions(role) {
      const isSd = currentLang === 'sd';
      const desktopNav = document.getElementById('desktopNav');
      const mobileNav = document.getElementById('mobileBottomNav');
      const cloudBtn = document.getElementById('cloudStatusBtn');
      const actionBtn = document.getElementById('actionMenuBtn');
      const headerRefuel = document.getElementById('headerRefuelBtn');
      const roleBadgeContainer = document.getElementById('roleBadgeContainer');
      const roleBadgeText = document.getElementById('roleBadgeText');
      const exitBtn = document.getElementById('btnExitPortal');

      if (exitBtn) {
        exitBtn.classList.remove('hidden');
        exitBtn.classList.add('inline-flex');
      }
      if (roleBadgeContainer) {
        roleBadgeContainer.classList.remove('hidden');
        roleBadgeContainer.classList.add('flex');
      }

      if (role === 'admin') {
        if (desktopNav) {
          desktopNav.className = 'hidden md:flex items-center gap-0.5 sm:gap-1 bg-slate-100/90 p-0.5 sm:p-1 rounded-xl shrink-0 border border-slate-200/50';
        }
        if (mobileNav) mobileNav.classList.remove('hidden');
        if (cloudBtn) {
          cloudBtn.classList.remove('hidden');
          cloudBtn.classList.add('inline-flex');
        }
        if (actionBtn) {
          actionBtn.classList.remove('hidden');
          actionBtn.classList.add('inline-flex');
        }
        if (headerRefuel) {
          headerRefuel.className = 'hidden md:inline-flex bg-brand-600 hover:bg-brand-700 text-white px-2.5 py-1 text-xs font-semibold rounded-lg items-center gap-1 shadow-sm transition shrink-0 whitespace-nowrap';
        }

        if (roleBadgeText) {
          roleBadgeText.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 text-white shadow-xs';
          roleBadgeText.innerHTML = `<i class="ph-bold ph-shield-check text-emerald-400"></i><span>${isSd ? 'ايڊمن' : 'Admin'}</span>`;
        }
      } else {
        // Driver / User role (Data Entry Only)
        if (desktopNav) {
          desktopNav.className = 'hidden items-center gap-1 bg-slate-100/90 p-1 rounded-xl shrink-0 border border-slate-200/50';
        }
        if (mobileNav) mobileNav.classList.add('hidden');
        if (cloudBtn) {
          cloudBtn.classList.add('hidden');
          cloudBtn.classList.remove('inline-flex');
        }
        if (actionBtn) {
          actionBtn.classList.add('hidden');
          actionBtn.classList.remove('inline-flex');
        }
        if (headerRefuel) {
          headerRefuel.className = 'hidden bg-brand-600 text-white px-2.5 py-1 text-xs font-semibold rounded-lg items-center gap-1 shrink-0 whitespace-nowrap';
        }

        if (roleBadgeText) {
          roleBadgeText.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200';
          roleBadgeText.innerHTML = `<i class="ph-bold ph-user"></i><span>${isSd ? 'يوزر' : 'User'}</span>`;
        }
        resetForm();
      }

      filterAndRenderTable();
    }

    // --- Tab Navigation System (Desktop & Android Bottom Bar) ---
    function switchTab(tabId) {
      if (!currentUserRole) {
        showLandingPage();
        return;
      }

      if (currentUserRole === 'user' && tabId !== 'refuel') {
        showToast(currentLang === 'sd' ? 'ڊرائيور کي صرف اندراج جا اختيار آهن.' : 'Drivers only have refuel entry permissions.', 'error');
        tabId = 'refuel';
      }

      // Hide landing view whenever entering app tabs
      const landingElem = document.getElementById('view-landing');
      if (landingElem) landingElem.classList.add('hidden');
      const views = ['dashboard', 'refuel', 'logs'];
      views.forEach(view => {
        const viewElem = document.getElementById(`view-${view}`);
        const navBtn = document.getElementById(`nav-${view}`);
        const mNavBtn = document.getElementById(`mobile-nav-${view}`);
        const mPill = document.getElementById(`mobile-pill-${view}`);
        const isActive = view === tabId;

        if (isActive) {
          viewElem.classList.remove('hidden');
          if (navBtn) {
            navBtn.classList.add('bg-white', 'text-brand-600', 'shadow-sm');
            navBtn.classList.remove('text-slate-600');
          }
          if (mNavBtn) {
            if (view === 'refuel') {
              if (mPill) mPill.className = 'w-14 h-14 rounded-2xl bg-brand-700 text-white shadow-xl shadow-brand-600/50 border-4 border-white flex items-center justify-center text-2xl ring-2 ring-brand-400 group-active:scale-90 transition-all';
            } else {
              mNavBtn.className = 'flex flex-col items-center justify-center flex-1 py-1 px-1 text-brand-600 transition-colors group';
              if (mPill) mPill.className = 'w-14 h-8 rounded-full flex items-center justify-center transition-all bg-brand-100 text-brand-700 group-active:scale-95';
            }
          }
        } else {
          viewElem.classList.add('hidden');
          if (navBtn) {
            navBtn.classList.remove('bg-white', 'text-brand-600', 'shadow-sm');
            navBtn.classList.add('text-slate-600');
          }
          if (mNavBtn) {
            if (view === 'refuel') {
              if (mPill) mPill.className = 'w-14 h-14 rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-500/40 border-4 border-white flex items-center justify-center text-2xl group-active:scale-90 transition-all';
            } else {
              mNavBtn.className = 'flex flex-col items-center justify-center flex-1 py-1 px-1 text-slate-400 hover:text-slate-600 transition-colors group';
              if (mPill) mPill.className = 'w-14 h-8 rounded-full flex items-center justify-center transition-all bg-transparent group-active:scale-95';
            }
          }
        }
      });

      if (tabId === 'dashboard') {
        updateDashboard();
        if (vehicleChartInstance) vehicleChartInstance.resize();
        if (fuelTypeChartInstance) fuelTypeChartInstance.resize();
      } else if (tabId === 'logs') {
        filterAndRenderTable();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // --- Calculation Helpers ---
    function calculateTotalCost() {
      const liters = parseFloat(document.getElementById('liters').value) || 0;
      const rate = parseFloat(document.getElementById('ratePerLiter').value) || 0;
      const total = liters * rate;
      document.getElementById('totalCost').value = total > 0 ? total.toFixed(2) : '';
    }

    // --- Form Management (Create / Update) ---
    function handleFormSubmit(e) {
      e.preventDefault();

      try {
        localStorage.removeItem(USER_CLEARED_FLAG_KEY);
      } catch (e) { }

      const editId = document.getElementById('editEntryId').value;

      if (editId && currentUserRole !== 'admin') {
        showToast(currentLang === 'sd' ? 'صرف ايڊمن رڪارڊ تبديل ڪري سگهي ٿو.' : 'Access Denied: Only Admin can edit records.', 'error');
        resetForm();
        return;
      }
      const vehiclePlate = document.getElementById('vehiclePlate').value.trim().toUpperCase();
      const fuelType = document.getElementById('fuelType').value;
      const liters = parseFloat(document.getElementById('liters').value);
      const ratePerLiter = parseFloat(document.getElementById('ratePerLiter').value);
      const totalCost = parseFloat(document.getElementById('totalCost').value) || (liters * ratePerLiter);
      const pumpStation = document.getElementById('pumpStation').value.trim();
      const driverName = document.getElementById('driverName').value.trim() || 'Unassigned';
      const odometerReading = document.getElementById('odometerReading').value ? parseInt(document.getElementById('odometerReading').value) : null;
      const entryDateTime = document.getElementById('entryDateTime').value;
      const memoNotes = document.getElementById('memoNotes').value.trim();

      if (!vehiclePlate || !fuelType || isNaN(liters) || isNaN(ratePerLiter) || !pumpStation || !entryDateTime) {
        showToast('Please fill all mandatory fields properly.', 'error');
        return;
      }

      let savedRecordId = editId;
      if (editId) {
        // Updating existing entry (Instant Local Update + Auto Cloud Upload)
        const updatedRecord = {
          id: editId,
          vehiclePlate,
          fuelType,
          liters,
          ratePerLiter,
          totalCost,
          pumpStation,
          driverName,
          odometerReading,
          entryDateTime,
          memoNotes,
          updatedAt: new Date().toISOString()
        };

        removeDeletedRecordId(editId);
        addToOfflineSyncQueue(editId);

        const idx = fuelRecords.findIndex(r => r.id === editId);
        if (idx !== -1) {
          fuelRecords[idx] = updatedRecord;
          persistData();
          updateDashboard();
          filterAndRenderTable();
        }

        autoUploadRecordToCloud(updatedRecord, true);
      } else {
        // New entry creation (Instant Local Update + Auto Cloud Upload)
        const newRecord = {
          id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          vehiclePlate,
          fuelType,
          liters,
          ratePerLiter,
          totalCost,
          pumpStation,
          driverName,
          odometerReading,
          entryDateTime,
          memoNotes,
          createdAt: new Date().toISOString()
        };

        removeDeletedRecordId(newRecord.id);
        addToOfflineSyncQueue(newRecord.id);

        fuelRecords.unshift(newRecord);
        persistData();
        updateDashboard();
        filterAndRenderTable();

        autoUploadRecordToCloud(newRecord, false);
      }

      // Display confirmation message directly on the Save button
      const submitBtn = document.getElementById('submitBtn');
      const isSd = currentLang === 'sd';
      const successMsg = editId
        ? (isSd ? 'ڊيٽا اپڊيٽ ٿي وئي!' : 'Data Updated Successfully!')
        : (isSd ? 'ڊيٽا داخل ٿي وئي!' : 'Data Entered Successfully!');

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.className = 'px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold shadow-md flex items-center gap-2';
        submitBtn.innerHTML = `<i class="ph-bold ph-check-circle text-lg"></i><span>${successMsg}</span>`;
      }

      if (!savedRecordId && typeof newRecord !== 'undefined' && newRecord) {
        savedRecordId = newRecord.id;
      }
      setTimeout(() => {
        resetForm();
        if (currentUserRole === 'user') {
          if (savedRecordId) openReceiptModal(savedRecordId);
        } else {
          switchTab('dashboard');
        }
      }, 1200);
    }

    function resetForm() {
      document.getElementById('refuelForm').reset();
      document.getElementById('editEntryId').value = '';
      const isSd = currentLang === 'sd';
      document.getElementById('formHeaderTitle').textContent = isSd ? 'تيل ڀرائڻ جو نئون اندراج' : 'New Refuel Log Entry';

      const submitBtn = document.getElementById('submitBtn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.className = 'px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-md transition flex items-center gap-2';
        submitBtn.innerHTML = `<i class="ph-bold ph-cloud-arrow-up text-base"></i><span id="submitBtnText" data-i18n="btnSave">${isSd ? 'اندراج محفوظ ڪريو' : 'Save Refuel Entry'}</span>`;
      }
      initDefaultDateTime();
    }

    function editEntry(id) {
      if (currentUserRole !== 'admin') {
        showToast(currentLang === 'sd' ? 'صرف ايڊمن رڪارڊ ايڊٽ ڪري سگهي ٿو.' : 'Access Denied: Only Admin can edit records.', 'error');
        return;
      }
      const record = fuelRecords.find(r => r.id === id);
      if (!record) return;

      document.getElementById('editEntryId').value = record.id;
      document.getElementById('vehiclePlate').value = record.vehiclePlate;
      document.getElementById('fuelType').value = record.fuelType;
      document.getElementById('liters').value = record.liters;
      document.getElementById('ratePerLiter').value = record.ratePerLiter;
      document.getElementById('totalCost').value = record.totalCost.toFixed(2);
      document.getElementById('pumpStation').value = record.pumpStation;
      document.getElementById('driverName').value = record.driverName === 'Unassigned' ? '' : record.driverName;
      document.getElementById('odometerReading').value = record.odometerReading || '';
      document.getElementById('entryDateTime').value = record.entryDateTime;
      document.getElementById('memoNotes').value = record.memoNotes || '';

      document.getElementById('formHeaderTitle').textContent = `Edit Refuel: ${record.vehiclePlate}`;
      const submitBtn = document.getElementById('submitBtn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.className = 'px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-md transition flex items-center gap-2';
        submitBtn.innerHTML = `<i class="ph-bold ph-check text-base"></i><span id="submitBtnText">${currentLang === 'sd' ? 'رڪارڊ تبديل ڪريو' : 'Update Record'}</span>`;
      }

      switchTab('refuel');
    }

    // --- Deletion Flow ---
    function openDeleteModal(id) {
      if (currentUserRole !== 'admin') {
        showToast(currentLang === 'sd' ? 'صرف ايڊمن رڪارڊ ڊيليٽ ڪري سگهي ٿو.' : 'Access Denied: Only Admin can delete records.', 'error');
        return;
      }
      deleteTargetId = id;
      const modal = document.getElementById('deleteModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeDeleteModal() {
      deleteTargetId = null;
      const modal = document.getElementById('deleteModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function executeDelete() {
      if (currentUserRole !== 'admin') {
        showToast(currentLang === 'sd' ? 'صرف ايڊمن رڪارڊ ڊيليٽ ڪري سگهي ٿو.' : 'Access Denied: Only Admin can delete records.', 'error');
        closeDeleteModal();
        return;
      }
      if (!deleteTargetId) return;
      const targetId = deleteTargetId;
      addDeletedRecordId(targetId);
      removeFromOfflineSyncQueue(targetId);
      fuelRecords = fuelRecords.filter(r => r.id !== targetId);
      persistData();
      closeDeleteModal();
      updateDashboard();
      filterAndRenderTable();

      let db = firebaseDb;
      if (!db && window.firebase) {
        const storedFb = localStorage.getItem(FIREBASE_CONFIG_KEY);
        if (storedFb) {
          try {
            const cfg = JSON.parse(storedFb);
            if (!firebase.apps || !firebase.apps.length) {
              firebaseApp = firebase.initializeApp(cfg);
            } else {
              firebaseApp = firebase.app();
            }
            firebaseDb = firebaseApp.firestore();
            db = firebaseDb;
          } catch (e) { }
        }
      }

      if (db) {
        db.collection('fuel_records').doc(targetId).delete()
          .then(() => showToast('Record deleted locally & removed from Cloud.', 'info'))
          .catch(err => {
            console.error('Cloud delete failed:', err);
            showToast('Deleted locally. Cloud sync pending: ' + err.message, 'warning');
          });
      } else {
        showToast('Record deleted.', 'info');
      }
    }

    async function confirmClearAll() {
      toggleActionMenu();
      const isSd = currentLang === 'sd';
      const promptMsg = isSd
        ? 'ڇا توھان سڀ ڊيٽا ختم ڪرڻ چاھيو ٿا؟\nهي لوڪل ڊيٽابيس، سيمپل رڪارڊ، ۽ ڪلائوڊ مان سمورو رڪارڊ مڪمل طور تي صاف ڪري ڇڏيندو.'
        : 'Are you sure you want to clear ALL data?\nThis will permanently delete all sample data, local database records, and cloud database records from all locations.';

      if (!confirm(promptMsg)) return;

      // 1. Immediately mark user-cleared flag and clear local state
      try {
        localStorage.setItem(USER_CLEARED_FLAG_KEY, 'true');
        localStorage.setItem(STORAGE_KEY, '[]');
        localStorage.removeItem(STORAGE_KEY + '_backup');
        localStorage.removeItem(OFFLINE_SYNC_QUEUE_KEY);
        clearDeletedRecordIds();
      } catch (e) {
        console.error('LocalStorage clear error:', e);
      }

      fuelRecords = [];

      // Reset Charts to 0
      if (vehicleChartInstance) {
        vehicleChartInstance.data.labels = [];
        vehicleChartInstance.data.datasets[0].data = [];
        vehicleChartInstance.update();
      }
      if (fuelTypeChartInstance) {
        fuelTypeChartInstance.data.datasets[0].data = [0, 0];
        fuelTypeChartInstance.update();
      }

      updateDashboard();
      filterAndRenderTable();
      updateFormCloudSyncStatus();

      // 2. Identify or initialize Firestore database connection
      let db = firebaseDb;
      if (!db && window.firebase) {
        let cfg = null;
        const storedFb = localStorage.getItem(FIREBASE_CONFIG_KEY);
        if (storedFb) {
          try { cfg = JSON.parse(storedFb); } catch (e) { }
        }
        if (!cfg && DEFAULT_FIREBASE_CONFIG && DEFAULT_FIREBASE_CONFIG.apiKey && DEFAULT_FIREBASE_CONFIG.projectId) {
          cfg = DEFAULT_FIREBASE_CONFIG;
        }
        if (cfg) {
          try {
            if (!firebase.apps || !firebase.apps.length) {
              firebaseApp = firebase.initializeApp(cfg);
            } else {
              firebaseApp = firebase.app();
            }
            firebaseDb = firebaseApp.firestore();
            db = firebaseDb;
          } catch (e) { }
        }
      }

      let cloudCleared = false;
      let cloudError = null;

      // 3. Delete from Firebase Cloud Firestore
      if (db) {
        try {
          showToast(isSd ? 'ڪلائوڊ مان رڪارڊ صاف ٿي رهيا آهن...' : 'Deleting all records from Cloud...', 'info');

          // Fetch all documents currently in the cloud collection
          const snapshot = await db.collection('fuel_records').get();
          if (!snapshot.empty) {
            let batch = db.batch();
            let count = 0;
            for (const doc of snapshot.docs) {
              batch.delete(doc.ref);
              count++;
              if (count % 400 === 0) {
                await batch.commit();
                batch = db.batch();
              }
            }
            await batch.commit();
          }

          cloudCleared = true;
        } catch (e) {
          console.error('Error clearing cloud collection:', e);
          cloudError = e.message;
        }
      }

      // 4. User feedback
      if (cloudError) {
        showToast(
          isSd
            ? `لوڪل ۽ سيمپل ڊيٽا صاف ٿي ويو، پر ڪلائوڊ نقص: ${cloudError}`
            : `Local & sample data cleared, but Cloud error: ${cloudError}`,
          'warning'
        );
      } else if (cloudCleared) {
        showToast(
          isSd
            ? 'سمورو ڊيٽا ڪاميابي سان ختم ڪيو ويو (لوڪل، ڪلائوڊ ۽ سيمپل رڪارڊ صاف)!'
            : 'All data cleared successfully (Local, Cloud & Sample data removed)!',
          'success'
        );
      } else {
        showToast(
          isSd
            ? 'سمورو لوڪل ڊيٽابيس ۽ سيمپل رڪارڊ صاف ڪيو ويو!'
            : 'All local database and sample records cleared!',
          'success'
        );
      }
    }


    // --- Dashboard & Analytics Computation ---
    function updateDashboard() {
      let totalCost = 0;
      let totalPetrolLiters = 0;
      let petrolCost = 0;
      let totalDieselLiters = 0;
      let dieselCost = 0;
      let weightedRateSum = 0;
      const vehicleSet = new Set();
      const vehicleCostMap = {};
      const vehicleDriversMap = {};

      (fuelRecords || []).forEach(rec => {
        if (!rec) return;
        const liters = parseCleanNumber(rec.liters);
        const rate = parseCleanNumber(rec.ratePerLiter);
        const cost = parseCleanNumber(rec.totalCost) || (liters * rate) || 0;
        const plate = String(rec.vehiclePlate || 'FLEET').toUpperCase().trim();
        const fuelType = String(rec.fuelType || '').toLowerCase();

        totalCost += cost;
        weightedRateSum += rate;
        vehicleSet.add(plate);

        if (fuelType.includes('petrol') || fuelType.includes('پيٽرول')) {
          totalPetrolLiters += liters;
          petrolCost += cost;
        } else {
          totalDieselLiters += liters;
          dieselCost += cost;
        }

        // Aggregate for vehicle chart
        vehicleCostMap[plate] = (vehicleCostMap[plate] || 0) + cost;

        if (!vehicleDriversMap[plate]) {
          vehicleDriversMap[plate] = [];
        }
        const dName = rec.driverName && rec.driverName !== 'Unassigned' ? String(rec.driverName).trim() : '';
        if (dName && !vehicleDriversMap[plate].includes(dName)) {
          vehicleDriversMap[plate].push(dName);
        }
      });

      const totalLiters = totalPetrolLiters + totalDieselLiters;
      const avgRate = totalLiters > 0 ? (totalCost / totalLiters) : 0;

      const isSd = currentLang === 'sd';
      const cur = isSd ? 'رپيا ' : 'PKR ';
      const lit = isSd ? ' ليٽر' : ' L';
      const uniqueSuffix = isSd ? ' گاڏيون' : ' Unique Vehicles';
      const spendPrefix = isSd ? 'خرچ: ' : 'Spend: ';

      // Update KPI DOM elements
      document.getElementById('kpi-total-cost').textContent = `${cur}${totalCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      document.getElementById('kpi-total-petrol').textContent = `${totalPetrolLiters.toFixed(1)}${lit}`;
      document.getElementById('kpi-petrol-cost').textContent = `${spendPrefix}${cur}${petrolCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
      document.getElementById('kpi-total-diesel').textContent = `${totalDieselLiters.toFixed(1)}${lit}`;
      document.getElementById('kpi-diesel-cost').textContent = `${spendPrefix}${cur}${dieselCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
      document.getElementById('kpi-total-entries').textContent = fuelRecords.length;
      document.getElementById('kpi-unique-vehicles').textContent = `${vehicleSet.size}${uniqueSuffix}`;
      document.getElementById('kpi-avg-rate').textContent = `${cur}${avgRate.toFixed(2)}`;

      // Render recent 5 logs in dashboard
      const recentRows = document.getElementById('dashboardRecentRows');
      recentRows.innerHTML = '';
      const recentFive = [...(fuelRecords || [])].sort((a, b) => new Date(b.entryDateTime || 0) - new Date(a.entryDateTime || 0)).slice(0, 5);

      if (recentFive.length === 0) {
        recentRows.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">${isSd ? 'ڪو به تازو رڪارڊ ناهي.' : 'No recent refuel transactions.'}</td></tr>`;
      } else {
        recentFive.forEach(rec => {
          const cost = parseFloat(rec.totalCost) || 0;
          const liters = parseFloat(rec.liters) || 0;
          const row = document.createElement('tr');
          row.className = 'hover:bg-slate-50 transition';
          row.innerHTML = `
            <td class="py-3 px-4 text-slate-500 whitespace-nowrap">${formatDate(rec.entryDateTime)}</td>
            <td class="py-3 px-4 font-bold text-slate-900">${rec.vehiclePlate || 'FLEET'}</td>
            <td class="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">
              <span class="inline-flex items-center gap-1.5">
                <i class="ph-bold ph-user text-slate-400"></i>
                ${rec.driverName || (isSd ? 'مقرر نه ٿيل' : 'Unassigned')}
              </span>
            </td>
            <td class="py-3 px-4">
              <span class="inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${rec.fuelType === 'Petrol' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}">
                ${rec.fuelType === 'Petrol' ? (isSd ? 'پيٽرول' : 'Petrol') : (isSd ? 'ڊيزل' : 'Diesel')}
              </span>
            </td>
            <td class="py-3 px-4 font-medium">${liters.toFixed(1)}${lit}</td>
            <td class="py-3 px-4 text-slate-600 truncate max-w-[180px]">${rec.pumpStation || 'Station'}</td>
            <td class="py-3 px-4 text-right font-bold text-slate-900">${cur}${cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td class="py-3 px-4 text-center">
              <button onclick="openReceiptModal('${rec.id}')" title="${isSd ? 'رسيد / واؤچر ڏسو' : 'View / Screenshot Receipt'}" class="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition">
                <i class="ph-bold ph-receipt text-base"></i>
              </button>
            </td>
          `;
          recentRows.appendChild(row);
        });
      }

      // Update Charts
      updateCharts(vehicleCostMap, vehicleDriversMap, totalPetrolLiters, totalDieselLiters);
    }

    // --- Chart.js Visualizations ---
    let chartInitRetryCount = 0;
    function initCharts() {
      if (typeof Chart === 'undefined') {
        if (chartInitRetryCount < 15) {
          chartInitRetryCount++;
          setTimeout(initCharts, 350);
        }
        return;
      }
      if (vehicleChartInstance && fuelTypeChartInstance) return;
      try {
        // Vehicle Expenditure Bar Chart
        const canvasVehicles = document.getElementById('vehicleCostChart');
        if (canvasVehicles) {
          const ctxVehicles = canvasVehicles.getContext('2d');
          vehicleChartInstance = new Chart(ctxVehicles, {
            type: 'bar',
            data: {
              labels: [],
              datasets: [{
                label: 'Total Spend (PKR)',
                data: [],
                backgroundColor: '#3b82f6',
                borderRadius: 8,
                borderSkipped: false
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    title: function (items) {
                      if (!items || !items.length) return '';
                      const rawLabel = items[0].chart.data.labels[items[0].dataIndex];
                      if (Array.isArray(rawLabel)) {
                        return `${rawLabel[0]} • Driver: ${rawLabel[1].replace(/[()]/g, '')}`;
                      }
                      return rawLabel;
                    },
                    label: function (context) {
                      return ` Total Fuel Spend: PKR ${context.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                    }
                  }
                }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  grid: { color: '#f1f5f9' },
                  ticks: {
                    font: { family: 'Inter', size: 10 }
                  }
                },
                x: {
                  grid: { display: false },
                  ticks: {
                    font: { family: 'Inter', size: 11, weight: 'bold' }
                  }
                }
              }
            }
          });
        }

        // Petrol vs Diesel Doughnut Chart
        const canvasFuel = document.getElementById('fuelTypeChart');
        if (canvasFuel) {
          const ctxFuel = canvasFuel.getContext('2d');
          fuelTypeChartInstance = new Chart(ctxFuel, {
            type: 'doughnut',
            data: {
              labels: ['Petrol', 'Diesel'],
              datasets: [{
                data: [0, 0],
                backgroundColor: ['#f59e0b', '#3b82f6'],
                borderWidth: 3,
                borderColor: '#ffffff',
                hoverOffset: 4
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: {
                    boxWidth: 12,
                    font: { family: 'Inter', size: 12, weight: 600 }
                  }
                },
                tooltip: {
                  callbacks: {
                    label: function (context) {
                      return ` ${context.label}: ${context.parsed.toFixed(1)} Liters`;
                    }
                  }
                }
              },
              cutout: '70%'
            }
          });
        }
      } catch (err) {
        console.error('Error initializing charts:', err);
      }
    }

    function updateCharts(vehicleCostMap, vehicleDriversMap, petrolLiters, dieselLiters) {
      if (!vehicleChartInstance || !fuelTypeChartInstance) return;

      // Update Bar Chart
      const vehiclePlates = Object.keys(vehicleCostMap);
      const vehicleCosts = Object.values(vehicleCostMap);

      const labels = vehiclePlates.map(plate => {
        const drivers = vehicleDriversMap && vehicleDriversMap[plate] ? vehicleDriversMap[plate] : [];
        const driverName = drivers.length > 0 ? drivers.join(', ') : 'Unassigned';
        return [plate, `(${driverName})`];
      });

      vehicleChartInstance.data.labels = labels.length > 0 ? labels : ['No Data'];
      vehicleChartInstance.data.datasets[0].data = vehicleCosts.length > 0 ? vehicleCosts : [0];
      vehicleChartInstance.update();

      // Update Doughnut Chart
      fuelTypeChartInstance.data.datasets[0].data = [petrolLiters, dieselLiters];
      fuelTypeChartInstance.update();
    }

    // --- Search, Filtering & Table View ---
    function filterAndRenderTable() {
      const searchInput = document.getElementById('tableSearch');
      const fuelSelect = document.getElementById('fuelFilter');
      const startInput = document.getElementById('dateFilterStart');
      const endInput = document.getElementById('dateFilterEnd');

      const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
      const fuelFilter = fuelSelect ? fuelSelect.value : 'ALL';
      const startDate = startInput ? startInput.value : '';
      const endDate = endInput ? endInput.value : '';

      const filtered = (fuelRecords || []).filter(rec => {
        if (!rec) return false;
        const vPlate = String(rec.vehiclePlate || '').toLowerCase();
        const pStation = String(rec.pumpStation || '').toLowerCase();
        const dName = String(rec.driverName || '').toLowerCase();
        const memo = String(rec.memoNotes || '').toLowerCase();

        // Search matches Vehicle, Pump, Driver, or Memo
        const matchSearch = !searchTerm ||
          vPlate.includes(searchTerm) ||
          pStation.includes(searchTerm) ||
          dName.includes(searchTerm) ||
          memo.includes(searchTerm);

        // Fuel Type filter
        const matchFuel = fuelFilter === 'ALL' || rec.fuelType === fuelFilter;

        // Date range
        let matchDate = true;
        if (startDate && rec.entryDateTime) {
          matchDate = matchDate && (rec.entryDateTime.slice(0, 10) >= startDate);
        }
        if (endDate && rec.entryDateTime) {
          matchDate = matchDate && (rec.entryDateTime.slice(0, 10) <= endDate);
        }

        return matchSearch && matchFuel && matchDate;
      });

      // Sort chronological descending
      filtered.sort((a, b) => new Date(b.entryDateTime || 0) - new Date(a.entryDateTime || 0));

      const tbody = document.getElementById('logsTableBody');
      const mobileCards = document.getElementById('logsMobileCards');
      const emptyState = document.getElementById('tableEmptyState');
      if (tbody) tbody.innerHTML = '';
      if (mobileCards) mobileCards.innerHTML = '';

      let totalFilteredAmount = 0;
      const cur = currentLang === 'sd' ? 'رپيا ' : 'PKR ';
      const isSd = currentLang === 'sd';

      if (filtered.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
      } else {
        if (emptyState) emptyState.classList.add('hidden');
        filtered.forEach(rec => {
          const cost = parseFloat(rec.totalCost) || 0;
          const litersVal = parseFloat(rec.liters) || 0;
          const rateVal = parseFloat(rec.ratePerLiter) || 0;
          totalFilteredAmount += cost;
          const fuelLabel = rec.fuelType === 'Petrol' ? (isSd ? 'پيٽرول' : 'Petrol') : (isSd ? 'ڊيزل' : 'Diesel');
          const driverLabel = rec.driverName || (isSd ? 'مقرر نه ٿيل' : 'Unassigned');

          // 1. Desktop Table Row
          if (tbody) {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition border-b border-slate-100';
            tr.innerHTML = `
              <td class="py-3 px-4 whitespace-nowrap text-slate-500 font-medium">
                ${formatDate(rec.entryDateTime)}
              </td>
              <td class="py-3 px-4">
                <span class="font-bold text-slate-900 tracking-wide">${rec.vehiclePlate || 'FLEET'}</span>
                ${rec.memoNotes ? `<p class="text-[11px] text-slate-400 truncate max-w-[140px]">${rec.memoNotes}</p>` : ''}
              </td>
              <td class="py-3 px-4 whitespace-nowrap">
                <span class="inline-flex items-center gap-1.5 font-medium text-slate-800">
                  <i class="ph-bold ph-user text-slate-400"></i>
                  ${driverLabel}
                </span>
              </td>
              <td class="py-3 px-4">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${rec.fuelType === 'Petrol' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}">
                  ${fuelLabel}
                </span>
              </td>
              <td class="py-3 px-4 font-semibold text-slate-800">${litersVal.toFixed(2)}</td>
              <td class="py-3 px-4 text-slate-600">${cur}${rateVal.toFixed(2)}</td>
              <td class="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">${cur}${cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              <td class="py-3 px-4 text-slate-700">${rec.pumpStation || 'Station'}</td>
              <td class="py-3 px-4 text-slate-600 whitespace-nowrap">
                ${rec.odometerReading ? `<span class="inline-flex items-center gap-1"><i class="ph-bold ph-gauge text-slate-400"></i> ${rec.odometerReading.toLocaleString()} ${isSd ? 'ڪلوميٽر' : 'Km'}</span>` : `<span class="text-slate-400 text-xs">${isSd ? 'ميٽر ناهي' : 'No Km'}</span>`}
              </td>
              <td class="py-3 px-4 text-center whitespace-nowrap">
                <div class="inline-flex items-center gap-1.5">
                  <button onclick="openReceiptModal('${rec.id}')" title="${isSd ? 'رسيد ڏسو / تصوير ڪڍو' : 'View / Screenshot Receipt'}" class="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition">
                    <i class="ph-bold ph-receipt text-base"></i>
                  </button>
                  ${currentUserRole === 'admin' ? `
                  <button onclick="editEntry('${rec.id}')" title="Edit Entry" class="p-1.5 rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-50 transition">
                    <i class="ph-bold ph-pencil-simple text-base"></i>
                  </button>
                  <button onclick="openDeleteModal('${rec.id}')" title="Delete Entry" class="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition">
                    <i class="ph-bold ph-trash text-base"></i>
                  </button>
                  ` : ''}
                </div>
              </td>
            `;
            tbody.appendChild(tr);
          }

          // 2. Mobile Android Material Card
          if (mobileCards) {
            const card = document.createElement('div');
            card.className = 'p-4 hover:bg-slate-50/90 active:bg-slate-100 transition border-b border-slate-100 space-y-2.5';
            const receiptText = isSd ? 'رسيد' : 'Receipt';
            const odoBadge = rec.odometerReading ? `<span class="inline-flex items-center gap-1 text-[11px] text-slate-500"><i class="ph-bold ph-gauge text-slate-400"></i> ${rec.odometerReading.toLocaleString()} ${isSd ? 'ڪلوميٽر' : 'Km'}</span>` : '';

            card.innerHTML = `
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono font-bold text-xs tracking-wider shadow-xs">
                    ${rec.vehiclePlate || 'FLEET'}
                  </span>
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${rec.fuelType === 'Petrol' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}">
                    ${fuelLabel}
                  </span>
                </div>
                <div class="text-right rtl:text-left">
                  <span class="text-base font-extrabold text-slate-900 font-mono tracking-tight">${cur}${cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-1.5 text-xs text-slate-600">
                <div class="flex items-center gap-1.5 truncate">
                  <i class="ph-bold ph-user text-slate-400 shrink-0"></i>
                  <span class="truncate font-semibold text-slate-800">${driverLabel}</span>
                </div>
                <div class="flex items-center gap-1.5 justify-end rtl:justify-start text-slate-400 text-[11px]">
                  <i class="ph-bold ph-calendar shrink-0"></i>
                  <span>${formatDate(rec.entryDateTime)}</span>
                </div>
                <div class="flex items-center gap-1.5 truncate">
                  <i class="ph-bold ph-gas-pump text-slate-400 shrink-0"></i>
                  <span class="truncate text-slate-700">${rec.pumpStation || 'Station'}</span>
                </div>
                <div class="flex items-center gap-1.5 justify-end rtl:justify-start font-medium text-slate-700">
                  <span>${litersVal.toFixed(2)} L @ ${rateVal.toFixed(1)}</span>
                </div>
              </div>

              ${rec.memoNotes ? `<p class="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 truncate"><i class="ph-bold ph-note text-slate-400 mr-1"></i>${rec.memoNotes}</p>` : ''}

              <div class="flex items-center justify-between pt-1 border-t border-slate-50 text-xs">
                <div>${odoBadge}</div>
                <div class="flex items-center gap-1.5">
                  <button onclick="openReceiptModal('${rec.id}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs active:bg-emerald-100 transition shadow-xs">
                    <i class="ph-bold ph-receipt text-sm"></i>
                    <span>${receiptText}</span>
                  </button>
                  ${currentUserRole === 'admin' ? `
                  <button onclick="editEntry('${rec.id}')" class="p-2 rounded-lg text-slate-600 hover:text-brand-600 active:bg-slate-100 transition" title="Edit">
                    <i class="ph-bold ph-pencil-simple text-base"></i>
                  </button>
                  <button onclick="openDeleteModal('${rec.id}')" class="p-2 rounded-lg text-slate-600 hover:text-rose-600 active:bg-rose-50 transition" title="Delete">
                    <i class="ph-bold ph-trash text-base"></i>
                  </button>
                  ` : ''}
                </div>
              </div>
            `;
            mobileCards.appendChild(card);
          }
        });
      }

      document.getElementById('filteredCountText').textContent = filtered.length;
      const totalWord = currentLang === 'sd' ? 'ڪل: ' : 'Total: ';
      document.getElementById('filteredCostText').textContent = `${totalWord}${cur}${totalFilteredAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    function resetTableFilters() {
      document.getElementById('tableSearch').value = '';
      document.getElementById('fuelFilter').value = 'ALL';
      document.getElementById('dateFilterStart').value = '';
      document.getElementById('dateFilterEnd').value = '';
      filterAndRenderTable();
    }

    // --- Export / Import Utilities ---
    function toggleActionMenu(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const menu = document.getElementById('actionMenuDropdown');
      if (menu) {
        menu.classList.toggle('hidden');
      }
    }

    function exportToCSV() {
      toggleActionMenu();
      if (fuelRecords.length === 0) {
        showToast('No records to export!', 'error');
        return;
      }

      const headers = ['Record ID', 'Vehicle Plate', 'Fuel Type', 'Quantity (Liters)', 'Rate Per Liter', 'Total Cost', 'Pump Station', 'Driver', 'Odometer Reading', 'DateTime', 'Notes'];
      const csvRows = [headers.join(',')];

      fuelRecords.forEach(r => {
        const row = [
          `"${r.id}"`,
          `"${r.vehiclePlate}"`,
          `"${r.fuelType}"`,
          r.liters,
          r.ratePerLiter,
          r.totalCost,
          `"${(r.pumpStation || '').replace(/"/g, '""')}"`,
          `"${(r.driverName || '').replace(/"/g, '""')}"`,
          r.odometerReading || '',
          `"${r.entryDateTime}"`,
          `"${(r.memoNotes || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
      });

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      downloadFile(blob, `Fleet_Fuel_MIS_Export_${new Date().toISOString().slice(0, 10)}.csv`);
      showToast('CSV export downloaded.', 'success');
    }

    function exportToJSON() {
      toggleActionMenu();
      const blob = new Blob([JSON.stringify(fuelRecords, null, 2)], { type: 'application/json' });
      downloadFile(blob, `Fleet_Fuel_MIS_Backup_${new Date().toISOString().slice(0, 10)}.json`);
      showToast('Database JSON backup created.', 'success');
    }

    function importFromJSON(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async function (e) {
        try {
          const parsed = JSON.parse(e.target.result);
          if (Array.isArray(parsed)) {
            try {
              localStorage.removeItem(USER_CLEARED_FLAG_KEY);
              clearDeletedRecordIds();
            } catch (e) { }
            if (isFirebaseActive && firebaseDb) {
              const batch = firebaseDb.batch();
              parsed.forEach(r => {
                const docId = r.id || ('rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
                batch.set(firebaseDb.collection('fuel_records').doc(docId), { ...r, id: docId });
              });
              await batch.commit();
              showToast(`Imported & synced ${parsed.length} records to Firebase Cloud!`, 'success');
            } else {
              fuelRecords = parsed.map(sanitizeRecord).filter(Boolean);
              persistData();
              updateDashboard();
              filterAndRenderTable();
              showToast(`Imported ${parsed.length} records successfully!`, 'success');
            }
          } else {
            showToast('Invalid JSON database format.', 'error');
          }
        } catch (err) {
          showToast('Failed to parse uploaded JSON file: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    }

    function downloadFile(blob, filename) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }

    // --- Firebase Cloud Database Management ---
    // Automatically poll and connect once Firebase SDK finishes downloading
    function waitForFirebaseAndConnect(config, showToastFeedback = false, maxAttempts = 30) {
      let attempts = 0;
      function tryConnect() {
        attempts++;
        if (window.firebase && window.firebase.firestore) {
          connectFirebase(config, showToastFeedback);
        } else if (attempts < maxAttempts) {
          setTimeout(tryConnect, 200);
        } else {
          console.warn('[Fuel MIS] Firebase SDK script load timeout.');
          updateCloudUIState('error', 'Firebase SDK loading timeout. Check internet connection.');
        }
      }
      tryConnect();
    }

    function initFirebaseFromStorage() {
      let config = null;

      // 1. Prioritize DEFAULT_FIREBASE_CONFIG so all phones & computers use the exact same live database
      if (DEFAULT_FIREBASE_CONFIG && DEFAULT_FIREBASE_CONFIG.apiKey && DEFAULT_FIREBASE_CONFIG.projectId) {
        config = DEFAULT_FIREBASE_CONFIG;
        try {
          localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(DEFAULT_FIREBASE_CONFIG));
        } catch (e) { }
      } else {
        const stored = localStorage.getItem(FIREBASE_CONFIG_KEY);
        if (stored) {
          try { config = JSON.parse(stored); } catch (e) { }
        }
      }

      // 2. Connect via auto-retry
      if (config && config.apiKey && config.projectId) {
        populateFirebaseModalInputs(config);
        waitForFirebaseAndConnect(config, false);
      } else {
        updateCloudUIState('disconnected');
      }
    }

    function copyDriverInviteLink() {
      let cfg = null;
      try {
        const stored = localStorage.getItem(FIREBASE_CONFIG_KEY);
        if (stored) cfg = JSON.parse(stored);
      } catch (e) { }
      if (!cfg && DEFAULT_FIREBASE_CONFIG && DEFAULT_FIREBASE_CONFIG.apiKey && DEFAULT_FIREBASE_CONFIG.projectId) {
        cfg = DEFAULT_FIREBASE_CONFIG;
      }
      if (!cfg || !cfg.apiKey || !cfg.projectId) {
        showToast('Please configure Firebase Cloud first before generating the driver invite link!', 'warning');
        openFirebaseModal();
        return;
      }

      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
      const base = window.location.href.split('#')[0];
      const link = base + '#setup=' + encodeURIComponent(encoded);

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => {
          showToast('Driver Auto-Connect Link copied! Send this link to drivers on WhatsApp.', 'success');
        }).catch(() => {
          prompt('Copy this link and send to drivers on WhatsApp:', link);
        });
      } else {
        prompt('Copy this link and send to drivers on WhatsApp:', link);
      }
    }

    function openFirebaseModal() {
      const stored = localStorage.getItem(FIREBASE_CONFIG_KEY);
      if (stored) {
        try {
          populateFirebaseModalInputs(JSON.parse(stored));
        } catch (e) { }
      }
      const modal = document.getElementById('firebaseModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeFirebaseModal() {
      const modal = document.getElementById('firebaseModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function populateFirebaseModalInputs(config) {
      if (!config) return;
      if (config.apiKey) document.getElementById('fbApiKey').value = config.apiKey;
      if (config.projectId) document.getElementById('fbProjectId').value = config.projectId;
      if (config.authDomain) document.getElementById('fbAuthDomain').value = config.authDomain;
      if (config.appId) document.getElementById('fbAppId').value = config.appId;
      if (config.storageBucket) document.getElementById('fbStorageBucket').value = config.storageBucket;
      if (config.messagingSenderId) document.getElementById('fbMessagingSenderId').value = config.messagingSenderId;
    }

    function parseFirebaseConfigInput() {
      const raw = document.getElementById('fbSnippetInput').value;
      if (!raw || raw.trim().length === 0) return;

      const extractVal = (key) => {
        const regex = new RegExp(`['"]?${key}['"]?\\s*:\\s*['"]([^'"]+)['"]`, 'i');
        const match = raw.match(regex);
        return match ? match[1].trim() : '';
      };

      const apiKey = extractVal('apiKey');
      const projectId = extractVal('projectId');
      const authDomain = extractVal('authDomain');
      const appId = extractVal('appId');
      const storageBucket = extractVal('storageBucket');
      const messagingSenderId = extractVal('messagingSenderId');

      let filledCount = 0;
      if (apiKey) { document.getElementById('fbApiKey').value = apiKey; filledCount++; }
      if (projectId) { document.getElementById('fbProjectId').value = projectId; filledCount++; }
      if (authDomain) { document.getElementById('fbAuthDomain').value = authDomain; filledCount++; }
      if (appId) { document.getElementById('fbAppId').value = appId; filledCount++; }
      if (storageBucket) { document.getElementById('fbStorageBucket').value = storageBucket; filledCount++; }
      if (messagingSenderId) { document.getElementById('fbMessagingSenderId').value = messagingSenderId; filledCount++; }

      if (filledCount >= 2) {
        showToast(`Auto-filled ${filledCount} Firebase API settings!`, 'success');
      }
    }

    function saveFirebaseConfig() {
      const config = {
        apiKey: document.getElementById('fbApiKey').value.trim(),
        projectId: document.getElementById('fbProjectId').value.trim(),
        authDomain: document.getElementById('fbAuthDomain').value.trim(),
        appId: document.getElementById('fbAppId').value.trim(),
        storageBucket: document.getElementById('fbStorageBucket').value.trim(),
        messagingSenderId: document.getElementById('fbMessagingSenderId').value.trim()
      };

      if (!config.apiKey || !config.projectId) {
        showToast('Please enter both API Key and Project ID.', 'error');
        return;
      }

      localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
      connectFirebase(config, true);
    }

    // --- Automatic Cloud Upload & Offline Sync Queue ---
    const OFFLINE_SYNC_QUEUE_KEY = 'fleet_fuel_offline_sync_queue_v1';

    function getOfflineSyncQueue() {
      try {
        const q = localStorage.getItem(OFFLINE_SYNC_QUEUE_KEY);
        return q ? JSON.parse(q) : [];
      } catch (e) {
        return [];
      }
    }

    function addToOfflineSyncQueue(recordId) {
      const q = getOfflineSyncQueue();
      if (!q.includes(recordId)) {
        q.push(recordId);
        localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(q));
      }
      updateFormCloudSyncStatus();
    }

    function removeFromOfflineSyncQueue(recordId) {
      let q = getOfflineSyncQueue();
      q = q.filter(id => id !== recordId);
      localStorage.setItem(OFFLINE_SYNC_QUEUE_KEY, JSON.stringify(q));
      updateFormCloudSyncStatus();
    }

    function autoUploadRecordToCloud(record, isEdit = false) {
      // Ensure record is always in sync queue until cloud write is acknowledged
      addToOfflineSyncQueue(record.id);

      if (firebaseDb) {
        firebaseDb.collection('fuel_records').doc(record.id).set(record, { merge: true })
          .then(() => {
            removeFromOfflineSyncQueue(record.id);
            isFirebaseActive = true;
            showToast(isEdit ? 'Entry updated & synced to Cloud!' : 'Refuel entry logged & synced to Cloud!', 'success');
            updateFormCloudSyncStatus();
          })
          .catch(err => {
            console.warn('Direct cloud upload delayed, pending in offline queue:', err);
            updateFormCloudSyncStatus();
          });
      } else {
        updateFormCloudSyncStatus();
      }
    }

    async function flushOfflineSyncQueue() {
      if (!isFirebaseActive || !firebaseDb) return;
      const q = getOfflineSyncQueue();
      if (q.length === 0) return;

      const recordsToUpload = fuelRecords.filter(r => q.includes(r.id));
      if (recordsToUpload.length === 0) {
        localStorage.removeItem(OFFLINE_SYNC_QUEUE_KEY);
        updateFormCloudSyncStatus();
        return;
      }

      try {
        const batch = firebaseDb.batch();
        recordsToUpload.forEach(r => {
          batch.set(firebaseDb.collection('fuel_records').doc(r.id), r, { merge: true });
        });
        await batch.commit();
        localStorage.removeItem(OFFLINE_SYNC_QUEUE_KEY);
        showToast(`Auto-uploaded ${recordsToUpload.length} pending refuel records to Cloud!`, 'success');
        updateFormCloudSyncStatus();
      } catch (err) {
        console.warn('Auto-upload of offline queue failed, will retry:', err);
      }
    }

    function updateFormCloudSyncStatus() {
      const badge = document.getElementById('formCloudSyncBadge');
      const text = document.getElementById('formCloudSyncText');
      const dot = document.getElementById('formCloudSyncDot');
      if (!badge || !text || !dot) return;

      const queue = getOfflineSyncQueue();
      const isSd = currentLang === 'sd';

      if (isFirebaseActive && firebaseDb) {
        if (queue.length > 0) {
          badge.className = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold';
          dot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
          text.textContent = isSd
            ? `ڪلائوڊ تي خودڪار اپلوڊ جاري (${queue.length} انتظار ۾)`
            : `Auto-Uploading to Cloud (${queue.length} pending)`;
        } else {
          badge.className = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold';
          dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
          text.textContent = isSd
            ? 'ڪلائوڊ تي خودڪار اپلوڊ: فعال'
            : 'Auto-Upload to Cloud: Active';
        }
      } else {
        if (queue.length > 0) {
          badge.className = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold';
          dot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
          text.textContent = isSd
            ? `مقامي محفوظ (${queue.length} رڪارڊ ڪلائوڊ ڪنيڪشن جي انتظار ۾)`
            : `Saved Locally (${queue.length} queued for Cloud auto-upload)`;
        } else {
          badge.className = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold';
          dot.className = 'w-2.5 h-2.5 rounded-full bg-slate-400';
          text.textContent = isSd
            ? 'خودڪار ڪلائوڊ اپلوڊ: اسٽينڊ بائي'
            : 'Cloud Auto-Upload: Standby';
        }
      }
    }

    function showFirebaseRulesAlert() {
      const banner = document.getElementById('firestoreRulesAlertBanner');
      if (banner) {
        banner.classList.remove('hidden');
      }
      const dashBanner = document.getElementById('dashboardCloudAlertBanner');
      if (dashBanner) {
        dashBanner.classList.remove('hidden');
        dashBanner.innerHTML = `
          <div class="flex items-center justify-between gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
            <div class="flex items-center gap-2">
              <i class="ph-bold ph-warning-circle text-lg text-rose-600 shrink-0"></i>
              <span><strong>Cloud Permissions Blocked:</strong> Project <code>aligul-d0875</code> requires Firestore rules set to <code>allow read, write: if true;</code> so mobile devices can sync.</span>
            </div>
            <button onclick="openFirebaseModal()" class="px-3 py-1 bg-rose-600 text-white rounded-lg font-bold shrink-0 shadow-xs hover:bg-rose-700">Fix Now</button>
          </div>
        `;
      }
      showToast('Firebase Notice: Cloud permission blocked. Check Firestore security rules.', 'warning');
    }

    function showFirebaseQuotaAlert(msg) {
      const banner = document.getElementById('firestoreQuotaAlertBanner');
      if (banner) {
        banner.classList.remove('hidden');
      }
      const dashBanner = document.getElementById('dashboardCloudAlertBanner');
      if (dashBanner) {
        dashBanner.classList.remove('hidden');
        dashBanner.innerHTML = `
          <div class="flex items-center justify-between gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900">
            <div class="flex items-center gap-2">
              <i class="ph-bold ph-warning text-lg text-amber-600 shrink-0"></i>
              <span><strong>Firebase Cloud Daily Quota Exceeded (HTTP 429):</strong> The free daily quota on project <code>aligul-d0875</code> has been exhausted today. Each mobile is saving locally until midnight reset, or connect a new free Firebase project.</span>
            </div>
            <button onclick="openFirebaseModal()" class="px-3 py-1 bg-amber-600 text-white rounded-lg font-bold shrink-0 shadow-xs hover:bg-amber-700">Cloud Settings</button>
          </div>
        `;
      }
      showToast('Firebase Cloud Notice: Daily quota exceeded on aligul-d0875. Operating in local mode.', 'warning');
    }

    function connectFirebase(config, showToastFeedback = true) {
      if (!window.firebase || !window.firebase.firestore) {
        waitForFirebaseAndConnect(config, showToastFeedback);
        return;
      }

      try {
        updateCloudUIState('connecting');

        if (firestoreUnsubscribe) {
          firestoreUnsubscribe();
          firestoreUnsubscribe = null;
        }

        if (!firebase.apps || !firebase.apps.length) {
          firebaseApp = firebase.initializeApp(config);
        } else {
          firebaseApp = firebase.app();
        }
        firebaseDb = firebaseApp.firestore();

        // Real-time snapshot listener on fuel_records collection
        firestoreUnsubscribe = firebaseDb.collection('fuel_records')
          .onSnapshot((snapshot) => {
            const deletedIds = getDeletedRecordIds();
            const cloudDocIds = new Set();
            const mergedMap = new Map();

            // 1. Start with all existing valid local records so local entries are NEVER lost!
            (fuelRecords || []).forEach(localRec => {
              if (localRec && localRec.id && !deletedIds.has(localRec.id)) {
                const clean = sanitizeRecord(localRec);
                if (clean) mergedMap.set(clean.id, clean);
              }
            });

            // 2. Merge all documents from Cloud snapshot (synchronized across all mobile devices & locations)
            snapshot.forEach(doc => {
              if (deletedIds.has(doc.id)) {
                doc.ref.delete().catch(() => { });
                return;
              }
              const cleanCloud = sanitizeRecord({ id: doc.id, ...doc.data() });
              if (cleanCloud) {
                mergedMap.set(doc.id, cleanCloud);
                cloudDocIds.add(doc.id);
                removeFromOfflineSyncQueue(doc.id);
              }
            });

            // 3. Sort chronological descending (newest refuels first)
            const records = Array.from(mergedMap.values());
            records.sort((a, b) => new Date(b.entryDateTime || 0) - new Date(a.entryDateTime || 0));

            fuelRecords = records;
            persistData();
            updateDashboard();
            filterAndRenderTable();
            isFirebaseActive = true;
            updateCloudUIState('connected', config.projectId);
            updateFormCloudSyncStatus();

            // 4. If any local records are not yet in the cloud, upload them now so all devices receive them!
            const unuploaded = records.filter(r => !cloudDocIds.has(r.id) && !deletedIds.has(r.id));
            if (unuploaded.length > 0) {
              uploadRecordsBatchToCloud(unuploaded);
            }
          }, (err) => {
            console.error('Firestore onSnapshot error:', err);
            isFirebaseActive = false;
            updateCloudUIState('error', err.message);
            updateFormCloudSyncStatus();
            // Critical: Keep all local records visible even on Firebase network/permission errors!
            if (!fuelRecords || fuelRecords.length === 0) {
              initData();
            }
            updateDashboard();
            filterAndRenderTable();
            showToast('Firebase notice: ' + err.message + ' (Working in local offline mode)', 'info');
          });

        if (showToastFeedback) {
          showToast(`Connecting to Firebase project: ${config.projectId}...`, 'info');
          closeFirebaseModal();
        }
      } catch (err) {
        console.error('Firebase init failed:', err);
        isFirebaseActive = false;
        updateCloudUIState('error', err.message);
        if (showToastFeedback) {
          showToast('Failed to initialize Firebase: ' + err.message, 'error');
        }
      }
    }

    async function uploadRecordsBatchToCloud(records) {
      if (!isFirebaseActive || !firebaseDb || !records || records.length === 0) return;
      try {
        const batch = firebaseDb.batch();
        records.forEach(r => {
          const docRef = firebaseDb.collection('fuel_records').doc(r.id);
          batch.set(docRef, r, { merge: true });
        });
        await batch.commit();
        records.forEach(r => removeFromOfflineSyncQueue(r.id));
        console.log(`Auto-uploaded ${records.length} local records to Firebase Cloud.`);
      } catch (err) {
        console.warn('Batch upload of local records to Cloud delayed:', err);
      }
    }

    async function testCloudConnection() {
      const btn = document.getElementById('btnTestCloudSync');
      const originalText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="ph-bold ph-spinner animate-spin text-base"></i> Testing Cloud Connection...';
      }

      if (!firebaseDb) {
        initFirebaseFromStorage();
      }

      if (!firebaseDb) {
        showToast('Firebase is initializing. Please wait a moment or check internet connection.', 'warning');
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        return;
      }

      try {
        const testId = '_ping_test_' + Date.now();
        // 1. Test Write
        await firebaseDb.collection('fuel_records').doc(testId).set({
          test: true,
          timestamp: new Date().toISOString()
        });
        // 2. Test Read
        const snap = await firebaseDb.collection('fuel_records').doc(testId).get();
        // 3. Clean up
        await firebaseDb.collection('fuel_records').doc(testId).delete();

        showToast('✅ Cloud Sync Verified! Real-time connection to aligul-d0875 is working perfectly!', 'success');
        updateCloudUIState('connected', 'aligul-d0875');
      } catch (err) {
        console.error('Cloud Test Failed:', err);
        if (err.code === 'permission-denied') {
          showFirebaseRulesAlert();
          showToast('❌ Firestore Permission Denied! Set rules to "allow read, write: if true;" in Firebase Console.', 'error');
        } else {
          showToast('❌ Cloud Test Notice: ' + err.message, 'error');
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      }
    }

    function disconnectFirebase() {
      if (confirm('Disconnect from Firebase cloud database and switch back to Local Storage mode?')) {
        if (firestoreUnsubscribe) {
          firestoreUnsubscribe();
          firestoreUnsubscribe = null;
        }
        if (window.firebase && firebase.apps && firebase.apps.length > 0) {
          firebase.app().delete();
        }
        isFirebaseActive = false;
        firebaseApp = null;
        firebaseDb = null;
        localStorage.removeItem(FIREBASE_CONFIG_KEY);
        updateCloudUIState('disconnected');
        showToast('Disconnected from Firebase. Operating in Local Mode.', 'info');
      }
    }

    async function syncLocalToFirebase() {
      if (!isFirebaseActive || !firebaseDb) {
        showToast('Connect to Firebase first before uploading local data!', 'error');
        return;
      }
      if (fuelRecords.length === 0) {
        showToast('No records found to upload.', 'info');
        return;
      }

      const btn = document.getElementById('btnSyncLocal');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="ph-bold ph-spinner animate-spin"></i> Uploading...';
      btn.disabled = true;

      try {
        const batch = firebaseDb.batch();
        fuelRecords.forEach(rec => {
          const docRef = firebaseDb.collection('fuel_records').doc(rec.id);
          batch.set(docRef, rec, { merge: true });
        });
        await batch.commit();
        showToast(`Uploaded ${fuelRecords.length} records to Firebase Cloud!`, 'success');
      } catch (err) {
        console.error('Upload to Firebase failed:', err);
        showToast('Upload failed: ' + err.message, 'error');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }

    function updateCloudUIState(status, extraInfo = '') {
      const dot = document.getElementById('cloudStatusDot');
      const text = document.getElementById('cloudStatusText');
      const modalDot = document.getElementById('modalStatusDot');
      const modalTitle = document.getElementById('modalStatusTitle');
      const modalSub = document.getElementById('modalStatusSubtitle');
      const btnDisconnect = document.getElementById('btnDisconnectFb');

      if (status === 'connected') {
        if (dot) dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-400';
        if (text) text.textContent = 'Cloud Active';
        if (modalDot) modalDot.className = 'w-3 h-3 rounded-full bg-emerald-500';
        if (modalTitle) modalTitle.textContent = `Connected: Firebase Cloud (${extraInfo})`;
        if (modalSub) modalSub.textContent = 'Live real-time sync is active across all locations and devices.';
        if (btnDisconnect) btnDisconnect.classList.remove('hidden');
      } else if (status === 'connecting') {
        if (dot) dot.className = 'w-2.5 h-2.5 rounded-full bg-blue-500';
        if (text) text.textContent = 'Connecting...';
        if (modalDot) modalDot.className = 'w-3 h-3 rounded-full bg-blue-500';
        if (modalTitle) modalTitle.textContent = 'Connecting to Firebase Cloud...';
        if (modalSub) modalSub.textContent = 'Establishing live real-time sync connection...';
      } else if (status === 'error') {
        if (dot) dot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
        if (text) text.textContent = 'Cloud Error';
        if (modalDot) modalDot.className = 'w-3 h-3 rounded-full bg-rose-500';
        if (modalTitle) modalTitle.textContent = 'Firebase Connection Error';
        if (modalSub) modalSub.textContent = extraInfo || 'Check API Key, Project ID, or Firestore Security Rules.';
        if (btnDisconnect) btnDisconnect.classList.remove('hidden');
      } else {
        // disconnected / local
        if (dot) dot.className = 'w-2.5 h-2.5 rounded-full bg-amber-500';
        if (text) text.textContent = 'Local Mode';
        if (modalDot) modalDot.className = 'w-3 h-3 rounded-full bg-amber-500';
        if (modalTitle) modalTitle.textContent = 'Status: Local Storage Only (Offline Mode)';
        if (modalSub) modalSub.textContent = 'Refuels are saved on this device only. Connect Firebase to sync with drivers remotely.';
        if (btnDisconnect) btnDisconnect.classList.add('hidden');
      }

      updateFormCloudSyncStatus();
    }

    // --- Internationalization (English & Sindhi سنڌي) ---
    const I18N = {
      en: {
        appTitle: 'Jatoi Fleet Fuel MIS',
        appSubtitle: 'Tracker & Fuel Management Console',
        navDashboard: 'Dashboard',
        navRefuel: 'Log Refuel',
        navLogs: 'Fuel Logs',
        newRefuelBtn: 'New Refuel',
        kpiSpend: 'Total Spend',
        kpiSpendSub: 'Overall fleet fuel cost',
        kpiPetrol: 'Petrol Used',
        kpiDiesel: 'Diesel Used',
        kpiEntries: 'Total Fill-ups',
        kpiAvgRate: 'Avg Rate/Liter',
        kpiAvgRateSub: 'Average across records',
        chartVehicleTitle: 'Fuel Spend by Vehicle & Driver',
        chartVehicleSub: 'Aggregated expenditure per plate number and driver',
        chartVehicleBadge: 'Vehicle & Driver',
        chartFuelRatioTitle: 'Fuel Ratio (Liters)',
        chartFuelRatioSub: 'Petrol vs. Diesel distribution',
        chartFuelRatioBadge: 'Volume',
        recentTitle: 'Recent Refuels',
        recentSub: 'Last 5 records submitted from pump stations',
        viewAllLogs: 'View All Logs',
        formTitle: 'New Refuel Log Entry',
        formSub: 'Submit fuel receipts from field petrol pumps for administrative audit.',
        fieldActive: 'Field Active',
        lblPlate: 'Vehicle Plate / Reg No.',
        lblFuelType: 'Fuel Type',
        lblQuantity: 'Quantity (Liters)',
        lblRate: 'Rate Per Liter (Cost)',
        lblTotal: 'Total Amount (Auto Calculated)',
        lblPump: 'Petrol Pump / Station',
        lblDriver: 'Driver / Field Officer Name',
        lblOdo: 'Odometer / Tracker Km',
        lblDateTime: 'Date & Time of Refuel',
        lblMemo: 'Slip Number / Pump Memo / Notes',
        btnReset: 'Reset',
        btnSave: 'Save Refuel Entry',
        searchPlaceholder: 'Search vehicle plate, station, or driver...',
        optAllFuel: 'All Fuel Types',
        optPetrolOnly: 'Petrol Only',
        optDieselOnly: 'Diesel Only',
        btnResetFilters: 'Reset Filters',
        showing: 'Showing',
        entries: 'entries',
        colDateTime: 'Date / Time',
        colPlate: 'Vehicle Plate',
        colDriver: 'Driver',
        colFuelType: 'Fuel Type',
        colVolume: 'Volume (L)',
        colRate: 'Rate / L',
        colAmount: 'Total Amount',
        colPump: 'Petrol Station',
        colOdometer: 'Odometer',
        colActions: 'Actions',
        roleAdmin: 'Admin',
        roleUser: 'User',
        btnExitPortal: 'Switch Portal',
        appFooterText: 'App designed by Zonish Computer Academy Newjatoi'
      },
      sd: {
        appTitle: 'جتوئي فليٽ فيول ايم آءِ ايس',
        appSubtitle: 'گاڏين جي تيل ۽ مائليج مئنيجمينٽ سسٽم',
        navDashboard: 'ڊيش بورڊ',
        navRefuel: 'تيل جو اندراج',
        navLogs: 'فيول لاگز (رڪارڊ)',
        newRefuelBtn: 'نئون اندراج',
        kpiSpend: 'ڪل خرچ',
        kpiSpendSub: 'فليٽ جي تيل جو سمورو خرچ',
        kpiPetrol: 'پيٽرول واهپو',
        kpiDiesel: 'ڊيزل واهپو',
        kpiEntries: 'ڪل ڀيرا تيل ڀرايو',
        kpiAvgRate: 'سراسري في ليٽر ريٽ',
        kpiAvgRateSub: 'رڪارڊز جي سراسري قيمت',
        chartVehicleTitle: 'گاڏي ۽ ڊرائيور موجب خرچ',
        chartVehicleSub: 'هر نمبر پليٽ ۽ ڊرائيور جو ڪل خرچ',
        chartVehicleBadge: 'گاڏي ۽ ڊرائيور',
        chartFuelRatioTitle: 'تيل جو تناسب (ليٽر)',
        chartFuelRatioSub: 'پيٽرول ۽ ڊيزل جي ورڇ',
        chartFuelRatioBadge: 'مقدار',
        recentTitle: 'تازو تيل اندراج',
        recentSub: 'پيٽرول پمپن تان داخل ڪيل آخري 5 رڪارڊ',
        viewAllLogs: 'سڀ رڪارڊ ڏسو',
        formTitle: 'تيل ڀرائڻ جو نئون اندراج',
        formSub: 'انتظامي آڊٽ لاءِ پمپ جي پرچي ۽ بل جا تفصيل داخل ڪريو.',
        fieldActive: 'فعال سسٽم',
        lblPlate: 'گاڏي نمبر / رجسٽريشن',
        lblFuelType: 'تيل جو قسم',
        lblQuantity: 'مقدار (ليٽر)',
        lblRate: 'في ليٽر ريٽ (قيمت)',
        lblTotal: 'ڪل رقم (خودڪار حساب)',
        lblPump: 'پيٽرول پمپ / اسٽيشن جو نالو',
        lblDriver: 'ڊرائيور / فيلڊ آفيسر جو نالو',
        lblOdo: 'اوڊوميٽر / ميٽر ريڊنگ (ڪلوميٽر)',
        lblDateTime: 'تاريخ ۽ وقت',
        lblMemo: 'پرچي نمبر / بل جا تفصيل / نوٽس',
        btnReset: 'ري سيٽ ڪريو',
        btnSave: 'اندراج محفوظ ڪريو',
        searchPlaceholder: 'گاڏي نمبر، پمپ يا ڊرائيور جو نالو ڳوليو...',
        optAllFuel: 'سڀ تيل قسم',
        optPetrolOnly: 'صرف پيٽرول',
        optDieselOnly: 'صرف ڊيزل',
        btnResetFilters: 'فلٽر ختم ڪريو',
        showing: 'ڏيکاري رهيا آهيون',
        entries: 'رڪارڊ',
        colDateTime: 'تاريخ / وقت',
        colPlate: 'گاڏي نمبر',
        colDriver: 'ڊرائيور',
        colFuelType: 'قسم',
        colVolume: 'ليٽر (L)',
        colRate: 'ريٽ / ليٽر',
        colAmount: 'ڪل رقم',
        colPump: 'پيٽرول پمپ',
        colOdometer: 'ڪلوميٽر (Km)',
        colActions: 'عمل',
        roleAdmin: 'ايڊمن',
        roleUser: 'يوزر',
        btnExitPortal: 'پورٽل بدلايو',
        appFooterText: 'App designed by Zonish Computer Academy Newjatoi'
      }
    };

    const RECEIPT_I18N = {
      en: {
        sub: 'Official Refuel Voucher & Audit Receipt',
        badge: 'AUDITED',
        lblDate: 'Date & Time',
        lblVehicle: 'Vehicle Plate',
        lblDriver: 'Driver / Officer',
        lblStation: 'Petrol Pump / Station',
        lblFuelType: 'Fuel Type',
        lblVolume: 'Quantity (L)',
        lblRate: 'Rate / Liter',
        lblTotal: 'Total Amount Paid',
        lblOdometer: 'Odometer',
        lblMemo: 'Slip Memo / Notes',
        verification: 'E-Verified Fuel MIS Audit Voucher',
        generated: 'Generated',
        currency: 'PKR',
        km: 'Km',
        liters: 'Liters'
      },
      sd: {
        sub: 'سرڪاري فيول واؤچر ۽ آڊٽ رسيد',
        badge: 'منظور ٿيل',
        lblDate: 'تاريخ ۽ وقت',
        lblVehicle: 'گاڏي رجسٽريشن نمبر',
        lblDriver: 'ڊرائيور / آفيسر جو نالو',
        lblStation: 'پيٽرول پمپ / اسٽيشن',
        lblFuelType: 'تيل جو قسم',
        lblVolume: 'مقدار (ليٽر)',
        lblRate: 'ريٽ / ليٽر',
        lblTotal: 'ڪل ادا ڪيل رقم',
        lblOdometer: 'اوڊوميٽر',
        lblMemo: 'پرچي / بل تفصيل',
        verification: 'اي-تصديق شده فيول ايم آءِ ايس واؤچر',
        generated: 'جاري ڪيل',
        currency: 'رپيا',
        km: 'ڪلوميٽر',
        liters: 'ليٽر'
      }
    };

    function setLanguage(lang) {
      currentLang = lang;
      localStorage.setItem(LANG_STORAGE_KEY, lang);
      applyTranslations(lang);
      updateDashboard();
      filterAndRenderTable();
      showToast(lang === 'sd' ? 'سنڌي ٻولي فعال ٿي وئي آهي.' : 'English language activated.', 'info');
    }

    function initLanguage() {
      const savedLang = localStorage.getItem(LANG_STORAGE_KEY) || 'en';
      currentLang = savedLang;
      applyTranslations(savedLang);
    }

    function applyTranslations(lang) {
      const dict = I18N[lang] || I18N.en;
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) {
          if (el.tagName === 'INPUT' && el.getAttribute('placeholder')) {
            el.placeholder = dict[key];
          } else {
            el.textContent = dict[key];
          }
        }
      });

      const btnEn = document.getElementById('langBtn-en');
      const btnSd = document.getElementById('langBtn-sd');
      const brandElem = document.getElementById('brandAppTitle');

      if (lang === 'sd') {
        document.documentElement.dir = 'rtl';
        document.documentElement.lang = 'sd';
        document.body.classList.add('font-sindhi');
        if (brandElem) brandElem.innerHTML = 'جتوئي فليٽ فيول <span class="text-brand-600">ايم آءِ ايس</span>';
        document.title = 'جتوئي فليٽ فيول MIS - مئنيجمينٽ سسٽم';
        if (btnSd) btnSd.className = 'px-2.5 py-1.5 rounded-md transition text-brand-600 bg-brand-50 font-bold font-sindhi';
        if (btnEn) btnEn.className = 'px-2.5 py-1.5 rounded-md transition text-slate-600 hover:text-slate-900 font-bold';
      } else {
        document.documentElement.dir = 'ltr';
        document.documentElement.lang = 'en';
        document.body.classList.remove('font-sindhi');
        if (brandElem) brandElem.innerHTML = 'Jatoi Fleet Fuel <span class="text-brand-600">MIS</span>';
        document.title = 'Jatoi Fleet Fuel MIS - Fuel & Mileage Tracker';
        if (btnEn) btnEn.className = 'px-2.5 py-1.5 rounded-md transition text-brand-600 bg-brand-50 font-bold';
        if (btnSd) btnSd.className = 'px-2.5 py-1.5 rounded-md transition text-slate-600 hover:text-slate-900 font-bold font-sindhi';
      }

      if (currentUserRole) {
        applyRolePermissions(currentUserRole);
      }

      updateFormCloudSyncStatus();
    }

    // --- Receipt Modal & Screenshot Voucher ---
    function openReceiptModal(id) {
      const rec = fuelRecords.find(r => r.id === id);
      if (!rec) return;
      currentReceiptRecord = rec;
      receiptLang = currentLang;
      renderReceipt();
      const modal = document.getElementById('receiptModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeReceiptModal() {
      const modal = document.getElementById('receiptModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    function setReceiptLanguage(lang) {
      receiptLang = lang;
      renderReceipt();
    }

    function renderReceipt() {
      if (!currentReceiptRecord) return;
      const rec = currentReceiptRecord;
      const t = RECEIPT_I18N[receiptLang] || RECEIPT_I18N.en;
      const captureArea = document.getElementById('receiptCaptureArea');

      const btnEn = document.getElementById('receiptLangBtn-en');
      const btnSd = document.getElementById('receiptLangBtn-sd');
      const receiptTitleElem = document.getElementById('receiptAppTitle');
      if (receiptLang === 'sd') {
        if (receiptTitleElem) receiptTitleElem.innerHTML = 'جتوئي فليٽ فيول <span class="text-brand-600">ايم آءِ ايس</span>';
        if (btnSd) btnSd.className = 'px-2.5 py-1 rounded-md transition text-brand-600 bg-white shadow-xs font-bold font-sindhi';
        if (btnEn) btnEn.className = 'px-2.5 py-1 rounded-md transition text-slate-600 hover:text-slate-900 font-bold';
        captureArea.dir = 'rtl';
        captureArea.classList.add('font-sindhi');
      } else {
        if (receiptTitleElem) receiptTitleElem.innerHTML = 'Jatoi Fleet Fuel <span class="text-brand-600">MIS</span>';
        if (btnEn) btnEn.className = 'px-2.5 py-1 rounded-md transition text-brand-600 bg-white shadow-xs font-bold';
        if (btnSd) btnSd.className = 'px-2.5 py-1 rounded-md transition text-slate-600 hover:text-slate-900 font-bold font-sindhi';
        captureArea.dir = 'ltr';
        captureArea.classList.remove('font-sindhi');
      }

      document.getElementById('receiptSubheader').textContent = t.sub;
      document.getElementById('receiptBadge').innerHTML = `<i class="ph-bold ph-seal-check"></i> ${t.badge}`;
      document.getElementById('receiptVoucherId').textContent = '#' + (rec.id.replace('rec_', 'REF-'));

      document.getElementById('lblReceiptDate').textContent = t.lblDate;
      document.getElementById('valReceiptDate').textContent = formatDate(rec.entryDateTime);

      document.getElementById('lblReceiptVehicle').textContent = t.lblVehicle;
      document.getElementById('valReceiptVehicle').textContent = rec.vehiclePlate;

      document.getElementById('lblReceiptDriver').textContent = t.lblDriver;
      document.getElementById('valReceiptDriver').textContent = rec.driverName || (receiptLang === 'sd' ? 'مقرر نه ٿيل' : 'Unassigned');

      document.getElementById('lblReceiptStation').textContent = t.lblStation;
      document.getElementById('valReceiptStation').textContent = rec.pumpStation;

      document.getElementById('lblReceiptFuelType').textContent = t.lblFuelType;
      const fuelName = rec.fuelType === 'Petrol'
        ? (receiptLang === 'sd' ? 'پيٽرول (Super)' : 'Petrol (Super)')
        : (receiptLang === 'sd' ? 'ڊيزل (HSD)' : 'Diesel (HSD)');
      document.getElementById('valReceiptFuelType').textContent = fuelName;

      document.getElementById('lblReceiptVolume').textContent = t.lblVolume;
      document.getElementById('valReceiptVolume').textContent = `${rec.liters.toFixed(2)} ${t.liters}`;

      document.getElementById('lblReceiptRate').textContent = t.lblRate;
      document.getElementById('valReceiptRate').textContent = `${t.currency} ${rec.ratePerLiter.toFixed(2)}`;

      document.getElementById('lblReceiptTotal').textContent = t.lblTotal;
      document.getElementById('valReceiptTotal').textContent = `${t.currency} ${rec.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

      document.getElementById('valReceiptOdometer').textContent = rec.odometerReading
        ? `${t.lblOdometer}: ${rec.odometerReading.toLocaleString()} ${t.km}`
        : `${t.lblOdometer}: --`;

      const memoBox = document.getElementById('receiptMemoBox');
      document.getElementById('lblReceiptMemo').textContent = t.lblMemo;
      if (rec.memoNotes) {
        memoBox.classList.remove('hidden');
        document.getElementById('valReceiptMemo').textContent = rec.memoNotes;
      } else {
        memoBox.classList.add('hidden');
      }

      document.getElementById('receiptVerificationText').textContent = t.verification;
      document.getElementById('receiptTimestamp').textContent = `${t.generated}: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
      document.getElementById('btnScreenshotText').textContent = receiptLang === 'sd' ? 'اسڪرين شاٽ (تصوير)' : 'Screenshot (PNG)';
    }

    function downloadReceiptImage() {
      const receiptArea = document.getElementById('receiptCaptureArea');
      const btn = document.getElementById('btnDownloadReceipt');
      const originalHtml = btn.innerHTML;
      btn.innerHTML = '<i class="ph-bold ph-spinner animate-spin text-base"></i><span>Saving...</span>';
      btn.disabled = true;

      html2canvas(receiptArea, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      }).then(canvas => {
        const link = document.createElement('a');
        const plate = currentReceiptRecord ? currentReceiptRecord.vehiclePlate : 'Fuel';
        const langCode = receiptLang === 'sd' ? 'Sindhi' : 'English';
        link.download = `Fuel_Receipt_${plate}_${langCode}_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast(receiptLang === 'sd' ? 'رسيد جو تصويري اسڪرين شاٽ ڊائون لوڊ ٿي ويو!' : 'Receipt screenshot downloaded successfully!', 'success');
      }).catch(err => {
        console.error('html2canvas error:', err);
        showToast('Screenshot capture error: ' + err.message, 'error');
      }).finally(() => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      });
    }

    function printReceipt() {
      const receiptArea = document.getElementById('receiptCaptureArea');
      const win = window.open('', '_blank', 'width=720,height=850');
      if (!win) {
        showToast('Please allow popups to print receipt.', 'error');
        return;
      }
      const dir = receiptLang === 'sd' ? 'rtl' : 'ltr';
      win.document.open();
      win.document.write('<!DOCTYPE html><html><head><title>Jatoi Fleet Fuel Receipt - ' + (currentReceiptRecord ? currentReceiptRecord.vehiclePlate : '') + '</title>');
      win.document.write('<' + 'script src="https://cdn.tailwindcss.com"><' + '/script>');
      win.document.write('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">');
      win.document.write('<style>body { font-family: "Inter", "Noto Sans Arabic", sans-serif; padding: 24px; background: #fff; }</style></head>');
      win.document.write('<body dir="' + dir + '">' + receiptArea.outerHTML);
      win.document.write('<' + 'script>window.onload=function(){setTimeout(function(){window.print();window.close();},350);};<' + '/script>');
      win.document.write('</body></html>');
      win.document.close();
    }

    // --- Helper Utilities ---
    function formatDate(dateStr) {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    function showToast(message, type = 'info') {
      const toast = document.getElementById('toast');
      const toastMsg = document.getElementById('toastMsg');
      const toastIcon = document.getElementById('toastIcon');
      const toastCard = document.getElementById('toastCard');

      toastMsg.textContent = message;

      if (type === 'success') {
        toastIcon.innerHTML = '<i class="ph-bold ph-check-circle text-emerald-400"></i>';
        toastCard.className = 'flex items-center gap-3 bg-slate-900 border-l-4 border-emerald-500 text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium';
      } else if (type === 'error') {
        toastIcon.innerHTML = '<i class="ph-bold ph-warning-circle text-rose-400"></i>';
        toastCard.className = 'flex items-center gap-3 bg-slate-900 border-l-4 border-rose-500 text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium';
      } else {
        toastIcon.innerHTML = '<i class="ph-bold ph-info text-blue-400"></i>';
        toastCard.className = 'flex items-center gap-3 bg-slate-900 border-l-4 border-blue-500 text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium';
      }

      toast.classList.remove('translate-x-full', 'opacity-0');
      toast.classList.add('translate-x-0', 'opacity-100');

      setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        toast.classList.remove('translate-x-0', 'opacity-100');
      }, 3500);
    }
  
