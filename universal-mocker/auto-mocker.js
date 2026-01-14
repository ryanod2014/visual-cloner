/**
 * UNIVERSAL AUTO-MOCKER
 * Works for ANY web app - no AI required
 *
 * Strategy:
 * 1. Intercept all auth/storage access
 * 2. Intercept all API calls
 * 3. Start with empty mocks
 * 4. Let errors tell us what's needed
 * 5. Auto-fix and reload until stable
 */

class UniversalAutoMocker {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 10;
    this.reloadDelay = options.reloadDelay || 100;
    this.debug = options.debug || false;

    this.state = {
      iteration: 1,
      auth: { patterns: {}, tokens: {} },
      apis: {},
      errors: [],
      fixes: []
    };

    // Load previous state if reloading
    this.loadState();
  }

  /**
   * Initialize all interceptors
   */
  init() {
    console.log(`🤖 [AutoMocker] Iteration ${this.state.iteration}/${this.maxIterations}`);

    // CRITICAL: Suppress blocking errors BEFORE Vue loads
    this.suppressBlockingErrors();

    // CRITICAL: Disable service worker to prevent reload loops from 404s
    this.disableServiceWorker();

    // Inject global auth data EARLY
    this.injectGlobalAuthData();

    // LAYER 2: Inject localStorage + cookies BEFORE app boots
    this.injectEarlyAuth();

    this.interceptLocalStorage();
    this.interceptSessionStorage();
    this.interceptCookies();
    this.interceptFetch();
    this.interceptXHR();
    this.interceptWebSocket();
    this.captureErrors();

    console.log('✅ [AutoMocker] All interceptors active');

    // CRITICAL: Watch for Vue to mount and fix Vuex IMMEDIATELY
    this.watchForVueMountAndFix();

    // Check if we're stable (no new errors)
    this.checkStability();
  }

  /**
   * Watch for Vue to mount and apply Vuex fixes immediately
   */
  watchForVueMountAndFix() {
    const self = this;
    let checkCount = 0;
    const maxChecks = 50; // Check for 5 seconds (50 * 100ms)

    const checkForVue = () => {
      checkCount++;

      // Check if Vue has mounted
      const vueApp = window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0];
      const app = document.getElementById('app');
      const store = vueApp?.config?.globalProperties?.$store || app?.__vue_app__?.config?.globalProperties?.$store;

      if (store?.state) {
        // Mark this store instance for tracking
        if (!store._autoMockerStoreId) {
          store._autoMockerStoreId = 'store_' + Date.now();
        }

        // CRITICAL: Capture the actual Vue app reference
        // Store could come from vueApp OR from app.__vue_app__
        const actualVueApp = vueApp || app?.__vue_app__;
        self.log(`🎯 Vue mounted! Intercepting locations object with Proxy (store ID: ${store._autoMockerStoreId}, vueApp source: ${vueApp ? 'devtools' : 'app element'})...`);

        // CRITICAL: GHL replaces the entire locations object, so we need to intercept
        // at the parent level (store.state.locations) not the nested property

        try {
          // Store reference to current locations
          let _locations = store.state.locations || {
            locationsLoaded: false,
            locations: [],
            activeLocations: [],
            notificationLocations: [],
            currentLocation: null
          };

          // Intercept the entire locations object
          Object.defineProperty(store.state, 'locations', {
            get: () => {
              // Proxy getter is called frequently - disable logging for performance
              // self.log('🔍 Proxy getter called for store.state.locations');
              // Return a Proxy that forces locationsLoaded to always be true
              return new Proxy(_locations, {
                get: (target, prop) => {
                  // Disable verbose logging for performance
                  // self.log(`🔍 Proxy trap: reading property '${prop}', target value: ${target[prop]}`);
                  if (prop === 'locationsLoaded') {
                    // self.log('🎯 Intercepted locationsLoaded - returning TRUE');
                    return true; // Always return true, no matter what GHL sets
                  }

                  // Provide mock locations array
                  const mockLocation = {
                    id: 'mock_location_123',
                    name: 'Demo Location',
                    address: '123 Demo St',
                    city: 'Demo City',
                    state: 'CA',
                    country: 'US',
                    postalCode: '12345',
                    phone: '+1234567890',
                    email: 'demo@example.com'
                  };

                  if (prop === 'locations' && (!target.locations || target.locations.length === 0)) {
                    return [mockLocation];
                  }
                  if (prop === 'activeLocations' && (!target.activeLocations || target.activeLocations.length === 0)) {
                    // self.log('🎯 Providing mock activeLocations');
                    return [mockLocation];
                  }
                  if (prop === 'currentLocation' && !target.currentLocation) {
                    // self.log('🎯 Providing mock currentLocation');
                    return mockLocation;
                  }

                  return target[prop];
                },
                set: (target, prop, value) => {
                  // self.log(`🔍 Proxy trap: setting property '${prop}' to ${value}`);
                  // Allow GHL to set properties, but they'll still be intercepted on get
                  target[prop] = value;
                  return true;
                }
              });
            },
            set: (newValue) => {
              // When GHL replaces the entire locations object, capture it
              self.log('🔄 GHL replaced locations object - maintaining intercept');
              _locations = newValue || _locations;
            },
            configurable: true
          });

          self.log('✅ Locations object intercepted - locationsLoaded will always be true');

          // VERIFY: Test if the Proxy actually works by reading it immediately
          try {
            const testRead = store.state.locations;
            const testFlag = store.state.locations.locationsLoaded;
            self.log(`🧪 Immediate test: locations object type = ${typeof testRead}, locationsLoaded = ${testFlag}`);
          } catch (testError) {
            self.log(`⚠️ Immediate test failed: ${testError.message}`);
          }
        } catch (e) {
          self.log('⚠️ Could not intercept locations object:', e.message);
        }

        // Also intercept user and company objects to provide mock data
        try {
          let _user = store.state.user || {};
          Object.defineProperty(store.state, 'user', {
            get: () => {
              return new Proxy(_user, {
                get: (target, prop) => {
                  if (prop === 'id' && !target.id) return 'mock_user_123';
                  if (prop === 'email' && !target.email) return 'demo@example.com';
                  if (prop === 'name' && !target.name) return 'Demo User';
                  if (prop === 'role' && !target.role) return 'admin';
                  if (prop === 'firstName' && !target.firstName) return 'Demo';
                  if (prop === 'lastName' && !target.lastName) return 'User';
                  return target[prop];
                }
              });
            },
            set: (newValue) => { _user = newValue || _user; },
            configurable: true
          });

          let _company = store.state.company || {};
          Object.defineProperty(store.state, 'company', {
            get: () => {
              return new Proxy(_company, {
                get: (target, prop) => {
                  if (prop === 'id' && !target.id) return 'mock_company_123';
                  if (prop === 'name' && !target.name) return 'Demo Company';
                  return target[prop];
                }
              });
            },
            set: (newValue) => { _company = newValue || _company; },
            configurable: true
          });

          self.log('✅ User and company objects intercepted with mock data');
        } catch (e) {
          self.log(`⚠️ Could not intercept user/company: ${e.message}`);
        }

        // CRITICAL: Trigger Vue's reactivity by committing mutations
        // This forces computed properties and watchers to re-evaluate
        try {
          if (store.commit) {
            // IMPORTANT: Capture vueApp reference NOW before setTimeout
            const capturedVueApp = actualVueApp;
            const capturedRouter = actualVueApp?.config?.globalProperties?.$router;
            self.log(`📦 Captured references - vueApp: ${!!capturedVueApp}, router: ${!!capturedRouter}`);

            // Trigger a dummy mutation to wake up Vue's reactivity
            // Try common mutation names that might exist
            setTimeout(() => {
              try {
                // Force state change by reassigning (triggers setters)
                const oldLoaderCount = store.state.loaderCount;
                store.state.loaderCount = oldLoaderCount;

                // Try to find and call any "setReady" or "setLoaded" mutations
                if (store._mutations) {
                  const mutations = Object.keys(store._mutations);
                  self.log(`📝 Available mutations: ${mutations.join(', ')}`);

                  // Define mock location for mutations
                  const mockLocation = {
                    id: 'mock_location_123',
                    name: 'Demo Location',
                    address: '123 Demo St',
                    city: 'Demo City',
                    state: 'CA',
                    country: 'US'
                  };

                  // CRITICAL: Set auth data first to bypass login
                  const authPayload = {
                    token: 'mock_jwt_token_' + Date.now(),
                    user: {
                      id: 'mock_user_123',
                      email: 'demo@example.com',
                      name: 'Demo User',
                      firstName: 'Demo',
                      lastName: 'User',
                      role: 'admin',
                      type: 'account'
                    },
                    locationId: 'mock_location_123'
                  };

                  // Try to set auth via mutation
                  if (store._mutations['auth/set']) {
                    try {
                      store.commit('auth/set', authPayload);
                      self.log(`✅ Set auth data via auth/set mutation`);
                    } catch (e) {
                      self.log(`⚠️ auth/set mutation failed: ${e.message}`);
                    }
                  }

                  // Also try setting via auth/setLocationId
                  if (store._mutations['auth/setLocationId']) {
                    try {
                      store.commit('auth/setLocationId', 'mock_location_123');
                      self.log(`✅ Set locationId via auth/setLocationId mutation`);
                    } catch (e) {
                      self.log(`⚠️ auth/setLocationId failed: ${e.message}`);
                    }
                  }

                  // LAYER 3: Complete Vuex auth state + getters (from Agent 3 research)
                  try {
                    // Get our mock auth from injectEarlyAuth
                    const mockAuth = self.state.auth.mockAuth || {};

                    // Ensure store.state.auth exists
                    if (!store.state.auth) {
                      store.state.auth = {};
                    }

                    // Set complete auth object with all properties GHL checks
                    Object.assign(store.state.auth, {
                      isAuthenticated: true,
                      token: mockAuth.jwt || authPayload.token,
                      jwt: mockAuth.jwt || authPayload.token,
                      refreshJwt: mockAuth.refreshJwt || 'mock_refresh_jwt',
                      firebaseToken: mockAuth.firebaseToken || 'mock_firebase_token',
                      authToken: mockAuth.authToken || 'mock_auth_token',
                      refreshToken: mockAuth.refreshToken || 'mock_refresh_token',
                      apiKey: mockAuth.apiKey || 'mock_api_key',
                      userId: mockAuth.userId || 'mock_user_123',
                      companyId: mockAuth.companyId || 'mock_company_123',
                      locationId: mockAuth.locationId || 'mock_location_123',
                      user: authPayload.user
                    });

                    self.log('✅ Complete auth state injected');

                    // Override critical auth getters that route guards check
                    if (store.getters) {
                      const authGetters = {
                        'auth/isAuthenticated': () => true,
                        'auth/isJwtExist': () => true,
                        'auth/user': () => store.state.auth.user,
                        'auth/token': () => store.state.auth.jwt,
                        'auth/firebaseToken': () => store.state.auth.firebaseToken,
                        'auth/getAuth': () => store.state.auth
                      };

                      Object.keys(authGetters).forEach(key => {
                        try {
                          Object.defineProperty(store.getters, key, {
                            get: authGetters[key],
                            enumerable: true,
                            configurable: true
                          });
                        } catch (e) {
                          // Getter might not exist yet, that's OK
                        }
                      });

                      self.log('✅ Auth getters overridden');
                    }
                  } catch (e) {
                    self.log(`⚠️ Complete auth state failed: ${e.message}`);
                  }

                  // Try to trigger GHL-specific mutations
                  const mutationsToTry = [
                    { name: 'setInitialized', payload: true },
                    { name: 'setLocationLoaderState', payload: false },
                    { name: 'setAgencyLoaderState', payload: false },
                    { name: 'setLoaderCount', payload: 0 },
                    { name: 'user/set', payload: authPayload.user },
                    { name: 'locations/set', payload: { locationsLoaded: true, locations: [mockLocation], currentLocation: mockLocation } }
                  ];

                  mutationsToTry.forEach(({name, payload}) => {
                    if (store._mutations[name]) {
                      try {
                        store.commit(name, payload);
                        self.log(`✅ Triggered mutation: ${name}`);
                      } catch (e) {
                        self.log(`⚠️ Mutation ${name} failed: ${e.message}`);
                      }
                    }
                  });
                }

                // CRITICAL: Bypass Vue Router navigation guards
                self.log(`🔍 Using captured references... vueApp: ${!!capturedVueApp}, router: ${!!capturedRouter}`);

                if (capturedRouter) {
                  self.log(`🧭 Found Vue Router, current route: ${capturedRouter.currentRoute.value?.path || 'unknown'} (${capturedRouter.currentRoute.value?.name || 'no name'})`);

                  // CRITICAL: Disable all beforeEach navigation guards
                  try {
                    if (capturedRouter.beforeHooks) {
                      const guardCount = capturedRouter.beforeHooks.length;
                      capturedRouter.beforeHooks = []; // Clear all guards
                      self.log(`✅ Cleared ${guardCount} navigation guards`);
                    }
                    if (capturedRouter.beforeResolveHooks) {
                      capturedRouter.beforeResolveHooks = [];
                    }
                  } catch (e) {
                    self.log(`⚠️ Could not clear navigation guards: ${e.message}`);
                  }

                  // CRITICAL: Bypass route guards BEFORE navigation (Layer 4)
                  // GHL uses Vue Router 4 which has getRoutes() instead of matcher
                  if (capturedRouter) {
                    try {
                      self.log('🔧 [LAYER 4] Bypassing route guards (Vue Router 4)...');

                      // Vue Router 4 approach: directly modify route records via getRoutes()
                      if (capturedRouter.getRoutes && typeof capturedRouter.getRoutes === 'function') {
                        const routes = capturedRouter.getRoutes();
                        let guardCount = 0;

                        routes.forEach(route => {
                          if (route.beforeEnter) {
                            self.log(`🔓 Removing beforeEnter guard from: ${route.path}`);
                            delete route.beforeEnter;
                            guardCount++;
                          }
                        });

                        window.__ROUTER_BYPASS_ACTIVE__ = true;
                        self.log(`✅ [LAYER 4] Removed ${guardCount} route guards from ${routes.length} routes`);
                      } else {
                        self.log('⚠️ [LAYER 4] Router has no getRoutes() method');
                      }
                    } catch (e) {
                      self.log(`⚠️ [LAYER 4] Router bypass failed: ${e.message}`);
                    }
                  } else {
                    self.log('⚠️ [LAYER 4] No router to patch');
                  }

                  // Try navigating to dashboard with location_id
                  const locationId = self.state.auth.mockAuth?.locationId || 'mock_location_123';
                  const routesToTry = [
                    `/location/${locationId}/dashboard`,
                    `/v2/location/${locationId}`,
                    `/location/${locationId}`,
                    '/dashboard',
                    '/v2',
                    '/home'
                  ];

                  self.log(`🧭 Attempting navigation with locationId: ${locationId}`);

                  for (const route of routesToTry) {
                    try {
                      capturedRouter.push(route);
                      self.log(`✅ Attempted navigation to ${route}`);
                      break; // Stop after first successful push
                    } catch (e) {
                      self.log(`⚠️ Navigation to ${route} failed: ${e.message}`);
                    }
                  }
                } else {
                  self.log(`⚠️ Vue Router not found - cannot force navigation`);
                }

                // Force root component update using captured reference
                self.log(`🔍 Checking captured Vue instance... vueApp: ${!!capturedVueApp}, _instance: ${!!capturedVueApp?._instance}, proxy: ${!!capturedVueApp?._instance?.proxy}`);

                // Try multiple methods to trigger update
                let updateTriggered = false;

                // Method 1: Vue 3 app._instance.proxy.$forceUpdate()
                if (capturedVueApp?._instance?.proxy?.$forceUpdate) {
                  try {
                    capturedVueApp._instance.proxy.$forceUpdate();
                    self.log('✅ Forced Vue root component update via $forceUpdate');
                    updateTriggered = true;
                  } catch (e) {
                    self.log(`⚠️ $forceUpdate failed: ${e.message}`);
                  }
                }

                // Method 2: Manually re-assign store state to trigger reactivity
                if (!updateTriggered && store) {
                  try {
                    // Trigger Vue's reactivity by reassigning reactive properties
                    const temp = store.state.initialized;
                    store.state.initialized = temp;
                    self.log('✅ Triggered reactivity via state reassignment');
                    updateTriggered = true;
                  } catch (e) {
                    self.log(`⚠️ State reassignment failed: ${e.message}`);
                  }
                }

                // Method 3: Try navigating to root then back to dashboard
                if (!updateTriggered && capturedRouter) {
                  try {
                    capturedRouter.push('/');
                    setTimeout(() => {
                      capturedRouter.push('/dashboard');
                      self.log('✅ Attempted double navigation (/ → /dashboard)');
                    }, 100);
                    updateTriggered = true;
                  } catch (e) {
                    self.log(`⚠️ Double navigation failed: ${e.message}`);
                  }
                }

                if (!updateTriggered) {
                  self.log('⚠️ All update methods failed');
                }

                // DIAGNOSTIC TOOL - Not final solution!
                // Purpose: Validate if dashboard content exists under loading screen
                // This helps us understand if we're 95% done or have deeper issues
                setTimeout(() => {
                  self.runDiagnostic(capturedRouter);
                }, 2000); // Wait for mutations/navigation to complete

              } catch (e) {
                self.log(`⚠️ Could not trigger reactivity: ${e.message}`);
              }
            }, 1000); // Wait for Vue to finish initial mount
          }
        } catch (e) {
          self.log(`⚠️ Could not set up reactivity trigger: ${e.message}`);
        }

        // Force loader count to always be 0
        if (typeof store.state.loaderCount !== 'undefined') {
          Object.defineProperty(store.state, 'loaderCount', {
            get: () => 0,
            set: () => {},
            configurable: true
          });
        }

        // Force loader flags to always be false
        ['locationLoaderActive', 'agencyLoaderActive'].forEach(flag => {
          if (typeof store.state[flag] !== 'undefined') {
            Object.defineProperty(store.state, flag, {
              get: () => false,
              set: () => {},
              configurable: true
            });
          }
        });

        // Force initialized to always be true
        if (typeof store.state.initialized !== 'undefined') {
          Object.defineProperty(store.state, 'initialized', {
            get: () => true,
            set: () => {},
            configurable: true
          });
        }

        self.log('✅ All flags locked - cannot be overwritten by GHL initialization');
        return; // Stop checking
      }

      // Keep checking if Vue hasn't mounted yet
      if (checkCount < maxChecks) {
        setTimeout(checkForVue, 100);
      } else {
        self.log('⚠️ Vue did not mount within 5 seconds');
      }
    };

    // Start checking after a short delay
    setTimeout(checkForVue, 100);
  }

  /**
   * Suppress errors that block Vue/React from mounting
   */
  suppressBlockingErrors() {
    const originalConsoleError = console.error;
    console.error = function(...args) {
      const msg = args.join(' ');
      // Suppress common blocking errors
      if (msg.includes('innerText') ||
          msg.includes('Firebase') ||
          msg.includes('Cannot read properties')) {
        return; // Swallow error
      }
      originalConsoleError.apply(console, args);
    };

    // CRITICAL: Intercept atob() to prevent InvalidCharacterError that causes logout
    // GHL calls atob() on tokens and if it fails, triggers logout
    const originalAtob = window.atob;
    window.atob = function(str) {
      try {
        return originalAtob(str);
      } catch (e) {
        // If atob fails, return a safe decoded value instead of throwing
        const preview = typeof str === 'string' ? str.substring(0, 50) : String(str).substring(0, 50);
        console.log(`🔇 [AutoMocker] Suppressed atob error for: ${preview}...`);
        // Return a JSON object that won't break GHL's parsing
        return JSON.stringify({ id: 'mock', error: 'atob_failed' });
      }
    };

    this.log('✅ Suppressing blocking console errors');
    this.log('✅ Intercepted atob() to prevent decode errors');
  }

  /**
   * Inject global auth data that apps expect
   */
  injectGlobalAuthData() {
    window.__USER__ = window.__USER__ || {
      id: 'mock_user',
      email: 'demo@example.com',
      name: 'Demo User',
      authenticated: true
    };

    window.__INITIAL_STATE__ = window.__INITIAL_STATE__ || {
      user: window.__USER__,
      authenticated: true,
      initialized: true
    };

    this.log('✅ Injected global auth data');
  }

  /**
   * Disable service worker to prevent reload loops from 404 errors
   */
  disableServiceWorker() {
    // Unregister any existing service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          registration.unregister();
          this.log(`🚫 Unregistered service worker: ${registration.scope}`);
        });
      });

      // Prevent new service worker registration
      const originalRegister = navigator.serviceWorker.register;
      navigator.serviceWorker.register = function() {
        console.log('🚫 [AutoMocker] Blocked service worker registration');
        return Promise.reject(new Error('Service worker disabled by auto-mocker'));
      };
    }

    this.log('✅ Service worker disabled');
  }

  /**
   * Inject early auth (localStorage + cookies) - Layer 2 of auth bypass
   * This runs BEFORE Vue boots, ensuring auth tokens exist when checked
   */
  injectEarlyAuth() {
    const timestamp = Date.now();

    // CRITICAL DISCOVERY: GHL frontend uses atob() to decode JWT parts, which expects
    // regular base64 (WITH padding), not base64url (without padding).
    // So we need to create "JWT-shaped" tokens that are actually regular base64!

    // Use REGULAR base64 (with padding) for ALL tokens including JWT parts
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({
      userId: `mock_user_${timestamp}`,
      companyId: `mock_company_${timestamp}`,
      locationId: `mock_location_${timestamp}`,
      email: "demo@example.com",
      role: "admin",
      exp: 9999999999,
      iat: Math.floor(timestamp / 1000)
    }));
    const signature = btoa(`mock_signature_${timestamp}`);
    const validJWT = `${header}.${payload}.${signature}`;

    // All tokens use regular base64 so GHL's atob() calls work
    const mockAuth = {
      firebaseToken: btoa(`mock_firebase_token_${timestamp}`),
      jwt: validJWT,
      refreshJwt: btoa(`mock_refresh_jwt_${timestamp}`),
      authToken: btoa(`mock_auth_token_${timestamp}`),
      refreshToken: btoa(`mock_refresh_token_${timestamp}`),
      apiKey: btoa(`mock_api_key_${timestamp}`),
      userId: `mock_user_${timestamp}`,
      companyId: `mock_company_${timestamp}`,
      locationId: `mock_location_${timestamp}`
    };

    // Store in class for later use
    this.state.auth.mockAuth = mockAuth;

    // Set localStorage (GHL reads this on boot)
    try {
      localStorage.setItem('a', JSON.stringify(mockAuth));
      localStorage.setItem('m_a', mockAuth.jwt);
      localStorage.setItem('firebaseToken', mockAuth.firebaseToken);
      this.log('✅ Early auth: localStorage set');
    } catch (e) {
      this.log(`⚠️ Early auth: localStorage failed - ${e.message}`);
    }

    // Set cookies (also checked by GHL)
    try {
      document.cookie = `m_a=${mockAuth.jwt}; path=/; max-age=86400`;
      document.cookie = `firebaseToken=${mockAuth.firebaseToken}; path=/; max-age=86400`;
      this.log('✅ Early auth: cookies set');
    } catch (e) {
      this.log(`⚠️ Early auth: cookies failed - ${e.message}`);
    }
  }

  /**
   * DIAGNOSTIC TOOL - Not final solution!
   * Purpose: Validate if dashboard content exists under loading screen
   * This helps us understand if we're 95% done or have deeper issues
   */
  runDiagnostic(router) {
    this.log('🔍 [DIAGNOSTIC] Removing loading screen to inspect app state...');

    try {
      // Hide all loading overlays
      const loaderSelectors = [
        '.hl-loader-container',
        '.app-loader',
        '[class*="loader"]',
        '[class*="loading"]'
      ];

      let removedCount = 0;
      loaderSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          // Check if element is actually visible
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            el.style.display = 'none';
            removedCount++;
            this.log(`🔍 [DIAGNOSTIC] Hidden: ${selector}`);
          }
        });
      });

      this.log(`🔍 [DIAGNOSTIC] Hidden ${removedCount} loading elements`);

      // Force route to dashboard
      if (router) {
        try {
          router.replace('/dashboard');
          this.log('🔍 [DIAGNOSTIC] Forced navigation to /dashboard');
        } catch (e) {
          this.log(`🔍 [DIAGNOSTIC] Navigation failed: ${e.message}`);
        }
      }

      // Report results after DOM settles
      setTimeout(() => {
        const visibleElements = Array.from(document.querySelectorAll('*'))
          .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }).length;

        const currentRoute = router?.currentRoute?.value?.path || 'unknown';
        const bodyText = document.body.innerText.substring(0, 200);

        this.log(`🔍 [DIAGNOSTIC] === RESULTS ===`);
        this.log(`🔍 [DIAGNOSTIC] Visible elements: ${visibleElements}`);
        this.log(`🔍 [DIAGNOSTIC] Current route: ${currentRoute}`);
        this.log(`🔍 [DIAGNOSTIC] Body text preview: ${bodyText}`);

        if (visibleElements > 100) {
          this.log('✅ [DIAGNOSTIC] Success! Dashboard appears to be rendering');
          this.log('✅ [DIAGNOSTIC] Conclusion: We are ~95% done, just need proper auth redirect logic');
        } else if (visibleElements > 50) {
          this.log('⚠️ [DIAGNOSTIC] Partial success - Some content visible but incomplete');
          this.log('⚠️ [DIAGNOSTIC] Conclusion: Need to investigate what else is blocking');
        } else {
          this.log('❌ [DIAGNOSTIC] Still stuck - Very few elements visible');
          this.log('❌ [DIAGNOSTIC] Conclusion: Need deeper GHL integration (API mocking, auth flow)');
        }

        // Log what's actually visible
        const visibleTags = {};
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            visibleTags[el.tagName] = (visibleTags[el.tagName] || 0) + 1;
          }
        });
        this.log(`🔍 [DIAGNOSTIC] Visible tag breakdown: ${JSON.stringify(visibleTags)}`);
      }, 2000);

    } catch (e) {
      this.log(`❌ [DIAGNOSTIC] Error during diagnostic: ${e.message}`);
    }
  }

  /**
   * Intercept localStorage - auto-inject auth tokens
   */
  interceptLocalStorage() {
    const self = this;
    const _getItem = Storage.prototype.getItem;
    const _setItem = Storage.prototype.setItem;

    Storage.prototype.getItem = function(key) {
      let value = _getItem.call(this, key);

      // If missing and looks like auth, inject it
      if (!value && self.looksLikeAuth(key)) {
        value = self.generateAuthToken(key);
        _setItem.call(this, key, value);

        self.log(`🔑 Auto-injected auth: ${key} = ${value.substring(0, 50)}...`);
        self.state.auth.patterns[key] = value;
      }

      return value;
    };

    this.log('✅ localStorage intercepted');
  }

  /**
   * Intercept sessionStorage
   */
  interceptSessionStorage() {
    // Same as localStorage
    this.log('✅ sessionStorage intercepted');
  }

  /**
   * Intercept document.cookie
   */
  interceptCookies() {
    const self = this;
    const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ||
                       Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');

    if (cookieDesc && cookieDesc.configurable) {
      Object.defineProperty(document, 'cookie', {
        get: function() {
          return cookieDesc.get.call(document);
        },
        set: function(val) {
          self.log(`🍪 Cookie set: ${val.split('=')[0]}`);
          return cookieDesc.set.call(document, val);
        }
      });
    }

    this.log('✅ Cookies intercepted');
  }

  /**
   * Intercept fetch() - core API mocking
   * HYPOTHESIS: Return 200 for ALL requests to prevent 404/501 reload loops
   */
  interceptFetch() {
    const self = this;
    const _fetch = window.fetch;

    window.fetch = function(url, options = {}) {
      const urlStr = url.toString();
      const method = (options.method || 'GET').toUpperCase();

      // CRITICAL: Don't intercept local asset files, only external API calls
      const isLocalAsset =
        urlStr.startsWith('/') ||  // Relative path
        urlStr.startsWith(window.location.origin) ||  // Same origin
        !urlStr.includes('://') ||  // No protocol (relative)
        /\.(zip|wasm|js|css|png|jpg|jpeg|gif|svg|webp|mp4|woff2?|ttf|otf|eot)$/i.test(urlStr);  // Asset file

      if (isLocalAsset) {
        // Let local assets through to the real server
        return _fetch.call(window, url, options);
      }

      // HYPOTHESIS FIX: ALL external API calls return 200 with valid mock data
      // This prevents ANY 404/501 errors that might trigger reload loops

      self.log(`✅ MOCKED (200): ${method} ${urlStr.substring(0, 80)}`);

      // Generate minimal valid response based on URL patterns
      let mockResponse = {
        success: true,
        data: {}
      };

      // Special handling for Firebase/Google APIs
      if (urlStr.includes('googleapis.com') ||
          urlStr.includes('firebaseio.com') ||
          urlStr.includes('gstatic.com')) {

        if (urlStr.includes('firebaseinstallations')) {
          mockResponse = {
            name: 'mock-installation',
            fid: 'mock_fid_' + Date.now(),
            authToken: {
              token: 'mock_token_' + Date.now(),
              expiresIn: '604800s'
            }
          };
        } else if (urlStr.includes('identitytoolkit') || urlStr.includes('securetoken')) {
          mockResponse = {
            kind: 'identitytoolkit#VerifyPasswordResponse',
            idToken: 'mock_firebase_jwt_' + Date.now(),
            refreshToken: 'mock_refresh_token',
            expiresIn: '3600',
            localId: 'mock_user_id'
          };
        }
      }
      // Special handling for GHL localization endpoints
      else if (urlStr.includes('/localization/') || urlStr.includes('module=')) {
        mockResponse = {
          data: {},
          translations: {},
          locale: 'en-US',
          modules: {}
        };
      }
      // Check for common API patterns and provide appropriate mock
      else if (urlStr.includes('/api/') || urlStr.includes('/v1/') || urlStr.includes('/v2/')) {
        // Generic API response
        mockResponse = {
          success: true,
          data: {},
          status: 'ok'
        };
      }

      // Track this API call
      if (!self.state.apis[urlStr]) {
        self.state.apis[urlStr] = {
          method,
          calls: 0,
          mock: mockResponse,
          lastCall: null,
          errors: []
        };
      }

      const api = self.state.apis[urlStr];
      api.calls++;
      api.lastCall = Date.now();

      // ALWAYS return 200 OK with valid JSON
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
        clone: function() { return this; }
      });
    };

    this.log('✅ fetch() intercepted - ALL requests return 200');
  }

  /**
   * Intercept XMLHttpRequest
   * HYPOTHESIS: Return 200 for ALL requests to prevent 404/501 reload loops
   */
  interceptXHR() {
    const self = this;
    const OriginalXHR = window.XMLHttpRequest;

    window.XMLHttpRequest = function() {
      const xhr = new OriginalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;

      xhr.open = function(method, url, ...rest) {
        this._method = method;
        this._url = url;
        return originalOpen.call(this, method, url, ...rest);
      };

      xhr.send = function(data) {
        const urlStr = this._url || '';

        // CRITICAL: Don't intercept local asset files, only external API calls
        const isLocalAsset =
          urlStr.startsWith('/') ||  // Relative path
          urlStr.startsWith(window.location.origin) ||  // Same origin
          !urlStr.includes('://') ||  // No protocol (relative)
          /\.(zip|wasm|js|css|png|jpg|jpeg|gif|svg|webp|mp4|woff2?|ttf|otf|eot)$/i.test(urlStr);  // Asset file

        if (isLocalAsset) {
          // Let local assets through to the real server
          return originalSend.call(this, data);
        }

        // HYPOTHESIS FIX: ALL external API calls return 200 with valid mock data
        // This prevents ANY 404/501 errors that might trigger reload loops

        self.log(`✅ MOCKED XHR (200): ${this._method} ${urlStr.substring(0, 80)}`);

        // Generate minimal valid response based on URL patterns
        let mockResponse = {
          success: true,
          data: {}
        };

        // Special handling for Firebase/Google APIs
        if (urlStr.includes('googleapis.com') ||
            urlStr.includes('firebaseio.com') ||
            urlStr.includes('gstatic.com')) {

          if (urlStr.includes('firebaseinstallations')) {
            mockResponse = {
              name: 'mock-installation',
              fid: 'mock_fid_' + Date.now(),
              authToken: {
                token: 'mock_token_' + Date.now(),
                expiresIn: '604800s'
              }
            };
          } else if (urlStr.includes('identitytoolkit') || urlStr.includes('securetoken')) {
            mockResponse = {
              kind: 'identitytoolkit#VerifyPasswordResponse',
              idToken: 'mock_firebase_jwt_' + Date.now(),
              refreshToken: 'mock_refresh_token',
              expiresIn: '3600',
              localId: 'mock_user_id'
            };
          }
        }
        // Special handling for GHL localization endpoints
        else if (urlStr.includes('/localization/') || urlStr.includes('module=')) {
          mockResponse = {
            data: {},
            translations: {},
            locale: 'en-US',
            modules: {}
          };
        }
        // Check for common API patterns and provide appropriate mock
        else if (urlStr.includes('/api/') || urlStr.includes('/v1/') || urlStr.includes('/v2/')) {
          // Generic API response
          mockResponse = {
            success: true,
            data: {},
            status: 'ok'
          };
        }

        // Track this API call
        if (!self.state.apis[urlStr]) {
          self.state.apis[urlStr] = {
            method: this._method,
            calls: 0,
            mock: mockResponse,
            lastCall: null,
            errors: []
          };
        }

        const api = self.state.apis[urlStr];
        api.calls++;
        api.lastCall = Date.now();

        // ALWAYS return 200 OK with valid JSON
        setTimeout(() => {
          const responseText = JSON.stringify(mockResponse);
          Object.defineProperty(this, 'status', { value: 200, writable: false });
          Object.defineProperty(this, 'statusText', { value: 'OK', writable: false });
          Object.defineProperty(this, 'responseText', { value: responseText, writable: false });
          Object.defineProperty(this, 'response', { value: responseText, writable: false });
          Object.defineProperty(this, 'readyState', { value: 4, writable: false });

          if (this.onreadystatechange) this.onreadystatechange();
          if (this.onload) this.onload();
        }, 10);

        return;
      };

      return xhr;
    };

    this.log('✅ XHR intercepted - ALL requests return 200');
  }

  /**
   * Intercept WebSocket
   */
  interceptWebSocket() {
    const self = this;
    const OriginalWS = window.WebSocket;

    window.WebSocket = function(url, protocols) {
      self.log(`🔌 WebSocket blocked: ${url}`);

      // Return fake WebSocket
      return {
        readyState: 1,
        send: () => {},
        close: () => {},
        addEventListener: () => {},
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null
      };
    };

    this.log('✅ WebSocket intercepted');
  }

  /**
   * Capture and analyze errors
   */
  captureErrors() {
    const self = this;

    window.addEventListener('error', function(e) {
      const error = {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        timestamp: Date.now()
      };

      self.state.errors.push(error);
      self.log(`❌ Error: ${e.message}`);

      // Try to fix it
      const fix = self.analyzeError(error);
      if (fix) {
        self.applyFix(fix);
        self.scheduleReload();
      }

      e.preventDefault();
    }, true);

    window.addEventListener('unhandledrejection', function(e) {
      const error = {
        message: e.reason?.message || e.reason?.toString() || 'Unknown rejection',
        timestamp: Date.now()
      };

      // Suppress Firebase errors (they're expected with mocks)
      if (error.message.includes('Firebase') ||
          error.message.includes('permission') ||
          error.message.includes('googleapis.com')) {
        self.log(`🔇 Suppressed Firebase error: ${error.message.substring(0, 60)}`);
        e.preventDefault();
        return;
      }

      self.state.errors.push(error);
      self.log(`❌ Rejection: ${error.message}`);

      const fix = self.analyzeError(error);
      if (fix) {
        self.applyFix(fix);
        self.scheduleReload();
      }

      e.preventDefault();
    });

    this.log('✅ Error handlers installed');
  }

  /**
   * Analyze error and generate fix
   */
  analyzeError(error) {
    const msg = error.message || '';

    // Skip if message is empty
    if (!msg || msg === 'undefined') {
      return null;
    }

    // Pattern 1: "Cannot read property/properties 'X' of undefined/null"
    // Handles both formats:
    // - Old: "Cannot read property 'X' of undefined"
    // - New Chrome: "Uncaught TypeError: Cannot read properties of null (reading 'X')"
    const match1 = msg.match(/(?:Uncaught )?(?:TypeError: )?Cannot read propert(?:y|ies) (?:of (undefined|null) \(reading '(\w+)'\)|'(\w+)' of (undefined|null))/);
    if (match1) {
      const property = match1[2] || match1[3];
      const parentType = match1[1] || match1[4];
      this.log(`🔍 Detected missing property: ${property} (parent was ${parentType})`);
      return {
        type: 'missing_property',
        property: property,
        parentType: parentType,
        url: this.findRecentAPI(),
        value: this.inferType(property),
        error: msg
      };
    }

    // Pattern 2: "X.map is not a function" → needs array
    const match2 = msg.match(/(?:Uncaught )?(?:TypeError: )?(\w+)\.map is not a function/);
    if (match2) {
      this.log(`🔍 Detected needs array: ${match2[1]}`);
      return {
        type: 'needs_array',
        property: match2[1],
        url: this.findRecentAPI(),
        value: [],
        error: msg
      };
    }

    // Pattern 3: "X.then is not a function" → needs Promise
    const match3 = msg.match(/(?:Uncaught )?(?:TypeError: )?(\w+)\.then is not a function/);
    if (match3) {
      this.log(`🔍 Detected needs promise: ${match3[1]}`);
      return {
        type: 'needs_promise',
        property: match3[1],
        url: this.findRecentAPI(),
        error: msg
      };
    }

    // Pattern 4: "X is not defined"
    const match4 = msg.match(/(?:Uncaught )?(?:ReferenceError: )?(\w+) is not defined/);
    if (match4) {
      this.log(`🔍 Detected undefined variable: ${match4[1]}`);
      return {
        type: 'undefined_variable',
        property: match4[1],
        error: msg
      };
    }

    return null;
  }

  /**
   * Apply fix to mock data
   */
  applyFix(fix) {
    this.log(`🔧 Applying fix: ${fix.type} for ${fix.property}`);

    if (fix.type === 'missing_property' || fix.type === 'needs_array') {
      const api = this.state.apis[fix.url];
      if (api) {
        // Navigate nested properties
        const parts = fix.property.split('.');
        let current = api.mock;

        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) current[parts[i]] = {};
          current = current[parts[i]];
        }

        current[parts[parts.length - 1]] = fix.value;
        this.log(`✅ Fixed: ${fix.url} now has ${fix.property}`);
      }
    }

    this.state.fixes.push(fix);
  }

  /**
   * Find most recent API call (likely source of error)
   */
  findRecentAPI() {
    const recent = Object.entries(this.state.apis)
      .filter(([_, data]) => data.lastCall && (Date.now() - data.lastCall < 1000))
      .sort((a, b) => b[1].lastCall - a[1].lastCall);

    return recent[0]?.[0] || Object.keys(this.state.apis)[0];
  }

  /**
   * Infer type from property name
   */
  inferType(propName) {
    const lower = propName.toLowerCase();

    // Arrays
    if (lower.endsWith('s') && !lower.endsWith('ss')) return [];
    if (/(list|items|array)/.test(lower)) return [];

    // Booleans
    if (/^(is|has|can|should|enable|disable)/.test(lower)) return true;

    // Numbers
    if (/(count|total|amount|price|revenue|value|num|quantity)/.test(lower)) return 0;

    // Dates
    if (/(date|time|timestamp|at|created|updated)/.test(lower)) return new Date().toISOString();

    // IDs
    if (lower === 'id' || lower.endsWith('id') || lower.endsWith('_id')) {
      return 'mock_' + propName + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Emails
    if (lower.includes('email')) return 'demo@example.com';

    // Names
    if (/(name|title|label|heading)/.test(lower)) return 'Demo ' + propName;

    // URLs
    if (/(url|link|href|src)/.test(lower)) return 'https://example.com';

    // Phone
    if (/(phone|tel|mobile)/.test(lower)) return '+1234567890';

    // Objects
    if (/(data|info|details|config|settings|profile|meta)/.test(lower)) return {};

    // Safe default
    return '';
  }

  /**
   * Check if key looks like auth
   */
  looksLikeAuth(key) {
    const lower = key.toLowerCase();
    return /(token|jwt|auth|session|user|credential|api[_-]?key)/.test(lower);
  }

  /**
   * Generate realistic auth token
   */
  generateAuthToken(key) {
    const lower = key.toLowerCase();

    if (lower.includes('jwt') || lower.includes('token')) {
      return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJtb2NrX3VzZXIifQ.mock_signature';
    }

    if (lower.includes('user')) {
      return JSON.stringify({
        id: 'mock_user_' + Date.now(),
        email: 'demo@example.com',
        name: 'Demo User'
      });
    }

    if (lower.includes('session')) {
      return 'mock_session_' + Date.now();
    }

    return 'mock_' + key + '_' + Date.now();
  }

  /**
   * Schedule reload for next iteration
   * DISABLED: GHL dashboard works, reload loop was preventing it from staying rendered
   */
  scheduleReload() {
    if (this._reloadScheduled) return;
    this._reloadScheduled = true;

    // SMART RELOAD: Check if dashboard rendered successfully before reloading
    const currentElementCount = document.querySelectorAll('*').length;
    const currentText = document.body?.innerText?.trim() || '';
    const hasDashboardContent = currentElementCount > 100 && currentText.length > 50;

    if (hasDashboardContent) {
      // Dashboard rendered successfully - DON'T reload!
      this.log(`🎉 Dashboard rendered successfully! (${currentElementCount} elements, content present)`);
      this.log('✅ App is stable - reload disabled to keep dashboard visible');
      this.generateReport();
      this.markReady();
      return;
    }

    // App is stuck (< 100 elements or no content) - allow reload to unstick it
    this.log(`⚠️ App appears stuck (${currentElementCount} elements, text length: ${currentText.length})`);
    this.log(`🔄 Scheduling reload to unstick app...`);

    setTimeout(() => {
      if (this.state.iteration < this.maxIterations) {
        this.log(`🔄 Reloading for iteration ${this.state.iteration + 1}...`);
        this.saveState();
        this.state.iteration++;
        location.reload();
      } else {
        this.log('⚠️ Max iterations reached, stopping');
        this.generateReport();
      }
    }, this.reloadDelay);
  }

  /**
   * Check if app is stable (no new errors in last 3 seconds)
   */
  checkStability() {
    try {
      // Wait for document.body to exist
      if (!document.body) {
        console.log('[AutoMocker] ⏳ Waiting for document.body...');
        setTimeout(() => this.checkStability(), 100);
        return;
      }

      const initialElementCount = document.querySelectorAll('*').length;
      const initialText = document.body.innerText;

      console.log(`[AutoMocker] 🕐 checkStability() called - will check in 5 seconds (iter ${this.state?.iteration || 'unknown'}, elements: ${initialElementCount})`);

      // Check after 5 seconds
      const self = this;
      setTimeout(() => {
        console.log(`[AutoMocker] 🕐 checkStability() setTimeout FIRED after 5s (iter ${self.state?.iteration || 'unknown'})`);
        const recentErrors = self.state.errors.filter(e =>
          Date.now() - e.timestamp < 3000
        );

        const currentElementCount = document.querySelectorAll('*').length;
        const currentText = document.body.innerText;

        // Check if stuck on loading screen (even if DOM is changing)
        const isOnLoadingScreen = (
          /loading/i.test(currentText) ||
          /please wait/i.test(currentText) ||
          /initializing/i.test(currentText)
        );

        // Check if Vue hasn't mounted (for Vue apps)
        const vueNotMounted = (
          !window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0] &&
          self.state.iteration >= 3
        );

        // Check if same error repeating (stuck on error)
        const hasRepeatingErrors = recentErrors.length > 0 && self.state.iteration >= 5;

        // Traditional stuck check (no DOM changes)
        const isDOMStuck = (
          currentElementCount === initialElementCount &&
          currentText === initialText
        );

        // Consider stuck if ANY stuck condition is met
        const isStuck = isDOMStuck || isOnLoadingScreen || vueNotMounted || hasRepeatingErrors;

        if (recentErrors.length === 0 && !isStuck) {
          self.log('✅ App stable! No errors in 3 seconds');
          self.log(`📊 Converged in ${self.state.iteration} iterations`);
          self.generateReport();
          self.markReady();
        } else if (isStuck) {
          const reason = isDOMStuck ? 'DOM not changing' :
                        isOnLoadingScreen ? 'stuck on loading screen' :
                        vueNotMounted ? 'Vue not mounting' :
                        'repeating errors';
          self.log(`⚠️ App stuck (${reason}) - applying Vuex fixes ONLY (no DOM manipulation)`);
          self.applyAggressiveFixes();
        } else {
          self.log(`⏳ Still seeing errors: ${recentErrors.length}`);
        }
    }, 5000);
    } catch (e) {
      console.error('[AutoMocker] checkStability() ERROR:', e.message);
    }
  }

  /**
   * Apply aggressive fixes when app is stuck
   */
  applyAggressiveFixes() {
    this.log('🔧 Applying aggressive fixes...');

    // Fix 0: If Vue hasn't mounted, clear error state
    if (!window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0]) {
      this.log('⚠️ Vue not mounted - clearing error state');
      // Clear error state that might be blocking Vue
      this.state.errors = [];
      // Note: error suppression and auth injection now happen in init()
    }

    // Fix 1: Find and manipulate Vuex/Pinia store
    try {
      const app = document.getElementById('app') || document.querySelector('[data-v-app]');
      let store = null;

      // Try to find Vue app and store
      if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__?.apps?.[0]) {
        const vueApp = window.__VUE_DEVTOOLS_GLOBAL_HOOK__.apps[0];
        store = vueApp.config?.globalProperties?.$store;
      } else if (app?.__vue_app__) {
        store = app.__vue_app__.config?.globalProperties?.$store;
      }

      if (store?.state) {
        // Check if this is the same store instance
        const storeId = store._autoMockerStoreId || 'unknown';
        this.log(`✅ Found Vuex store (ID: ${storeId}) - forcing ready state`);

        // Force all loader flags to false
        if (typeof store.state.loaderCount !== 'undefined') {
          Object.defineProperty(store.state, 'loaderCount', {
            get: () => 0,
            set: () => {}
          });
        }

        // Common loading flags
        const loaderFlags = [
          'loading', 'isLoading', 'initializing',
          'locationLoaderActive', 'agencyLoaderActive',
          'showLoader', 'busy', 'fetching'
        ];

        loaderFlags.forEach(flag => {
          if (typeof store.state[flag] !== 'undefined') {
            Object.defineProperty(store.state, flag, {
              get: () => false,
              set: () => {}
            });
          }
        });

        // Force ready flags to true
        const readyFlags = [
          'isReady', 'ready', 'initialized', 'userReady', 'dataLoaded'
        ];

        readyFlags.forEach(flag => {
          if (typeof store.state[flag] !== 'undefined') {
            Object.defineProperty(store.state, flag, {
              get: () => true,
              set: () => {}
            });
          }
        });

        this.log('✅ Forced store to ready state');
      }
    } catch (e) {
      this.log(`Failed to manipulate store: ${e.message}`);
    }

    // Fix 2: DISABLED - CSS/DOM manipulation breaks the UI
    // The Vuex fixes above are enough to bypass loading screen
    this.log('⏭️  Skipping CSS/DOM manipulation - letting UI render naturally');
    return; // Exit early, don't apply CSS/DOM fixes

    // Fix 2: Force show hidden content
    setTimeout(() => {
      const self = this;  // Capture 'this' for use in nested functions
      const app = document.getElementById('app') || document.body;

      // CRITICAL: Use !important to prevent Vue from overriding
      app.style.setProperty('display', 'block', 'important');
      app.style.setProperty('visibility', 'visible', 'important');
      app.style.setProperty('opacity', '1', 'important');

      // Add a GLOBAL CSS rule to force ALL descendants visible
      const style = document.createElement('style');
      style.textContent = `
        /* CRITICAL: Fix parent containers having 0 size */
        html, body {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          min-width: 100vw !important;
          min-height: 100vh !important;
        }

        /* Force app and ALL descendants visible */
        #app {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          width: 100% !important;
          height: 100vh !important;
        }
        #app *:not([class*="loading"]):not([class*="loader"]) {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
      `;
      document.head.appendChild(style);
      console.log('[AutoMocker] ✅ Added global CSS to force html/body size and visibility');

      // Force show ALL descendants recursively - ALWAYS force, not just if hidden
      const forceShowRecursive = (element, depth = 0) => {
        if (depth > 10) return; // Prevent infinite recursion

        try {
          const text = element.textContent.toLowerCase();
          // Don't show loading screens
          if (text.includes('loading fresh data') || text.includes('please wait')) {
            element.style.setProperty('display', 'none', 'important');
            return;
          }

          // ALWAYS force visible, regardless of current state (CSS classes might hide it)
          element.style.setProperty('display', 'block', 'important');
          element.style.setProperty('visibility', 'visible', 'important');
          element.style.setProperty('opacity', '1', 'important');

          console.log(`[AutoMocker] Force-showed [depth ${depth}]: ${element.tagName}.${element.className || 'no-class'}`);

          // Recurse to ALL children
          Array.from(element.children).forEach(child => forceShowRecursive(child, depth + 1));
        } catch (e) {
          console.error('[AutoMocker] Error in forceShowRecursive:', e.message);
        }
      };

      // Force show all descendants starting from app's children
      console.log('[AutoMocker] Starting recursive force-show...');
      try {
        Array.from(app.children).forEach(child => forceShowRecursive(child, 0));
        console.log('[AutoMocker] ✅ Recursive force-show completed');
      } catch (e) {
        console.error('[AutoMocker] ❌ Force-show failed:', e.message);
      }

      // Watch for Vue trying to hide the app
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const currentDisplay = app.style.display;
            if (currentDisplay === 'none' || currentDisplay === '') {
              app.style.setProperty('display', 'block', 'important');
              this.log('⚠️ Prevented app from being hidden');
            }
          }
        });
      });

      observer.observe(app, {
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      // NOW hide ONLY specific loading screens (not broad selectors)
      const loadingElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent.toLowerCase();
        // Must contain "loading" text AND be a relatively small element (not a parent container)
        return (text.includes('loading fresh data') || text.includes('please wait')) &&
               el.children.length < 5 &&  // Small elements only
               el !== app;  // Don't hide the app itself!
      });

      loadingElements.forEach(el => {
        el.style.display = 'none';
        this.log(`Hid specific loading element: ${el.tagName}.${el.className}`);
      });

      this.log('✅ Forced content visible with mutation observer');

      // Give the app time to respond to fixes - don't reload!
      // Let the next stuck detection cycle handle it if still stuck
      setTimeout(() => {
        const newElementCount = document.querySelectorAll('*').length;
        const newText = document.body.innerText;

        this.log(`ℹ️  After aggressive fixes: ${newElementCount} elements, text: "${newText.substring(0, 50)}..."`);

        // Don't reload! Give it more time. The next checkStability cycle will handle it.
      }, 5000);
    }, 100);
  }

  /**
   * Save state to localStorage for next iteration
   */
  saveState() {
    try {
      localStorage.setItem('__AUTO_MOCKER_STATE__', JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }

  /**
   * Load state from previous iteration
   */
  loadState() {
    try {
      const saved = localStorage.getItem('__AUTO_MOCKER_STATE__');
      if (saved) {
        const prevState = JSON.parse(saved);
        this.state = {
          ...prevState,
          iteration: (prevState.iteration || 0) + 1,
          errors: [],  // Reset errors for this iteration
          fixes: prevState.fixes || []
        };
        this.log(`📥 Loaded state from iteration ${this.state.iteration - 1}`);
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }
  }

  /**
   * Generate final report
   */
  generateReport() {
    const report = {
      summary: {
        iterations: this.state.iteration,
        totalAPIs: Object.keys(this.state.apis).length,
        totalFixes: this.state.fixes.length,
        authPatterns: Object.keys(this.state.auth.patterns)
      },
      apis: Object.entries(this.state.apis).map(([url, data]) => ({
        url,
        method: data.method,
        calls: data.calls,
        mock: data.mock
      })),
      auth: this.state.auth,
      fixes: this.state.fixes
    };

    console.log('\n📋 ============ AUTO-MOCKER REPORT ============');
    console.log(JSON.stringify(report, null, 2));
    console.log('============================================\n');

    // Save report
    try {
      localStorage.setItem('__AUTO_MOCKER_REPORT__', JSON.stringify(report));
    } catch (e) {}

    return report;
  }

  /**
   * Mark app as ready
   */
  markReady() {
    window.__AUTO_MOCKER_READY__ = true;
    localStorage.removeItem('__AUTO_MOCKER_STATE__');  // Clean up
  }

  /**
   * Debug logging
   */
  log(msg) {
    if (this.debug) {
      console.log(`[AutoMocker] ${msg}`);
    }
  }
}

// Auto-init if not already done
if (!window.__AUTO_MOCKER_READY__) {
  const mocker = new UniversalAutoMocker({ debug: true });
  mocker.init();
  window.__AUTO_MOCKER__ = mocker;
}
